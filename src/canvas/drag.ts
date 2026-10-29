import { create } from 'zustand';
import type { ComponentNode, ComponentType, ProjectDoc } from '../types/tree';
import { isContainerType, spec } from '../types/library';
import { findNode, findParent, isDescendant } from '../ops/treeUtils';
import { createInsertedNode } from '../ops/screenOps';
import { takenIds } from '../ops/validate';

export type DropMode = 'before' | 'after' | 'inside';

export interface DropTarget {
  nodeId: string;
  mode: DropMode;
  rect: { left: number; top: number; width: number; height: number };
}

export interface DragState {
  active: boolean;
  kind: 'insert' | 'move';
  type?: ComponentType;
  nodeId?: string;
  label: string;
  x: number;
  y: number;
  target: DropTarget | null;
}

const initial: DragState = {
  active: false,
  kind: 'insert',
  label: '',
  x: 0,
  y: 0,
  target: null,
};

export const useDrag = create<{
  drag: DragState;
  begin: (init: {
    kind: 'insert' | 'move';
    type?: ComponentType;
    nodeId?: string;
    label: string;
    x: number;
    y: number;
  }) => void;
  move: (x: number, y: number, target: DropTarget | null) => void;
  end: () => void;
}>((set) => ({
  drag: initial,
  begin: ({ kind, type, nodeId, label, x, y }) =>
    set({
      drag: { active: true, kind, type, nodeId, label, x, y, target: null },
    }),
  move: (x, y, target) => set((s) => ({ drag: { ...s.drag, x, y, target } })),
  end: () => set({ drag: initial }),
}));

const NODE_CLASS = /^n-[a-z][a-z0-9_]{2,30}$/;

/**
 * The element that actually carries `n-<id>`, not the text span the pointer
 * happens to be over. Geometry read from a span is why a drop line used to
 * appear halfway up the card instead of at its edge.
 */
export function nodeElementOf(el: Element | null): { id: string; el: Element } | null {
  let cur: Element | null = el;
  while (cur) {
    const cls = cur.getAttribute('class') || '';
    const hit = cls.split(/\s+/).find((c) => NODE_CLASS.test(c));
    if (hit) return { id: hit.slice(2), el: cur };
    cur = cur.parentElement;
  }
  return null;
}

export function nodeIdFromElement(el: Element | null): string | null {
  return nodeElementOf(el)?.id ?? null;
}

/**
 * Where a drop would land, given the element under the pointer.
 *
 * Three things this now does that it did not:
 *
 * 1. It speaks about the NODE, not the deepest span inside it, so `before` and
 *    `after` mean what they say.
 * 2. Empty space inside the artboard is a target — the screen itself. A drag
 *    released on the padding of a phone screen used to do nothing at all,
 *    which reads as "drag and drop is decoration".
 * 3. Anything outside the artboard is not a target, so a stray release over
 *    the panels cancels instead of building something.
 */
export function dropTargetFor(
  doc: ProjectDoc,
  screenRootId: string,
  el: Element | null,
  y: number,
): DropTarget | null {
  if (!el || typeof (el as Element).closest !== 'function') return null;
  const insideFrame = Boolean(el.closest('.frame-viewport'));
  const screen = doc.screens.find((s) => s.root.id === screenRootId);
  if (!screen) return null;
  const hit = nodeElementOf(el);
  if (!hit) {
    if (!insideFrame) return null;
    const rootEl = el.closest('.frame-viewport')?.querySelector(`.n-${screen.root.id}`);
    if (!rootEl) return null;
    return { nodeId: screen.root.id, mode: 'inside', rect: rootEl.getBoundingClientRect() };
  }
  const node = findNode(screen.root, hit.id);
  if (!node) return null;
  if (node.id === screen.root.id) {
    return { nodeId: node.id, mode: 'inside', rect: hit.el.getBoundingClientRect() };
  }
  const rect = hit.el.getBoundingClientRect();
  const local = y - rect.top;
  const edge = Math.min(12, rect.height * 0.22);
  if (isContainerType(node.type)) {
    if (local < edge) return { nodeId: node.id, mode: 'before', rect };
    if (local > rect.height - edge) return { nodeId: node.id, mode: 'after', rect };
    return { nodeId: node.id, mode: 'inside', rect };
  }
  return { nodeId: node.id, mode: local < rect.height / 2 ? 'before' : 'after', rect };
}

/** Convenience for the pointer path: hit-test the viewport yourself. */
export function resolveTarget(
  doc: ProjectDoc,
  screenRootId: string,
  x: number,
  y: number,
): DropTarget | null {
  return dropTargetFor(doc, screenRootId, document.elementFromPoint(x, y), y);
}

export interface DropResult {
  ops: unknown[];
  label: string;
  error?: string;
}

export function buildDropOps(
  doc: ProjectDoc,
  drag: Pick<DragState, 'kind' | 'type' | 'nodeId'>,
  target: DropTarget,
): DropResult {
  const screen = doc.screens.find((s) => findNode(s.root, target.nodeId));
  if (!screen) return { ops: [], label: '', error: 'Drop inside a screen.' };
  const targetNode = findNode(screen.root, target.nodeId);
  if (!targetNode) return { ops: [], label: '', error: 'That element is gone.' };

  let parentId: string;
  let index: number;
  if (target.mode === 'inside') {
    if (!isContainerType(targetNode.type)) {
      return { ops: [], label: '', error: 'That element cannot hold children.' };
    }
    parentId = targetNode.id;
    index = targetNode.children.length;
  } else {
    if (screen.root.id === targetNode.id) {
      return { ops: [], label: '', error: 'Drop into the screen instead.' };
    }
    const parent = findParent(screen.root, targetNode.id);
    if (!parent) return { ops: [], label: '', error: 'No parent for that element.' };
    parentId = parent.parent.id;
    index = parent.index + (target.mode === 'after' ? 1 : 0);
    if (!isContainerType(parent.parent.type)) {
      return { ops: [], label: '', error: 'Drop into a container.' };
    }
  }

  if (drag.kind === 'move' && drag.nodeId) {
    if (drag.nodeId === target.nodeId)
      return { ops: [], label: '', error: 'Already there.' };
    if (isDescendant(screen.root, drag.nodeId, targetNode.id)) {
      return { ops: [], label: '', error: 'A node cannot go inside itself.' };
    }
    /*
     * Insert indices are child positions BEFORE the move, so a node coming
     * from earlier in the same parent shifts the target down by one once it
     * leaves. Without this, dragging B onto C put B after D.
     */
    const from = findParent(screen.root, drag.nodeId);
    if (from && from.parent.id === parentId && from.index < index) index -= 1;
    if (from && from.parent.id === parentId && from.index === index) {
      return { ops: [], label: '', error: 'Already there.' };
    }
    return {
      ops: [{ op: 'move', id: drag.nodeId, parentId, index }],
      label: 'Move',
    };
  }

  if (!drag.type) return { ops: [], label: '', error: 'Nothing to insert.' };
  const taken = takenIds(doc);
  const parent = findNode(screen.root, parentId)!;
  const node = createInsertedNode(drag.type, parent, taken);
  return {
    ops: [{ op: 'add', parentId, index, node: node as unknown as ComponentNode }],
    label: `Add ${spec(drag.type)?.label || drag.type}`,
  };
}
