import { useId } from 'react';

export interface MusewareLogoProps {
  /** Size in pixels (applies to width & height). Defaults to 18. */
  size?: number;
  /** Custom CSS classes. */
  className?: string;
  /** Fill style: radiant brand gradient (default) or single-color currentColor. */
  variant?: 'gradient' | 'monochrome';
  /** Accessible title for assistive technologies. Pass empty string for purely decorative mark. */
  title?: string;
}

/**
 * Official Museware brand mark.
 * The architectural "M" monogram embodies "The Canvas that builds with you"
 * through sculpted isometric pillars and smooth structural shoulders.
 */
export function MusewareLogo({
  size = 18,
  className = '',
  variant = 'gradient',
  title = 'Museware',
}: MusewareLogoProps) {
  const reactId = useId();
  const gradId = `mw-brand-mark-${reactId.replace(/:/g, '')}`;
  const fill = variant === 'gradient' ? `url(#${gradId})` : 'currentColor';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
      aria-label={title || undefined}
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}
    >
      {variant === 'gradient' && (
        <defs>
          <linearGradient id={gradId} x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="var(--mw-indigo-400)" />
            <stop offset="50%" stopColor="var(--mw-indigo-500)" />
            <stop offset="100%" stopColor="var(--mw-violet-500)" />
          </linearGradient>
        </defs>
      )}
      <path
        d="M5.5 26.5V8C5.5 5.79 7.29 4 9.5 4H10.5C12.1 4 13.5 4.9 14.2 6.3L16 9.8L17.8 6.3C18.5 4.9 19.9 4 21.5 4H22.5C24.71 4 26.5 5.79 26.5 8V26.5C26.5 27.33 25.83 28 25 28C24.17 28 23.5 27.33 23.5 26.5V11L18.3 20.3C17.4 22 14.6 22 13.7 20.3L8.5 11V26.5C8.5 27.33 7.83 28 7 28C6.17 28 5.5 27.33 5.5 26.5Z"
        fill={fill}
      />
    </svg>
  );
}
