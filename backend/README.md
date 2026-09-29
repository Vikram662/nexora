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

# 3. Synchronize database schema and seed initial data
npx prisma db push
npx prisma db seed

# 4. Start local development server
npm run start:dev
```

## Available Scripts

- `npm run start:dev`: Launch NestJS in watch mode.
- `npm run build`: Compile TypeScript bundle for production.
- `npm run test`: Run unit test suite via Vitest.
- `npm run test:e2e`: Run end-to-end integration tests.
- `npm run lint`: Lint codebase via Oxlint.
