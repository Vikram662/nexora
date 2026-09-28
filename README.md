# Nexora RTC — Enterprise Self-Hosted WebRTC PaaS

Nexora is a self-hosted private Real-Time Communication (RTC) Platform-as-a-Service providing high-definition 1:1 and multi-party video conferencing, low-latency voice calling, sub-second live interactive broadcasting, and peer-to-peer real-time data messaging with **Zero-Storage BYOS** architecture and automated Indian GST billing compliance.

---

## 🌟 Key Capabilities

- **1:1 & Group Video Calling**: Adaptive bitrate mesh and SFU scaling.
- **Crystal-Clear Voice Hotlines**: 32kbps Opus codec with hardware acoustic echo cancellation (AEC) and noise suppression.
- **Sub-Second Live Interactive Broadcasting**: Ultra-low-latency (<300ms) with distinct Host (Publisher) and Audience (Viewer-only) token controls.
- **In-Room Real-Time Data Messaging**: P2P SCTP DataChannel messaging with sub-10ms delivery, slide-over chat drawer, and unread counters.
- **Zero-Storage BYOS (Bring Your Own Storage)**:
  - **AWS S3**: AP-South-1 / US-East-1 direct signed egress.
  - **Cloudflare R2**: 100% S3-compatible object storage with $0 egress bandwidth fees.
  - **Google Cloud Storage (GCS)**: Service account JSON credentials with AES-256-GCM encryption.
- **Indian GST Billing & Razorpay Webhooks**:
  - SAC 998314 tax invoices with 18% CGST/SGST/IGST breakdown.
  - Idempotent Razorpay webhook handling (`POST /v1/portal/payments/webhook`) with HMAC-SHA256 signature verification.
  - Pre-session GST-inclusive wallet balance protection.
- **DigiLocker KYC Compliance**: PAN, Aadhaar OTP, MCA CIN, and GSTIN verification flows.
- **Native Client SDKs**: Drop-in guides and complete reference apps for **Android (Kotlin)**, **Flutter (Dart)**, **iOS (Swift / SwiftUI)**, and **Web (React / TypeScript)**.

---

## 🚀 Quickstart

### Prerequisites
- Node.js v20+ or v22+
- MySQL Server (Port 3306)
- LiveKit SFU Server (Port 7880)

### 1. Install Dependencies
\`\`\`bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
cd ..
\`\`\`

### 2. Configure Environment
Create `.env` in `backend/` with database and encryption master keys:
\`\`\`env
DATABASE_URL="mysql://root:@localhost:3306/nexora_rtc"
ENCRYPTION_MASTER_KEY="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
LIVEKIT_API_KEY="devkey"
LIVEKIT_API_SECRET="secret"
RAZORPAY_KEY_ID="rzp_test_..."
RAZORPAY_KEY_SECRET="..."
RAZORPAY_WEBHOOK_SECRET="whsec_..."
\`\`\`

### 3. Database Migration & Seed
\`\`\`bash
cd backend
npx prisma db push
npx prisma db seed
cd ..
\`\`\`

### 4. Running the Platform
\`\`\`bash
# Option A: PM2 Process Manager (Recommended for Production)
pm2 start ecosystem.config.cjs

# Option B: Development Mode
# Terminal 1: LiveKit Server
./start-livekit-windows.ps1

# Terminal 2: Backend Control Plane (Port 4000)
cd backend && npm run start:dev

# Terminal 3: Frontend Developer Console (Port 3000)
cd frontend && npm run dev
\`\`\`

---

## 📖 Documentation
Interactive documentation and API specifications:
- **Developer Documentation**: \`http://localhost:3000/docs\`
- **Interactive WebRTC Sandbox**: \`http://localhost:3000/user/sandbox\`
- **Master Admin Portal**: \`http://localhost:3000/admin\`

---

## 📄 License
UNLICENSED — Private Enterprise Distribution
