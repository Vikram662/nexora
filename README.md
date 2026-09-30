# Nexora RTC — Self-Hosted WebRTC PaaS

Nexora is a self-hosted Real-Time Communication (RTC) platform: 1:1 and multi-party video, voice calls, live broadcast and in-room messaging on your own LiveKit servers, with recordings written to the customer's own bucket (BYOS) and Indian GST billing built in.

---

## Architecture

```
┌─────────────────────────┐               ┌──────────────────────────────┐
│  Developer Client App   │               │     Developer Backend        │
│ (Web / React / Mobile)  │◄─────────────►│    (Client-Side Caller)      │
└────────────┬────────────┘               └──────────────┬───────────────┘
             │                                           │ x-api-key / x-api-secret
             │                                           ▼
             │                             ┌─────────────────────────────┐
             │ WSS (LiveKit WebRTC)        │   NEXORA CONTROL PLANE      │
             │                             │   (NestJS API :4000)        │
             ▼                             │  • JWT auth, tenant scoping │
┌─────────────────────────────┐            │  • Prepaid wallet + GST     │
│      NEXORA MEDIA PLANE     │            │  • Signed webhooks in / out │
│  LiveKit SFU (:7880)        │            │  • AES-256-GCM key vault    │
│  Coturn STUN/TURN (:3478)   │            └──────────────┬──────────────┘
│  Redis (:6379)              │                           ▼
└──────────────┬──────────────┘            ┌─────────────────────────────┐
               ▼                           │ MySQL: tenancy, ledger,     │
┌─────────────────────────────┐            │ invoices, notifications     │
│ CUSTOMER'S OWN CLOUD        │            └─────────────────────────────┘
│ AWS S3 / R2 / GCS (BYOS)    │
└─────────────────────────────┘
```

## Default ports

| Service | Port | Purpose |
| :--- | :--- | :--- |
| Frontend (Next.js) | `3000` | Website, developer console, admin ops center |
| Control plane API | `4000` | Tokens, billing, auth, webhooks |
| LiveKit signal | `7880` | WebRTC signaling |
| LiveKit RTC TCP / UDP | `7881` / `50000–60000` | Media |
| Coturn | `3478` / `5349` | STUN / TURN |
| MySQL | `3306` | Database |
| Redis | `6379` (127.0.0.1) | LiveKit state |

---

## What is built

| Area | Status | Notes |
| :--- | :--- | :--- |
| Auth, roles, tenant isolation | ✅ | HttpOnly session cookie, edge middleware check, per-organization scoping |
| Team invitations | ✅ | One-time email link (7 days), set password or sign in, pending list, revoke, organization switcher |
| Room tokens, rooms, participants | ✅ | Prepaid wallet is debited atomically when a production token is minted; unused time is refunded when the participant leaves |
| Wallet top-ups (Razorpay) | ✅ | Real Razorpay order, amount stored server-side, verified with Razorpay, credited once (checkout and webhook cannot double-credit) |
| GST tax invoices | ✅ | One per customer per closed month, gap-free numbering per financial year, CGST+SGST or IGST, printable HTML and PDF |
| Credit notes (GST s.34) | ✅ | Own numbering series, refers to the invoice, optional wallet credit, PDF |
| Email notifications | ✅ | Queue with retries. Needs SMTP |
| SMS notifications | ✅ | MSG91 with DLT templates. Needs an MSG91 account |
| Outbound webhooks to customers | ✅ | HMAC-signed, retried after 1 min, 5 min, 30 min, 2 h, resend from the console, public https URLs only |
| Recording to the customer's bucket | 🟡 | Built; test it with your LiveKit egress worker |
| KYC | 🟡 | `MOCK` only checks the format. Use `SUREPASS` for real checks |
| Auto-recharge | ⏳ | Not built. Settings exist in the database but nothing uses them |
| RTMP restream / OBS ingest | ⏳ | Designed, not built |

## Security notes

- The server refuses to start without `ENCRYPTION_MASTER_KEY` (64 hex characters) and `JWT_SECRET` (32+ characters).
- API secrets are stored hashed. Webhook signing secrets and new API secrets are shown once.
- Payments, API keys and webhooks use constant-time comparison. Repeated bad API secrets lock a key **for that client IP only**.
- Webhook URLs must be public `https` addresses (checked at registration and before every delivery). Localhost, private ranges and cloud metadata addresses are refused.
- The session cookie is `HttpOnly`: scripts on the page never read or write it. Only the API sets it.
- The 2FA QR code is drawn in the browser; the secret is never sent to a third-party service.
- Redis binds to `127.0.0.1` only.

---

## Setup

### Prerequisites

Node.js 20 or 22, MySQL, and a LiveKit server (the Docker stack in `docker/` provides one).

