# Nexora Engineering Rules

The rules for this repo: folder structure, NestJS backend, Next.js frontend, Git and GitHub.
Every new file, folder, module, branch and pull request follows this document.
If code and this document disagree, fix the code or change this document in the same PR.

Status key: **Now** = how the repo is today · **Target** = where we are going · **Rule** = applies from today.

---

## 1. Repo layout

### 1.1 Root of the repo (Rule)

| File | Purpose |
| :--- | :--- |
| `.nvmrc` | `22` (Node 22 LTS everywhere: laptop, CI, server) |
| `.editorconfig` | UTF-8, LF, 2 spaces, final newline, trim trailing whitespace |
| `.gitignore` | `node_modules`, `dist`, `.next`, `coverage`, `.env*` (except `.env.example`), logs, OS/IDE files |
| `.prettierrc` | One format for backend and frontend: `singleQuote`, `trailingComma: all`, `printWidth: 140` |
| `commitlint.config.js` | Conventional commits (`@commitlint/config-conventional`) |
| `.husky/` | `pre-commit` (lint-staged), `commit-msg` (commitlint), `pre-push` (typecheck + unit tests) |
| `lint-staged.config.js` | Lint and format only the files you changed |
| `renovate.json` | Dependency updates, `minimumReleaseAge: "7 days"` |
| `.github/workflows/ci.yml` | Lint, typecheck, test and build on every push and PR |
| `.github/CODEOWNERS` | Who must approve PRs |
| `.github/pull_request_template.md` | PR checklist (section 4.5) |
| `README.md` | How to run, test and deploy, plus every env key |

Notes, research, request docs and large design documents do **not** live in the repo.
They go in `nexora-docs/` at the repo root, never inside `backend/` or `frontend/`. Only code, tooling, READMEs and these rules files sit outside it.
The architecture blueprint lives in `nexora-docs/RTC_PAAS_ARCHITECTURE_BLUEPRINT.md`.

### 1.2 Top level (Target)

```
nexora/
├── backend/            NestJS monorepo: 2 apps + shared libs (section 2)
├── frontend/           Next.js App Router (section 3)
├── deploy/
│   ├── pm2/            ecosystem.config.cjs (api, worker, frontend)
│   ├── jenkins/        Jenkinsfile + check.sh, build.sh, package.sh, deploy.sh
│   ├── ansible/        server setup playbooks (app, jenkins, media)
│   └── k8s/            base + overlays dev / stag / prod (Flow 1, later)
├── docker/             LiveKit, Coturn, Redis, egress (local + prod media plane)
├── bin/                LiveKit binary for Windows dev (binary itself git-ignored)
├── nexora-docs/        notes, research, architecture blueprint (no code)
└── <root files from 1.1>
```

Done: the PM2 file is `deploy/pm2/ecosystem.config.cjs` with `nexora-api`, `nexora-worker` and `nexora-frontend`.

---

## 2. Backend rules (NestJS)

### 2.1 Folder structure (Target)

```
backend/
├── apps/
│   ├── api/src/main.ts          HTTP only: controllers, guards, pipes, OpenAPI, /health
│   └── worker/src/main.ts       Background jobs only: BullMQ consumers + job schedulers (crons), no HTTP
├── libs/
│   ├── modules/                 one folder per business area
│   │   ├── auth/                login, sessions, MFA, API keys, roles
│   │   ├── team/                invitations, members
│   │   ├── livekit/             tokens, rooms, recording, webhooks in/out, billing per minute
│   │   ├── portal/              console endpoints, payments, auto recharge, KYC, system health
│   │   ├── invoicing/           GST invoices, credit notes, PDF
│   │   ├── notifications/       email + SMS queue, templates
│   │   └── settings/            site settings, pricing, public site
│   │       └── <module>/        <module>.module.ts · *.controller.ts · *.service.ts · *.processor.ts
│   │                            dto/ · *.spec.ts next to the code
│   ├── database/                Prisma module + service (one client per DB)
│   ├── crypto/                  AES-256-GCM key vault (shared, not a business area)
│   ├── queue/                   queue names, job payload types, producers
│   ├── observability/           otel.ts (SDK start) · logger.ts (pino)
│   └── config/                  env schema; the app refuses to start on an invalid value
├── prisma/                      schema.prisma, seed.ts
├── test/                        e2e (supertest), no real DB needed
├── database/manual/             reviewed SQL + rollback SQL, run by hand
├── Dockerfile                   multi-stage, node:22-alpine, non-root user
└── nest-cli.json                "monorepo": true → apps/ + libs/
```

