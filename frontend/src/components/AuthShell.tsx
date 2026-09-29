import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface AuthShellProps {
  title: string;
  lede: string;
  aside: { heading: string; points: string[] };
  footer: React.ReactNode;
  children: React.ReactNode;
}

export function AuthShell({ title, lede, aside, footer, children }: AuthShellProps) {
  return (
    <div className="min-h-screen grid lg:grid-cols-[0.9fr_1.1fr] selection:bg-accent selection:text-white">
      <aside className="hidden lg:flex flex-col justify-between bg-console text-slate-200 px-12 py-14">
        <Link href="/" className="font-display text-xl font-semibold tracking-tight text-paper">
          Nexora<span className="text-accent">.</span>rtc
        </Link>
        <div>
          <h2 className="font-display text-3xl font-semibold tracking-tight text-paper leading-tight max-w-sm">
            {aside.heading}
          </h2>
          <ul className="mt-8 space-y-4 text-sm text-slate-400 max-w-sm">
            {aside.points.map((point) => (
              <li key={point} className="border-l border-console-line pl-4 leading-relaxed">
                {point}
              </li>
            ))}
          </ul>
        </div>
        <p className="font-mono text-[11px] text-slate-500">Control plane · LiveKit · INR billing</p>
      </aside>

      <main className="flex flex-col justify-center px-6 py-14 sm:px-12">
        <div className="w-full max-w-sm mx-auto">
          <Link href="/" className="lg:hidden font-display text-xl font-semibold tracking-tight">
            Nexora<span className="text-accent">.</span>rtc
          </Link>
          <h1 className="font-display mt-6 lg:mt-0 text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm text-muted leading-relaxed">{lede}</p>
          <div className="mt-8">{children}</div>
          <p className="mt-8 text-sm text-muted">{footer}</p>
        </div>
      </main>
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
  icon: LucideIcon;
  autoComplete?: string;
  minLength?: number;
}

export function AuthField({ id, label, type, value, onChange, placeholder, icon: Icon, autoComplete, minLength }: AuthFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium mb-1.5">
        {label}
      </label>
      <div className="relative">
        <Icon className="h-4 w-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
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
          className="w-full pl-9 pr-3 py-2.5 rounded-md border border-line bg-white text-sm placeholder:text-slate-400 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
        />
      </div>
    </div>
  );
}

export function AuthError({ message }: { message: string }) {
  return (
    <div role="alert" className="mb-5 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
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
      className="w-full py-2.5 rounded-md bg-ink text-paper text-sm font-medium hover:bg-accent transition-colors active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
    >
      {loading ? busy : idle}
    </button>
  );
}
