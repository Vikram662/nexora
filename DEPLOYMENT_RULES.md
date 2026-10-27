# Nexora Platform and Deployment Rules

Target platform: **Flow 2 — Jenkins + PM2 on EC2 (no Docker for the apps)**.
GitHub Actions runs lint and tests on every push; Jenkins builds and deploys; the apps run on EC2 under PM2.
Secrets come from Infisical at runtime. Logs and traces go to OpenTelemetry → CloudWatch + Grafana.
Data lives in RDS (MySQL 8), ElastiCache (Redis, BullMQ) and S3.

Code standards (folders, NestJS, Next.js, Git) are in [ENGINEERING_RULES.md](ENGINEERING_RULES.md). This file covers everything from the laptop to production.

```
Laptop → feat/ or fix/ branch → PR: dev → stag → main → GitHub Actions (lint + test)
→ Jenkins build → rsync over SSH → EC2: pm2 reload → users (ALB)
```

Fast path: no image build, no registry, no cluster. Same Git rules as Flow 1: nothing reaches prod without a PR, green lint/tests and an approval in Jenkins.

---

## 1. Local development (every developer, same setup)

| Tool | Version / rule |
| :--- | :--- |
| Node | 22 LTS, from `.nvmrc` (`nvm use`) |
| Docker Desktop | only for local services, never for running the apps |
| Infisical CLI | `infisical run --env=dev -- npm run start:dev`: env injected at run, no `.env` file with real secrets on the laptop |

Local services:

```
docker compose up        → mysql 8.0 + redis 7 + otel-collector (console exporter)
docker/docker-compose.yml → LiveKit SFU + Coturn + Redis (media plane)
```

Start the apps:

```
backend:  npm run start:dev           (api on :4000)
          npm run start:worker:dev    (worker, no port)
frontend: npm run dev                 (:3000)
```

Logging on the laptop: pino with `pino-pretty`, `LOG_LEVEL=debug`. Production: JSON only.
`console.log` is allowed only on your laptop and never committed.

### 1.1 Local gates (a commit that fails a gate never leaves the laptop)

| Hook | Runs |
| :--- | :--- |
| `pre-commit` | ESLint/oxlint `--fix` + Prettier `--write` on staged files (lint-staged) |
| `pre-commit` | related unit tests only (`vitest related --run <staged files>`) |
| `commit-msg` | commitlint (conventional commits) |
| `pre-push` | type-check + build |

Examples of good commit messages:

```
feat(invoicing): add credit note PDF
fix(portal): stop double credit on webhook retry
refactor(livekit): move token mint into service
```

Rejected: `update`, `changes`, `design change`, `commit live`.

---

## 2. Git flow and GitHub rules

```
feat/<ticket>-<slug>  ─┐
fix/<ticket>-<slug>   ─┼─► dev  ──PR──► stag ──PR──► main
                       │    │            │            │
                       │  auto deploy  auto deploy  deploy prod
                       │    dev          stag       (manual approval)
hotfix/<ticket>-<slug> ── from main ──PR──► main, then merged back into stag and dev the same day
```

Each arrow = PR + 1 approval + green CI → delete branch after merge.

### 2.1 Branch protection (Settings → Branches / Rulesets) on `main`, `stag`, `dev`

- Allowed to push: **no one**. Allowed to merge: **maintainers**. No force push, no deletion.
- Merge only by PR with **1 approval**, CI must pass, all threads resolved.
- Code owner review required (`.github/CODEOWNERS`).
- Dismiss stale approvals on new commits. Branch must be up to date before merge.

### 2.2 Push rules

- Commit message must match:
  `^(feat|fix|chore|docs|refactor|test|perf|ci|build|style|revert)(\(.+\))?!?: .{1,72}$`
- Branch name must match: `^(feat|fix|hotfix|chore)/[a-z0-9._-]+$` (plus `main`, `stag`, `dev`)
- Every push runs the lint pipeline (GitHub Actions).
- Default branch is `main` (never `master`). Delete stale branches.

### 2.3 Dependencies (Renovate)

```json
{
  "extends": ["config:recommended"],
  "minimumReleaseAge": "7 days",
  "schedule": ["before 6am on monday"],
  "baseBranches": ["dev"],
  "packageRules": [{ "matchUpdateTypes": ["minor", "patch"], "groupName": "minor and patch" }]
}
```

Packages are kept up to date, but only with releases at least 7 days old. Renovate opens PRs into `dev`; majors come as separate PRs.

---

## 3. CI/CD: GitHub Actions + Jenkins build server → EC2 (no Docker)

```
GitHub push / merge
   │  webhook
   ▼
Jenkins multibranch job ── checkout + deps (npm ci)
   ▼
lint + test (same as GitHub Actions)
   ▼
build: nest build / next build
   ▼
package: release-<sha>.tar.gz
   ▼
rsync over SSH → /srv/nexora/releases/<ts>-<sha>
   ▼
switch symlink: current → releases/<ts>-<sha>
   ▼
pm2 reload ecosystem.config.cjs (zero downtime)
   ▼
health check: GET /health = 200 on every port ── fail → rollback to previous release
```