### 1. Install

```bash
cd backend && npm install
cd ../frontend && npm install
cd ..
```

### 2. Environment files

| File | Copy from | Used by |
| :--- | :--- | :--- |
| `backend/.env` | `backend/.env.example` | NestJS API |
| `frontend/.env.local` | `frontend/.env.example` | Next.js |
| `docker/.env` | `docker/.env.example` | Docker Compose (LiveKit, Redis, Coturn, egress) |

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
cp docker/.env.example docker/.env      # only if you run the Docker stack
```

The demo values work on your own machine. For anything else generate real secrets: `openssl rand -hex 32`.

**Values that must match across files**

| Backend | Must equal | Why |
| :--- | :--- | :--- |
| `JWT_SECRET` | `JWT_SECRET` in `frontend/.env.local` | The site verifies the session cookie the API signs. A mismatch sends every `/user` and `/admin` request to login. |
| `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Same names in `docker/.env` | The API signs tokens with this pair and LiveKit must know it. |
| `LIVEKIT_URL` | `NEXT_PUBLIC_LIVEKIT_URL` (frontend) | Where clients connect. |

#### Backend variables (`backend/.env`)

**Required**

| Variable | Notes |
| :--- | :--- |
| `DATABASE_URL` | `mysql://USER:PASSWORD@HOST:3306/nexora_rtc` |
| `ENCRYPTION_MASTER_KEY` | 64 hex characters. Encrypts stored bucket, Firebase and AI credentials. The seed needs it too. |
| `JWT_SECRET` | 32+ characters. Also signs team invitation links. |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Use `wss://` in production. Secret is 32+ characters. |

**Server**

| Variable | Default | Notes |
| :--- | :--- | :--- |
| `PORT` | `4000` | |
| `NODE_ENV` | `development` | `production` turns on `Secure` cookies and refuses placeholder Razorpay keys. |
| `CORS_ORIGIN` | `http://localhost:3000` | Comma-separated browser origins. |
| `COOKIE_DOMAIN` | | Session cookie domain, for example `.yourdomain.com`, when the API and site are on sibling hosts such as `api.yourdomain.com` and `www.yourdomain.com`. Leave unset locally or when both share one host. The API and the website must share a parent domain, otherwise the site cannot see the session. |
| `TRUST_PROXY` | | Number of proxy hops (for example `1`) behind a load balancer, so the real client IP is used for lockouts and throttling. |
| `STAFF_OPS_ORG_ID` | `org_nexora_master_ops` | Organization staff sessions are bound to. The seed creates it. |
| `MFA_ISSUER_NAME` | `Nexora RTC` | Label in authenticator apps. |
| `COTURN_HOST` | | Shown read-only in Admin Settings. |

**Payments (Razorpay)**

| Variable | Notes |
| :--- | :--- |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Live or test keys. Keys starting `rzp_test_mock` skip Razorpay calls (local development only). |
| `RAZORPAY_WEBHOOK_SECRET` | Same value you enter in the Razorpay dashboard webhook. |

**Email**

| Variable | Notes |
| :--- | :--- |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM` | Until `SMTP_HOST` and `EMAIL_FROM` are set, emails wait in the queue. |
| `APP_URL` | Public site URL, used for links inside emails (invitations, "open console"). |
| `NOTIFICATIONS_AUTO_SEND` | `false` stops the 30-second background sender. |
| `LOW_BALANCE_THRESHOLD` | Rupees. Default `100`. |

**SMS (MSG91)**

| Variable | Notes |
| :--- | :--- |
| `SMS_PROVIDER` | `MSG91` |
| `SMS_API_KEY` | Your MSG91 authkey. |
| `MSG91_TEMPLATE_<TYPE>` | DLT template id per type. See [SMS setup](#sms-msg91). A type with no id is not sent by SMS. |

**Billing and webhooks**

| Variable | Notes |
| :--- | :--- |
| `INVOICE_AUTO_GENERATE` | `true` issues last month's invoices automatically (checked every 6 hours, never duplicates). Otherwise use Admin, Billing, Tax Invoices. |
| `WEBHOOK_RETRY_AUTO` | `false` stops the background webhook retry worker. |
| `WEBHOOK_ALLOW_PRIVATE_URLS` | `true` allows `http` and local addresses for customer webhooks. Development only, ignored in production. |

**Other**

| Variable | Notes |
| :--- | :--- |
| `KYC_PROVIDER`, `KYC_ENV`, `KYC_API_TOKEN` | `MOCK` (default) only checks format. `SUREPASS` plus a token verifies for real. |
| `SEED_STAFF_PASSWORD` | Password for seeded staff and demo users. If unset the seed generates one and prints it once. |
| `SEED_ALLOW_PRODUCTION` | The seed refuses `NODE_ENV=production` unless this is `true`. Do not set it on a real database. |

> Company details for tax invoices (legal name, GSTIN, state code, address) are **not** environment variables. Enter them in Admin, Settings, Tax invoice details.

#### Frontend variables (`frontend/.env.local`)

| Variable | Required | Notes |
| :--- | :--- | :--- |
| `JWT_SECRET` | Yes | Same as the backend. Server-only, never prefix with `NEXT_PUBLIC_`. |
| `NEXT_PUBLIC_API_URL` | Production | Public API URL when it is on another domain. |
| `API_INTERNAL_URL` | Recommended | Server-side URL for public pages (brand, contact, pricing). |
| `NEXT_PUBLIC_LIVEKIT_URL` | Recommended | LiveKit URL used by the sandbox. |
| `NEXT_PUBLIC_SITE_URL` | Production | Public origin for canonical URLs, sitemap and social previews. |
| `NEXT_PUBLIC_MFA_ISSUER` | No | Name shown in authenticator apps (defaults to `Nexora`). |

#### Docker stack (`docker/.env`)

| Variable | Notes |
| :--- | :--- |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | Same as the backend. |
| `REDIS_HOST` / `REDIS_PASSWORD` | Shared by LiveKit and the egress worker. |
| `TURN_STATIC_AUTH_SECRET` | Coturn credential secret. |
| `BACKEND_INTERNAL_WEBHOOK_URL` | Where LiveKit posts room and recording events (default `http://127.0.0.1:4000/v1/webhooks/livekit`). |

