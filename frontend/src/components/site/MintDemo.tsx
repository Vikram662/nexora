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
      aria-label="Example: your server requests a pass, then the call meter starts"
      className="m-0 min-w-0 rounded-[10px] bg-bark text-sand overflow-hidden"
    >
      <figcaption className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-[#4a3c30] font-plex text-xs text-taupe">
        <span>Step 1, for your developer</span>
        <span className="inline-flex items-center gap-2 tabular">
          <span className={`h-2 w-2 rounded-full ${live ? 'bg-[#e07a4f] motion-safe:animate-pulse' : 'bg-[#6b5d4f]'}`} aria-hidden="true" />
          {live ? 'live' : 'idle'} · <span aria-hidden="true">{timecode(seconds)}</span>
          {charged !== null && live && <span aria-hidden="true">· ₹{rateFormat.format(charged)} so far</span>}
        </span>
      </figcaption>

      <pre className="m-0 p-5 font-plex text-[13px] leading-[1.7] overflow-x-auto min-h-[12rem]" aria-hidden="true">
        <code>{TOKEN_REQUEST.slice(0, typed)}</code>
      </pre>
      <p className="sr-only">{TOKEN_REQUEST}</p>

      <pre
        className={`m-0 px-5 pb-5 font-plex text-[13px] leading-[1.7] text-amber-code overflow-x-auto transition-opacity duration-500 ${
          live ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <code>{`→ ${TOKEN_RESPONSE}`}</code>
      </pre>

      <p className="border-t border-[#4a3c30] px-5 py-2.5 text-xs text-taupe">
        Charged per started minute{charged === null ? '' : ', at the lowest plan’s video rate'}.
      </p>
    </figure>
  );
}
