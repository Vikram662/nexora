# Nexora RTC — Developer Console & Operations Portal

Next.js 16 (App Router) developer console and operations portal for Nexora RTC.

## Key Features

- **Developer Dashboard (`/user`)**: Manage API keys, BYOS (AWS S3, Cloudflare R2, Google Cloud Storage) storage connections, Firebase push integrations, and real-time usage metrics.
- **Interactive RTC Sandbox (`/user/sandbox`)**: In-browser testing suite for 1:1, multi-party video conferencing, and live broadcasting.
- **Operations Center (`/admin`)**: Operations and support triage console with strict role-based access control, Indian GST billing overviews, and DigiLocker KYC review workflows.
- **Cryptographic Middleware**: Edge middleware verifies signed JWT sessions with `jose`, rejecting untrusted or forged client cookies.

## Development Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local

# 3. Start Next.js development server
npm run dev
```