### 3.1 Branch → target server (Jenkins picks the SSH host from the branch name)

| Branch | Server | When |
| :--- | :--- | :--- |
| `dev` | `dev-app-01` | automatic on merge |
| `stag` | `stag-app-01` | automatic on merge |
| `main` | `prod-app-01`, then `prod-app-02` | after `input` approval in Jenkins; one server at a time |

### 3.2 Jenkinsfile (same shape for every repo, `deploy/jenkins/Jenkinsfile`)

```groovy
pipeline {
  agent { label 'builder' }
  options { disableConcurrentBuilds(); timestamps() }
  stages {
    stage('Install') { steps { sh 'npm ci --prefix backend && npm ci --prefix frontend' } }
    stage('Lint + Test') { steps { sh './deploy/jenkins/check.sh' } }   // lint, typecheck, unit tests
    stage('Build') { steps { sh './deploy/jenkins/build.sh' } }         // nest build, next build (standalone)
    stage('Package') { steps { sh './deploy/jenkins/package.sh' } }     // release-<sha>.tar.gz
    stage('Approve prod') {
      when { branch 'main' }
      steps { input message: 'Deploy to production?' }
    }
    stage('Deploy') {
      when { anyOf { branch 'dev'; branch 'stag'; branch 'main' } }
      steps { sshagent(['deploy-key']) { sh "./deploy/jenkins/deploy.sh ${env.BRANCH_NAME}" } }
    }
  }
  post { failure { slackSend channel: '#deploys', message: "FAILED ${env.JOB_NAME} ${env.BUILD_NUMBER}" } }
}
```

### 3.3 deploy.sh (what it must do, in order)

```bash
# deploy/jenkins/deploy.sh <branch>
REL="$(date +%Y%m%d%H%M)-${GIT_COMMIT:0:7}"
for HOST in $HOSTS; do                                   # prod: one server at a time
  rsync -az --delete release/ deploy@$HOST:/srv/nexora/releases/$REL/
  ssh deploy@$HOST "cd /srv/nexora/releases/$REL/backend && npx prisma migrate deploy"   # first host only
  ssh deploy@$HOST "ln -sfn /srv/nexora/releases/$REL /srv/nexora/current \
                    && pm2 reload /srv/nexora/current/deploy/pm2/ecosystem.config.cjs --env $ENV --update-env"
  ssh deploy@$HOST "curl -fsS localhost:4000/health && curl -fsS localhost:3000/api/health" \
    || ssh deploy@$HOST "/srv/nexora/bin/rollback.sh"    # current → previous release, pm2 reload
done
```

Rules:
- Build once and deploy the same tarball. Never run `npm install` or `git pull` on a server.
- Keep the last **5 releases** on each server; older ones are deleted by the deploy.
- Rollback = point `current` to the previous release + `pm2 reload`. Target time: under 1 minute.
- DB migrations must be **backward compatible** (expand → deploy → contract) because the old release keeps serving during reload and rollback.
- Take an RDS snapshot before every prod deploy that contains a migration or `database/manual/` SQL.
- `NEXT_PUBLIC_*` values are baked into the frontend at build time, so Jenkins builds the frontend separately for each env with that env's public values.

---

## 4. Server folder structure (every app server: dev, stag, prod)

```
/srv/nexora/
├── releases/
│   ├── 202610271130-a1b2c3d/          one folder per deploy, never edited after rsync
│   │   ├── backend/
│   │   │   ├── dist/                  apps/api + apps/worker + libs (built)
│   │   │   ├── node_modules/          production deps only (npm ci --omit=dev)
│   │   │   ├── prisma/                schema + migrations
│   │   │   └── package.json
│   │   ├── frontend/
│   │   │   ├── .next/standalone/      server.js (output: "standalone")
│   │   │   ├── .next/static/
│   │   │   └── public/
│   │   └── deploy/pm2/ecosystem.config.cjs
│   └── 202610261540-9f8e7d6/          previous release (rollback target)
├── current -> releases/202610271130-a1b2c3d
├── shared/
│   ├── env/
│   │   ├── api.env                    rendered by Infisical Agent, mode 600, owner nexora
│   │   ├── worker.env
│   │   └── frontend.env
│   └── logs/                          pm2 logs only as fallback; real logs go to CloudWatch
└── bin/
    └── rollback.sh
```

| Path / item | Rule |
| :--- | :--- |
| Linux users | `nexora` runs the apps (no sudo, no shell login); `deploy` owns `/srv/nexora/releases` and receives rsync from Jenkins only |
| SSH | port 22 open **only** to the Jenkins private IP. Humans use AWS SSM Session Manager |
| Node | 22 via nvm for user `nexora` |
| Process manager | pm2 started by `pm2 startup systemd`; `pm2 save` after every change |
| systemd services | `infisical-agent` (project nexora, env = server env), `otelcol-contrib` (OTLP → CloudWatch + Grafana) |
| Server setup | one Ansible playbook / EC2 user-data installs Node 22, pm2, otelcol, Infisical Agent, users, SSH keys. Never configure a server by hand |

