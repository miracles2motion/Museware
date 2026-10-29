import type { StyleSet } from './tree';

/**
 * THE STYLE DICTIONARY — one table, three consumers.
 *
 * Before this file, the same visual idea had several homes and several names:
 * a Row's gap lived in props while a Screen's lived in styles; `align` meant
 * "align my children" in props and "align me in my parent" in styles, so the
 * inspector showed two fields both labelled "Align"; width accepted 'match'
 * and 'hug' in the CSS engine but no field ever offered them; and the agent had
 * to guess every key because nothing named one.
 *
 * The law this table enforces: ONE HOME PER CONCEPT.
 *   · styles  = presentation + layout (gap, align, justify, wrap, grow, padding…)
 *   · props   = content and behaviour only (text, src, items, bindKey, variant…)
 *   · alignment is never ambiguous — a container has `align` (cross axis,
 *     align-items) and `justify` (main axis, justify-content); a child has
 *     `selfAlign` (align-self) and `grow` (flex-grow, Sketchware's weight).
 *   · sizing is Sketchware's vocabulary: match | hug | a length.
 *
 * The inspector renders its Style tab from STYLE_FIELDS, tools.ts validates
 * from STYLE_FIELDS, and cssGen emits from STYLE_FIELDS. Add a row here and all
 * three learn it; there is no second list to forget.
 */

export type StyleKind =
  | 'size'
  | 'choice'
  | 'toggle'
  | 'number'
  | 'length'
  | 'spacing'
  | 'color';

/** Who the field is for. `child` means "when I sit inside a flex parent". */
export type StyleScope = 'container' | 'child' | 'text' | 'every';

export type StyleGroup = 'Layout' | 'Space' | 'Size' | 'Colour' | 'Type' | 'Effects';

export interface StyleOption {
  value: string;
  label: string;
}

export interface StyleFieldDef {
  key: string;
  label: string;
  hint: string;
  kind: StyleKind;
  group: StyleGroup;
  scope: StyleScope;
  options?: StyleOption[];
  suggestions?: string[];
  /** How this key becomes CSS. The default is camelCase → kebab-case. */
  emit?: (value: StyleValue) => string[];
}

type StyleValue = string | number | boolean;

export const ALIGN_VALUES = ['start', 'center', 'end', 'stretch'] as const;
export const JUSTIFY_VALUES = ['start', 'center', 'end', 'space-between'] as const;
export const OVERFLOW_VALUES = ['visible', 'hidden', 'auto'] as const;
export const TEXT_ALIGN_VALUES = ['start', 'center', 'end'] as const;
export const SIZE_WORDS = ['match', 'hug'] as const;

const choice = (values: readonly string[], labels?: Record<string, string>): StyleOption[] =>
  values.map((value) => ({ value, label: labels?.[value] || value }));

const ALIGN_CSS: Record<string, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
};
const JUSTIFY_CSS: Record<string, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  'space-between': 'space-between',
};

const SIDES = ['top', 'right', 'bottom', 'left'] as const;

const UNITLESS = new Set(['fontWeight', 'opacity', 'lineHeight', 'zIndex', 'order', 'grow']);

export const camelToKebab = (key: string) =>
  key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

/** 'match'/'hug' are Sketchware words that compile to CSS; numbers get px. */
export function cssValue(key: string, value: StyleValue): string {
  if (typeof value === 'number') {
    return UNITLESS.has(key) || key === 'letterSpacing' ? String(value) : `${value}px`;
  }
  const v = String(value).trim();
  if (v === 'match') return '100%';
  if (v === 'hug') return 'fit-content';
  return v;
}

export function isBoxObject(value: unknown): value is Record<string, StyleValue> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).every(
    (v) => typeof v === 'string' || typeof v === 'number',
  );
}

/** padding / margin accept one value or a per-side box (agent-only for now). */
function boxEmit(key: 'padding' | 'margin') {
  return (value: StyleValue): string[] => {
    if (!isBoxObject(value)) return [`${key}:${cssValue(key, value)}`];
    const out: string[] = [];
    for (const side of SIDES) {
      const sideValue = value[side];
      if (sideValue === undefined || sideValue === '') continue;
      out.push(`${key}-${side}:${cssValue(key, sideValue)}`);
    }
    return out;
  };
}

