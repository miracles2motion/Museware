/**
 * Where a layer-list drag should put the node.
 *
 * Split out of `Layers.tsx` because the interesting part is arithmetic, not
 * rendering — and because the old inline version had two bugs that made the
 * panel feel decorative:
 *
 * 1. It always inserted at the over-row's own index, so dragging a row DOWN
 *    one slot computed the slot it already occupied: the drop looked like it
 *    did nothing.
 * 2. It could never nest, even though the panel says "drop on a container row
 *    to nest": the parent always came from the over-row's parent.
 *
 * Indent decides nesting, the same gesture every tree UI uses: drag a row to
 * the right, over a container, and it goes inside.
 */
import type { ComponentNode, ScreenDoc } from '../types/tree';
import { findNode, findParent, isDescendant } from '../ops/treeUtils';
import { isContainerType } from '../types/library';

/** How far right a row has to be dragged before it means "put it inside". */
export const NEST_INDENT_PX = 18;

export interface MoveTarget {
  parentId: string;
  index: number;
}

export interface MoveDecision {
  target?: MoveTarget;
  error?: string;
}

export function layerMoveTarget(
  screen: ScreenDoc,
  activeId: string,
  overId: string,
  indentPx = 0,
): MoveDecision {
  if (activeId === overId) return { error: 'Already there.' };
  if (activeId === screen.root.id) return { error: 'The screen itself cannot move.' };
  const active = findNode(screen.root, activeId);
  const over = findNode(screen.root, overId);
  if (!active) return { error: 'That layer is gone.' };
  if (!over) return { error: 'That layer is gone.' };
  if (isDescendant(screen.root, activeId, overId)) {
    return { error: 'A node cannot go inside itself.' };
  }

  if (indentPx > NEST_INDENT_PX && isContainerType(over.type)) {
    const last = over.children.length;
    if (active.id === over.id) return { error: 'Already there.' };
    return { target: { parentId: over.id, index: last } };
  }

  const to = findParent(screen.root, over.id);
  // Dropping on the screen row itself: append to the screen.
  if (!to)
    return { target: { parentId: screen.root.id, index: screen.root.children.length } };

  const parentId = to.parent.id;
  const from = findParent(screen.root, activeId);
  const fromSameParent = Boolean(from && from.parent.id === parentId);
  const movingDown = Boolean(fromSameParent && from && from.index < to.index);
  // Insert AFTER the row we are over when moving down, BEFORE it when moving up.
  const raw = to.index + (movingDown ? 1 : 0);
  // `move` removes the node before inserting, so a node that lived earlier in
  // the same parent shifts the target one slot left.
  const index = fromSameParent && from && from.index < raw ? raw - 1 : raw;
  if (fromSameParent && from && from.index === index) return { error: 'Already there.' };
  return { target: { parentId, index } };
}

/** Convenience for callers that only need the node. */
export function isContainer(node: ComponentNode | null): boolean {
  return Boolean(node && isContainerType(node.type));
}