Status of the move:

| Before | Now | Status |
| :--- | :--- | :--- |
| `src/main.ts`, `src/app.*` | `apps/api/src/` | done |
| `src/{auth,team,livekit,portal,invoicing,notifications,settings}/` | `libs/modules/<same name>/` | done |
| `src/prisma/` | `libs/database/` | done |
| `src/crypto/` | `libs/crypto/` | done |
| env checks spread over services | `libs/config/env.validation.ts`, checked once at boot | done (the old per-service checks stay as a second guard) |
| repeating `setInterval` jobs in the api | run only in `apps/worker` (`APP_ROLE`, `libs/config/app-role.ts`) | done |
| `setInterval` timers in `NotificationsService`, `OutboundWebhookService`, `AutoRechargeService`, `InvoiceService`, `RecordingService` | BullMQ job schedulers + `*.processor.ts` | to do |
| — | `libs/queue`, `libs/observability` (OTel + pino) | to do |
| modules import each other | ports (section 2.2) | to do |

### 2.2 Module boundaries (Rule)

- A module in `libs/modules/*` **never imports another module**. It may import only shared libs (`database`, `crypto`, `queue`, `config`, `observability`).
- When module A needs module B, A declares a **port** (an abstract class, for example `WalletPort`, `NotifierPort`). The app (`apps/api` or `apps/worker`) binds the port to B's service in its root module.
- Today `portal` imports `livekit`, `invoicing`, `notifications`, `auth`, `settings`, and `auth` imports `team` and `notifications`. Do not add new cross-module imports. Remove the existing ones one by one, starting with `notifications` (used by most modules), then `settings`.
- No circular module dependencies, no `forwardRef`.

### 2.3 Apps (Rule)

- `apps/api`: HTTP only. No timers, no queue consumers. Long or retried work goes onto a queue.
- `apps/worker`: no HTTP server (`NestFactory.createApplicationContext`). Owns every repeating job. Each job is idempotent, so a retry or two workers never double-charge, double-invoice or double-send.
- Both apps start from the same `libs/config` schema and the same logger.

### 2.4 Code (Rule)

- TypeScript `strict`. No `any` in new code; use `unknown` and narrow it.
- ESM (`"type": "module"`): relative imports end in `.js`.
- Controllers are thin: validate input (class-validator DTO in `dto/`), call one service method, return a DTO. Business logic lives in services.
- Global `ValidationPipe` with `whitelist`, `forbidNonWhitelisted`, `transform`. Every body, query and param has a DTO.
- Every query is scoped to the caller's organization. Never trust an organization id from the client.
- Money uses integer paise (or Prisma `Decimal`), never floating point. Wallet debit and credit run inside one DB transaction with a ledger row.
- Webhooks in: verify the signature on the raw body before parsing. Webhooks out: HMAC-signed, public https URLs only.
- Secrets come from env only. Stored third-party credentials are encrypted with `libs/crypto`.
- Throw Nest HTTP exceptions (`BadRequestException`, ...), never raw `Error`, from controllers and services that serve HTTP.
- Log with the shared pino logger (JSON, with `requestId`, `orgId`). No `console.log` in committed code. Never log secrets, tokens, passwords, card or KYC data.
- OpenAPI decorators on every controller. The spec generates the typed client the frontend uses.

### 2.5 Database (Rule)

