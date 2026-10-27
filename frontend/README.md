# Nexora RTC — Developer Console & Operations Portal

Next.js 16 (App Router) developer console and operations portal for Nexora RTC.

## Key Features

- **Developer Dashboard (`/user`)**: Manage API keys, BYOS (AWS S3, Cloudflare R2, Google Cloud Storage) storage connections, Firebase push integrations, and real-time usage metrics.
- **Interactive RTC Sandbox (`/user/sandbox`)**: In-browser testing suite for 1:1, multi-party video conferencing, and live broadcasting.
- **Operations Center (`/admin`)**: Operations and support triage console with strict role-based access control, Indian GST billing overviews, and DigiLocker KYC review workflows.
- **Cryptographic Middleware**: Edge middleware (`src/proxy.ts`) verifies signed JWT sessions with `jose`, rejecting untrusted or forged client cookies.

## Development Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local

# 3. Start Next.js development server (port 3000; the API must run on port 4000)
npm run dev
```

## Layout

Route groups `( )` organise the pages and do not change any URL.

```
src/
├── app/
│   ├── (public)/        website: home, features, pricing, docs, contact, privacy, security, terms
│   ├── (auth)/          login, signup, invite/[token]
│   ├── (app)/           signed-in consoles: user/*, admin/*
│   ├── api/health/      GET /api/health for the load balancer and deploy checks
│   ├── layout.tsx       root layout
│   └── robots.ts · sitemap.ts · opengraph-image.tsx
├── components/          shared components (site/ for website-only pieces)
├── lib/                 api.ts (the only place that calls the backend), types, SEO, formatters
└── proxy.ts             session check for /user and /admin (Next 16 name for middleware)
scripts/
└── copy-standalone-assets.mjs   runs after next build (see Production)
```

Rules:

- The frontend never touches the database or partner secrets. Every backend call goes through `src/lib/api.ts` (server-side public data: `src/lib/site.ts`).
- Only `NEXT_PUBLIC_*` values reach the browser. `JWT_SECRET` is server-only and must equal `JWT_SECRET` in `backend/.env`.
- Import with the `@/` alias. Full rules: [ENGINEERING_RULES.md](../ENGINEERING_RULES.md) section 3.

## Available Scripts

- `npm run dev`: development server on port 3000.
- `npm run build`: production build with `output: 'standalone'`, then copies `public/`, `.next/static/` and `.env.local` / `.env.production.local` into `.next/standalone/`.
- `npm run start:standalone`: run the built server (`node .next/standalone/server.js`). This is what PM2 runs.
- `npm run start`: `next start` (still works, but prints a warning with standalone output; prefer `start:standalone`).
- `npm run typecheck`: TypeScript (`tsc --noEmit`).
- `npm run lint`: ESLint. `npm run lint:files -- <files>`: used by the pre-commit hook.

## Production

`NEXT_PUBLIC_*` values are baked in at build time, so build once per environment with that environment's values.

```bash
npm ci
npm run build
PORT=3000 HOSTNAME=0.0.0.0 npm run start:standalone
```

With PM2 from the repo root: `pm2 start deploy/pm2/ecosystem.config.cjs` (runs `nexora-frontend` from `.next/standalone`, 2 instances).
Health check: `curl -fsS localhost:3000/api/health`.
`Dockerfile` builds the same standalone server as a non-root image (Flow 1).
Servers, Jenkins steps and rollback: [DEPLOYMENT_RULES.md](../DEPLOYMENT_RULES.md) section 14.
