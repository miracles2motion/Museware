import { describe, expect, it } from 'vitest';
import { generateCss, UTILITY_CSS } from './cssGen';
import type { ComponentNode, ProjectDoc, StyleSet } from '../types/tree';

/**
 * The CSS engine is where the dictionary becomes pixels. These pin the laws it
 * used to break: one meaning per alignment word, Sketchware sizing words that
 * finally exist on BOTH axes, weight/grow, wrapping, and per-side space.
 */

function node(
  id: string,
  type: ComponentNode['type'],
  styles: StyleSet = {},
  props: Record<string, unknown> = {},
  children: ComponentNode[] = [],
): ComponentNode {
  return { id, type, props, styles, children };
}

function cssOf(...children: ComponentNode[]): string {
  const doc = {
    name: 'test',
    screens: [
      {
        id: 'screen_1',
        name: 'Screen 1',
        entry: true,
        root: node('screen_1_root', 'screen', {}, {}, children),
      },
    ],
    tokens: {},
    opLog: [],
    rail: [],
    customComponents: [],
  } as unknown as ProjectDoc;
  return generateCss(doc);
}

/** The declaration list for one node's own class. */
function ruleFor(css: string, id: string): string {
  const start = css.indexOf(`.n-${id}{`);
  if (start < 0) throw new Error(`no rule for ${id}`);
  return css.slice(start, css.indexOf('}', start));
}

describe('alignment has one meaning per word', () => {
  it('a container’s align is align-items (its children), never align-self', () => {
    const rule = ruleFor(cssOf(node('col_a', 'col', { align: 'center' })), 'col_a');
    expect(rule).toContain('align-items:center');
    expect(rule).not.toContain('align-self');
  });

  it('a child’s selfAlign is align-self', () => {
    const css = cssOf(
      node('col_a', 'col', {}, {}, [node('btn_a', 'button', { selfAlign: 'end' })]),
    );
    expect(ruleFor(css, 'btn_a')).toContain('align-self:flex-end');
  });

  it('start and end map to the flex words, not to raw strings', () => {
    const rule = ruleFor(
      cssOf(node('row_a', 'row', { align: 'end', justify: 'start' })),
      'row_a',
    );
    expect(rule).toContain('align-items:flex-end');
    expect(rule).toContain('justify-content:flex-start');
  });

  it('justify passes space-between through — it is the whole point of it', () => {
    const rule = ruleFor(
      cssOf(node('row_a', 'row', { justify: 'space-between' })),
      'row_a',
    );
    expect(rule).toContain('justify-content:space-between');
  });

  it('grow becomes flex-grow, unitless (Sketchware weight)', () => {
    const css = cssOf(node('row_a', 'row', {}, {}, [node('txt_a', 'text', { grow: 1 })]));
    expect(ruleFor(css, 'txt_a')).toContain('flex-grow:1');
  });

  it('wrap becomes flex-wrap both ways', () => {
    expect(ruleFor(cssOf(node('row_a', 'row', { wrap: true })), 'row_a')).toContain(
      'flex-wrap:wrap',
    );
    expect(ruleFor(cssOf(node('row_b', 'row', { wrap: false })), 'row_b')).toContain(
      'flex-wrap:nowrap',
    );
  });
});

describe('Sketchware sizing words reach the CSS', () => {
  it('match and hug work on width AND height', () => {
    const rule = ruleFor(
      cssOf(node('card_a', 'card', { width: 'match', height: 'hug' })),
      'card_a',
    );
    expect(rule).toContain('width:100%');
    expect(rule).toContain('height:fit-content');
  });

  it('a plain length still passes through', () => {
    expect(ruleFor(cssOf(node('card_a', 'card', { height: '320px' })), 'card_a')).toContain(
      'height:320px',
    );
    expect(ruleFor(cssOf(node('card_b', 'card', { height: 320 })), 'card_b')).toContain(
      'height:320px',
    );
  });

  it('min and max respect the same words', () => {
    const rule = ruleFor(
      cssOf(node('img_a', 'image', { minHeight: 'hug', maxWidth: 'match' })),
      'img_a',
    );
    expect(rule).toContain('min-height:fit-content');
    expect(rule).toContain('max-width:100%');
  });
});

describe('space', () => {
  it('a padding box emits one declaration per side', () => {
    const rule = ruleFor(
      cssOf(node('card_a', 'card', { padding: { top: '8px', right: 16, bottom: '0' } })),
      'card_a',
    );
    expect(rule).toContain('padding-top:8px');
    expect(rule).toContain('padding-right:16px');
    expect(rule).toContain('padding-bottom:0');
    expect(rule).not.toContain('padding-left');
    expect(rule).not.toContain('padding:8px 16px 0');
  });

  it('a single padding value stays one declaration', () => {
    expect(
      ruleFor(cssOf(node('card_a', 'card', { padding: 'var(--pad-card)' })), 'card_a'),
    ).toContain('padding:var(--pad-card)');
  });
});

