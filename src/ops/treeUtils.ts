import type { ComponentNode, ProjectDoc, ScreenDoc } from '../types/tree';

export function clone<T>(value: T): T {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : (JSON.parse(JSON.stringify(value)) as T);
}

export function findNode(node: ComponentNode, id: string): ComponentNode | null {
  if (node.id === id) return node;
  for (const child of node.children || []) {
    const hit = findNode(child, id);
    if (hit) return hit;
  }
  return null;
}

export function findNodeInDoc(
  doc: ProjectDoc,
  id: string,
): { node: ComponentNode; screen: ScreenDoc } | null {
  for (const screen of doc.screens) {
    const node = findNode(screen.root, id);
    if (node) return { node, screen };
  }
  return null;
}

export function findParent(
  root: ComponentNode,
  id: string,
): { parent: ComponentNode; index: number } | null {
  const idx = (root.children || []).findIndex((c) => c.id === id);
  if (idx >= 0) return { parent: root, index: idx };
  for (const child of root.children || []) {
    const hit = findParent(child, id);
    if (hit) return hit;
  }
  return null;
}

export function walk(
  node: ComponentNode,
  visit: (n: ComponentNode, depth: number) => void,
  depth = 0,
) {
  visit(node, depth);
  for (const c of node.children || []) walk(c, visit, depth + 1);
}

export function countNodes(node: ComponentNode): number {
  let n = 1;
  for (const c of node.children || []) n += countNodes(c);
  return n;
}

export function maxDepth(node: ComponentNode, depth = 1): number {
  let d = depth;
  for (const c of node.children || []) d = Math.max(d, maxDepth(c, depth + 1));
  return d;
}

export function isDescendant(
  root: ComponentNode,
  ancestorId: string,
  maybeChildId: string,
): boolean {
  const ancestor = findNode(root, ancestorId);
  if (!ancestor) return false;
  const found = findNode(ancestor, maybeChildId);
  return Boolean(found) && ancestorId !== maybeChildId;
}

export function screenOf(doc: ProjectDoc, screenId: string): ScreenDoc | undefined {
  return doc.screens.find((s) => s.id === screenId);
}

export function entryScreen(doc: ProjectDoc): ScreenDoc | undefined {
  return doc.screens.find((s) => s.entry) || doc.screens[0];
}

export function boundKeys(doc: ProjectDoc): string[] {
  const keys = new Set<string>();
  for (const screen of doc.screens) {
    walk(screen.root, (n) => {
      const b = n.props.bindKey;
      if (typeof b === 'string' && b) keys.add(b);
    });
  }
  return Array.from(keys).sort();
}

export function flattenNodes(root: ComponentNode): ComponentNode[] {
  const out: ComponentNode[] = [];
  walk(root, (n) => out.push(n));
  return out;
}
