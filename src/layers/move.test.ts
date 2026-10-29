import { describe, expect, it } from 'vitest';
import type { ComponentNode, ScreenDoc } from '../types/tree';
import { layerMoveTarget, NEST_INDENT_PX } from './move';

/**
 * The layer panel claims "drag to reorder, drop on a container to nest".
 * Both halves used to be false: a downward drag computed the row's own slot
 * (so nothing moved), and nesting was impossible at any indent.
 */

function node(
  id: string,
  type: ComponentNode['type'],
  children: ComponentNode[] = [],
): ComponentNode {
  return { id, type, props: {}, styles: {}, children };
}

function screenOf(...children: ComponentNode[]): ScreenDoc {
  return {
    id: 'screen_1',
    name: 'Screen 1',
    entry: true,
    root: node('screen_1_root', 'screen', children),
  };
}

/** [a, b, c] under one column. */
function listScreen(): ScreenDoc {
  return screenOf(
    node('col_main', 'col', [
      node('card_a', 'card'),
      node('card_b', 'card'),
      node('card_c', 'card'),
    ]),
  );
}

describe('dragging one layer onto another', () => {
  it('moving DOWN one slot actually moves it down', () => {
    // Old bug: over card_b at index 1, insert at 1 — where it already was.
    const decision = layerMoveTarget(listScreen(), 'card_a', 'card_b');
    expect(decision.target).toEqual({ parentId: 'col_main', index: 1 });
  });

  it('moving UP one slot lands before the row it was dropped on', () => {
    expect(layerMoveTarget(listScreen(), 'card_c', 'card_b').target).toEqual({
      parentId: 'col_main',
      index: 1,
    });
  });

  it('moving the first row to the last lands last', () => {
    expect(layerMoveTarget(listScreen(), 'card_a', 'card_c').target).toEqual({
      parentId: 'col_main',
      index: 2,
    });
  });

  it('refuses to drop a row on itself, or to say "moved" when it did not', () => {
    expect(layerMoveTarget(listScreen(), 'card_a', 'card_a').error).toBe('Already there.');
    // card_b over card_a with no indent inserts before card_a — a real move.
    expect(layerMoveTarget(listScreen(), 'card_b', 'card_a').error).toBeUndefined();
  });

  it('nests when the row is dragged right over a container', () => {
    const decision = layerMoveTarget(
      listScreen(),
      'card_c',
      'col_main',
      NEST_INDENT_PX + 6,
    );
    expect(decision.target).toEqual({ parentId: 'col_main', index: 3 });
  });

  it('does not nest on a small wobble', () => {
    // 4px right is a reorder, not a nest: it lands beside the column.
    expect(layerMoveTarget(listScreen(), 'card_a', 'col_main', 4).target).toEqual({
      parentId: 'screen_1_root',
      index: 0,
    });
  });

  it('never nests inside a leaf, however far right it goes', () => {
    const screen = screenOf(node('heading_x', 'heading'), node('card_a', 'card'));
    expect(layerMoveTarget(screen, 'card_a', 'heading_x', 200).target).toEqual({
      parentId: 'screen_1_root',
      index: 0,
    });
  });

  it('refuses to put a row inside its own subtree', () => {
    const screen = screenOf(
      node('col_main', 'col', [node('card_a', 'card', [node('txt_t', 'text')])]),
    );
    expect(layerMoveTarget(screen, 'card_a', 'txt_t').error).toBe(
      'A node cannot go inside itself.',
    );
  });

  it('never moves the screen itself', () => {
    expect(layerMoveTarget(listScreen(), 'screen_1_root', 'col_main').error).toBe(
      'The screen itself cannot move.',
    );
  });

  it('drops a row on the screen row to append it there', () => {
    expect(layerMoveTarget(listScreen(), 'card_a', 'screen_1_root').target).toEqual({
      parentId: 'screen_1_root',
      index: 1,
    });
  });
});