- Prisma only. No TypeORM, Sequelize or raw drivers.
- Schema changes: change `prisma/schema.prisma` and add a migration in the same PR.
- Production schema/data changes that are not plain migrations go in `database/manual/YYYYMMDD_<name>.sql` with a matching `..._rollback.sql`, are reviewed in the PR and run by hand. No auto-sync (`prisma db push`) against stag or prod.
- `prisma db seed` deletes data: local only, never stag or prod.

### 2.6 Tests (Rule)

- Vitest. Unit tests `*.spec.ts` next to the code; e2e in `test/*.e2e-spec.ts` with supertest and mocked Prisma (no real DB).
- Every bug fix comes with a test that fails without the fix.
- Money, tax (GST), auth, roles and webhook signatures must have tests.
- `npm test` must pass before push (pre-push hook) and in CI.

### 2.7 Lint and format (Rule)

- `oxlint` (`backend/oxlint.json`) and the root `.prettierrc`.
- Commands: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

### 2.8 Architecture decision: modular monolith, not microservices (Rule)

The backend stays **one NestJS codebase** that runs as **two processes** (`apps/api`, `apps/worker`). Do not split it into microservices.

Why:

| Reason | In this codebase |
| :--- | :--- |
| Small backend | 7 business modules (auth, team, livekit, portal, invoicing, notifications, settings) |
| Money must change in one DB transaction | wallet debit on token mint, refund on participant leave, top-ups, GST invoices, credit notes. Across services this needs sagas / distributed transactions, which are hard to get right with money and GST |
| One database | all modules share one MySQL schema; microservices would need a database per service and a data split |
| Small team | every service needs its own deploy, monitoring and on-call; Flow 2 (PM2 on EC2) is built for a few apps |
| Heavy traffic is already separate | video and audio go through LiveKit and Coturn (media plane), not Nest. Nest only mints tokens and handles billing and webhooks |

What we do instead:

1. **API and worker split.** `apps/api` serves HTTP only. `apps/worker` runs every background job: email and SMS queue, webhook retries, auto recharge, invoice generation, recording reconciliation. Today these run on `setInterval` timers inside the API. With PM2 cluster mode (`instances: max`), each API copy runs its own timers, so the same job can run several times. Fixing this comes first.
2. **BullMQ on Redis** for those jobs: retries with backoff, dead-letter queue, idempotent handlers (safe to run twice).
3. **Clean module boundaries** (section 2.2). Modules talk through ports, not direct imports. Once a module only talks through ports, it can later move into its own service without a rewrite.

Split a module into its own service only when at least one of these is true, and record the decision in a PR that updates this section:

- it must scale very differently from the rest (for example webhook delivery at very high volume)
- it needs another language or runtime (for example a Python ML or OCR service; it then runs as an internal-only app under PM2, called only by the backend)
- a separate team owns it and deploys it on its own schedule
- a compliance rule applies to that part only (for example isolating KYC data)

None of these apply today. Next step: phase P2 in [DEPLOYMENT_RULES.md](DEPLOYMENT_RULES.md) (Nest monorepo layout, timers → BullMQ in `apps/worker`).

---

## 3. Frontend rules (Next.js)

This repo runs Next.js 16 (App Router, React 19, Tailwind 4). Next 16 differs from older versions; read `frontend/node_modules/next/dist/docs/` before using an API you are unsure about (see `frontend/AGENTS.md`).

### 3.1 Folder structure (Target)

```
frontend/
├── src/
│   ├── app/
│   │   ├── (public)/        website: home, features, pricing, docs, contact, legal pages
│   │   ├── (auth)/          login, signup, invite/[token]
│   │   ├── (app)/           signed-in consoles: user/*, admin/*
│   │   ├── api/health/      route.ts for load balancer health checks
│   │   ├── layout.tsx       root layout
│   │   └── robots.ts · sitemap.ts · opengraph-image.tsx
│   ├── components/          shared components (site/ for website-only pieces)
│   ├── lib/                 api.ts (only way to call the backend) · env.ts · auth helpers · formatters
│   ├── proxy.ts             edge session check (Next 16 name for middleware)
│   └── instrumentation.ts   OTel start
├── public/
├── tests/                   Playwright e2e
├── Dockerfile               multi-stage, output: "standalone", non-root
└── next.config.ts
```

