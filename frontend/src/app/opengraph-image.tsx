import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const alt = 'Nexora RTC: video calls that run on servers you own';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Same typefaces and palette as the public site (assets/fonts, OFL; colours from globals.css).
const SAND = '#efe8dd';
const BARK = '#2b2118';
const BARK_SOFT = '#4a3c30';
const MOSS = '#2f6b4f';
const CREAM = '#f8f4ec';

export default async function OpengraphImage() {
  const [newsreader, figtree, photo] = await Promise.all([
    readFile(join(process.cwd(), 'assets/fonts/Newsreader-Medium.ttf')),
    readFile(join(process.cwd(), 'assets/fonts/Figtree-Medium.ttf')),
    readFile(join(process.cwd(), 'public/images/home-hero.jpg')),
  ]);
  const photoSrc = `data:image/jpeg;base64,${photo.toString('base64')}`;

  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', background: SAND, color: BARK, fontFamily: 'Figtree' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '64px 48px 64px 72px' }}>
        <div style={{ display: 'flex', fontFamily: 'Newsreader', fontSize: 44 }}>Nexora</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div style={{ display: 'flex', fontFamily: 'Newsreader', fontSize: 72, lineHeight: 1.04, letterSpacing: -1.5 }}>
            Video calls that run on servers you own.
          </div>
          <div style={{ display: 'flex', fontSize: 28, lineHeight: 1.4, color: BARK_SOFT }}>
            Rooms, recordings and GST billing in rupees.
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            alignSelf: 'flex-start',
            padding: '12px 22px',
            borderRadius: 999,
            background: MOSS,
            color: CREAM,
            fontSize: 22,
          }}
        >
          Media on your servers · Recordings in your bucket
        </div>
      </div>
      <div style={{ display: 'flex', width: 440, padding: '40px 40px 40px 0' }}>
        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
        <img src={photoSrc} width={400} height={550} style={{ width: 400, height: 550, objectFit: 'cover', borderRadius: 18 }} />
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: 'Newsreader', data: newsreader, style: 'normal', weight: 500 },
        { name: 'Figtree', data: figtree, style: 'normal', weight: 500 },
      ],
    },
  );
}
