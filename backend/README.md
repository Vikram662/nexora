# Nexora RTC — Backend Control Plane

NestJS-based control plane and REST API gateway for Nexora RTC, providing authentication, WebRTC token minting, BYOS/BYOF storage configuration, and automated Indian GST compliance billing.

## Security Architecture

- **Stateless Control Plane**: REST API gateway operates on port 4000. WebRTC media and peer traffic stream directly to the LiveKit SFU (port 7880/7881), never proxying media payloads through NestJS.
- **Fail-Fast Secrets**: Refuses to boot if `ENCRYPTION_MASTER_KEY` (AES-256-GCM) is missing or not a 32-byte hexadecimal string.
- **Cryptographic Webhooks**: Razorpay webhooks verify HMAC-SHA256 signatures over raw request buffers with timing-attack resistant `crypto.timingSafeEqual`.
- **Zero Raw Secret Exposure**: Sensitive credentials (`apiSecretHash`, SMTP passwords, Razorpay secrets) are never returned to the frontend.
- **Rate-Limiting & Throttling**: `@nestjs/throttler` protects public endpoints; `ApiKeyGuard` provides fast 60s cache and lockout against CPU DoS.

## Development Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env

# 3. Synchronize database schema and seed initial data (local database only)
npx prisma db push
npx prisma db seed

# 4. Start the API and the worker
npm run start:dev
npm run start:worker:dev
```

## Layout

```
apps/api/src/        HTTP only: main.ts, root module, /health
apps/worker/src/     background jobs, no HTTP (APP_ROLE=worker)
libs/modules/        auth, team, livekit, portal, invoicing, notifications, settings
libs/database/       Prisma module and service
libs/crypto/         AES-256-GCM key vault
libs/config/         env schema (refuses to start on a bad value), APP_ROLE
test/                e2e with supertest, no database
database/manual/     reviewed SQL with rollback SQL, run by hand
```

Repeating jobs run only when `APP_ROLE` is not `api`. The API sets `api` by default; set `APP_ROLE=all` to run everything in one process locally.

## Available Scripts

- `npm run start:dev` / `npm run start:worker:dev`: API / worker in watch mode.
- `npm run build`: compile both apps to `dist/apps/{api,worker}` and `dist/libs`.
- `npm run start:prod` / `npm run start:worker:prod`: run the built API / worker.
- `npm run test`: unit tests (Vitest).
- `npm run test:e2e`: e2e tests (supertest, no database).
- `npm run lint`: Oxlint. `npm run typecheck`: TypeScript.
