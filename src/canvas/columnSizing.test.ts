import { describe, expect, it } from 'vitest';
import { buildDropOps } from './drag';
import { createProject } from '../store/useProject';
import { emptyScreen, insertNodeBatch } from '../ops/screenOps';
import { applyOps } from '../ops/apply';
import { generateCss } from './cssGen';
import type { ComponentNode } from '../types/tree';
const rect = { left: 0, top: 0, width: 390, height: 780 };

describe('new columns on a screen', () => {
  it('dragging to the screen applies real match-height styles immediately', () => {
    const screen = emptyScreen('Home', { id: 'home', entry: true });
    const doc = { ...createProject(), screens: [screen] };
    const result = buildDropOps(
      doc,
      { kind: 'insert', type: 'col', nodeId: undefined },
      { nodeId: screen.root.id, mode: 'inside', rect },
    );
    const applied = applyOps(result.ops, doc, { source: 'user' });
    expect(applied.errors).toEqual([]);
    const column = applied.doc.screens[0].root.children[0];
    expect(column.styles.height).toBe('match');
    expect(generateCss(applied.doc)).toMatch(
      new RegExp(`\\.n-${column.id}\\{[^}]*height:100%`),
    );
  });
  it('click insertion also matches at screen level but nested columns do not force height', () => {
    const screen = emptyScreen('Home', { id: 'home', entry: true });
    const parent: ComponentNode = {
      id: 'outer_col',
      type: 'col',
      props: {},
      styles: {},
      children: [],
    };
    screen.root.children.push(parent);
    const doc = { ...createProject(), screens: [screen] };
    const root = insertNodeBatch(doc, 'col');
    const nested = insertNodeBatch(doc, 'col', parent.id);
    if ('error' in root || 'error' in nested) throw new Error('failed to insert');
    expect((root.ops[0] as { node: ComponentNode }).node.styles.height).toBe('match');
    expect((nested.ops[0] as { node: ComponentNode }).node.styles.height).toBeUndefined();
  });
});
