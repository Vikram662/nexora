# Nexora RTC — Enterprise Self-Hosted WebRTC PaaS

Nexora is a self-hosted private Real-Time Communication (RTC) Platform-as-a-Service providing high-definition 1:1 and multi-party video conferencing, low-latency voice calling, sub-second live interactive broadcasting, and peer-to-peer real-time data messaging with **Zero-Storage BYOS** architecture and automated Indian GST billing compliance.

---

## 🏗️ Architecture & System Topology

```
┌─────────────────────────┐               ┌──────────────────────────────┐
│  Developer Client App   │               │     Developer Backend        │
│ (Web / React / Mobile)  │◄─────────────►│    (Client-Side Caller)      │
└────────────┬────────────┘               └──────────────┬───────────────┘
             │                                           │ x-api-key / x-api-secret
             │                                           ▼
             │                             ┌─────────────────────────────┐
             │ WSS (LiveKit WebRTC)        │   NEXORA CONTROL PLANE      │
             │                             │   (NestJS Gateway :4000)    │
             ▼                             │  • JWT Auth & Tenant Scoping│
┌─────────────────────────────┐            │  • Atomic Wallet Protection │
│      NEXORA MEDIA PLANE     │            │  • HMAC Webhook Ingestion   │
│  ┌────────────────────────┐ │            │  • AES-256-GCM BYOS Vault   │
│  │ LiveKit SFU (:7880)    │ │            └──────────────┬──────────────┘
│  │ Coturn STUN/TURN (:3478│ │                           │
│  │ Redis Cluster (:6379)  │ │                           ▼
│  └───────────┬────────────┘ │            ┌─────────────────────────────┐
└──────────────┼──────────────┘            │ MySQL Database & GST Ledger │
               ▼                           │ (Port 3306)                 │
┌─────────────────────────────┐            └─────────────────────────────┘
│    DEVELOPER'S OWN CLOUD    │
│  AWS S3 / R2 / GCS (BYOS)   │
└─────────────────────────────┘
```

---

## 🔌 Default Port Allocations

| Service / Component | Default Port | Protocol | Purpose |
| :--- | :--- | :--- | :--- |
| **Frontend Portal** | `3000` | HTTP / HTTPS | Next.js Developer Console & Admin Ops Center |
| **Control Plane API** | `4000` | HTTP / HTTPS | NestJS Gateway, Token Minting, Billing & Auth |
| **LiveKit SFU Signal** | `7880` | HTTP / WSS | WebRTC Signaling, Room Lifecycle & Token Auth |
| **LiveKit SFU RTC TCP**| `7881` | TCP | WebRTC Fallback Transport for restrictive NATs |
| **LiveKit SFU RTC UDP**| `50000–60000`| UDP | Real-Time Audio & Video RTP/SRTP Packet Streams |
| **Coturn STUN / TURN** | `3478` / `5349`| UDP / TCP | STUN NAT Discovery & TLS Encrypted TURN Media Relay |
| **MySQL Database** | `3306` | TCP | Relational DB: Tenancy, GST Invoices, Ledger |
| **Redis Cache** | `6379` | TCP (127.0.0.1) | LiveKit Cluster State & Session Cache |

---

## 🚦 Implementation Status

| Feature / Primitive | Status | Notes |
| :--- | :--- | :--- |
| **JWT Authentication & RBAC** | ✅ Implemented | HttpOnly signed cookie session, edge middleware verification |
| **Strict Multi-Tenant Isolation** | ✅ Implemented | Scoped strictly to authenticated user's organization |
| **Atomic Wallet Billing** | ✅ Implemented | Race-free conditional decrement (`updateMany`) with GST |
| **HMAC-SHA256 Webhooks** | ✅ Implemented | Timing-safe verification over raw request buffers |
| **Zero-Storage BYOS Encryption**| ✅ Implemented | AES-256-GCM with strict 32-byte key enforcement |
| **Indian GST Compliance (SAC 998314)** | ✅ Implemented | 18% CGST/SGST/IGST breakdown and GSTR reporting |
| **Interactive RTC Sandbox** | ✅ Implemented | Live in-browser multi-party WebRTC room testing |
| **DigiLocker KYC Compliance** | 🟡 Sandbox Mode | Format regex verified; live gateway requires Surepass credentials |
| **Server-to-Server Recording API** | ⏳ Planned | LiveKit Egress container service with automatic BYOS cloud upload |
| **BullMQ Asynchronous Billing** | ⏳ Planned | Blueprint architectural pattern for high-scale room events |
| **Native Mobile SDKs** | ⏳ Planned | Copy-pasteable quickstart guides provided in docs; client SDK wrappers on roadmap |

