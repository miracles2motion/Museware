import type { DesignTokens } from '../types/tokens';
import { effectiveComponentTokens } from '../design/materialize';

export const TOKEN_SHEET_CAP = 1800;

const PRIORITY_KEYS = [
  'openui_bg',
  'openui_fg',
  'openui_elevated',
  'openui_sunk',
  'openui_accent',
  'openui_accent_subtle',
  'openui_text_primary',
  'openui_text_secondary',
  'openui_text_tertiary',
  'openui_border_default',
  'openui_success_text',
  'openui_alert_text',
  'openui_danger_text',
  'openui_text_brand',
];

function colorPairs(colors: Record<string, string> | undefined, limit: number): string {
  if (!colors) return '';
  const keys = PRIORITY_KEYS.filter((k) => typeof colors[k] === 'string');
  for (const k of Object.keys(colors)) {
    if (keys.length >= limit) break;
    if (!keys.includes(k) && typeof colors[k] === 'string') keys.push(k);
  }
  return keys
    .slice(0, limit)
    .map((k) => `${k.replace(/^openui_/, '')}=${colors[k]}`)
    .join(' ');
}

function foundationsLines(foundations: Record<string, unknown> | undefined): string[] {
  if (!foundations) return [];
  const out: string[] = [];
  const text = JSON.stringify(foundations);
  const font = text.match(/"(?:fontFamily|family|base|body)"\s*:\s*"([^"]{3,60})"/);
  if (font) out.push(`type: ${font[1]}`);
  const grid = text.match(/"(?:grid|spacing|ladder|tap)"\s*:\s*"([^"]{3,70})"/);
  if (grid) out.push(grid[1]);
  if (out.length < 2) {
    const motion = text.match(/"motion"\s*:\s*(\{[^}]{0,120}\})/);
    if (motion) out.push(motion[1].slice(0, 110));
  }
  return out.slice(0, 2);
}

/**
 * The ONLY design context any prompt ever sees (§5.4). Hard cap 1800 chars,
 * reads component tokens by `key` (the regression), and degrades by dropping
 * the least important lines until it fits.
 */
export function buildTokenSheet(tokens: DesignTokens): string {
  const theme = tokens.openuiTheme;
  const scales = [
    `radii card ${theme.radii_dp?.card ?? 14}/btn ${theme.radii_dp?.button ?? 12}/input ${theme.radii_dp?.input ?? 12}`,
    `pad ${theme.metrics_dp?.screen_pad ?? 20} · gap ${theme.metrics_dp?.section_gap ?? 16} · card pad ${theme.metrics_dp?.card_pad ?? 16}`,
    `button h ${theme.metrics_dp?.button_height ?? 50} · input h ${theme.metrics_dp?.input_height ?? 50}`,
  ];
  const fonts =
    theme.font_heading || theme.font_body
      ? `fonts: ${theme.font_heading || 'system'} / ${theme.font_body || 'system'}`
      : 'fonts: system stack';
  const chips = effectiveComponentTokens(tokens);
  const componentLines = chips.map((c) => {
    const props = Object.entries(c.props || {})
      .slice(0, 6)
      .map(([k, v]) => `${k}:${String(v)}`)
      .join(', ');
    return `${c.key}{${props}}`;
  });
  const extra =
    chips.length > 14 ? `+${chips.length - 14} more components (Design System panel)` : '';
  const foundation = foundationsLines(
    theme.foundations as Record<string, unknown> | undefined,
  );

  const build = (colorLimit: number, componentCount: number): string => {
    const lines = [
      `THEME "${tokens.title}" (${tokens.specVersion})`,
      `brand ${theme.brand_color} · secondary ${theme.secondary_color} · neutral ${theme.neutral_scale || 'slate'} · corners ${theme.corner_profile || 'balanced'} · density ${theme.density || 'comfortable'} · mode ${theme.theme_mode || 'DayNight'}`,
      scales.join(' · '),
      fonts,
      `light ${colorPairs(theme.light_colors, colorLimit)}`,
      `dark ${colorPairs(theme.dark_colors, colorLimit)}`,
      `components ${componentLines.slice(0, componentCount).join(' · ')}${extra && componentCount >= 14 ? ` · ${extra}` : ''}`,
      ...foundation.map((f) => `foundation ${f}`),
    ];
    return lines.join('\n');
  };

  let out = build(14, 14);
  let colorLimit = 14;
  let componentCount = 14;
  let foundationsOn = foundation.length > 0;
  while (out.length > TOKEN_SHEET_CAP) {
    if (componentCount > 6) componentCount -= 2;
    else if (colorLimit > 8) colorLimit -= 2;
    else if (componentCount > 2) componentCount -= 1;
    else if (foundationsOn) foundationsOn = false;
    else break;
    out = build(colorLimit, componentCount);
    if (!foundationsOn) {
      out = out
        .split('\n')
        .filter((l) => !l.startsWith('foundation '))
        .join('\n');
    }
  }
  return out.length > TOKEN_SHEET_CAP ? out.slice(0, TOKEN_SHEET_CAP) : out;
}
