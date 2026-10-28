import { create } from 'zustand';
import type { ComponentNode, ComponentType, ProjectDoc } from '../types/tree';
import { isContainerType, spec } from '../types/library';
import { findNode, findParent } from '../ops/treeUtils';
import { hydrateNode } from '../ops/validate';
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

export function nodeIdFromElement(el: Element | null): string | null {
  let cur: Element | null = el;
  while (cur) {
    const cls = cur.getAttribute('class') || '';
    const hit = cls.split(/\s+/).find((c) => /^n-[a-z][a-z0-9_]{2,30}$/.test(c));
    if (hit) return hit.slice(2);
    cur = cur.parentElement;
  }
  return null;
}

export function resolveTarget(
  doc: ProjectDoc,
  screenRootId: string,
  x: number,
  y: number,
): DropTarget | null {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  const id = nodeIdFromElement(el);
  if (!id) return null;
  const screen = doc.screens.find((s) => s.root.id === screenRootId);
  const node = screen ? findNode(screen.root, id) : null;
  if (!node) return null;
  const rect = el.getBoundingClientRect();
  const local = y - rect.top;
  const edge = Math.min(12, rect.height * 0.22);
  if (isContainerType(node.type)) {
    if (local < edge) return { nodeId: id, mode: 'before', rect };
    if (local > rect.height - edge) return { nodeId: id, mode: 'after', rect };
    return { nodeId: id, mode: 'inside', rect };
  }
  return { nodeId: id, mode: local < rect.height / 2 ? 'before' : 'after', rect };
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
    return {
      ops: [{ op: 'move', id: drag.nodeId, parentId, index }],
      label: 'Move',
    };
  }

  if (!drag.type) return { ops: [], label: '', error: 'Nothing to insert.' };
  const taken = takenIds(doc);
  const node = hydrateNode({ type: drag.type }, taken);
  return {
    ops: [{ op: 'add', parentId, index, node: node as unknown as ComponentNode }],
    label: `Add ${spec(drag.type)?.label || drag.type}`,
  };
}