Route groups `( )` do not change URLs, so moving `user/`, `admin/`, `login/` etc. into them keeps every link working.

### 3.2 Code (Rule)

- **The frontend never touches the database or partner secrets.** No Prisma, no DB URL, no Razorpay/KYC/SMS keys in `frontend/`. Everything goes through the backend API via `src/lib/api.ts`.
- Only `NEXT_PUBLIC_*` env values reach the browser; never put a secret in one. Read env through `src/lib/env.ts`, which fails the build on a missing value.
- Server Components by default. Add `'use client'` only for state, effects, event handlers or browser APIs, and keep client components small.
- Import with the `@/` alias, never with `../../`.
- Components: PascalCase file names, one component per file, props typed. Shared UI goes in `components/`; a component used by one page stays next to that page.
- Styling: Tailwind classes, `clsx` + `tailwind-merge` for conditional classes. No inline style objects except dynamic values.
- Every page works at phone width (360 px) with no horizontal scroll, works in keyboard-only use, and has visible focus states and alt text.
- Console pages (`/user/*`, `/admin/*`) send `X-Robots-Tag: noindex` (set in `next.config.ts`).
- Show loading, empty and error states for every data view. Never show a raw error object to the user.
- No `console.log` in committed code.

### 3.3 Lint, test, build (Rule)

- `eslint` (`eslint-config-next` core-web-vitals + typescript), root `.prettierrc`.
- Commands: `npm run lint`, `npx tsc --noEmit`, `npm run build`, Playwright for e2e.

---

## 4. Git and GitHub rules

Remote: `github.com/Vikram662/nexora`.

### 4.1 Branches (Rule)

| Branch | Deploys to | Who writes |
| :--- | :--- | :--- |
| `main` | production | merge from `stag` only, through a PR |
| `stag` | staging (`stag-*` hosts) | merge from `dev` through a PR, or a hotfix |
| `dev` | dev (`dev-*` hosts) | merge from feature branches through a PR |
| `feat/<ticket>-<slug>` | — | you |
| `fix/<ticket>-<slug>` | — | you |
| `hotfix/<ticket>-<slug>` | — | branch from `main`, PR into `main`, then merge `main` back into `stag` and `dev` the same day |

- Branch from `dev` (or `main` for a hotfix). Keep branches short-lived: merge within a few days.
- Branch names: lowercase, words joined with `-`, for example `feat/nx-142-wallet-auto-recharge`. Must match `^(feat|fix|hotfix|chore)/[a-z0-9._-]+$`.
- Delete the branch after merging.

### 4.2 Commit messages (Rule)

Conventional commits, checked by commitlint in the `commit-msg` hook and in CI:

```
<type>(<scope>): <what changed, imperative, lower case, no full stop>
```

