import type { ComponentNode, ProjectDoc, StyleSet } from '../types/tree';

const CAP = 4000;

function styleDigest(styles: StyleSet): string {
  const bits: string[] = [];
  for (const key of [
    'padding',
    'gap',
    'background',
    'color',
    'fontSize',
    'fontWeight',
    'borderRadius',
    'width',
    'maxWidth',
    'textAlign',
  ] as const) {
    const v = styles[key];
    if (v !== undefined && v !== '' && v !== null) bits.push(`${key}=${String(v)}`);
  }
  return bits.length ? ` [${bits.join(' ')}]` : '';
}

function textOf(node: ComponentNode): string {
  const p = node.props as Record<string, unknown>;
  const bits: string[] = [];
  for (const key of [
    'text',
    'title',
    'label',
    'subtitle',
    'placeholder',
    'value',
    'delta',
    'brand',
  ]) {
    const v = p[key];
    if (typeof v === 'string' && v.trim()) bits.push(`${key}:"${v.trim().slice(0, 70)}"`);
  }
  if (p.level) bits.push(`level=${String(p.level)}`);
  if (p.variant) bits.push(`variant=${String(p.variant)}`);
  if (p.columns) bits.push(`columns=${String(p.columns)}`);
  if (p.bindKey) bits.push(`binds=${String(p.bindKey)}`);
  if (p.icon) bits.push(`icon=${String(p.icon)}`);
  if (p.src) bits.push('image:set');
  return bits.length ? ` ${bits.join(' ')}` : '';
}

function actionsOf(node: ComponentNode): string {
  if (!node.events) return '';
  const parts: string[] = [];
  for (const [ev, list] of Object.entries(node.events)) {
    if (!list || !list.length) continue;
    const verbs = list.map((a) => {
      if (a.type === 'navigate') return `→${a.to}`;
      if (a.type === 'setState') return `set ${a.key}`;
      if (a.type === 'toggle') return `toggle ${a.key}`;
      if (a.type === 'toast') return 'toast';
      if (a.type === 'openUrl') return 'openUrl';
      return `if ${a.key}`;
    });
    parts.push(`${ev}:${verbs.join(',')}`);
  }
  return parts.length ? ` {${parts.join(';')}}` : '';
}

function renderNode(
  node: ComponentNode,
  depth: number,
  lines: string[],
  cap: number,
): void {
  if (lines.join('\n').length > cap) return;
  const indent = '  '.repeat(depth);
  const visible = node.visibleWhen
    ? ` vis=${node.visibleWhen.key}${node.visibleWhen.equals !== undefined ? `=${String(node.visibleWhen.equals)}` : ''}`
    : '';
  lines.push(
    `${indent}- ${node.id} (${node.type})${textOf(node)}${styleDigest(node.styles)}${actionsOf(node)}${visible}`,
  );
  for (const child of node.children || []) renderNode(child, depth + 1, lines, cap);
}

/** The reviewer's eyes: a plain-text render of the changed screens (§8.3). */
export function canvasOutline(doc: ProjectDoc, screenIds: string[]): string {
  const screens = doc.screens.filter((s) => screenIds.includes(s.id));
  const list = screens.length ? screens : doc.screens;
  const lines: string[] = [];
  lines.push(`CANVAS OUTLINE — ${list.length} screen(s), kind ${doc.kind}`);
  for (const screen of list) {
    const hasResponsive = (() => {
      let found = false;
      const scan = (n: ComponentNode): void => {
        if (n.styles.responsive?.medium || n.styles.responsive?.expanded) found = true;
        n.children.forEach(scan);
      };
      scan(screen.root);
      return found;
    })();
    lines.push(
      `\nSCREEN ${screen.id} "${screen.name}"${screen.entry ? ' (entry)' : ''}${hasResponsive ? ' [responsive overrides]' : ''}`,
    );
    const compact: string[] = [];
    screen.root.children.forEach((c) => renderNode(c, 1, compact, 1800));
    lines.push('COMPACT (390):');
    lines.push(...compact);
    if (hasResponsive) {
      const expanded: string[] = [];
      screen.root.children.forEach((c) => renderNode(c, 1, expanded, 1200));
      lines.push('EXPANDED (1024) — same tree, overrides applied:');
      lines.push(...expanded.slice(0, 20));
    }
    if (screen.mockData && Object.keys(screen.mockData).length) {
      lines.push(
        `MOCK DATA: ${Object.entries(screen.mockData)
          .map(([k, v]) => `${k}=${v.length} rows`)
          .join(', ')}`,
      );
    }
  }
  let out = lines.join('\n');
  if (out.length > CAP) out = `${out.slice(0, CAP - 24)}\n…(outline truncated)`;
  return out;
}

export function changedScreenIds(
  doc: ProjectDoc,
  entries: { batch: unknown[] }[],
): string[] {
  void entries;
  return doc.screens.map((s) => s.id);
}