describe('the migration window', () => {
  it('honours a container’s legacy props.gap/align/wrap', () => {
    const rule = ruleFor(
      cssOf(node('row_a', 'row', {}, { gap: '12px', align: 'center', wrap: false })),
      'row_a',
    );
    expect(rule).toContain('gap:12px');
    expect(rule).toContain('align-items:center');
    expect(rule).toContain('flex-wrap:nowrap');
  });

  it('lets styles win over the legacy props', () => {
    const rule = ruleFor(
      cssOf(node('row_a', 'row', { gap: '4px' }, { gap: '12px', align: 'center' })),
      'row_a',
    );
    expect(rule).toContain('gap:4px');
    expect(rule).not.toContain('gap:12px');
    // align has no style of its own, so the prop still speaks for it.
    expect(rule).toContain('align-items:center');
  });

  it('never reads layout props off a leaf', () => {
    const rule = ruleFor(cssOf(node('txt_a', 'text', {}, { gap: '12px' })), 'txt_a');
    expect(rule).not.toContain('gap:12px');
  });
});

describe('the screen layout prop is real', () => {
  it('flex-col stacks and flex-row lays sections out side by side', () => {
    expect(
      ruleFor(cssOf(node('s1', 'screen', {}, { layout: 'flex-col' })), 's1'),
    ).toContain('flex-direction:column');
    expect(
      ruleFor(cssOf(node('s2', 'screen', {}, { layout: 'flex-row' })), 's2'),
    ).toContain('flex-direction:row');
  });
});

describe('the screen owns its height when it scrolls', () => {
  /*
   * height:'match' compiles to 100%, and a percentage height against an
   * INDEFINITE parent silently falls back to auto — which is exactly why
   * match worked on width and did nothing on height.
   */
  it('a scrolling screen is exactly the frame and scrolls inside it', () => {
    const rule = ruleFor(cssOf(node('s1', 'screen', {}, { scroll: true })), 's1');
    expect(rule).toContain('height:100%');
    expect(rule).toContain('overflow-y:auto');
    expect(rule).not.toContain('min-height:100%');
  });

  it('a non-scrolling screen grows with the page instead', () => {
    const rule = ruleFor(cssOf(node('s2', 'screen', {}, { scroll: false })), 's2');
    expect(rule).toContain('min-height:100%');
    // ';' keeps min-height:100% from counting as a height:100% hit.
    expect(rule).not.toContain(';height:100%');
    expect(rule).not.toContain('overflow-y:auto');
  });

  it('treats an absent flag as scrolling — the documented default', () => {
    const rule = ruleFor(cssOf(node('s3', 'screen')), 's3');
    expect(rule).toContain('height:100%');
    expect(rule).toContain('overflow-y:auto');
  });
});

describe('height match fills the screen a scrolling screen owns', () => {
  it('compiles a match child to a full percentage of that definite height', () => {
    const rule = ruleFor(
      cssOf(node('col_a', 'col', { height: 'match' }, undefined, [])),
      'col_a',
    );
    expect(rule).toContain('height:100%');
  });
});

describe('unknown keys stay useful', () => {
  it('passes raw CSS through untouched', () => {
    const rule = ruleFor(cssOf(node('card_a', 'card', { marginTop: '9px' })), 'card_a');
    expect(rule).toContain('margin-top:9px');
  });
});

describe('responsive defaults and image shape', () => {
  it('reflows grid at compact, medium and expanded without overriding explicit responsive values', () => {
    const css = cssOf(
      node(
        'grid_tea',
        'grid',
        { responsive: { expanded: { columns: 4 } } },
        { columns: 3 },
      ),
    );
    expect(ruleFor(css, 'grid_tea')).toContain('repeat(1, minmax(0, 1fr))');
    expect(css).toContain(
      '@container mw (min-width:600px){.n-grid_tea{grid-template-columns:repeat(2, minmax(0, 1fr))}}',
    );
    expect(css).toContain(
      '@container mw (min-width:1024px){.n-grid_tea{grid-template-columns:repeat(3, minmax(0, 1fr))}}',
    );
    expect(css).toContain('grid-template-columns:repeat(4, minmax(0, 1fr))');
  });
  it('splits image heroes at the medium container breakpoint', () => {
    expect(UTILITY_CSS).toContain('@container mw (min-width:600px)');
    const css = cssOf(
      node('hero_a', 'hero', {}, { image: 'https://example.com/hero.png' }),
    );
    expect(css).toContain(
      '@container mw (min-width:600px){.n-hero_a{display:grid;grid-template-columns:1fr 1fr;align-items:center}}',
    );
  });
  it('uses request aspect and actual measured source width for image sizing', () => {
    const css = cssOf(
      node(
        'img_a',
        'image',
        {},
        { assetAspectWidth: 1200, assetAspectHeight: 640, assetWidth: 900 },
      ),
    );
    expect(ruleFor(css, 'img_a')).toContain('aspect-ratio:1200 / 640');
    expect(ruleFor(css, 'img_a')).toContain('max-width:900px');
  });
});