---

## 🔒 Security & Hardening Guardrails

- **Zero Hardcoded Secrets**: `CryptoService` halts boot if `ENCRYPTION_MASTER_KEY` is missing or invalid.
- **Timing-Attack Resistance**: Razorpay signatures and API authentication compare hashes in constant time via `crypto.timingSafeEqual`.
- **Secret Redaction**: API secret hashes, SMTP credentials, and encryption keys are strictly omitted from frontend API responses.
- **Rate-Limiting**: `@nestjs/throttler` protects all public endpoints; `ApiKeyGuard` provides fast 60s in-memory caching and lockout against CPU DoS attacks.
- **Loopback Isolation**: Redis binds strictly to `127.0.0.1`, shielded from public interfaces.

---

## 🚀 Quickstart

### Prerequisites
- Node.js v20+ or v22+
- MySQL Server (Port 3306)
- LiveKit SFU Server (Port 7880)

### 1. Install Dependencies
```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
cd ..
```

### 2. Configure Environment

Three env files, one per component. Each has a matching `.env.example` with demo values you can copy for local development.

| File | Copy from | Used by |
| :--- | :--- | :--- |
| `backend/.env` | `backend/.env.example` | NestJS control plane |
| `frontend/.env.local` | `frontend/.env.example` | Next.js website and console |
| `docker/.env` | `docker/.env.example` | Docker Compose (LiveKit, Redis, Coturn, egress) |

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
cp docker/.env.example docker/.env      # only if you run the Docker stack
```

The demo values are fine on your own machine. For anything else, generate real secrets:

```bash
openssl rand -hex 32
```

**Values that must match across files**

| Backend (`backend/.env`) | Must equal | Why |
| :--- | :--- | :--- |
| `JWT_SECRET` | `JWT_SECRET` in `frontend/.env.local` | The frontend verifies the session cookie the backend signs. A mismatch redirects every `/user` and `/admin` request to login. |
| `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Same names in `docker/.env` (or the values `start-livekit-windows.ps1` reads from `backend/.env`) | The backend signs tokens and calls LiveKit with this pair; LiveKit must know it. |
| `LIVEKIT_URL` | `NEXT_PUBLIC_LIVEKIT_URL` in the frontend | Where clients connect. |

#### Backend (`backend/.env`)

