'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/**
 * Draws a QR code in the browser. The value never leaves the page, which matters for
 * two-factor secrets: sending them to an online QR service would hand out the secret.
 */
export function QrCode({ value, size = 144, alt }: { value: string; size?: number; alt: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { width: size * 2, margin: 1, errorCorrectionLevel: 'M' })
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (!src) return <div style={{ width: size, height: size }} className="bg-paper-deep" aria-hidden="true" />;
  // A generated data URL, so there is nothing for next/image to optimise.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} width={size} height={size} className="rounded-md" />;
}
