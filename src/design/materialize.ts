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
  `--pad-screen:${s.padScreen}px`,
  `--gap-section:${s.gapSection}px`,
  `--pad-card:${s.padCard}px`,
  `--gap-item:${s.gapItem}px`,
  `--pad-control-x:${Math.max(12, Math.round(s.padCard * 0.9))}px`,
  `--h-button:${s.hButton}px`,
  `--h-input:${s.hInput}px`,
  `--h-chip:${s.hChip}px`,
  `--h-row:${s.hRow}px`,
  `--h-nav:${s.hNav}px`,
  `--type-display:${Math.round(28 + s.padScreen * 0.2)}px`,
  `--type-title:${Math.round(20 + s.padScreen * 0.1)}px`,
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
  names.add('font-heading');
  names.add('font-body');
  return names;
}
