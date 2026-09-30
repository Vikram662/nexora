'use client';

import { useEffect, useState } from 'react';
import { TOKEN_REQUEST, TOKEN_RESPONSE, rateFormat } from '@/lib/marketing';

const TYPE_INTERVAL_MS = 14;
const RESPONSE_DELAY_MS = 450;

function timecode(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

/**
 * Hero demo: the token request types out, the response arrives, then the session
 * meter starts. Plays once on load; with reduced motion it shows the finished state.
 */
export function MintDemo({ ratePerMinute }: { ratePerMinute: number | null }) {
  const [typed, setTyped] = useState(0);
  const [live, setLive] = useState(false);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    let interval: ReturnType<typeof setInterval> | undefined;

    const startMeter = () => {
      setLive(true);
      interval = setInterval(() => setSeconds((s) => s + 1), 1000);
    };

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      timers.push(
        setTimeout(() => {
          setTyped(TOKEN_REQUEST.length);
          startMeter();
        }, 0),
      );
    } else {
      let i = 0;
      const type = setInterval(() => {
        i += 2;
        setTyped(Math.min(i, TOKEN_REQUEST.length));
        if (i >= TOKEN_REQUEST.length) {
          clearInterval(type);
          timers.push(setTimeout(startMeter, RESPONSE_DELAY_MS));
        }
      }, TYPE_INTERVAL_MS);
      timers.push(type as unknown as ReturnType<typeof setTimeout>);
    }

    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.forEach((t) => clearInterval(t as unknown as ReturnType<typeof setInterval>));
      if (interval) clearInterval(interval);
    };
  }, []);

  const startedMinutes = Math.max(1, Math.ceil(seconds / 60));
  const charged = ratePerMinute === null ? null : startedMinutes * ratePerMinute;

  return (
    <figure
      aria-label="Example: request a room token, then the session meter starts"
      className="rounded-lg bg-console text-slate-200 border border-console-line overflow-hidden"
    >
      <figcaption className="flex items-center justify-between gap-4 px-4 py-2.5 border-b border-console-line font-mono text-[11px] text-slate-400">
        <span>POST /v1/tokens</span>
        <span className="flex items-center gap-2 tabular">
          {live ? <span className="onair-dot" aria-hidden="true" /> : <span className="h-2 w-2 rounded-full bg-slate-600" aria-hidden="true" />}
          <span className={live ? 'text-slate-100' : ''}>{live ? 'LIVE' : 'idle'}</span>
          <span aria-hidden="true">{timecode(seconds)}</span>
          {charged !== null && live && <span aria-hidden="true" className="text-indigo-300">₹{rateFormat.format(charged)}</span>}
        </span>
      </figcaption>

      <pre className="p-4 font-mono text-[12px] leading-relaxed overflow-x-auto min-h-[10.5rem]" aria-hidden="true">
        <code>{TOKEN_REQUEST.slice(0, typed)}</code>
      </pre>
      <p className="sr-only">{TOKEN_REQUEST}</p>

      <div className={`transition-opacity duration-500 ${live ? 'opacity-100' : 'opacity-0'}`}>
        <div className="border-t border-console-line px-4 py-2 font-mono text-[11px] text-slate-500">200 OK</div>
        <pre className="px-4 pb-4 font-mono text-[12px] leading-relaxed text-indigo-200/90 overflow-x-auto">
          <code>{TOKEN_RESPONSE}</code>
        </pre>
      </div>

      <p className="border-t border-console-line px-4 py-2 text-[11px] text-slate-500">
        Billed per started minute{charged === null ? '' : ', at the lowest plan video rate'}.
      </p>
    </figure>
  );
}
