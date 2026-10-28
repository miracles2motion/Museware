import { describe, expect, it } from 'vitest';
import { createProject } from '../store/useProject';
import { applyOps } from './apply';
import { emptyScreen, insertNodeBatch, setEntryScreen } from './screenOps';
import { hydrateNode } from './validate';
import type { ProjectDoc } from '../types/tree';

function withScreen(name = 'Home'): ProjectDoc {
  const doc = createProject('Test');
  const screen = emptyScreen(name, { entry: true });
  const res = applyOps([{ op: 'addScreen', screen }], doc, { source: 'user' });
  if (res.errors.length) throw new Error(res.errors[0].message);
  return res.doc;
}

const user = { source: 'user' as const };

describe('the op model', () => {
  it('adds a screen and marks the first one as the entry', () => {
    const doc = withScreen();
    expect(doc.screens).toHaveLength(1);
    expect(doc.screens[0].entry).toBe(true);
  });

  it('batches are all-or-nothing', () => {
    const doc = withScreen();
    const rootId = doc.screens[0].root.id;
    const res = applyOps(
      [
        { op: 'add', parentId: rootId, node: hydrateNode({ type: 'heading' }, new Set()) },
        { op: 'remove', id: 'nope' },
      ],
      doc,
      user,
    );
    expect(res.errors[0].code).toBe('E_NO_PARENT');
    expect(res.doc).toBe(doc);
    expect(res.doc.screens[0].root.children).toHaveLength(0);
  });

  it('rejects unknown tokens with a pointer at the escape hatch', () => {
    const doc = withScreen();
    const rootId = doc.screens[0].root.id;
    const res = applyOps(
      [{ op: 'setStyles', id: rootId, styles: { background: 'var(--openui-nope)' } }],
      doc,
      user,
    );
    expect(res.errors[0].code).toBe('E_TOKEN_UNKNOWN');
  });

  it('a cleared style value removes the property (revert to inherit)', () => {
    const doc = withScreen();
    const rootId = doc.screens[0].root.id;
    const styled = applyOps(
      [{ op: 'setStyles', id: rootId, styles: { background: 'var(--openui-bg)' } }],
      doc,
      user,
    );
    expect(styled.doc.screens[0].root.styles.background).toBe('var(--openui-bg)');
    const cleared = applyOps(
      [{ op: 'setStyles', id: rootId, styles: { background: '' } }],
      styled.doc,
      user,
    );
    expect(cleared.errors).toHaveLength(0);
    expect(cleared.doc.screens[0].root.styles.background).toBeUndefined();
  });

  it('writes and clears a breakpoint override without touching the base', () => {
    const doc = withScreen();
    const rootId = doc.screens[0].root.id;
    const base = applyOps(
      [{ op: 'setStyles', id: rootId, styles: { padding: 'var(--pad-screen)' } }],
      doc,
      user,
    ).doc;
    const overridden = applyOps(
      [
        {
          op: 'setStyles',
          id: rootId,
          styles: { responsive: { medium: { padding: 'var(--pad-card)' } } },
        },
      ],
      base,
      user,
    ).doc;
    expect(overridden.screens[0].root.styles.responsive?.medium?.padding).toBe(
      'var(--pad-card)',
    );
    expect(overridden.screens[0].root.styles.padding).toBe('var(--pad-screen)');

    const cleared = applyOps(
      [
        {
          op: 'setStyles',
          id: rootId,
          styles: { responsive: { medium: { padding: '' } } },
        },
      ],
      overridden,
      user,
    ).doc;
    expect(cleared.screens[0].root.styles.responsive?.medium?.padding).toBeUndefined();
    expect(cleared.screens[0].root.styles.padding).toBe('var(--pad-screen)');
  });

  it('refuses to remove the last screen or the screen root', () => {
    const doc = withScreen();
    const rootId = doc.screens[0].root.id;
    expect(applyOps([{ op: 'remove', id: rootId }], doc, user).errors[0].code).toBe(
      'E_BAD_OP',
    );
    expect(
      applyOps([{ op: 'removeScreen', id: doc.screens[0].id }], doc, user).errors[0].code,
    ).toBe('E_BAD_OP');
  });

  it('never moves a node inside itself', () => {
    const doc = withScreen();
    const root = doc.screens[0].root;
    const card = hydrateNode({ type: 'card' }, new Set());
    const added = applyOps([{ op: 'add', parentId: root.id, node: card }], doc, user).doc;
    const res = applyOps([{ op: 'move', id: card.id, parentId: card.id }], added, user);
    expect(res.errors[0].code).toBe('E_BAD_OP');
  });

  it('enforces one addScreen per turn (law 12)', () => {
    const doc = withScreen();
    const res = applyOps(
      [
        { op: 'addScreen', screen: emptyScreen('Two') },
        { op: 'addScreen', screen: emptyScreen('Three') },
      ],
      doc,
      user,
    );
    expect(res.errors[0].code).toBe('E_BUILD_CARD');
  });

  it('setEntry moves the entry flag and keep exactly one', () => {
    const doc = applyOps(
      [{ op: 'addScreen', screen: emptyScreen('Two') }],
      withScreen(),
      user,
    ).doc;
    expect(setEntryScreen(doc, 'two')).toBe(true);
    const moved = applyOps([{ op: 'setEntry', id: 'two' }], doc, user).doc;
    expect(moved.screens.filter((s) => s.entry)).toHaveLength(1);
    expect(moved.screens.find((s) => s.entry)?.id).toBe('two');
  });

  it('inserts a node by type through insertNodeBatch', () => {
    const doc = withScreen();
    const batch = insertNodeBatch(doc, 'button', doc.screens[0].root.id);
    if ('error' in batch) throw new Error(batch.error);
    const res = applyOps(batch.ops, doc, user);
    expect(res.errors).toHaveLength(0);
    expect(res.doc.screens[0].root.children[0].type).toBe('button');
  });

  it('rejects a duplicate node id anywhere in the batch', () => {
    const doc = withScreen();
    const rootId = doc.screens[0].root.id;
    const node = hydrateNode({ type: 'text', id: 'dup_text' }, new Set());
    const res = applyOps(
      [
        { op: 'add', parentId: rootId, node },
        { op: 'add', parentId: rootId, node },
      ],
      doc,
      user,
    );
    expect(res.errors.length).toBeGreaterThan(0);
  });
});
