import { inrFormat, rateFormat } from '@/lib/marketing';
import type { PublicSite } from '@/lib/types';

const PEOPLE = 2;
const MINUTES = 30;

/** The lowest published video rate, used for "what does a call cost" examples. */
export function lowestVideoRate(site: PublicSite | null): number | null {
  const rates = (site?.plans ?? []).map((p) => p.videoRatePerMinute).filter((r): r is number => r !== null);
  return rates.length ? Math.min(...rates) : null;
}

interface CostExampleProps {
  site: PublicSite | null;
  heading?: string;
  variant: 'home' | 'pricing';
}

/** A receipt for a 30-minute, two-person video consult, priced from the live rate and GST settings. */
export function CostExample({ site, heading, variant }: CostExampleProps) {
  const rate = lowestVideoRate(site);
  const personMinutes = PEOPLE * MINUTES;
  const amount = rate === null ? null : personMinutes * rate;
  const tax = amount === null || !site ? null : (amount * site.gstPercent) / 100;
  const total = amount === null || tax === null ? null : amount + tax;
  const money = (value: number | null) => (value === null ? '—' : `₹${inrFormat.format(value)}`);

  const row = 'flex justify-between gap-3 border-b border-dashed border-crust';
  const home = variant === 'home';

  return (
    <div
      className={`w-full max-w-[440px] rounded-[10px] p-7 shadow-[0_1px_0_#d9cfc0] ${
        home ? 'bg-cream text-[15px] leading-[1.9] -rotate-1' : 'bg-white text-base leading-loose rotate-1'
      } motion-reduce:rotate-0`}
    >
      {heading && <p className="mb-2 font-serif text-[22px]">{heading}</p>}
      <div className={row}>
        <span className="text-bark-muted">
          {PEOPLE} people × {MINUTES} minutes
        </span>
        <span className="font-plex tabular">{personMinutes} min</span>
      </div>
      <div className={row}>
        <span className="text-bark-muted">
          {home ? 'at the video rate' : rate === null ? '× video rate' : `× ₹${rateFormat.format(rate)} video rate`}
        </span>
        <span className="font-plex tabular">{money(amount)}</span>
      </div>
      <div className={row}>
        <span className="text-bark-muted">
          {home ? '' : '+ '}GST{site ? ` ${site.gstPercent}%` : ''}
        </span>
        <span className="font-plex tabular">{money(tax)}</span>
      </div>
      <div className={`flex justify-between gap-3 font-semibold ${home ? '' : 'text-lg'}`}>
        <span>{home ? 'From your wallet' : 'Taken from your wallet'}</span>
        <span className="font-plex tabular">{money(total)}</span>
      </div>
      {total === null && <p className="mt-3 text-sm leading-relaxed text-bark-muted">Amounts appear here once rates are published.</p>}
    </div>
  );
}