Run it with `cd docker && docker compose up -d`. Redis has a health check; LiveKit and egress wait for it.

### 3. Database

```bash
cd backend
npx prisma db push      # creates or updates every table. Run it again after pulling schema changes.
```

There is no migrations folder: the schema is applied with `db push`.

**Demo data (optional):** `npx prisma db seed` fills **every table** with sample organizations, staff, users, projects, usage, invoices (through the real invoice service), a credit note, webhooks and more. It **wipes all tables first** and refuses to run in production. Passwords and API secrets are generated and printed once. Use it only on an empty development database.

### 4. Run

```bash
# Terminal 1: LiveKit (Windows native; reads the key pair from backend\.env)
./start-livekit-windows.ps1     # or: cd docker && docker compose up -d

# Terminal 2: API (port 4000)
cd backend && npm run start:dev

# Terminal 3: site and console (port 3000)
cd frontend && npm run dev
```

Production (PM2): `cd backend && npm run build && cd ../frontend && npm run build && cd .. && pm2 start ecosystem.config.cjs`

---

## First-run checklist

Do these once, in this order. Items marked **you** need accounts or dashboards only you can open.

1. **Env files and database.** Create the three env files, run `npx prisma db push`, then start everything. Optionally run the seed on a development database.
2. **Sign in as staff** (`superadmin@nexora.io` after seeding; the password is printed by the seed) and open **Admin, Settings**:
   - Brand, contact details and social links (shown on the public site).
   - **Per-minute rates** for every plan. Production tokens are refused until a rate exists for the plan.
   - **Tax invoice details:** legal name, GSTIN, state code (first two digits of the GSTIN), registered address. Invoices cannot be generated without them.
3. **Email (you).** Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM` and `APP_URL`. Restart the API. Use **Admin, Billing, Tax Invoices, Send queued emails** to flush anything already queued.
4. **Razorpay (you).** Put the keys in `.env`, then set up the webhook (below).
5. **LiveKit webhook.** LiveKit must be able to reach `BACKEND_INTERNAL_WEBHOOK_URL`. It drives billing settlement (refund or charge when a participant leaves) and recording events. `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` must be identical on both sides.
6. **SMS (you, optional).** See [SMS setup](#sms-msg91).
7. **Try one full path:** sign up, create a project, add money, mint a token in the sandbox, join a room, leave, check the wallet and Sessions.

### Razorpay webhook

Payments credit the wallet when the browser verifies the payment. The webhook is the backup for when the customer closes the tab before that happens, so set it up.

1. Razorpay Dashboard, Settings, Webhooks, Add new webhook.
2. URL: `https://<your-api-domain>/v1/portal/payments/webhook`
3. Secret: any strong value. Put the same value in `RAZORPAY_WEBHOOK_SECRET`.
4. Events: `payment.captured` and `order.paid`.
5. Locally, expose port 4000 with a tunnel (for example ngrok) and use that URL.

Top-ups are credited in full. GST is added to each session's per-minute charge and shown on the monthly tax invoice.

### SMS (MSG91)