- Types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`, `style`, `revert`.
- Regex (push rule): `^(feat|fix|chore|docs|refactor|test|perf|ci|build|style|revert)(\(.+\))?!?: .{1,72}$`
- Scopes: `backend`, `frontend`, `api`, `worker`, `auth`, `team`, `livekit`, `portal`, `invoicing`, `notifications`, `settings`, `db`, `deploy`, `ci`, `deps`.
- Breaking change: `feat(api)!: ...` and a `BREAKING CHANGE:` footer.
- One logical change per commit. Messages like `update`, `changes`, `design change` or `commit live` are rejected.
- Commits carry only the developer's own git identity. No co-author trailers for tools or bots.

Examples:

```
feat(invoicing): add credit note PDF
fix(portal): stop double credit when checkout and webhook race
docs: add engineering rules
```

### 4.3 Local gates (Rule)

| Hook | Runs | Blocks when |
| :--- | :--- | :--- |
| `pre-commit` | lint-staged: oxlint/eslint `--fix` + prettier `--write` on staged files | lint error |
| `pre-commit` | related unit tests only (`vitest related --run`) | failing test |
| `commit-msg` | commitlint, subject at most 72 characters | message not conventional |
| `pre-push` | type-check + build (backend and frontend) | type or build error |

Never bypass with `--no-verify`. If a hook is wrong, fix the hook in a PR.

### 4.4 Branch protection (GitHub → Settings → Branches / Rulesets)

Apply to `main`, `stag` and `dev`:

- Require a pull request before merging; no direct pushes, including admins.
- Required approvals: `main` 1 (code owner), `stag` 1, `dev` 1.
- Require review from Code Owners (`.github/CODEOWNERS`).
- Dismiss stale approvals when new commits are pushed.
- Require status checks to pass: `backend`, `frontend` (CI jobs); require branches to be up to date before merging.
- Require conversation resolution before merging.
- Require linear history; merge method: **squash** for feature → `dev`, **merge commit** for `dev` → `stag` → `main`.
- Block force pushes and branch deletion.
- Automatically delete head branches after merge (repo setting).

Repo settings: enable Dependabot security alerts and secret scanning with push protection.

### 4.5 Pull requests (Rule)

- Title follows the commit format (it becomes the squash commit).
- Body: what changed, why, how it was tested, screenshots for UI, migration or env changes, rollback steps.
- Keep PRs small (about 400 changed lines or fewer, lockfiles excluded). Split bigger work.
- CI green and all conversations resolved before merge. The author merges after approval.
- A PR that changes env keys updates `.env.example` and `README.md`.
- A PR that changes the DB includes the migration (or `database/manual/` SQL + rollback).

### 4.6 CI (GitHub Actions, `.github/workflows/ci.yml`)

Runs on every push to `dev`, `stag`, `main` and on every PR:

- **backend**: `npm ci` → `prisma generate` → `typecheck` → `lint` → `test` → `build`
- **frontend**: `npm ci` → `tsc --noEmit` → `lint` → `build`
- **commitlint** on PR commits
- Node version from `.nvmrc`, npm cache on.

Deploy (Flow 2: Jenkins build server + PM2 on EC2, no Docker):

```
merge to dev / stag / main → Jenkins: lint + test → build → release-<sha>.tar.gz
→ rsync over SSH → current symlink → pm2 reload (zero downtime) → /health check → rollback on fail
```

- `dev` and `stag` deploy automatically; `main` deploys after an approval in Jenkins, one server at a time.
- Secrets live in Infisical (dev / stag / prod), read at runtime, never in the repo or in CI variables.
- Full steps, server folders, AWS layout and runbooks: [DEPLOYMENT_RULES.md](DEPLOYMENT_RULES.md).

### 4.7 CODEOWNERS and dependencies

- `.github/CODEOWNERS`: `* @Vikram662`; add owners per path (`/backend/`, `/frontend/`, `/deploy/`) as the team grows.
- Renovate (or Dependabot) opens dependency PRs; `minimumReleaseAge: "7 days"`; group minor/patch updates; majors are separate PRs.
- Commit lockfiles (`package-lock.json`). Use `npm ci` in CI and on servers.

---

## 5. Environments and secrets (Rule)

| Env | Branch | Hosts |
| :--- | :--- | :--- |
| dev | `dev` | `dev-*` |
| stag | `stag` | `stag-*` |
| prod | `main` | production hosts |

- `.env` files are never committed. Every key is listed in `backend/.env.example` / `frontend/.env.example` with a comment.
- Different secrets per environment. Demo values in `.env.example` are for local use only.
- Rotate a secret right away if it was ever committed, pasted in chat or logged.

---

## 6. Definition of done

A change is done when:

- [ ] lint, typecheck, tests and build pass locally and in CI
- [ ] tests cover the change (a failing test first for bug fixes)
- [ ] no new cross-module import in `libs/modules/*`
- [ ] no secret, DB access or partner key in the frontend
- [ ] env keys documented, migrations included, rollback known
- [ ] PR reviewed by a code owner and merged through the protected branch
- [ ] health check is green after deploy and logs show no new errors