export const STYLE_FIELDS: StyleFieldDef[] = [
  /* ---------- Layout: what a CONTAINER does to its children ---------- */
  {
    key: 'align',
    label: 'Align children',
    hint: 'Cross axis: start, centre, end, or stretch so children fill the width.',
    kind: 'choice',
    group: 'Layout',
    scope: 'container',
    options: choice(ALIGN_VALUES, { start: 'start', stretch: 'stretch' }),
    emit: (v) => [`align-items:${ALIGN_CSS[String(v)] ?? String(v)}`],
  },
  {
    key: 'justify',
    label: 'Distribute children',
    hint: 'Main axis: space-between pins the first child to the start and the last to the end.',
    kind: 'choice',
    group: 'Layout',
    scope: 'container',
    options: choice(JUSTIFY_VALUES),
    emit: (v) => [`justify-content:${JUSTIFY_CSS[String(v)] ?? String(v)}`],
  },
  {
    key: 'wrap',
    label: 'Wrap to new lines',
    hint: 'When children run out of room, start a new line instead of shrinking them.',
    kind: 'toggle',
    group: 'Layout',
    scope: 'container',
    emit: (v) => [`flex-wrap:${v ? 'wrap' : 'nowrap'}`],
  },
  {
    key: 'gap',
    label: 'Space between children',
    hint: 'Distance between children. A token keeps the rhythm of the page.',
    kind: 'spacing',
    group: 'Layout',
    scope: 'container',
    suggestions: ['var(--gap-item)', 'var(--gap-section)', '0'],
  },
  {
    key: 'selfAlign',
    label: 'Align in parent',
    hint: 'Cross axis: where this block sits inside the container that holds it.',
    kind: 'choice',
    group: 'Layout',
    scope: 'child',
    options: choice(ALIGN_VALUES),
    emit: (v) => [`align-self:${ALIGN_CSS[String(v)] ?? String(v)}`],
  },
  {
    key: 'grow',
    label: 'Fill leftover space',
    hint: 'In a Row or Column this block soaks up the leftover space on the main axis (Sketchware’s weight).',
    kind: 'toggle',
    group: 'Layout',
    scope: 'child',
    emit: (v) => [`flex-grow:${v ? 1 : 0}`],
  },

  /* ---------- Space: the box itself ---------- */
  {
    key: 'padding',
    label: 'Inner space',
    hint: 'Space inside this box, between its edge and its content.',
    kind: 'spacing',
    group: 'Space',
    scope: 'every',
    suggestions: ['var(--pad-card)', 'var(--pad-screen)', 'var(--pad-control-x)', '0'],
    emit: boxEmit('padding'),
  },
  {
    key: 'margin',
    label: 'Outer space',
    hint: 'Space outside this box, pushing its neighbours away.',
    kind: 'spacing',
    group: 'Space',
    scope: 'every',
    suggestions: ['0', 'auto', 'var(--gap-item)', 'var(--gap-section)'],
    emit: boxEmit('margin'),
  },
  {
    key: 'borderRadius',
    label: 'Corners',
    hint: 'Rounding. Tokens follow the theme’s corner profile.',
    kind: 'spacing',
    group: 'Space',
    scope: 'every',
    suggestions: [
      'var(--radius-card)',
      'var(--radius-button)',
      'var(--radius-chip)',
      '0',
    ],
  },

  /* ---------- Size: Sketchware's match / hug / length ---------- */
  {
    key: 'width',
    label: 'Width',
    hint: 'Match fills the parent, Hug fits the content, Fixed is an exact length.',
    kind: 'size',
    group: 'Size',
    scope: 'every',
  },
  {
    key: 'height',
    label: 'Height',
    hint: 'Match fills a parent with a set height — a screen with Scrolls on qualifies. Hug fits the content. Fixed is an exact length.',
    kind: 'size',
    group: 'Size',
    scope: 'every',
  },
  {
    key: 'minWidth',
    label: 'Min width',
    hint: 'The box never gets narrower than this.',
    kind: 'length',
    group: 'Size',
    scope: 'every',
    suggestions: ['120px', '240px', '100%'],
  },
  {
    key: 'maxWidth',
    label: 'Max width',
    hint: 'The box never gets wider than this — useful for readable line lengths.',
    kind: 'length',
    group: 'Size',
    scope: 'every',
    suggestions: ['100%', '720px', '1120px', 'none'],
  },
  {
    key: 'minHeight',
    label: 'Min height',
    hint: 'The box never gets shorter than this.',
    kind: 'length',
    group: 'Size',
    scope: 'every',
    suggestions: ['0', '120px', '320px'],
  },
  {
    key: 'maxHeight',
    label: 'Max height',
    hint: 'The box never gets taller than this.',
    kind: 'length',
    group: 'Size',
    scope: 'every',
    suggestions: ['none', '320px', '640px'],
  },

  /* ---------- Colour ---------- */
  {
    key: 'background',
    label: 'Background',
    hint: 'Fill behind the content. Tokens follow the design system.',
    kind: 'color',
    group: 'Colour',
    scope: 'every',
  },
  {
    key: 'color',
    label: 'Text colour',
    hint: 'Colour of the text inside this block.',
    kind: 'color',
    group: 'Colour',
    scope: 'every',
  },
  {
    key: 'border',
    label: 'Border',
    hint: 'A hairline or a frame, in the same language as CSS borders.',
    kind: 'spacing',
    group: 'Colour',
    scope: 'every',
    suggestions: [
      '1px solid var(--openui-border-default)',
      '1px solid var(--openui-border-accent)',
      'none',
    ],
  },

  /* ---------- Type ---------- */
  {
    key: 'fontSize',
    label: 'Text size',
    hint: 'The type scale, in tokens.',
    kind: 'spacing',
    group: 'Type',
    scope: 'text',
    suggestions: [
      'var(--type-display)',
      'var(--type-title)',
      'var(--type-heading)',
      'var(--type-body)',
      'var(--type-label)',
    ],
  },
  {
    key: 'fontWeight',
    label: 'Weight',
    hint: 'How heavy the strokes are.',
    kind: 'choice',
    group: 'Type',
    scope: 'text',
    options: choice(['300', '400', '500', '600', '700', '800']),
  },
  {
    key: 'lineHeight',
    label: 'Line height',
    hint: 'Distance between lines of text. 1.5 reads well at body size.',
    kind: 'length',
    group: 'Type',
    scope: 'text',
    suggestions: ['1.2', '1.4', '1.58', '1.8'],
  },
  {
    key: 'letterSpacing',
    label: 'Letter spacing',
    hint: 'Tighten headlines, open up small caps.',
    kind: 'length',
    group: 'Type',
    scope: 'text',
    suggestions: ['-0.02em', '0', '0.02em', '0.06em'],
  },
  {
    key: 'textAlign',
    label: 'Text align',
    hint: 'Where the text sits inside its own box.',
    kind: 'choice',
    group: 'Type',
    scope: 'text',
    options: choice(TEXT_ALIGN_VALUES),
  },

  /* ---------- Effects ---------- */
  {
    key: 'boxShadow',
    label: 'Shadow',
    hint: 'Lift the block off the page.',
    kind: 'spacing',
    group: 'Effects',
    scope: 'every',
    suggestions: ['var(--shadow-card)', 'var(--shadow-raised)', 'none'],
  },
  {
    key: 'opacity',
    label: 'Opacity',
    hint: 'How see-through the block is. 1 is solid.',
    kind: 'length',
    group: 'Effects',
    scope: 'every',
    suggestions: ['1', '0.8', '0.6', '0.4'],
  },
  {
    key: 'overflow',
    label: 'Overflow',
    hint: 'What happens to content that does not fit: show it, hide it, or scroll.',
    kind: 'choice',
    group: 'Effects',
    scope: 'every',
    options: choice(OVERFLOW_VALUES),
    emit: (v) => [`overflow:${String(v)}`],
  },
];

