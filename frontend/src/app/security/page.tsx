import type { Metadata } from 'next';
import { SiteShell } from '@/components/site/SiteShell';
import { SECURITY_SECTIONS } from '@/lib/marketing';

export const metadata: Metadata = {
  title: 'Data & security',
  alternates: { canonical: '/security' },
  description:
    'Where recordings are stored, what Nexora keeps, how bucket credentials are encrypted, and which compliance claims we do not make.',
};

export default function SecurityPage() {
  return (
    <SiteShell>
      <div className="max-w-6xl mx-auto px-6 py-16">
        <h1 className="font-display text-4xl font-semibold tracking-tight max-w-2xl">Where your data ends up</h1>

        <dl className="mt-10 grid md:grid-cols-2 gap-x-16 gap-y-10 max-w-4xl">
          <div>
            <dt className="font-semibold">Recordings</dt>
            <dd className="mt-2 text-muted leading-relaxed">
              The egress worker writes the file to the bucket you connected. We keep a metadata row: room, object key,
              duration, size, status.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Bucket credentials</dt>
            <dd className="mt-2 text-muted leading-relaxed">
              Encrypted with AES-256-GCM and decrypted only when a recording starts. They are never returned to the
              browser after you save them.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">What we do hold</dt>
            <dd className="mt-2 text-muted leading-relaxed">
              Account and organisation records, KYC documents you submit, the wallet ledger, GST invoices, and usage
              logs. Chat content is not stored.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Isolation between customers</dt>
            <dd className="mt-2 text-muted leading-relaxed">
              Room names are prefixed with the project id on the media server, and every API call is scoped to the
              authenticated project or organisation.
            </dd>
          </div>
        </dl>

        <p className="mt-12 border-t border-line pt-6 text-sm text-muted max-w-3xl">
          Compliance depends on how you deploy and configure. We are working toward SOC 2 readiness and have not been
          audited; talk to us before relying on Nexora for HIPAA or DPDP obligations.
        </p>
      </div>

      <section aria-labelledby="controls-heading" className="border-t border-line bg-paper-deep">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <h2 id="controls-heading" className="font-display text-3xl font-semibold tracking-tight">
            Controls in the product today
          </h2>
          <div className="mt-10 grid md:grid-cols-2 gap-x-14 gap-y-10">
            {SECURITY_SECTIONS.map((section) => (
              <div key={section.title}>
                <h3 className="font-semibold">{section.title}</h3>
                <ul className="mt-3 space-y-2.5 text-sm text-muted leading-relaxed">
                  {section.points.map((point) => (
                    <li key={point} className="border-l-2 border-accent/50 pl-3">
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="shared-heading" className="max-w-6xl mx-auto px-6 py-16">
        <h2 id="shared-heading" className="font-display text-3xl font-semibold tracking-tight">
          What stays your responsibility
        </h2>
        <ul className="mt-6 max-w-3xl space-y-3 text-muted leading-relaxed">
          <li>Hardening and patching the LiveKit, Coturn, egress, database and Redis hosts you run.</li>
          <li>Access policy and retention on the storage bucket where recordings are written.</li>
          <li>Keeping project secrets on your server, never in a mobile or web bundle.</li>
          <li>Consent and lawful basis for recording the people on your calls.</li>
        </ul>
      </section>
    </SiteShell>
  );
}
