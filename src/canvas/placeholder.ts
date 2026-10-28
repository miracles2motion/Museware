import type { DesignTokens } from '../types/tokens';

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const v =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const n = Number.parseInt(v.slice(0, 6) || '6d5cff', 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const to = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `#${[to(r1, r2), to(g1, g2), to(b1, b2)]
    .map((c) => c.toString(16).padStart(2, '0'))
    .join('')}`;
}

function palette(tokens: DesignTokens): { a: string; b: string; bg: string; ink: string } {
  const light = tokens.openuiTheme.light_colors || {};
  const dark = tokens.openuiTheme.dark_colors || {};
  const a = String(
    dark.openui_accent ||
      light.openui_accent ||
      tokens.openuiTheme.brand_color ||
      '#6D5CFF',
  );
  const b = String(
    dark.openui_secondary ||
      light.openui_secondary ||
      tokens.openuiTheme.secondary_color ||
      '#A855F7',
  );
  const bg = String(dark.openui_elevated || light.openui_elevated || '#ffffff');
  const ink = String(dark.openui_text_tertiary || light.openui_text_tertiary || '#8892a6');
  return { a, b, bg, ink };
}

/**
 * The house placeholder: an inline SVG data-URI from the token palette, so a
 * project with no real asset still looks designed (never a 404).
 */
export function placeholderImage(
  tokens: DesignTokens,
  opts: {
    seed?: string;
    width?: number;
    height?: number;
    variant?: 'hero' | 'card' | 'wide';
  } = {},
): string {
  const { a, b, bg } = palette(tokens);
  const w = opts.width || 960;
  const h = opts.height || 600;
  const seed = opts.seed || 'muse';
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 9973;
  const variant = opts.variant || 'wide';
  const c1 = mix(a, bg, 0.12);
  const c2 = mix(b, bg, 0.06);
  const c3 = mix(a, b, 0.5);
  const circles =
    variant === 'card'
      ? `<circle cx="${w * 0.78}" cy="${h * 0.3}" r="${h * 0.36}" fill="${c3}" opacity="0.55"/>
         <circle cx="${w * 0.22}" cy="${h * 0.85}" r="${h * 0.28}" fill="${c2}" opacity="0.8"/>`
      : `<circle cx="${w * 0.82}" cy="${h * 0.22}" r="${h * 0.5}" fill="${c3}" opacity="0.5"/>
         <circle cx="${w * 0.2}" cy="${h * 0.9}" r="${h * 0.42}" fill="${c2}" opacity="0.75"/>
         <path d="M0 ${h * 0.72} Q ${w * 0.3} ${h * 0.5} ${w * 0.58} ${h * 0.7} T ${w} ${h * 0.55} L ${w} ${h} L 0 ${h} Z" fill="${c1}" opacity="0.9"/>`;
  const marks = Array.from({ length: 4 }).map((_, i) => {
    const x = 40 + ((hash + i * 137) % Math.max(60, w - 160));
    const y = 40 + ((hash * (i + 2) + i * 71) % Math.max(60, h - 160));
    return `<rect x="${x}" y="${y}" width="${18 + (i % 3) * 10}" height="6" rx="3" fill="${palette(tokens).ink}" opacity="${0.12 + i * 0.03}"/>`;
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/>
  </linearGradient></defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>
  ${circles}
  <circle cx="${w * 0.5}" cy="${h * 0.5}" r="${Math.min(w, h) * 0.16}" fill="none" stroke="${bg}" stroke-opacity="0.55" stroke-width="2"/>
  ${marks.join('')}
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function avatarPlaceholder(tokens: DesignTokens, initials: string): string {
  const { a, b } = palette(tokens);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
  <defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0%" stop-color="${a}"/><stop offset="100%" stop-color="${b}"/></linearGradient></defs>
  <rect width="96" height="96" rx="48" fill="url(#a)"/>
  <text x="48" y="60" font-family="system-ui, sans-serif" font-size="34" font-weight="700" fill="#ffffff" text-anchor="middle">${initials
    .slice(0, 2)
    .toUpperCase()}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