### 4.1 PM2 apps (`deploy/pm2/ecosystem.config.cjs`)

| name | port | mode | instances | notes |
| :--- | :--- | :--- | :--- | :--- |
| `nexora-frontend` | 3000 | cluster | 2 | `node .next/standalone/server.js` |
| `nexora-api` | 4000 | cluster | max (vCPU count) | HTTP only |
| `nexora-worker` | — | fork | 1 | BullMQ consumers + job schedulers, no port |

Every app has `max_memory_restart`, `kill_timeout: 10000` (graceful shutdown on SIGTERM), `env_file` from `/srv/nexora/shared/env/<app>.env`, and `time: true`.
dev and stag run every app with 1 instance.

### 4.2 Media plane (LiveKit, Coturn)

The SFU and TURN need public UDP, so they do **not** sit behind the ALB and do not run on the app servers.

| Item | Rule |
| :--- | :--- |
| Server | `media-01` (prod), `media-dev-01` (dev+stag), public subnet, Elastic IP |
| Software | LiveKit SFU + egress + Coturn from `docker/` (the only place Docker runs in Flow 2), started by systemd |
| Ports | 443 / 7880 (signal over TLS), 7881 TCP, 50000–60000 UDP, 3478 / 5349 TURN |
| State | LiveKit uses ElastiCache Redis (multi-node ready) |
| Keys | LiveKit API key/secret from Infisical, same values in `nexora-api` env |

---

## 5. AWS runtime (ap-south-1, Mumbai)

One VPC, 2 AZs. Public subnets: ALB, NAT, media servers. Private subnets: app servers, RDS, Redis, Jenkins.

```
Users / customer apps
   ▼
Route 53 ─► AWS WAF (rate limit, bot control, OWASP managed rules) ─► ALB (public, ACM certs)
                                                                         │ host rule → target group per pm2 port
                         ┌───────────────────────────────────────────────┴───────────────┐
                         ▼                                                               ▼
               prod-app-01 (AZ a)                                              prod-app-02 (AZ b)
               nexora-frontend :3000 ×2                                       same apps, same release
               nexora-api      :4000 ×max                                     (worker runs on ONE server only,
               nexora-worker   ×1                                              or both with BullMQ locks)
                         │
     ┌──────────────┬────┴─────────┬──────────────┬────────────────┐
     ▼              ▼              ▼              ▼                ▼
 RDS MySQL 8   ElastiCache      S3 (private,   Infisical Cloud   Elastic IP / NAT
 Multi-AZ      Redis/Valkey     KMS)           dev/stag/prod     fixed outbound IP per env
 PITR 14 days  BullMQ + cache   recordings,                      (whitelisted at Razorpay,
 private       replica in AZ b  invoices, KYC                    KYC, SMS partners)
```

### 5.1 Servers

| Server | Size | Apps | Notes |
| :--- | :--- | :--- | :--- |
| `prod-app-01` | c7g.xlarge (Graviton) | all, AZ a | |
| `prod-app-02` | c7g.xlarge | all, AZ b | add when traffic needs it; ALB sends traffic to both |
| `stag-app-01` | t4g.xlarge | all ×1 | nearest copy of prod data (masked) |
| `dev-app-01` | t4g.large | all ×1 | stopped 21:00–08:00 |
| `jenkins-01` | t4g.large | Jenkins | private subnet, no public IP, keeps no data |

An Auto Scaling Group (min 1) per env can replace a broken server from the same playbook.

### 5.2 ALB target groups

| Host | Target |
| :--- | :--- |
| `www.<domain>`, `<domain>` | `:3000` nexora-frontend |
| `api.<domain>` | `:4000` nexora-api |
| `rtc.<domain>` | media server (LiveKit signal) |

Health checks: `GET /health` on `:4000`, `GET /api/health` on `:3000`, every 15 s.

### 5.3 Security groups (nothing else is open)

| From | To | Port |
| :--- | :--- | :--- |
| ALB | app servers | 3000, 4000 |
| Jenkins | app servers | 22 |
| app servers | RDS | 3306 |
| app servers | Redis | 6379 |
| media servers | Redis | 6379 |
| internet | ALB | 443 (80 redirects to 443) |
| internet | media servers | 443, 7881 TCP, 50000–60000 UDP, 3478, 5349 |

### 5.4 Data services

| Service | Rule |
| :--- | :--- |
| RDS MySQL 8.0 | Multi-AZ in prod, InnoDB + utf8mb4, PITR 14 days, private, encrypted, one DB user per app with least privilege |
| ElastiCache Redis | BullMQ queues + app cache, replica in 2nd AZ (prod), TLS + auth |
| S3 | private buckets, KMS encryption, block public access; invoices, exports, DB dumps. Customer recordings go to the customer's own bucket (BYOS) |
| CloudWatch Logs | `/nexora/<env>/<app>`, JSON lines; retention prod 90 days, dev/stag 14 days |
| Grafana Cloud | Tempo (traces), Prometheus (metrics), dashboards + alerts → Slack |

