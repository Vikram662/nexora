import Link from 'next/link';
import {
  Video,
  Radio,
  HardDrive,
  Cpu,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  Code2,
  Lock,
  Globe2,
  Users2,
  Zap,
} from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen bg-slate-50 text-slate-900 selection:bg-blue-600 selection:text-white">
      {/* Top Navbar */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <Radio className="h-5 w-5 animate-pulse" />
            </div>
            <div>
              <span className="font-extrabold text-xl tracking-tight text-slate-900">
                Nexora <span className="text-blue-600">RTC</span>
              </span>
              <span className="hidden sm:inline-block ml-2 text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                Self-Hosted PaaS
              </span>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-8 text-sm font-semibold text-slate-600">
            <a href="#features" className="hover:text-blue-600 transition-colors">Features</a>
            <a href="#architecture" className="hover:text-blue-600 transition-colors">Zero-Storage BYOS</a>
            <a href="#pricing" className="hover:text-blue-600 transition-colors">Pricing</a>
            <Link href="/docs" className="hover:text-blue-600 transition-colors">Documentation</Link>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="px-4 py-2 text-sm font-semibold text-slate-700 hover:text-blue-600 transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/signup"
              className="px-4 py-2 text-sm font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-600/20 transition-all flex items-center gap-1.5"
            >
              Get Started Free <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-20 pb-16 px-6 overflow-hidden bg-gradient-to-b from-white via-blue-50/30 to-slate-50 border-b border-slate-200">
        <div className="max-w-5xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-100/70 border border-blue-200 text-blue-800 text-xs font-semibold">
            <Zap className="h-3.5 w-3.5 fill-blue-600" />
            Production-Ready Agora & Twilio Alternative
          </div>

          <h1 className="text-4xl sm:text-6xl font-black text-slate-900 tracking-tight leading-[1.15]">
            Private Real-Time Video, Audio & Broadcast PaaS. <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">
              Zero Customer Data Stored.
            </span>
          </h1>

          <p className="max-w-2xl mx-auto text-base sm:text-lg text-slate-600 leading-relaxed font-normal">
            Own your WebRTC media plane powered by LiveKit + Coturn. Egress recordings land straight in <strong>your own AWS S3, Cloudflare R2, or GCS</strong>. We provide the ultra-fast control plane, you keep complete data sovereignty.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 pt-4">
            <Link
              href="/signup"
              className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-lg shadow-blue-600/25 transition-all flex items-center justify-center gap-2"
            >
              Create Free Account <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/user"
              className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-white hover:bg-slate-100 text-slate-800 font-bold text-sm border border-slate-300 shadow-sm transition-all flex items-center justify-center gap-2"
            >
              Developer Console Demo
            </Link>
          </div>

          <div className="pt-8 flex flex-wrap items-center justify-center gap-8 text-xs font-semibold text-slate-500">
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Sub-500ms WebRTC SFU</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Zero Video Storage at Rest</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> AES-256 Just-in-Time Decrypt</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> LiveKit Compatible SDKs</span>
          </div>
        </div>
      </section>

      {/* 3 Core Primitives */}
      <section id="features" className="py-20 px-6 max-w-7xl mx-auto w-full space-y-12">
        <div className="text-center space-y-3 max-w-2xl mx-auto">
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            Three Core Real-Time Primitives
          </h2>
          <p className="text-slate-600 text-sm">
            Everything your product needs to build high-scale communication without the exorbitant enterprise markup.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Card 1 */}
          <div className="p-8 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition-shadow space-y-4">
            <div className="h-12 w-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <Video className="h-6 w-6" />
            </div>
            <h3 className="text-xl font-bold text-slate-900">1:1 & Group Video Calling</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Crystal-clear, adaptive WebRTC video calls supporting 50+ participants per room with simulcast, screen-sharing, and active speaker detection.
            </p>
            <ul className="text-xs space-y-2 text-slate-500 pt-2 font-medium">
              <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-blue-600" /> Dynamically adapts to poor networks</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-blue-600" /> Coturn fallback for symmetric NATs</li>
            </ul>
          </div>

          {/* Card 2 */}
          <div className="p-8 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition-shadow space-y-4">
            <div className="h-12 w-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
              <Radio className="h-6 w-6" />
            </div>
            <h3 className="text-xl font-bold text-slate-900">Interactive Live Broadcast</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Sub-second interactive broadcasts with SFU mode, or mass distribution to tens of thousands of viewers via HLS-CDN segmentation.
            </p>
            <ul className="text-xs space-y-2 text-slate-500 pt-2 font-medium">
              <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-indigo-600" /> Restream simultaneously to YouTube/Twitch</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-indigo-600" /> OBS/RTMP hardware ingress support</li>
            </ul>
          </div>

          {/* Card 3 */}
          <div className="p-8 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition-shadow space-y-4">
            <div className="h-12 w-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <HardDrive className="h-6 w-6" />
            </div>
            <h3 className="text-xl font-bold text-slate-900">Zero-Storage BYOS & BYOF</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Recordings stream directly to your S3 or Cloudflare R2 bucket. Chat and push notifications route through your own Firebase project.
            </p>
            <ul className="text-xs space-y-2 text-slate-500 pt-2 font-medium">
              <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> We never store customer recordings</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> 100% GDPR, HIPAA & DPDP compliance</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Code Demo Section */}
      <section id="docs" className="py-16 px-6 bg-slate-900 text-white">
        <div className="max-w-6xl mx-auto space-y-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <span className="text-blue-400 font-mono text-xs font-semibold tracking-wider uppercase">Simple Integration</span>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-1">Start a Call in 3 Lines of Code</h2>
            </div>
            <p className="text-slate-400 text-sm max-w-md">
              Your server mints an authenticated token using your Nexora API keys; your frontend joins directly to the media SFU.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-mono text-xs">
            <div className="p-6 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between text-slate-400 border-b border-slate-800 pb-3">
                <span className="font-semibold text-slate-200">1. Server-side (Node / Next.js)</span>
                <span className="text-[11px] text-blue-400">POST /v1/tokens</span>
              </div>
              <pre className="text-blue-300 overflow-x-auto leading-relaxed">{`const API_BASE = process.env.NEXORA_API_URL || 'https://api.yourdomain.com';
const res = await fetch(\`\${API_BASE}/v1/tokens\`, {
  method: 'POST',
  headers: {
    'x-api-key': 'pk_live_...',
    'x-api-secret': 'sk_live_...'
  },
  body: JSON.stringify({
    roomName: 'doctor-patient-123',
    participantIdentity: 'patient_456'
  })
});
const { token, livekitUrl } = (await res.json()).data;`}</pre>
            </div>

            <div className="p-6 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between text-slate-400 border-b border-slate-800 pb-3">
                <span className="font-semibold text-slate-200">2. Client-side (Web / React / Mobile)</span>
                <span className="text-[11px] text-emerald-400">Direct WSS Mesh</span>
              </div>
              <pre className="text-emerald-300 overflow-x-auto leading-relaxed">{`import { Room } from 'livekit-client';

const room = new Room();
await room.connect(livekitUrl, token);

// Publish mic & camera instantly
await room.localParticipant.enableCameraAndMicrophone();`}</pre>
            </div>
          </div>
        </div>
      </section>

      {/* Transparent Pricing Cards */}
      <section id="pricing" className="py-20 px-6 max-w-7xl mx-auto w-full space-y-12">
        <div className="text-center space-y-3 max-w-2xl mx-auto">
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            Transparent, Pay-as-You-Go Pricing
          </h2>
          <p className="text-slate-600 text-sm">
            No forced contracts or opaque tiered minimums. Billed in Indian Rupees (INR) with full GST tax invoice.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Starter */}
          <div className="p-8 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-6">
            <div>
              <div className="font-bold text-slate-900 text-lg">Starter</div>
              <p className="text-xs text-slate-500 mt-1">For early startups and testing</p>
            </div>
            <div className="text-3xl font-black text-slate-900">
              ₹0 <span className="text-sm font-normal text-slate-500">/mo platform fee</span>
            </div>
            <ul className="text-xs space-y-3 text-slate-600 font-medium">
              <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> ₹0.30 per video minute</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Max 10 concurrent rooms</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> 12 participants per room</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> BYOS S3 recording export</li>
            </ul>
            <Link
              href="/signup"
              className="block w-full text-center py-2.5 rounded-xl border border-slate-300 hover:border-slate-400 font-semibold text-xs text-slate-800 transition-colors"
            >
              Start Free
            </Link>
          </div>

          {/* Growth */}
          <div className="p-8 rounded-2xl bg-white border-2 border-blue-600 shadow-xl shadow-blue-600/10 space-y-6 relative">
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-1 bg-blue-600 text-white rounded-full text-[11px] font-bold tracking-wider uppercase">
              Most Popular
            </div>
            <div>
              <div className="font-bold text-slate-900 text-lg">Growth</div>
              <p className="text-xs text-slate-500 mt-1">For growing apps & EdTech</p>
            </div>
            <div className="text-3xl font-black text-slate-900">
              ₹4,999 <span className="text-sm font-normal text-slate-500">/month</span>
            </div>
            <ul className="text-xs space-y-3 text-slate-600 font-medium">
              <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-blue-600" /> ₹0.18 per video minute</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-blue-600" /> Max 100 concurrent rooms</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-blue-600" /> 50 participants per room</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-blue-600" /> HLS-CDN Live Broadcast</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-blue-600" /> Priority TURN routing</li>
            </ul>
            <Link
              href="/signup"
              className="block w-full text-center py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 font-semibold text-xs text-white shadow-md shadow-blue-600/20 transition-all"
            >
              Get Started with Growth
            </Link>
          </div>

          {/* Enterprise */}
          <div className="p-8 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-6">
            <div>
              <div className="font-bold text-slate-900 text-lg">Enterprise</div>
              <p className="text-xs text-slate-500 mt-1">Dedicated clusters & SLA</p>
            </div>
            <div className="text-3xl font-black text-slate-900">
              Custom <span className="text-sm font-normal text-slate-500">volume rates</span>
            </div>
            <ul className="text-xs space-y-3 text-slate-600 font-medium">
              <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Unlimited concurrent rooms</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Dedicated media nodes & TURN</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> 99.99% Uptime SLA</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Custom B2B contract & DPA</li>
            </ul>
            <Link
              href="/signup"
              className="block w-full text-center py-2.5 rounded-xl border border-slate-300 hover:border-slate-400 font-semibold text-xs text-slate-800 transition-colors"
            >
              Contact Sales
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-10 px-6 text-center text-xs text-slate-500 space-y-2">
        <div className="font-semibold text-slate-700">Nexora RTC PaaS</div>
        <p>Built for developers who value zero-storage privacy, high reliability, and clear pricing.</p>
        <div className="text-slate-400 pt-2">© 2026 Nexora Technologies. All rights reserved.</div>
      </footer>
    </div>
  );
}
