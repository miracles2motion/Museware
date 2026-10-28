import type { Action, ComponentNode, ProjectDoc } from '../types/tree';
import { countNodes, walk } from '../ops/treeUtils';

const IDS_PER_SCREEN = 18;

export const INDEX_CAP = 4000;

function describeActions(node: ComponentNode): string[] {
  const out: string[] = [];
  const render = (actions: Action[] | undefined, depth = 1): string[] => {
    if (!actions) return [];
    const parts: string[] = [];
    for (const a of actions) {
      if (a.type === 'navigate') parts.push(`navigate ${a.to}`);
      else if (a.type === 'setState') parts.push(`set ${a.key}`);
      else if (a.type === 'toggle') parts.push(`toggle ${a.key}`);
      else if (a.type === 'toast') parts.push('toast');
      else if (a.type === 'openUrl') parts.push('openUrl');
      else if (a.type === 'when' && depth < 3) {
        const inner = render(a.then, depth + 1).join('/');
        parts.push(`if ${a.key}${inner ? ` → ${inner}` : ''}`);
      }
    }
    return parts;
  };
  for (const ev of ['tap', 'change', 'submit'] as const) {
    const parts = render(node.events?.[ev]);
    if (parts.length) out.push(`${ev}: ${parts.join(', ')}`);
  }
  return out;
}

export function buildProjectIndex(
  doc: ProjectDoc,
  opts: { selectionId?: string | null; extra?: string[] } = {},
): string {
  const lines: string[] = [];
  lines.push(
    `PROJECT "${doc.name}" · kind ${doc.kind} · ${doc.screens.length} screen${doc.screens.length === 1 ? '' : 's'} · ${doc.customComponents.length} custom components`,
  );
  const stateKeys = new Set<string>();
  for (const screen of doc.screens) {
    walk(screen.root, (n) => {
      const b = n.props.bindKey;
      if (typeof b === 'string' && b) stateKeys.add(b);
      const vw = n.visibleWhen?.key;
      if (vw) stateKeys.add(vw);
    });
  }
  if (doc.customComponents.length) {
    lines.push(
      `CUSTOM: ${doc.customComponents.map((c) => `${c.name} (${c.description || 'block'})`).join(' · ')}`,
    );
  }
  lines.push('SCREENS:');
  for (const screen of doc.screens) {
    lines.push(
      `- ${screen.id} "${screen.name}"${screen.entry ? ' (entry)' : ''} · ${countNodes(screen.root)} nodes`,
    );
    const ids: string[] = [];
    walk(screen.root, (n) => {
      if (ids.length < IDS_PER_SCREEN) ids.push(`${n.id}(${n.type})`);
    });
    lines.push(
      `  ids: ${ids.join(' ')}${countNodes(screen.root) > IDS_PER_SCREEN ? ' …' : ''}`,
    );
    const actions: string[] = [];
    walk(screen.root, (n) => {
      const a = describeActions(n);
      if (a.length && actions.length < 4) actions.push(`${n.id} ${a.join('; ')}`);
    });
    if (actions.length) lines.push(`  actions: ${actions.join(' | ')}`);
    if (screen.mockData && Object.keys(screen.mockData).length) {
      lines.push(
        `  mockData: ${Object.entries(screen.mockData)
          .map(([k, v]) => `${k}(${v.length})`)
          .join(' ')}`,
      );
    }
  }
  lines.push(`STATE KEYS: ${Array.from(stateKeys).sort().join(', ') || 'none yet'}`);
  if (doc.blueprint?.text) {
    lines.push(`BLUEPRINT (${doc.blueprint.decided ? 'approved' : 'proposed'}):`);
    lines.push(doc.blueprint.text.slice(0, 2000));
  }
  if (opts.selectionId) {
    for (const screen of doc.screens) {
      let hit: ComponentNode | null = null;
      walk(screen.root, (n) => {
        if (n.id === opts.selectionId) hit = n;
      });
      if (hit) {
        const node = hit as ComponentNode;
        lines.push(
          `SELECTION: ${node.id} (${node.type}) props=${JSON.stringify(node.props).slice(0, 200)}`,
        );
        break;
      }
    }
  }
  for (const line of opts.extra || []) lines.push(line);
  let out = lines.join('\n');
  if (out.length > INDEX_CAP) out = `${out.slice(0, INDEX_CAP - 18)}\n…(truncated)`;
  return out;
}