---

## 6. Domains

Production URLs stay the same. Only new hosts are added: `dev-*` and `stag-*`.

| App | prod | stag | dev |
| :--- | :--- | :--- | :--- |
| website + consoles | `www.<domain>` | `stag-www.<domain>` | `dev-www.<domain>` |
| API | `api.<domain>` | `stag-api.<domain>` | `dev-api.<domain>` |
| LiveKit | `rtc.<domain>` | `stag-rtc.<domain>` | `dev-rtc.<domain>` |
| TURN | `turn.<domain>` | `stag-turn.<domain>` | `dev-turn.<domain>` |

- One ACM certificate per env (`*.<domain>`). Certificates renew automatically; an alert fires 21 days before expiry.
- dev and stag sit behind WAF IP allow-list (office/VPN) and send `noindex`.

---

## 7. Production must-haves

### Reliability
- RDS Multi-AZ, PITR 14 days, snapshot before every DB change.
- Prod runs on 2 app servers behind the ALB once traffic needs it, deployed one at a time.
- Readiness + liveness on `/health`; graceful shutdown on SIGTERM.
- `pm2 reload` = zero downtime; previous release kept for rollback.
- BullMQ: retries with backoff + dead-letter queue. Jobs are idempotent (safe to run twice): wallet debits, invoices, emails, webhooks.
- Restore drill once a quarter (DB + S3).

### Security
- No public DB or Redis. SSM instead of SSH for people. One IAM role per server role.
- All secrets in Infisical; rotate any secret that ever sat in a repo, a `.env` on a server or a chat.
- WAF rate limits; admin console behind IP allow-list.
- SAST + dependency scan in CI (`npm audit --audit-level=high`, GitHub secret scanning with push protection).
- Audit log for money and access actions (wallet, payments, invoices, credit notes, API keys, roles, deletes).

### Observability
- OTel SDK starts first in every app (`libs/observability/otel.ts`, `frontend/src/instrumentation.ts`).
- pino JSON logs with `traceId`, `requestId`, `orgId`.
- One trace per request: browser → frontend → api → worker → partner API.
- Alerts: 5xx rate, p95 latency, queue depth, DLQ > 0, failed job, RDS CPU / connections, disk, cert expiry, LiveKit room failures.
- Uptime checks on every public URL (Grafana synthetic).
- One dashboard per service + one business dashboard (minutes used, top-ups, failed payments).

### Cost and operations
- Infra as code: Terraform (VPC, EC2, RDS, Redis, S3, IAM, ALB, WAF, Route 53).
- dev + stag: smaller Graviton EC2, stopped at night.
- AWS Budgets + alerts; tags on everything: `app`, `env`, `owner`.
- Runbook per service: restart, rollback, re-run a job, rotate a secret.
- On-call: alerts → Slack `#alerts`, one owner per service.
- Monthly: remove old releases, unused snapshots, unused secrets, unused IAM keys.

**Definition of done for Flow 2:** lint + tests green, OTel traces visible, JSON logs in CloudWatch, alerts set, runbook written, secrets in Infisical, rollback tested.

---

## 8. Tasks to set up Flow 2 (in order: cloud + code first, database restructure later)

1. **AWS foundation**: VPC, subnets, NAT, security groups, IAM roles, KMS.
2. **Servers**: EC2 for Jenkins, dev, stag, prod; Node 22, pm2, otelcol, Infisical Agent (Ansible).
3. **Data services**: RDS MySQL 8, ElastiCache, S3.
4. **Secrets**: Infisical project, machine identity per server, agent templates per app, `.env` files removed from servers.
5. **Repo template**: lint, prettier, tests, husky, commitlint, renovate, Jenkinsfile, pm2 file (see ENGINEERING_RULES.md).
6. **GitHub + Jenkins**: `main`/`stag`/`dev` + protection rules, webhook → Jenkins, multibranch job, SSH deploy key in Jenkins credentials.
7. **Edge**: Route 53, `dev-`/`stag-` hosts, ACM, WAF, ALB, target group per port.
8. **Go live**: dev → stag → prod; DNS cutover per host; old server kept 2 weeks; dashboards + alerts on.

### 8.1 Phases

| Phase | What | Done when |
| :--- | :--- | :--- |
| P0 Standards | `main`/`stag`/`dev`, protection + push rules, PR only, template files, Infisical project, all `.env` moved | every push runs lint, no direct pushes |
| P1 Move to AWS as it is | RDS, ElastiCache, S3, Route 53, EC2 + PM2, cut over host by host | old server off after 2 quiet weeks |
| P2 Backend into Nest monorepo | `apps/api` + `apps/worker` + `libs/modules`, timers → BullMQ, env schema, OTel + pino | no `setInterval` jobs in the API |
| P3 Frontend cleanup | route groups, `lib/api.ts` only, `standalone` output, Playwright, `/api/health` | no secrets or DB access in frontend |
| P4 Database | InnoDB + utf8mb4 everywhere, drop duplicate/unused tables, one source per fact | migrations + rollback SQL reviewed |

