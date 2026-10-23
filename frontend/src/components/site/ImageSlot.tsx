import Image from 'next/image';
import { twMerge } from 'tailwind-merge';
import { SITE_IMAGES, type ImageSlotKey } from '@/lib/marketing';

const TONES = ['bg-slot', 'bg-[#cdbfa9]', 'bg-[#d8cbb8]'] as const;

/** Rendered width hints for the responsive srcset: half-width hero boxes and three-up card grids. */
export const SLOT_SIZES = {
  half: '(min-width: 1024px) 560px, 100vw',
  third: '(min-width: 1180px) 370px, (min-width: 700px) 50vw, 100vw',
} as const;

interface ImageSlotProps {
  slot: ImageSlotKey;
  className?: string;
  /** Placeholder shade, so neighbouring slots read as separate photos. */
  tone?: 0 | 1 | 2;
  /** 'pill' sets the label on a sand chip (large slots); 'plain' is a bare caption (small cards). */
  label?: 'pill' | 'plain';
  sizes?: string;
  /** The page's main above-the-fold photo: load it first (largest contentful paint). */
  eager?: boolean;
  children?: React.ReactNode;
}

/** A photo box: renders the image set in SITE_IMAGES, or a labelled placeholder until one is set. */
export function ImageSlot({ slot, className = '', tone = 0, label = 'pill', sizes = SLOT_SIZES.half, eager, children }: ImageSlotProps) {
  const image = SITE_IMAGES[slot];

  if (image.src) {
    return (
      <div className={twMerge('relative overflow-hidden rounded-[10px]', TONES[tone], className)}>
        <Image
          src={image.src}
          alt={image.alt}
          fill
          sizes={sizes}
          className="object-cover"
          {...(eager ? { loading: 'eager' as const, fetchPriority: 'high' as const } : {})}
        />
        {children && <div className="relative h-full w-full">{children}</div>}
      </div>
    );
  }

  const caption =
    label === 'pill' ? (
      <span className="self-start font-plex text-xs text-slot-ink bg-sand px-2.5 py-1.5 rounded-full">Photo · {image.hint}</span>
    ) : (
      <span className="font-plex text-[11px] text-slot-ink">Photo · {image.hint}</span>
    );

  if (children) {
    return <div className={twMerge('rounded-[10px]', TONES[tone], className)}>{children}</div>;
  }

  return (
    <div
      role="img"
      aria-label={`Photo placeholder: ${image.alt}`}
      className={twMerge('flex flex-col justify-end rounded-[10px] p-4 sm:p-5', TONES[tone], className)}
    >
      {caption}
    </div>
  );
}

/** The placeholder caption on its own, for slots that hold other content (the auth asides). */
export function ImageSlotCaption({ slot }: { slot: ImageSlotKey }) {
  if (SITE_IMAGES[slot].src) return null;
  return (
    <span className="inline-block font-plex text-xs text-slot-ink bg-sand px-2.5 py-1.5 rounded-full">
      Photo · {SITE_IMAGES[slot].hint}
    </span>
  );
}
