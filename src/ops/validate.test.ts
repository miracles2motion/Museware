import { describe, expect, it } from 'vitest';
import { createProject } from '../store/useProject';
import { applyOps } from './apply';
import { emptyScreen } from './screenOps';
import type { ProjectDoc } from '../types/tree';

/**
 * The runtime authority. Three vocabularies were unenforced before this file:
 * style keys (any string was accepted, so 'stretch' reached justify-content and
 * vanished), enum props ('banana' was a variant), and required content (a
 * button with no words at all).
 */

const user = { source: 'user' as const };

function withScreen(): ProjectDoc {
  const doc = createProject('Test');
  const res = applyOps([{ op: 'addScreen', screen: emptyScreen('Home', { entry: true }) }], doc, user);
  if (res.errors.length) throw new Error(res.errors[0].message);
  return res.doc;
}

function rootId(doc: ProjectDoc): string {
  return doc.screens[0].root.id;
}

function addNode(doc: ProjectDoc, node: Record<string, unknown>) {
  return applyOps([{ op: 'add', parentId: rootId(doc), node }], doc, user);
}

describe('the style dictionary is enforced', () => {
  it('refuses justify:stretch and points at the valid words', () => {
    const doc = withScreen();
    const res = applyOps(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [{ op: 'setStyles', id: rootId(doc), styles: { justify: 'stretch' } }] as any,
      doc,
      user,
    );
    expect(res.errors[0]?.code).toBe('E_BAD_OP');
    // The runtime names the valid words, so the model can fix it next turn.
    expect(res.errors[0].message).toContain('stretch');
    expect(res.errors[0].message).toContain('space-between');
  });

  it('refuses an alignment word that does not exist', () => {
    const doc = withScreen();
    const res = applyOps(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [{ op: 'setStyles', id: rootId(doc), styles: { align: 'middle' } }] as any,
      doc,
      user,
    );
    expect(res.errors[0]?.code).toBe('E_BAD_OP');
    expect(res.errors[0].message).toContain('align');
  });

  it('refuses a grow that is not 0 or 1', () => {
    const doc = withScreen();
    const res = applyOps(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [{ op: 'setStyles', id: rootId(doc), styles: { grow: 3 } }] as any,
      doc,
      user,
    );
    expect(res.errors[0]?.code).toBe('E_BAD_OP');
  });

  it('accepts the whole dictionary in one call', () => {
    const doc = withScreen();
    const res = applyOps(
      [
        {
          op: 'setStyles',
          id: rootId(doc),
          styles: {
            align: 'center',
            selfAlign: 'end',
            justify: 'space-between',
            wrap: true,
            grow: 1,
            gap: 'var(--gap-item)',
            width: 'hug',
            height: 'match',
            overflow: 'hidden',
            padding: { top: '8px', left: 16 },
          },
        },
      ],
      doc,
      user,
    );
    expect(res.errors).toEqual([]);
    const styles = res.doc.screens[0].root.styles;
    expect(styles.padding).toEqual({ top: '8px', left: 16 });
    expect(styles.justify).toBe('space-between');
  });

  it('still accepts a raw CSS key as the escape hatch', () => {
    const doc = withScreen();
    const res = applyOps(
      [{ op: 'setStyles', id: rootId(doc), styles: { marginTop: '24px' } }],
      doc,
      user,
    );
    expect(res.errors).toEqual([]);
  });
});

describe('property sheets are enforced', () => {
  it('refuses a variant nobody can render', () => {
    const res = addNode(withScreen(), {
      type: 'button',
      props: { text: 'Go', variant: 'banana' },
    });
    expect(res.errors[0]?.code).toBe('E_BAD_OP');
    expect(res.errors[0].message).toContain('banana');
    expect(res.errors[0].guidance).toContain('primary, secondary, ghost, danger');
  });

  it('refuses an input type the runtime cannot honour', () => {
    const res = addNode(withScreen(), {
      type: 'input',
      props: { placeholder: 'Email', inputType: 'email' },
    });
    expect(res.errors[0]?.code).toBe('E_BAD_OP');
    expect(res.errors[0].guidance).toContain('password');
  });

  it('refuses a button with no words at all', () => {
    const res = addNode(withScreen(), { type: 'button', props: { text: '  ' } });
    expect(res.errors[0]?.code).toBe('E_BAD_OP');
    expect(res.errors[0].message).toContain('text');
  });

  it('lets a good button through', () => {
    const res = addNode(withScreen(), {
      type: 'button',
      props: { text: 'Save', variant: 'secondary', icon: 'check', disabled: false },
    });
    expect(res.errors).toEqual([]);
  });

  it('lets the model add a node and fix its props later, in that order', () => {
    const doc = withScreen();
    const added = addNode(doc, { type: 'button', props: { text: 'Save' } });
    expect(added.errors).toEqual([]);
    const btn = added.doc.screens[0].root.children[0];
    // Clearing text is an EDIT, not a creation: the panel must stay usable.
    const cleared = applyOps(
      [{ op: 'setProps', id: btn.id, props: { text: '' } }],
      added.doc,
      user,
    );
    expect(cleared.errors).toEqual([]);
  });

  it('refuses a range whose ends are crossed', () => {
    const res = addNode(withScreen(), {
      type: 'slider',
      props: { min: 100, max: 0, bindKey: 'amount' },
    });
    expect(res.errors[0]?.code).toBe('E_BAD_OP');
    expect(res.errors[0].message).toContain('min');
  });
});