Each phase ends with the old piece switched off.

---

## 9. Flow 1 (Kubernetes) vs Flow 2 (Jenkins + PM2)

| | Flow 1 · EKS + Docker | Flow 2 · Jenkins + PM2 (no Docker) |
| :--- | :--- | :--- |
| Build output | Docker image in ECR (`:<sha>`) | `release-<sha>.tar.gz` copied with rsync |
| Deploy time (typical) | 8–12 min (image build + rollout) | 3–5 min (build + rsync + pm2 reload) |
| Rollback | `kubectl rollout undo` | point `current` to the previous release + `pm2 reload` |
| Scaling | automatic: HPA (CPU, queue depth), Karpenter (nodes) | manual: add an EC2 from the playbook; pm2 cluster uses all CPUs |
| Secrets at runtime | Infisical operator → k8s Secret → pod env | Infisical Agent → env file → node env |
| Isolation | each app in its own pod with CPU / memory limits | apps share a server; pm2 `max_memory_restart` per app |
| Fixed cost | EKS control plane (~$73/month) + nodes | EC2 only |
| Skills needed | Kubernetes, Helm, Kustomize, Docker | Linux, PM2, SSH, Ansible |
| Best for | growth: many services, traffic spikes, autoscaling | fast start: live in days, small team |

**Suggested path:** go live on Flow 2 first (same PM2 model as today, fastest move to AWS). Keep a `Dockerfile` and `deploy/k8s/` from day one so moving to Flow 1 later is a pipeline change, not a code change. Data services (RDS, Redis, S3, Infisical, OTel) are the same in both.

---

## 10. Today → target (platform standards)

| Area | Today | Target |
| :--- | :--- | :--- |
| Hosting | one server, PM2 from repo root | AWS ap-south-1, Flow 2 (EC2 + PM2), Flow 1 later |
| Database | MySQL on the server | RDS MySQL 8 Multi-AZ, InnoDB + utf8mb4 |
| Crons / queue | `setInterval` timers inside the API process | ElastiCache + BullMQ in `nexora-worker`; retries, DLQ |
| Secrets | `.env` files on the server | Infisical (dev / stag / prod) read at runtime; leaked secrets rotated |
| Logs | `console.log`, pm2 log files on disk | pino JSON → CloudWatch Logs |
| Monitoring | `/health` + admin system-health page | OTel traces + metrics, Grafana dashboards, alerts to Slack |
| CI / CD | GitHub Actions lint/test on `main` only; manual deploy | GitHub Actions on every push + Jenkins deploys; prod needs approval |
| Git | `main` only, direct pushes, messages like "design change" | `main`/`stag`/`dev` protected, `feat/` `fix/` branches, PR only, conventional commits |
| Packages | manual updates | Node 22 LTS, Renovate with 7-day minimum release age |
| Edge | certificates per server, no WAF | Route 53 + WAF + ALB + ACM; new `dev-*` and `stag-*` hosts |

---

## 11. First-time server setup (step by step)

Done by the Ansible playbook (`deploy/ansible/app-server.yml`) or EC2 user-data, never by hand. These are the steps it runs, so anyone can read and check them.

### 11.1 App server (`dev-app-01`, `stag-app-01`, `prod-app-0N`)

```bash
# 1. OS: Amazon Linux 2023 or Ubuntu 24.04 LTS (arm64 for Graviton), latest patches
sudo dnf -y update            # or: sudo apt-get update && sudo apt-get -y upgrade
sudo timedatectl set-timezone Asia/Kolkata

# 2. Users
sudo useradd --system --create-home --shell /usr/sbin/nologin nexora    # runs the apps
sudo useradd --create-home --shell /bin/bash deploy                     # receives releases from Jenkins
sudo usermod -aG nexora deploy

# 3. Folders
sudo mkdir -p /srv/nexora/{releases,shared/env,shared/logs,bin}
sudo chown -R deploy:nexora /srv/nexora
sudo chmod 750 /srv/nexora /srv/nexora/shared/env

# 4. SSH: only the Jenkins public key for user deploy; no password login, no root login
#    /home/deploy/.ssh/authorized_keys  -> from="<jenkins private IP>" ssh-ed25519 AAAA... jenkins-deploy
#    /etc/ssh/sshd_config               -> PasswordAuthentication no, PermitRootLogin no

# 5. Node 22 + pm2 for user nexora (deploy runs pm2 through: sudo -u nexora pm2 ...)
#    install nvm, then: nvm install 22 && npm i -g pm2
#    pm2 startup systemd -u nexora --hp /home/nexora

# 6. Infisical Agent (systemd): renders /srv/nexora/shared/env/*.env from Infisical (12.2)
# 7. otelcol-contrib (systemd): OTLP on 127.0.0.1:4317/4318 -> CloudWatch + Grafana (12.3)
# 8. SSM agent on (people connect with: aws ssm start-session --target <instance-id>)
# 9. CloudWatch agent: disk, memory, pm2 fallback logs
# 10. pm2-logrotate: max 50 MB per file, keep 7
```