export const STYLE_BY_KEY = new Map(STYLE_FIELDS.map((f) => [f.key, f]));

/** Keys that are real style concepts (not raw CSS escapes like marginTop). */
export const STYLE_KEYS: string[] = STYLE_FIELDS.map((f) => f.key);

export const STYLE_GROUPS: StyleGroup[] = [
  'Layout',
  'Space',
  'Size',
  'Colour',
  'Type',
  'Effects',
];

const CONTAINER_ONLY = new Set(['align', 'justify', 'wrap', 'gap']);

export interface RelevanceContext {
  container: boolean;
  /** True for the screen root: it has no parent to align itself inside. */
  isRoot?: boolean;
  textish?: boolean;
}

/**
 * Which fields make sense for this node. A Divider has no children, so it is
 * never shown "Align children"; a Card is not text, so no type section. This is
 * the whole relevance filter — the old tab showed all fourteen fields to
 * everything, which is why none of them meant anything.
 */
export function styleFieldsFor(ctx: RelevanceContext): StyleFieldDef[] {
  return STYLE_FIELDS.filter((field) => {
    if (CONTAINER_ONLY.has(field.key) && !ctx.container) return false;
    switch (field.scope) {
      case 'container':
        return ctx.container;
      case 'child':
        return !ctx.isRoot;
      case 'text':
        return Boolean(ctx.textish);
      default:
        return true;
    }
  });
}

