import { describe, expect, it } from 'vitest';
import { createProject } from '../store/useProject';
import type { ComponentNode, ProjectDoc } from '../types/tree';
import { canvasOutline, resolveStyles } from './canvasOutline';

/**
 * The verify gate must judge what the visitor will actually see. Compact and
 * expanded are two different cascades, not the same tree printed twice.
 */

function node(partial: Partial<ComponentNode> & Pick<ComponentNode, 'id'>): ComponentNode {
  return {
    type: 'col',
    props: {},
    styles: {},
    children: [],
    ...partial,
  } as ComponentNode;
}

function docWith(child: ComponentNode): ProjectDoc {
  const doc = createProject('test');
  return {
    ...doc,
    screens: [
      {
        id: 'home',
        name: 'Home',
        entry: true,
        root: node({
          id: 'root',
          type: 'screen',
          styles: { padding: '16', gap: '12' },
          children: [child],
        }),
      },
    ],
  };
}

describe('canvas outline applies the real breakpoint cascade', () => {
  const card = node({
    id: 'pricing',
    type: 'card',
    styles: {
      padding: '16',
      gap: '8',
      responsive: {
        medium: { gap: '20' },
        expanded: { padding: '40' },
      },
    },
  });

  it('compact shows base values only, and no override marker', () => {
    const out = canvasOutline(docWith(card), ['home']);
    const compact = out.split('EXPANDED')[0];
    expect(compact).toContain('pricing');
    expect(compact).toContain('padding=16');
    expect(compact).toContain('gap=8');
    expect(compact).not.toContain('padding=40');
  });

  it('expanded shows the merged cascade (medium then expanded) and names the keys', () => {
    const out = canvasOutline(docWith(card), ['home']);
    const expanded = out.split('EXPANDED (1024) — same tree, overrides applied:')[1];
    expect(expanded).toBeTruthy();
    expect(expanded).toContain('padding=40');
    expect(expanded).toContain('gap=20');
    expect(expanded).toContain('<expanded: gap,padding>');
  });

  it('resolveStyles never mutates the node it reads', () => {
    const resolved = resolveStyles(card, 'expanded');
    expect(resolved.padding).toBe('40');
    expect(card.styles.padding).toBe('16');
    expect(resolveStyles(card, 'compact').padding).toBe('16');
  });

  it('says nothing about responsive when there is nothing to say', () => {
    const out = canvasOutline(docWith(node({ id: 'plain', type: 'heading' })), ['home']);
    expect(out).toContain('COMPACT (390):');
    expect(out).not.toContain('EXPANDED (1024)');
  });
});