Checklist after setup:

- [ ] `ssh deploy@<host>` works from Jenkins only
- [ ] `systemctl status infisical-agent otelcol-contrib pm2-nexora` all active
- [ ] `/srv/nexora/shared/env/api.env` exists, mode `600`, owner `nexora`
- [ ] server reaches RDS `3306` and Redis `6379`; nothing else listens publicly (`ss -tlnp`)
- [ ] instance tags: `app=nexora`, `env=<env>`, `owner=<team>`

### 11.2 Jenkins server (`jenkins-01`)

1. Private subnet, no public IP. UI reached over SSM port-forward or VPN only.
2. Install Jenkins LTS, Java 21, Node 22, `rsync`, `git`.
3. Plugins: Pipeline, Multibranch, GitHub Branch Source, SSH Agent, Credentials Binding, Slack Notification, Timestamper.
4. Credentials:
   - `github-app`: GitHub App (read repo, write commit status)
   - `deploy-key`: SSH private key whose public key is on every app server for user `deploy`
   - `infisical-build`: machine identity that reads only build-time `NEXT_PUBLIC_*` values
5. One multibranch job per repo; branch sources `dev`, `stag`, `main`, `hotfix/*`; GitHub webhook → `https://<jenkins>/github-webhook/`.
6. Workspace wiped after every build (`cleanWs()`). Artifacts kept at most 14 days.

### 11.3 Media server (`media-01`)

1. Public subnet, Elastic IP, security group from section 5.3.
2. Docker Engine + compose plugin (the only server type that runs Docker).
3. Copy `docker/` (compose, `livekit.prod.yaml`, `egress.yaml`, `turnserver.conf`) to `/srv/nexora-media/`.
4. LiveKit keys and TURN secret from Infisical into `/srv/nexora-media/.env` (mode 600).
5. systemd unit `nexora-media.service` runs `docker compose up -d` at boot.
6. TLS for `rtc.<domain>` and `turn.<domain>`: LiveKit built-in TLS, or ACM on an NLB TLS listener.

---

## 12. Runtime config files (examples to copy)

### 12.1 `deploy/pm2/ecosystem.config.cjs`

```js
const path = require('node:path');
const root = path.resolve(__dirname, '../..'); // /srv/nexora/current
const shared = '/srv/nexora/shared';

const common = {
  autorestart: true,
  watch: false,
  time: true,
  kill_timeout: 10000, // wait for graceful shutdown (SIGTERM)
  listen_timeout: 10000,
  max_restarts: 10,
  exp_backoff_restart_delay: 200,
  merge_logs: true,
};

module.exports = {
  apps: [
    {
      ...common,
      name: 'nexora-api',
      cwd: `${root}/backend`,
      script: 'dist/apps/api/src/main.js',
      node_args: '--enable-source-maps',
      exec_mode: 'cluster',
      instances: 'max',
      max_memory_restart: '1G',
      env_file: `${shared}/env/api.env`,
      error_file: `${shared}/logs/api-error.log`,
      out_file: `${shared}/logs/api-out.log`,
    },
    {
      ...common,
      name: 'nexora-worker',
      cwd: `${root}/backend`,
      script: 'dist/apps/worker/src/main.js',
      node_args: '--enable-source-maps',
      exec_mode: 'fork',
      instances: 1,
      max_memory_restart: '768M',
      env_file: `${shared}/env/worker.env`,
      error_file: `${shared}/logs/worker-error.log`,
      out_file: `${shared}/logs/worker-out.log`,
    },
    {
      ...common,
      name: 'nexora-frontend',
      cwd: `${root}/frontend/.next/standalone`,
      script: 'server.js',
      exec_mode: 'cluster',
      instances: 2,
      max_memory_restart: '768M',
      env: { PORT: 3000, HOSTNAME: '0.0.0.0' },
      env_file: `${shared}/env/frontend.env`,
      error_file: `${shared}/logs/frontend-error.log`,
      out_file: `${shared}/logs/frontend-out.log`,
    },
  ],
};
```

dev and stag run every app with `instances: 1`.

### 12.2 Infisical Agent (`/etc/infisical/agent.yaml`)

```yaml
infisical:
  address: https://app.infisical.com
auth:
  type: universal-auth
  config:
    client-id: /etc/infisical/client-id # machine identity of THIS server
    client-secret: /etc/infisical/client-secret
templates:
  - source-path: /etc/infisical/api.tmpl
    destination-path: /srv/nexora/shared/env/api.env
    config:
      polling-interval: 300s
      execute: { command: 'sudo -u nexora pm2 reload nexora-api --update-env', timeout: 60 }
  - source-path: /etc/infisical/worker.tmpl
    destination-path: /srv/nexora/shared/env/worker.env
  - source-path: /etc/infisical/frontend.tmpl
    destination-path: /srv/nexora/shared/env/frontend.env
```