/** The Style tab, grouped and filtered. Empty groups are dropped. */
export function styleSectionsFor(
  ctx: RelevanceContext,
): Array<{ group: StyleGroup; fields: StyleFieldDef[] }> {
  const fields = styleFieldsFor(ctx);
  return STYLE_GROUPS.map((group) => ({
    group,
    fields: fields.filter((f) => f.group === group),
  })).filter((section) => section.fields.length > 0);
}

/**
 * The CSS projection of one style entry. Unknown keys fall through as plain
 * CSS (marginTop, fontFamily, justifyContent…) — the dictionary names the
 * vocabulary, it does not fence the canvas in.
 */
export function styleDeclarationsFor(key: string, value: unknown): string[] {
  if (value === undefined || value === null || value === '') return [];
  const field = STYLE_BY_KEY.get(key);
  if (field?.emit) return field.emit(value as StyleValue);
  if (typeof value === 'object') return [];
  if (typeof value === 'boolean') return [];
  return [`${camelToKebab(key)}:${cssValue(key, value as StyleValue)}`];
}

/** Every declaration a StyleSet produces, in one pass. */
export function styleDeclarations(styles: StyleSet): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(styles)) {
    if (key === 'responsive' || key === 'columns') continue;
    out.push(...styleDeclarationsFor(key, value));
  }
  return out;
}

/** For validation: is this the right shape for this key? */
export function styleValueIssue(key: string, value: unknown): string | null {
  const field = STYLE_BY_KEY.get(key);
  if (!field) return null;
  if (field.kind === 'toggle') {
    if (key === 'grow') {
      return value === 0 || value === 1 || value === true || value === false
        ? null
        : 'grow is 0 or 1 (1 fills the leftover space)';
    }
    return typeof value === 'boolean' ? null : `${key} is true or false`;
  }
  if (field.kind === 'choice' && field.options) {
    // Options are labels; CSS accepts the same word as a number (fontWeight).
    const asText = String(value);
    if (!field.options.some((o) => o.value === asText)) {
      return `${key} must be one of: ${optionList(field)}`;
    }
    return null;
  }
  if (key === 'padding' || key === 'margin') {
    if (isBoxObject(value)) return null;
    if (typeof value === 'string' || typeof value === 'number') return null;
    return `${key} is a length or a box of top/right/bottom/left`;
  }
  if (typeof value === 'string' || typeof value === 'number') return null;
  return `${key} is a value, not ${typeof value}`;
}

function optionList(field: StyleFieldDef): string {
  return (field.options || []).map((o) => o.value).join(', ');
}