| Variable | Required | Demo value | Notes |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | Yes | `mysql://root:@localhost:3306/nexora_rtc` | MySQL connection string. |
| `ENCRYPTION_MASTER_KEY` | Yes | 64 hex characters | AES-256-GCM key for stored bucket and Firebase credentials. The server refuses to start without it or with the wrong length. |
| `JWT_SECRET` | Yes | any 32+ character string | Signs console session cookies. |
| `LIVEKIT_URL` | Yes | `ws://localhost:7880` | Use `wss://` in production. |
| `LIVEKIT_API_KEY` | Yes | `devkey` | |
| `LIVEKIT_API_SECRET` | Yes | any 32+ character string | |
| `PORT` | No | `4000` | |
| `NODE_ENV` | No | `development` | Cookies get the `Secure` flag when this is `production`. |
| `CORS_ORIGIN` | No | `http://localhost:3000` | Comma-separated browser origins allowed to call the API. |
| `STAFF_OPS_ORG_ID` | No | `org_nexora_master_ops` | Organisation staff sessions are bound to. The seed creates it. |
| `MFA_ISSUER_NAME` | No | `Nexora RTC` | Label in authenticator apps. |
| `INVOICE_AUTO_GENERATE` | No | | `true` issues the previous month's invoices automatically. Otherwise use Admin, Billing, Tax Invoices. Needs the company GSTIN and address saved in Settings first. |
| `COTURN_HOST` | No | `localhost:3478` | Shown read-only in Admin Settings. |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | For payments | `rzp_test_...` | Without them wallet top-ups fail. Point the Razorpay webhook at `POST /v1/portal/payments/webhook` with the same webhook secret. |
| `EMAIL_PROVIDER`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM` | Optional | | Notification email. |
| `SMS_PROVIDER`, `SMS_API_KEY`, `SMS_SENDER_ID` | Optional | | Notification SMS. |
| `KYC_PROVIDER`, `KYC_ENV`, `KYC_API_TOKEN` | Optional | `MOCK`, `SANDBOX` | `MOCK` only checks document format. Use `SUREPASS` with a token for real verification. |
| `SEED_STAFF_PASSWORD` | Seed only | | Password for the seeded staff accounts. If unset the seed generates one and prints it once. |

#### Frontend (`frontend/.env.local`)

| Variable | Required | Demo value | Notes |
| :--- | :--- | :--- | :--- |
| `JWT_SECRET` | Yes | same as backend | Server-only. Never give it a `NEXT_PUBLIC_` prefix. |
| `NEXT_PUBLIC_API_URL` | Production | `http://localhost:4000` | Public backend URL. Required when the API is on a different domain. |
| `API_INTERNAL_URL` | Recommended | `http://127.0.0.1:4000` | Server-side URL for the public pages (brand, contact, pricing). Without it those pages fall back to defaults and pricing shows "on request". |
| `NEXT_PUBLIC_LIVEKIT_URL` | Recommended | `ws://localhost:7880` | LiveKit URL used by the sandbox. |
| `NEXT_PUBLIC_SITE_URL` | Production | `http://localhost:3000` | Public origin for canonical URLs, `sitemap.xml`, `robots.txt` and social previews. |

#### Docker stack (`docker/.env`)

| Variable | Demo value | Notes |
| :--- | :--- | :--- |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | `devkey` / 32+ characters | Same as the backend. |
| `REDIS_HOST` / `REDIS_PASSWORD` | `127.0.0.1` / any password | Shared by LiveKit and the egress worker. |
| `TURN_STATIC_AUTH_SECRET` | any secret | Coturn credential secret. |
| `BACKEND_INTERNAL_WEBHOOK_URL` | `http://127.0.0.1:4000/v1/webhooks/livekit` | Where LiveKit posts room and recording events. |

Run it with `cd docker && docker compose up -d`.

### 3. Database Migration & First Settings

```bash
cd backend
npx prisma db push          # creates or updates the tables, including SiteSetting
cd ..
```

Then sign in as staff and open **Admin, Settings** to fill in what the public website and billing read from the database: brand and logo, contact details, social links, the announcement bar, plan text, and the per-minute rates for every plan. Production tokens are refused until a rate exists for the plan, so set the rates before going live.

> **Demo data:** `npx prisma db seed` fills the database with sample organisations, staff accounts and starting rates, but it **deletes existing data first**. Run it only on an empty development database. Staff accounts use `SEED_STAFF_PASSWORD`, or a random password printed once.

### 4. Running the Platform

#### Development Mode:
```bash
# Terminal 1: LiveKit SFU (Windows native; reads the API key pair from backend\.env)
./start-livekit-windows.ps1

# Terminal 2: Backend Control Plane (Port 4000)
cd backend && npm run start:dev

# Terminal 3: Frontend Developer Console (Port 3000)
cd frontend && npm run dev
```

#### Production (PM2):
*Note: Always run `npm run build` in both `backend` and `frontend` before starting PM2.*
```bash
cd backend && npm run build && cd ../frontend && npm run build && cd ..
pm2 start ecosystem.config.cjs
```

---

## 📖 Documentation
Interactive documentation and API specifications:
- **Developer Documentation**: `http://localhost:3000/docs`
- **Interactive WebRTC Sandbox**: `http://localhost:3000/user/sandbox`
- **Master Operations Portal**: `http://localhost:3000/admin`

---

## 📄 License
UNLICENSED — Private Enterprise Distribution
