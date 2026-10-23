import Link from 'next/link';
import { FOOTER_GROUPS, SOCIAL_LABELS } from '@/lib/marketing';
import type { BrandSettings, ContactSettings, SocialLinks } from '@/lib/types';

const DEFAULT_TAGLINE = 'Built for teams that would rather run their own media servers.';

type SocialKey = keyof typeof SOCIAL_LABELS;

interface FooterProps {
  brand: BrandSettings;
  contact?: ContactSettings;
  social?: SocialLinks;
}

export function Footer({ brand, contact, social }: FooterProps) {
  const socialKeys = social ? (Object.keys(SOCIAL_LABELS) as SocialKey[]).filter((k) => social[k]) : [];
  const companyName = contact?.companyName || brand.siteName;
  const reach = [contact?.phone, contact?.supportHours].filter(Boolean).join(' · ');
  const link = 'inline-block py-1.5 text-[#d9cfc0] no-underline hover:text-cream transition-colors';

  return (
    <footer className="bg-bark text-[#d9cfc0] text-[15px]">
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 pt-16 pb-7">
        <div className="flex flex-wrap gap-x-14 gap-y-10">
          <div className="flex-[2_1_320px] min-w-0">
            <p className="font-serif text-[34px] leading-[1.15] text-cream max-w-[420px]">{brand.tagline || DEFAULT_TAGLINE}</p>
            {socialKeys.length > 0 && social && (
              <ul aria-label="Social profiles" className="mt-5 flex flex-wrap gap-x-[18px] gap-y-1">
                {socialKeys.map((key) => (
                  <li key={key}>
                    <a href={social[key]} target="_blank" rel="noopener noreferrer me" className="inline-block py-1.5 underline underline-offset-4 hover:text-cream">
                      {SOCIAL_LABELS[key]}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {FOOTER_GROUPS.map((group) => (
            <nav key={group.heading} aria-label={group.heading} className="flex-[1_1_140px]">
              <h2 className="text-[13px] font-body font-semibold text-cream">
                {group.heading}
              </h2>
              <ul className="mt-3">
                {group.links.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className={link}>
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          <div className="flex-[1_1_220px] leading-relaxed">
            <h2 className="text-[13px] font-body font-semibold text-cream">
              Say hello
            </h2>
            <address className="not-italic mt-3">
              <span className="block">{companyName}</span>
              {contact?.address && <span className="block whitespace-pre-line">{contact.address}</span>}
              {contact?.email && (
                <a href={`mailto:${contact.email}`} className="block break-all hover:text-cream">
                  {contact.email}
                </a>
              )}
              {reach && <span className="block">{reach}</span>}
            </address>
            <Link href="/contact" className="inline-block mt-2 py-1 text-cream underline underline-offset-4">
              All the ways to reach us
            </Link>
          </div>
        </div>

        <div className="mt-12 pt-5 border-t border-[#4a3c30] flex flex-wrap justify-between gap-x-6 gap-y-2 text-[13px] text-taupe">
          <p>
            © {new Date().getFullYear()} {companyName}
          </p>
          <p className="flex flex-wrap gap-x-5 gap-y-1">
            <Link href="/privacy" className="underline underline-offset-4 hover:text-cream">
              Privacy
            </Link>
            <Link href="/terms" className="underline underline-offset-4 hover:text-cream">
              Terms
            </Link>
            <span>Media on your servers · Recordings in your bucket · Billed in INR</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
