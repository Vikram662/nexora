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
| **BullMQ Asynchronous Billing** | ⏳ Planned | Blueprint architectural pattern for high-scale room events |
| **Native Mobile SDKs** | ⏳ Planned | Guides provided in docs; client SDKs under active roadmap |

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
Generate a secure 32-byte hexadecimal master encryption key:
```bash
openssl rand -hex 32
```

Create `backend/.env` using `backend/.env.example` as a template, setting your database connection and generated key. Also create `frontend/.env.local` using `frontend/.env.example`.

### 3. Database Migration & Seed
```bash
cd backend
npx prisma db push
npm run prisma:seed
cd ..
```

### 4. Running the Platform

#### Development Mode:
```bash
# Terminal 1: LiveKit SFU (Windows native with checksum verification)
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
