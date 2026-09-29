import { ImageResponse } from 'next/og';

export const alt = 'Nexora RTC: calls, broadcasts and recordings on a media server you host';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          background: '#0b1b2e',
          color: '#f7f9fc',
        }}
      >
        <div style={{ display: 'flex', fontSize: 40, fontWeight: 700 }}>
          Nexora<span style={{ color: '#2dd4bf' }}>.</span>rtc
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05, maxWidth: 980 }}>
            Calls, broadcasts and recordings on a media server you host.
          </div>
          <div style={{ fontSize: 30, color: '#94a3b8' }}>Tokens, rooms, webhooks and GST billing in INR</div>
        </div>
      </div>
    ),
    size,
  );
}