Rules: one machine identity per server, allowed to read only its own env (`dev`, `stag` or `prod`). Secret folders: `/backend`, `/worker`, `/frontend`, `/media`, `/build`.

### 12.3 OTel collector (`/etc/otelcol-contrib/config.yaml`)

```yaml
receivers:
  otlp:
    protocols:
      grpc: { endpoint: 127.0.0.1:4317 }
      http: { endpoint: 127.0.0.1:4318 }
processors:
  batch: {}
  resourcedetection: { detectors: [env, ec2] }
exporters:
  awscloudwatchlogs: { log_group_name: /nexora/prod/apps, log_stream_name: nexora }
  otlphttp/grafana:
    endpoint: https://otlp-gateway-<zone>.grafana.net/otlp
    headers: { Authorization: 'Basic ${env:GRAFANA_OTLP_TOKEN}' }
service:
  pipelines:
    traces: { receivers: [otlp], processors: [resourcedetection, batch], exporters: [otlphttp/grafana] }
    metrics: { receivers: [otlp], processors: [resourcedetection, batch], exporters: [otlphttp/grafana] }
    logs: { receivers: [otlp], processors: [resourcedetection, batch], exporters: [awscloudwatchlogs, otlphttp/grafana] }
```

### 12.4 Env keys per app (values in Infisical, names in `.env.example`)

| App | Keys |
| :--- | :--- |
| `nexora-api` | `NODE_ENV`, `PORT=4000`, `APP_ROLE=api`, `CORS_ORIGIN`, `DATABASE_URL`, `REDIS_URL`, `ENCRYPTION_MASTER_KEY`, `JWT_SECRET`, `LIVEKIT_*`, `RAZORPAY_*`, `SMTP_*`, `SMS_*`, `MSG91_TEMPLATE_*`, `KYC_*`, `COOKIE_DOMAIN`, `TRUST_PROXY=1`, `OTEL_SERVICE_NAME=nexora-api`, `LOG_LEVEL=info` |
| `nexora-worker` | same data keys as api, `APP_ROLE=worker`, `OTEL_SERVICE_NAME=nexora-worker`; no `PORT`, no `CORS_ORIGIN` |
| `nexora-frontend` | `JWT_SECRET` (same as api), `API_URL` (server side), `OTEL_SERVICE_NAME=nexora-frontend`; build time only: `NEXT_PUBLIC_*` |

`TRUST_PROXY=1` is required behind the ALB so rate limits and login lockouts see the real client IP.

---

## 13. Backend deploy (step by step)

| # | Step | Command / check | Stops when |
| :--- | :--- | :--- | :--- |
| 1 | Checkout | exact commit `GIT_COMMIT` | — |
| 2 | Install | `npm ci` (Node from `.nvmrc`) | lockfile out of sync |
| 3 | Generate | `npx prisma generate` | schema invalid |
| 4 | Lint | `npm run lint` | lint error |
| 5 | Type-check | `npm run typecheck` | type error |
| 6 | Unit tests | `npm test` | failing test |
| 7 | e2e | `npm run test:e2e` (mocked DB) | failing test |
| 8 | Build | `npm run build` → `dist/apps/api`, `dist/apps/worker`, `dist/libs` | build error |
| 9 | Prod deps | `npm ci --omit=dev` in a clean folder | — |
| 10 | Package | `dist/`, `node_modules/`, `prisma/`, `package.json` → `release/backend/` | — |
| 11 | Ship | `rsync -az --delete` → `/srv/nexora/releases/<rel>/` | SSH or disk error |
| 12 | Migrate | `npx prisma migrate deploy` on the **first** server only; prod: RDS snapshot first | migration error → stop, nothing switched yet |
| 13 | Switch | `ln -sfn releases/<rel> current` | — |
| 14 | Reload | `pm2 reload ecosystem.config.cjs --only nexora-api,nexora-worker --update-env` | app does not start |
| 15 | Verify | `curl -fsS localhost:4000/health` (retry 10 × 3 s) | not 200 → step 16 |
| 16 | Rollback (on fail) | `current` → previous release, `pm2 reload`, Slack alert | — |
| 17 | Next server | prod: deregister from ALB → steps 11, 13–15 → register again | — |
| 18 | Clean | keep the 5 newest releases | — |

Backend rules on deploy:

- The API retries Redis connections at boot, but **refuses to start** on an invalid env (`libs/config`).
- Worker jobs use BullMQ job schedulers with a fixed `jobId`, so two workers never run the same schedule twice.
- Dropping or renaming a column takes **two** deploys: (1) code stops using it, (2) the migration removes it.
- Never run `prisma db push`, `prisma migrate reset` or `prisma db seed` on stag or prod.

---

## 14. Frontend deploy (step by step)

