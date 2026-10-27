import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ImageSlot, ImageSlotCaption } from '@/components/site/ImageSlot';
import { SITE_IMAGES, type ImageSlotKey } from '@/lib/marketing';

interface AuthShellProps {
  title: string;
  lede: string;
  aside: { heading: string; points: string[] };
  footer: React.ReactNode;
  children: React.ReactNode;
  /** Photo slot behind the aside copy. */
  image?: ImageSlotKey;
  /** Which side the photo aside sits on, from lg up; below that it is hidden. */
  side?: 'left' | 'right';
}

function Brand({ className = '' }: { className?: string }) {
  return (
    <Link href="/" className={`self-start py-1 font-serif text-[28px] font-medium leading-none text-bark ${className}`}>
      Nexora
    </Link>
  );
}

export function AuthShell({ title, lede, aside, footer, children, image = 'signIn', side = 'left' }: AuthShellProps) {
  const hasPhoto = Boolean(SITE_IMAGES[image].src);

  const asideBlock = (
    <ImageSlot slot={image} sizes="(min-width: 1024px) 50vw, 1px" className="hidden lg:flex flex-[1_1_440px] min-h-[360px] rounded-[14px]">
      <div className={`flex h-full w-full flex-col p-7 ${side === 'left' ? 'justify-between' : 'justify-end'}`}>
        {side === 'left' && <Brand />}
        <div className={hasPhoto ? 'self-start max-w-[480px] rounded-xl bg-cream/90 p-5' : ''}>
          <h2 className="max-w-[420px] text-[34px] leading-[1.15]">{aside.heading}</h2>
          <ul className="mt-4 max-w-[440px] pl-[18px] list-disc flex flex-col gap-1.5 text-[15px] leading-relaxed text-[#3e3226]">
            {aside.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
          <div className="mt-4">
            <ImageSlotCaption slot={image} />
          </div>
        </div>
      </div>
    </ImageSlot>
  );

  return (
    <div className="site-warm min-h-screen p-4 sm:p-5 flex gap-5">
      {side === 'left' && asideBlock}

      <main className="flex-[1_1_420px] min-w-0 flex flex-col px-2 pt-2 pb-8">
        <Brand className={side === 'left' ? 'lg:hidden' : ''} />
        <div className="flex flex-1 items-center justify-center pt-8 lg:pt-6">
          <div className="w-full max-w-[400px]">
            <h1 className="text-[38px] sm:text-[44px] tracking-[-0.015em]">{title}</h1>
            <p className="mt-2 text-base leading-relaxed text-bark-soft">{lede}</p>
            <div className="mt-7">{children}</div>
            {footer && <p className="mt-[26px] text-[15px] text-bark-soft">{footer}</p>}
          </div>
        </div>
      </main>

      {side === 'right' && asideBlock}
    </div>
  );
}

interface AuthFieldProps {
  id: string;
  label: string;
  type: 'text' | 'email' | 'password';
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  icon?: LucideIcon;
  autoComplete?: string;
  minLength?: number;
}

export function AuthField({ id, label, type, value, onChange, placeholder, icon: Icon, autoComplete, minLength }: AuthFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-[15px] font-medium mb-1.5">
        {label}
      </label>
      <div className="relative">
        {Icon && <Icon className="h-4 w-4 text-bark-muted absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />}
        <input
          id={id}
          type={type}
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          minLength={minLength}
          onChange={(e) => onChange(e.target.value)}
          required
          suppressHydrationWarning
          className={`w-full min-h-12 ${Icon ? 'pl-10' : 'pl-3.5'} pr-3.5 py-3 rounded-[10px] border border-crust bg-cream text-base text-bark placeholder:text-[#8f8173] focus:outline-none focus:border-moss focus:ring-1 focus:ring-moss transition-colors`}
        />
      </div>
    </div>
  );
}

export function AuthError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="mb-5 flex items-start gap-2 rounded-[10px] border border-[#e5b8a8] bg-[#fbeee8] px-3.5 py-3 text-sm text-[#8a2e1a]"
    >
      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

export function AuthSubmit({ loading, idle, busy }: { loading: boolean; idle: string; busy: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="mt-1.5 w-full min-h-[50px] rounded-full bg-moss text-cream text-base font-medium hover:bg-forest transition-colors active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
    >
      {loading ? busy : idle}
    </button>
  );
}
