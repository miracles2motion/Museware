import { findNodeInDoc } from '../ops/treeUtils';
import type { ComponentNode, ProjectDoc } from '../types/tree';

/** Evaluate against the current staged tree, not an untrusted model-provided list. */
export function filterScopedOps(
  doc: ProjectDoc,
  rootId: string,
  ops: unknown[],
  stylesOnly = false,
): { allowed: unknown[]; dropped: number } {
  const root = findNodeInDoc(doc, rootId)?.node;
  const ids = new Set<string>();
  const collect = (node: ComponentNode) => {
    ids.add(node.id);
    node.children.forEach(collect);
  };
  if (root) collect(root);
  const allowed: unknown[] = [];
  let dropped = 0;
  const newIds = (node: unknown): string[] | null => {
    if (!node || typeof node !== 'object') return null;
    const n = node as { id?: unknown; children?: unknown };
    if (typeof n.id !== 'string') return null; // Stable replay is required for atomic commit.
    const children = n.children === undefined ? [] : n.children;
    if (!Array.isArray(children)) return null;
    const all = [n.id];
    for (const child of children) {
      const childIds = newIds(child);
      if (!childIds) return null;
      all.push(...childIds);
    }
    return all;
  };
  // Evolve the allowed ID set in-order, so an added child can be edited in the same batch.
  for (const raw of ops) {
    const op = raw as { op?: string; id?: string; parentId?: string; node?: unknown };
    let ok = false;
    if (op && typeof op === 'object') {
      if (stylesOnly) ok = op.op === 'setStyles' && op.id === rootId;
      else if (['setProps', 'setStyles', 'setText', 'rename'].includes(op.op || ''))
        ok = typeof op.id === 'string' && ids.has(op.id);
      else if (op.op === 'remove')
        ok = typeof op.id === 'string' && op.id !== rootId && ids.has(op.id);
      else if (op.op === 'move')
        ok =
          typeof op.id === 'string' &&
          op.id !== rootId &&
          ids.has(op.id) &&
          typeof op.parentId === 'string' &&
          ids.has(op.parentId);
      else if (op.op === 'add' && typeof op.parentId === 'string' && ids.has(op.parentId)) {
        const added = newIds(op.node);
        ok = Boolean(
          added &&
            new Set(added).size === added.length &&
            added.every((id) => !findNodeInDoc(doc, id) && !ids.has(id)),
        );
        if (ok) added!.forEach((id) => ids.add(id));
      }
    }
    if (ok) allowed.push(raw);
    else dropped += 1;
  }
  return { allowed, dropped };
}
