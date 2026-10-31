import { SCAFFOLD_STRINGS } from '../types/library';
import { marqueeItems } from '../types/editorial';
import type { DesignTokens } from '../types/tokens';
import type { ComponentNode, ScreenDoc } from '../types/tree';

export interface LintFinding {
  severity: 'block' | 'warn';
  code:
    | 'scaffold'
    | 'imagery'
    | 'markup'
    | 'cramped'
    | 'button'
    | 'token'
    | 'spacing'
    | 'responsive'
    | 'navbar';
  nodeId: string;
  message: string;
}

/** Deterministic facts, independent of the reviewer and safe on old documents. */
export function lintScreen(
  screen: ScreenDoc,
  tokens?: DesignTokens,
  queuedIds: ReadonlySet<string> = new Set(),
  kind: 'app' | 'web' = 'app',
): LintFinding[] {
  const findings: LintFinding[] = [];
  const colors = new Map<string, string>();
  if (tokens) {
    for (const [key, hex] of Object.entries(tokens.openuiTheme.light_colors || {})) {
      if (typeof hex === 'string' && /^#[0-9a-f]{6}$/i.test(hex))
        colors.set(hex.toLowerCase(), `var(--${key.replaceAll('_', '-')})`);
    }
  }
  const add = (
    node: ComponentNode,
    severity: LintFinding['severity'],
    code: LintFinding['code'],
    message: string,
  ) => findings.push({ nodeId: node.id, severity, code, message });
  let hasImagery = false;
  let hasResponsive = false;
  let hasNavbar = false;
  let heroCount = 0;
  let marqueeCount = 0;
  let accentSections = 0;
  let glowSections = 0;
  const rawPixels = (value: unknown): number[] => {
    if (typeof value === 'number') return [value];
    if (typeof value !== 'string' || /var\(|calc\(/i.test(value)) return [];
    return value
      .trim()
      .split(/\s+/)
      .filter((part) => /^-?\d+(?:\.\d+)?(?:px)?$/i.test(part))
      .map(Number.parseFloat);
  };
  if (kind === 'web') {
    for (const [key, value] of Object.entries(screen.root.styles)) {
      if (
        /^(padding|gap|rowGap|columnGap)/i.test(key) &&
        rawPixels(value).some((n) => n < 24)
      )
        add(
          screen.root,
          'warn',
          'spacing',
          `Web screen root ${key} uses raw spacing below 24px.`,
        );
    }
  }
  const visit = (node: ComponentNode) => {
    if (node.type === 'navbar') hasNavbar = true;
    if (node.type === 'section') {
      const title = String(node.props.title || '')
        .trim()
        .toLowerCase();
      const first = node.children[0];
      if (
        title &&
        first?.type === 'heading' &&
        String(first.props.text || '')
          .trim()
          .toLowerCase() === title
      )
        add(node, 'block', 'markup', 'Section title duplicates its first child heading.');
      if (node.props.surface === 'accent' && ++accentSections > 1)
        add(node, 'warn', 'token', 'More than one accent section on this screen.');
      if (node.props.surface === 'glow' && ++glowSections > 2)
        add(node, 'warn', 'token', 'More than two glow sections on this screen.');
    }
    if (node.type === 'marquee') {
      if (++marqueeCount > 2)
        add(node, 'block', 'markup', 'More than two marquees on this screen.');
      if (marqueeItems(node.props.items).length < 4)
        add(node, 'warn', 'cramped', 'Marquee has fewer than four items.');
    }
    if (node.type === 'accordion') {
      const key = String(node.props.dataKey || node.props.bindKey || '');
      const rows = screen.mockData?.[key];
      const lines =
        typeof node.props.items === 'string'
          ? node.props.items.split(/\r?\n/).filter((line) => line.trim())
          : [];
      if (!rows?.length && (!lines.length || lines.some((line) => !line.includes('|'))))
        add(
          node,
          'block',
          'markup',
          'Accordion requires Question | Answer lines or mock data rows.',
        );
    }
    if (
      (node.styles.aspectRatio ||
        node.styles.responsive?.medium?.aspectRatio ||
        node.styles.responsive?.expanded?.aspectRatio) &&
      !['image', 'hero', 'card'].includes(node.type)
    )
      add(
        node,
        'warn',
        'responsive',
        'Aspect ratio is only applied to media blocks, not text containers.',
      );
    if (node.type === 'grid' && node.children.length) {
      const cols = Math.max(
        1,
        Math.min(
          6,
          Number(
            node.styles.responsive?.expanded?.columns ??
              node.styles.columns ??
              node.props.columns,
          ) || 2,
        ),
      );
      const total = node.children.reduce(
        (sum, child) =>
          sum +
          (child.styles.colSpan === 'full'
            ? cols
            : Math.max(1, Math.min(cols, Number(child.styles.colSpan) || 1))),
        0,
      );
      if (cols > 1 && total > cols && total % cols === 1)
        add(node, 'warn', 'responsive', 'Grid has an orphan cell in the final row.');
    }
    if (node.type === 'hero') {
      heroCount++;
      if (heroCount > 1)
        add(node, 'warn', 'responsive', 'More than one hero on this screen.');
      if (
        ['glow', 'sunk'].includes(String(node.props.surface)) &&
        String(node.styles.color || '').includes('openui-text-on-accent')
      )
        add(
          node,
          'warn',
          'token',
          'Glow or sunk hero uses on-accent text; check contrast.',
        );
    }
    if (
      node.type === 'heading' &&
      Number(node.props.level || 2) === 1 &&
      rawPixels(node.styles.fontSize).length
    )
      add(
        node,
        'warn',
        'responsive',
        'H1 uses a raw pixel font size instead of a fluid type token.',
      );
    if (
      node.type === 'grid' &&
      node.children.filter(
        (child) =>
          child.type === 'card' &&
          ['spotlight', 'accent'].includes(String(child.props.variant)),
      ).length > 1
    )
      add(node, 'warn', 'responsive', 'Grid has more than one spotlight or accent card.');
    if (
      kind === 'web' &&
      node.type === 'grid' &&
      Number(node.styles.columns) >= 2 &&
      !Object.values(node.styles.responsive || {}).some(
        (override) => override && Object.keys(override).length > 0,
      )
    ) {
      add(
        node,
        'warn',
        'responsive',
        'Desktop-first: this grid phones in two columns. Base stacks; density belongs to medium/expanded.',
      );
    }
    if (
      Object.values(node.styles.responsive || {}).some(
        (override) => override && Object.keys(override).length > 0,
      )
    )
      hasResponsive = true;
    if (node.type === 'hero' || node.type === 'image' || Boolean(node.props.image))
      hasImagery = true;
    for (const key of ['text', 'title', 'subtitle', 'label', 'placeholder']) {
      const value = node.props[key];
      if (typeof value !== 'string' || !value.trim()) continue;
      if (
        SCAFFOLD_STRINGS.has(value.trim()) ||
        /says something useful|A hero headline|One line about why|Type here|Say more/i.test(
          value,
        )
      )
        add(
          node,
          'block',
          'scaffold',
          `${key} contains scaffold copy: ${value.slice(0, 120)}`,
        );
      if (/\b(?:undefined|null|NaN)\b|\{\{/i.test(value))
        add(
          node,
          'block',
          'markup',
          `${key} contains an unresolved value: ${value.slice(0, 120)}`,
        );
    }
    const hasImage =
      (typeof node.props.src === 'string' && Boolean(node.props.src.trim())) ||
      (typeof node.props.image === 'string' && Boolean(node.props.image.trim()));
    if (node.type === 'image' && !hasImage && !queuedIds.has(node.id))
      add(node, 'warn', 'imagery', 'Image is empty; a palette placeholder is shown.');
    if (
      node.type === 'hero' &&
      !hasImage &&
      !queuedIds.has(node.id) &&
      !node.children.length &&
      !(typeof node.props.subtitle === 'string' && node.props.subtitle.trim())
    )
      add(
        node,
        'warn',
        'imagery',
        'Hero has no image, children, or subtitle; consider adding content.',
      );
    if (
      (node.type === 'row' || node.type === 'col') &&
      node.children.length > 6 &&
      !node.styles.gap
    )
      add(
        node,
        'warn',
        'cramped',
        `${node.type} has ${node.children.length} children and no gap`,
      );
    if (
      node.type === 'button' &&
      typeof node.props.text === 'string' &&
      node.props.text.trim().length < 3
    )
      add(node, 'warn', 'button', 'Button text is shorter than 3 characters');
    // Inspect shorthands, side-specific values, and responsive overrides. Only
    // literal pixels/unitless values are measured; percentages and tokens are
    // not pixel values and must not be mistaken for them.
    const excessiveSpacing = (value: unknown): boolean => {
      if (typeof value === 'number') return Math.abs(value) > 96;
      if (value && typeof value === 'object')
        return Object.values(value).some(excessiveSpacing);
      if (typeof value !== 'string') return false;
      return [...value.matchAll(/(?<![\w.%#-])-?\d+(?:\.\d+)?(?:px|dp)?(?![\w.%])/gi)].some(
        (match) => Math.abs(Number.parseFloat(match[0])) > 96,
      );
    };
    const checkSpacing = (styles: Record<string, unknown>, prefix = '') => {
      for (const [key, value] of Object.entries(styles)) {
        if (key === 'responsive' && value && typeof value === 'object') {
          for (const [breakpoint, override] of Object.entries(value))
            if (override && typeof override === 'object')
              checkSpacing(override as Record<string, unknown>, `${breakpoint}.`);
        } else if (
          /^(?:padding|margin|gap|rowGap|columnGap)(?:$|[A-Z-])/i.test(key) &&
          excessiveSpacing(value)
        ) {
          add(
            node,
            'block',
            'spacing',
            `${prefix}${key} exceeds 96px, likely a misread viewport width.`,
          );
        }
      }
    };
    checkSpacing(node.styles);
    const checkStyles = (styles: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(styles)) {
        if (value && typeof value === 'object')
          checkStyles(value as Record<string, unknown>);
        else if (typeof value === 'string')
          for (const hex of value.match(/#[0-9a-f]{6}\b/gi) || []) {
            const token = colors.get(hex.toLowerCase());
            if (token) add(node, 'warn', 'token', `${key} uses ${hex}; ${token} exists`);
          }
      }
    };
    checkStyles(node.styles);
    node.children.forEach(visit);
  };
  visit(screen.root);
  if (/\blanding\b/i.test(screen.name) && !hasImagery)
    add(
      screen.root,
      'warn',
      'imagery',
      'Landing has no image or hero node; check whether this visual design needs imagery.',
    );
  if (kind === 'web' && !hasResponsive)
    add(
      screen.root,
      'warn',
      'responsive',
      'Build adapts at md/lg or it is a stretched poster: no responsive overrides found.',
    );
  if (kind === 'web' && !hasNavbar)
    add(screen.root, 'warn', 'navbar', 'A website has navigation: no navbar node found.');
  return findings;
}
