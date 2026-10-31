import type { DesignTokens, ColorMap, ThemeComponentToken } from '../types/tokens';
import { COLOR_KEYS } from '../types/tokens';
import { coreTokens } from './starter';

const GENERIC = new Set([
  'system-ui',
  'sans-serif',
  'serif',
  'monospace',
  'ui-sans-serif',
  'ui-monospace',
  'ui-serif',
  'cursive',
]);

function fontStack(value?: string): string | null {
  if (!value || !value.trim()) return null;
  return value
    .split(',')
    .map((part, i) => {
      const f = part.trim();
      if (!f) return '';
      if (
        i === 0 &&
        !f.startsWith('"') &&
        !f.startsWith("'") &&
        !GENERIC.has(f) &&
        /\s/.test(f)
      ) {
        return `"${f}"`;
      }
      return f;
    })
    .filter(Boolean)
    .join(', ');
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

export interface DerivedScales {
  radiusCard: number;
  radiusButton: number;
  radiusInput: number;
  radiusChip: number;
  radiusTag: number;
  padScreen: number;
  gapSection: number;
  padCard: number;
  gapItem: number;
  hButton: number;
  hInput: number;
  hChip: number;
  hRow: number;
  hNav: number;
}

export function derivedScales(tokens: DesignTokens): DerivedScales {
  const t = tokens.openuiTheme;
  const r = t.radii_dp || {};
  const m = t.metrics_dp || {};
  return {
    radiusCard: num(r.card, 14),
    radiusButton: num(r.button, 12),
    radiusInput: num(r.input, 12),
    radiusChip: num(r.chip, 20),
    radiusTag: num(r.tag, 8),
    padScreen: num(m.screen_pad, 20),
    gapSection: num(m.section_gap, 16),
    padCard: num(m.card_pad, 16),
    gapItem: Math.round(num(m.section_gap, 16) * 0.6),
    hButton: num(m.button_height, 50),
    hInput: num(m.input_height, 50),
    hChip: num(m.chip_height, 34),
    hRow: num(m.row_height, 60),
    hNav: Math.round(num(m.button_height, 50) * 1.2),
  };
}

const scaleLines = (s: DerivedScales): string[] => [
  `--radius-card:${s.radiusCard}px`,
  `--radius-button:${s.radiusButton}px`,
  `--radius-input:${s.radiusInput}px`,
  `--radius-chip:${s.radiusChip}px`,
  `--radius-tag:${s.radiusTag}px`,
  `--pad-screen-base:${s.padScreen}px`,
  `--gap-section-base:${s.gapSection}px`,
  '--pad-screen:var(--pad-screen-base)',
  '--gap-section:var(--gap-section-base)',
  `--pad-card:${s.padCard}px`,
  `--gap-item:${s.gapItem}px`,
  `--pad-control-x:${Math.max(12, Math.round(s.padCard * 0.9))}px`,
  `--h-button:${s.hButton}px`,
  `--h-input:${s.hInput}px`,
  `--h-chip:${s.hChip}px`,
  `--h-row:${s.hRow}px`,
  `--h-nav:${s.hNav}px`,
  `--type-display-base:${Math.round(28 + s.padScreen * 0.2)}px`,
  `--type-title-base:${Math.round(20 + s.padScreen * 0.1)}px`,
  '--type-display:var(--type-display-base)',
  '--type-title:var(--type-title-base)',
  `--type-display-md:${Math.round(Math.round(28 + s.padScreen * 0.2) * 1.375)}px`,
  `--type-display-lg:${Math.round(Math.round(28 + s.padScreen * 0.2) * 1.75)}px`,
  `--type-title-md:${Math.round(Math.round(20 + s.padScreen * 0.1) * 1.27)}px`,
  `--type-title-lg:${Math.round(Math.round(20 + s.padScreen * 0.1) * 1.55)}px`,
  `--gap-section-md:${Math.round(s.gapSection * 2)}px`,
  `--gap-section-lg:${Math.round(s.gapSection * 3)}px`,
  `--pad-screen-md:${Math.round(s.padScreen * 1.8)}px`,
  `--pad-screen-lg:${Math.round(s.padScreen * 2.8)}px`,
  '--shadow-card:0 2px 6px rgba(0,0,0,.07), 0 12px 28px rgba(0,0,0,.08)',
  '--shadow-raised:0 4px 10px rgba(0,0,0,.10), 0 20px 40px rgba(0,0,0,.12)',
  '--shadow-glow:0 4px 14px rgba(0,0,0,.08), 0 18px 44px rgba(0,0,0,.12)',
  `--type-heading:${Math.round(16 + s.gapSection * 0.06)}px`,
  `--type-body:14px`,
  `--type-label:12px`,
];

function colorBlock(colors: ColorMap): string[] {
  return COLOR_KEYS.filter((k) => typeof colors[k] === 'string').map(
    (k) => `--${k.replace(/_/g, '-')}:${colors[k]}`,
  );
}

/**
 * tokens → the CSS custom properties every surface (canvas, run, export) shares.
 *
 * `scope` exists for the one page that shows two design systems at once: on
 * `:root` the second stylesheet would overwrite the first and both halves of a
 * comparison would render in whichever token set came last. Pass a selector and
 * the tokens land on that element only.
 */
export function materializeCss(tokens: DesignTokens, scope = ':root'): string {
  const t = tokens.openuiTheme;
  const light = t.light_colors || {};
  const dark = t.dark_colors || {};
  const scales = derivedScales(tokens);
  const heading =
    fontStack(t.font_heading) || 'system-ui, -apple-system, Segoe UI, sans-serif';
  const body = fontStack(t.font_body) || heading;
  const lines: string[] = [];
  lines.push(`${scope}{`);
  lines.push(...colorBlock(light).map((l) => `${l};`));
  lines.push(...scaleLines(scales).map((l) => `${l};`));
  lines.push(`--font-heading:${heading};`);
  lines.push(`--openui-font-heading:var(--font-heading);`);
  lines.push(`--openui-font-body:var(--font-body);`);
  lines.push(`--font-body:${body};`);
  lines.push('}');
  lines.push(
    scope === ':root'
      ? '[data-theme="dark"]{'
      : `${scope}[data-theme="dark"],${scope} [data-theme="dark"]{`,
  );
  lines.push(...colorBlock(dark).map((l) => `${l};`));
  lines.push('}');
  return lines.join('\n');
}

/** Screen-specific LOOK typography, without hard-coding leaf font sizes. */
export function screenLookVariables(
  props: Record<string, unknown>,
): Record<string, string> {
  const title = Number(props.lookTitle);
  const body = Number(props.lookBody);
  if (!Number.isFinite(title) || title <= 0 || !Number.isFinite(body) || body <= 0)
    return {};
  const display = title + 8;
  const pad = Number(props.lookPad);
  const gap = Number(props.lookGap);
  return {
    ...(Number.isFinite(pad) && pad >= 0 && props.lookPad !== undefined
      ? {
          '--pad-screen-base': `${pad}px`,
          '--pad-screen-md': `${Math.round(pad * 1.8)}px`,
          '--pad-screen-lg': `${Math.round(pad * 2.8)}px`,
        }
      : {}),
    ...(Number.isFinite(gap) && gap >= 0 && props.lookGap !== undefined
      ? {
          '--gap-section-base': `${gap}px`,
          '--gap-section-md': `${Math.round(gap * 2)}px`,
          '--gap-section-lg': `${Math.round(gap * 3)}px`,
        }
      : {}),
    '--type-display-base': `${display}px`,
    '--type-title-base': `${title}px`,
    '--type-body': `${body}px`,
    '--type-display-md': `${Math.round(display * 1.375)}px`,
    '--type-display-lg': `${Math.round(display * 1.75)}px`,
    '--type-title-md': `${Math.round(title * 1.27)}px`,
    '--type-title-lg': `${Math.round(title * 1.55)}px`,
  };
}

/** The component tokens that actually apply — preset overrides else core defaults. */
export function effectiveComponentTokens(tokens: DesignTokens): ThemeComponentToken[] {
  const preset = Array.isArray(tokens.tokens) ? tokens.tokens : [];
  const core = coreTokens();
  const byKey = new Map<string, ThemeComponentToken>();
  for (const c of core) byKey.set(c.key, { ...c, props: { ...c.props } });
  for (const p of preset) {
    if (!p || typeof p.key !== 'string') continue;
    const base = byKey.get(p.key);
    byKey.set(p.key, {
      ...base,
      ...p,
      props: { ...(base?.props || {}), ...(p.props || {}) },
    });
  }
  return Array.from(byKey.values());
}

export function componentTokenProps(
  tokens: DesignTokens,
  key: string,
): Record<string, string | number> {
  const found = effectiveComponentTokens(tokens).find((t) => t.key === key);
  return found?.props || {};
}

export function isDarkThemePreferred(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Values allowed in a style token reference: var(--openui-*) / var(--radius-*) … */
export function knownTokenNames(tokens: DesignTokens): Set<string> {
  const names = new Set<string>();
  for (const k of COLOR_KEYS) names.add(k.replace(/_/g, '-'));
  const derived = derivedScales(tokens);
  void derived;
  names.add('radius-card');
  names.add('radius-button');
  names.add('radius-input');
  names.add('radius-chip');
  names.add('radius-tag');
  names.add('pad-screen');
  names.add('gap-section');
  names.add('pad-card');
  names.add('gap-item');
  names.add('pad-control-x');
  names.add('h-button');
  names.add('h-input');
  names.add('h-chip');
  names.add('h-row');
  names.add('h-nav');
  names.add('type-display');
  names.add('type-title');
  names.add('type-heading');
  names.add('type-body');
  names.add('type-label');
  for (const name of ['shadow-card', 'shadow-raised', 'shadow-glow']) names.add(name);
  names.add('openui-font-heading');
  names.add('openui-font-body');
  names.add('font-heading');
  names.add('font-body');
  return names;
}
