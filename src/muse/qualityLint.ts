import { SCAFFOLD_STRINGS } from '../types/library';
import type { DesignTokens } from '../types/tokens';
import type { ComponentNode, ScreenDoc } from '../types/tree';

export interface LintFinding {
  severity: 'block' | 'warn';
  code: 'scaffold' | 'imagery' | 'markup' | 'cramped' | 'button' | 'token';
  nodeId: string;
  message: string;
}

/** Deterministic facts, independent of the reviewer and safe on old documents. */
export function lintScreen(screen: ScreenDoc, tokens?: DesignTokens): LintFinding[] {
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
  const visit = (node: ComponentNode) => {
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
    if (
      (node.type === 'image' || node.type === 'hero') &&
      !node.props.src &&
      !node.props.image &&
      node.props.illustrationQueued !== true
    )
      add(node, 'block', 'imagery', `${node.type} has no image`);
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
  return findings;
}