| # | Step | Command / check | Stops when |
| :--- | :--- | :--- | :--- |
| 1 | Checkout | exact commit | — |
| 2 | Install | `npm ci` | lockfile out of sync |
| 3 | Build env | Jenkins reads `NEXT_PUBLIC_*` for the target env from Infisical `/build` | missing key |
| 4 | Lint | `npm run lint` | lint error |
| 5 | Type-check | `npx tsc --noEmit` | type error |
| 6 | Build | `next build` with `output: 'standalone'` | build error |
| 7 | Assemble | copy `.next/static` → `.next/standalone/.next/static`, `public/` → `.next/standalone/public` | — |
| 8 | Package | `.next/standalone` → `release/frontend/.next/standalone` | — |
| 9 | Ship | rsync, same release folder as the backend | SSH or disk error |
| 10 | Reload | `pm2 reload ecosystem.config.cjs --only nexora-frontend --update-env` | app does not start |
| 11 | Verify | `curl -fsS localhost:3000/api/health` and `curl -fsS localhost:3000/` | not 200 → rollback |
| 12 | Smoke (stag, prod) | Playwright: home, login, pricing load with no console errors | fail → rollback |

Frontend rules on deploy:

- One build per env (public env is baked in). A stag build is **never** copied to prod.
- Static assets are content-hashed, so old and new releases serve side by side during the reload.
- The frontend server never holds DB URLs or partner keys. If `frontend.env` has one, the deploy is wrong.
- `/user/*` and `/admin/*` keep `X-Robots-Tag: noindex`; dev and stag send `noindex` on every page.

---

## 15. Release order and change control

1. Feature PR → `dev`: squash merge, auto deploy to dev, the developer checks it on `dev-www`.
2. `dev` → `stag` PR (release PR): lists every change; QA on `stag-www` with masked prod data.
3. `stag` → `main` PR: code owner approves; Jenkins waits for the `Approve prod` click.
4. Prod deploy window: Monday–Thursday, 10:00–17:00 IST. No Friday or holiday deploys except hotfixes.
5. After a prod deploy, watch dashboards for 30 minutes (5xx, p95, queue depth, DLQ, payments).
6. Tag the release `vYYYY.MM.DD-N` on `main`; GitHub release notes are generated from the conventional commits.

Hotfix: `hotfix/<ticket>-<slug>` from `main` → PR into `main` (1 approval, CI green) → prod deploy → merge `main` into `stag` and `dev` the same day.

---

## 16. Runbooks

### 16.1 Roll back a bad deploy

```bash
aws ssm start-session --target <instance-id>
sudo -u deploy /srv/nexora/bin/rollback.sh
```

`rollback.sh`:

```bash
cd /srv/nexora/releases
PREV=$(ls -1t | sed -n 2p)   # second newest release
ln -sfn "/srv/nexora/releases/$PREV" /srv/nexora/current
sudo -u nexora pm2 reload /srv/nexora/current/deploy/pm2/ecosystem.config.cjs --update-env
curl -fsS localhost:4000/health && curl -fsS localhost:3000/api/health
```

Run it on every prod server, one at a time. Then revert the commit on `main` with a PR so the next deploy does not bring it back.
If the bad release ran a migration, rollback is only safe when that migration was backward compatible (section 3.3). Otherwise the incident owner decides on a restore from the pre-deploy RDS snapshot.

### 16.2 App keeps restarting

1. `sudo -u nexora pm2 status`: which app, how many restarts.
2. `sudo -u nexora pm2 logs <app> --lines 200`, or CloudWatch `/nexora/<env>/<app>`.
3. Env problem (refuses to start): fix the value in Infisical; the agent re-renders; `pm2 reload <app> --update-env`.
4. Memory (`max_memory_restart`): check heap metrics in Grafana; roll back if it started with the last release.

### 16.3 Jobs stuck or failing

1. Grafana queue dashboard: depth, active, failed, DLQ per queue.
2. `sudo -u nexora pm2 status nexora-worker`; reload only the worker: `pm2 reload nexora-worker`.
3. After the cause is fixed, re-run DLQ jobs from the admin console. Jobs are idempotent.

### 16.4 Rotate a secret

1. Create the new value in Infisical (`prod`).
2. The agent re-renders env files within 5 minutes and reloads the app (or `pm2 reload <app> --update-env`).
3. Revoke the old value at the provider (Razorpay, SMTP, MSG91, KYC, LiveKit).
4. `JWT_SECRET` changes in api and frontend together; every user is logged out.
5. `ENCRYPTION_MASTER_KEY` cannot be swapped directly: stored credentials must be re-encrypted first (planned task).

### 16.5 Add a second prod server

1. Launch from the same launch template / Ansible playbook in AZ b.
2. Add the host to the Jenkins `prod` host list and the ALB target groups (3000, 4000).
3. Decide where the worker runs: one server, or both (BullMQ locks make that safe).
4. Deploy `main`; check both targets are healthy in the ALB.