Indian SMS must use DLT-approved templates, so each message type has its own template. In MSG91, create and get these approved, then put each template id in `.env`:

| Env variable | Template variable | Example template text |
| :--- | :--- | :--- |
| `MSG91_TEMPLATE_LOW_BALANCE` | `##balance##` | Nexora: wallet balance is low (Rs ##balance##). Add money to keep calls running. |
| `MSG91_TEMPLATE_PAYMENT_RECEIVED` | `##amount##` | Nexora: payment of Rs ##amount## received. |
| `MSG91_TEMPLATE_API_KEY_ROTATED` | `##project##` | Nexora: API secret rotated for ##project##. |
| `MSG91_TEMPLATE_SECURITY_ALERT` | `##project##` | Nexora: repeated failed API sign-ins on ##project##. |
| `MSG91_TEMPLATE_WEBHOOK_ENDPOINT_DEGRADED` | `##project##` | Nexora: webhook deliveries for ##project## keep failing. |
| `MSG91_TEMPLATE_KYC_APPROVED` | none | Nexora: your business is verified. |
| `MSG91_TEMPLATE_KYC_REJECTED` | none | Nexora: we could not verify your business. |

Also set `SMS_PROVIDER=MSG91` and `SMS_API_KEY=<authkey>`. SMS goes to the organization **owner's** saved phone number (Profile) and only if the owner turns it on under Notifications. Invoices, credit notes and the welcome message are email only.

---

## Billing, invoices and credit notes

- **Wallet:** prepaid in rupees. Minting a production token deducts the first 10 minutes at the plan rate plus GST. When the participant leaves, unused time is refunded and longer sessions are charged the difference (minimum one minute).
- **Tax invoices:** Admin, Billing, Tax Invoices, choose a month, **Generate invoices** (or set `INVOICE_AUTO_GENERATE=true`). A month can be invoiced 24 hours after it ends. Running it again never duplicates an invoice. Customers without a billing profile are skipped with a reason. Numbers look like `NXR/2627/000123`.
- **Credit notes:** on an invoice, **Credit note** takes the GST-inclusive amount and a reason. Numbers look like `NXC/2627/000001`. The tax is reversed in the same proportion, and the amount goes back to the wallet unless you untick it.
- **PDF:** the invoice and credit note PDFs embed Noto Sans (SIL Open Font License, `backend/src/invoicing/fonts/`), so the rupee sign and Devanagari names print correctly.
- **GSTR-1** (Admin, Billing) lists invoices and credit notes to registered buyers and shows totals net of credit notes. GSTR-2 is not provided.

**Ask your CA before going live:** how GST applies to prepaid wallet top-ups (advance received for services), whether you must issue receipt vouchers at top-up, and whether e-invoicing (IRN) applies at your turnover. This software follows the invoice fields in Rule 46 and the credit note rules in Section 34, but it is not tax advice.

## Customer webhooks

Customers register endpoints in **Console, Webhooks** and choose events: `room.started`, `room.finished`, `participant.joined`, `participant.left`, `recording.started`, `recording.completed`, `recording.failed`.

- Each event is a `POST` with a JSON body and a `Nexora-Signature: t=<unix>,v1=<hex>` header. The signature is `HMAC-SHA256(signing_secret, "<t>.<raw body>")`.
- A 2xx answer counts as delivered. Anything else, a timeout or a redirect is retried after 1 minute, 5 minutes, 30 minutes and 2 hours (5 tries in total). The console shows the status and has a **Resend** button.
- The signing secret is shown once when the endpoint is created.
- Only public `https` URLs are called.

---

## Checks before you push

```bash
cd backend  && npm run typecheck && npm run lint && npm test
cd frontend && npx tsc --noEmit && npm run lint && npm run build
```

`.github/workflows/ci.yml` runs the same checks. These are unit tests and a build. There are no browser or database end-to-end tests yet, so always try the full path from the checklist above on a test environment.

## Known gaps

- Auto-recharge is not built (you asked to do it later). Its settings exist in the database but nothing uses them, and there is no auto-recharge failure email.
- No GSTR-2, no e-invoicing (IRN), no receipt vouchers for top-ups.
- SMS supports MSG91 only.
- PDF fonts cover Latin and Devanagari. Other scripts (Tamil, Bengali and so on) would need another embedded font.
- The session cookie only works when the API and the website share a parent domain (see `COOKIE_DOMAIN`).

---

## Documentation

- **Developer documentation:** `http://localhost:3000/docs`
- **Sandbox:** `http://localhost:3000/user/sandbox`
- **Admin ops center:** `http://localhost:3000/admin`
- Architecture notes: `RTC_PAAS_ARCHITECTURE_BLUEPRINT.md`

## License

UNLICENSED — private distribution.
