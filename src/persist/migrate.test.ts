import { describe, expect, it } from 'vitest';
import { migrateLayoutV2 } from './migrate';
import { parseProjectDoc } from './schema';
import { generateCss } from '../canvas/cssGen';
import type { ComponentNode, Justify, ProjectDoc, ScreenDoc } from '../types/tree';
import { MUSEWARE_DEFAULT_THEME, cloneTheme } from '../design/starter';

/**
 * The two alignments used to live in two places, and a saved project holds the
 * old ones. Migration is the bridge: it must move every value to its one true
 * home, keep the picture pixel-identical, and be safe to run on every load.
 */

function node(
  id: string,
  type: ComponentNode['type'],
  props: Record<string, unknown> = {},
  styles: ComponentNode['styles'] = {},
  children: ComponentNode[] = [],
): ComponentNode {
  return { id, type, props, styles, children };
}

function v1Doc(root: ComponentNode): ProjectDoc {
  const screen: ScreenDoc = { id: 'screen_1', name: 'Screen 1', entry: true, root };
  return {
    format: 'museware/1',
    name: 'Legacy',
    screens: [screen],
    tokens: cloneTheme(MUSEWARE_DEFAULT_THEME),
    opLog: [],
    rail: [],
    kind: 'web',
    customComponents: [],
    updatedAt: 0,
  };
}

function legacyDoc(): ProjectDoc {
  return v1Doc(
    node('screen_1_root', 'screen', {}, { gap: 'var(--gap-section)' }, [
      node('row_a', 'row', { gap: '12px', align: 'center', wrap: false }, {}, [
        node('card_a', 'card', { pad: 'var(--pad-card)' }, {}, [
          node('head_a', 'heading', {}, { align: 'end' }, []),
        ]),
      ]),
      // A v1 document could hold justify:'stretch' — the type did not stop it.
      node('col_b', 'col', { align: 'start', gap: '8px' }, {
        justify: 'stretch' as unknown as Justify,
      }),
    ]),
  );
}

function ruleFor(css: string, id: string): string {
  const start = css.indexOf(`.n-${id}{`);
  return start < 0 ? '' : css.slice(start, css.indexOf('}', start));
}

describe('layout v2 moves every value to its one true home', () => {
  it('takes gap, align and wrap out of a row’s props', () => {
    const doc = migrateLayoutV2(legacyDoc());
    const row = doc.screens[0].root.children[0];
    expect(row.props.gap).toBeUndefined();
    expect(row.props.align).toBeUndefined();
    expect(row.props.wrap).toBeUndefined();
    expect(row.styles.gap).toBe('12px');
    expect(row.styles.align).toBe('center');
    expect(row.styles.wrap).toBe(false);
  });

  it('keeps a screen’s own gap where it was', () => {
    const doc = migrateLayoutV2(legacyDoc());
    expect(doc.screens[0].root.styles.gap).toBe('var(--gap-section)');
  });

  it('moves a card’s pad prop into padding', () => {
    const doc = migrateLayoutV2(legacyDoc());
    const card = doc.screens[0].root.children[0].children[0];
    expect(card.props.pad).toBeUndefined();
    expect(card.styles.padding).toBe('var(--pad-card)');
  });

  it('turns a leaf’s old align into selfAlign — that is what it compiled to', () => {
    const doc = migrateLayoutV2(legacyDoc());
    const heading = doc.screens[0].root.children[0].children[0].children[0];
    expect(heading.styles.align).toBeUndefined();
    expect(heading.styles.selfAlign).toBe('end');
  });

  it('drops justify:stretch, which never rendered as anything', () => {
    const doc = migrateLayoutV2(legacyDoc());
    expect(doc.screens[0].root.children[1].styles.justify).toBeUndefined();
  });

  it('stamps the version so it never runs twice', () => {
    const once = migrateLayoutV2(legacyDoc());
    expect(once.layoutVersion).toBe(2);
    const twice = migrateLayoutV2(once);
    // identity: the marker short-circuits before any copying
    expect(twice).toBe(once);
  });

  it('never demotes a migrated container’s align to align-self', () => {
    const once = migrateLayoutV2(legacyDoc());
    const row = once.screens[0].root.children[0];
    expect(row.styles.align).toBe('center');
    expect(row.styles.selfAlign).toBeUndefined();
  });

  it('covers the whole document, not the first screen only', () => {
    const doc = migrateLayoutV2(legacyDoc());
    const col = doc.screens[0].root.children[1];
    expect(col.props.align).toBeUndefined();
    expect(col.styles.align).toBe('start');
  });

  it('lets a style value win over the legacy prop, always', () => {
    const doc = migrateLayoutV2(
      v1Doc(node('screen_1_root', 'screen', {}, {}, [
        node('row_a', 'row', { gap: '12px' }, { gap: '4px' }),
      ])),
    );
    expect(doc.screens[0].root.children[0].styles.gap).toBe('4px');
  });
});

describe('the picture survives the move', () => {
  it('draws the same row before and after', () => {
    const before = generateCss(legacyDoc());
    const after = generateCss(migrateLayoutV2(legacyDoc()));
    expect(ruleFor(after, 'row_a')).toBe(ruleFor(before, 'row_a'));
    // col_b's justify:stretch was inert — dropping it changes nothing on screen.
    expect(ruleFor(before, 'col_b')).toContain('justify-content:stretch');
    expect(ruleFor(after, 'col_b')).not.toContain('justify-content');
    /*
     * A leaf's old styles.align used to compile to align-self. After the
     * rename, `align` means align-items — so migration is exactly what keeps
     * the leaf aligned the way it always drew.
     */
    expect(ruleFor(before, 'head_a')).not.toContain('align-self');
    expect(ruleFor(after, 'head_a')).toContain('align-self:flex-end');
  });

  it('keeps a card’s old pad as real padding (it used to be an inline style)', () => {
    const doc = migrateLayoutV2(legacyDoc());
    const card = doc.screens[0].root.children[0].children[0];
    expect(card.styles.padding).toBe('var(--pad-card)');
    expect(ruleFor(generateCss(doc), 'card_a')).toContain('padding:var(--pad-card)');
  });
});

describe('opening a saved project rewrites it once', () => {
  it('parseProjectDoc migrates and stamps the version', () => {
    const parsed = parseProjectDoc(JSON.parse(JSON.stringify(legacyDoc())));
    expect(parsed.layoutVersion).toBe(2);
    const row = parsed.screens[0].root.children[0];
    expect(row.props.gap).toBeUndefined();
    expect(row.styles.gap).toBe('12px');
  });

  it('accepts a v1 document whose justify is a value the dictionary now rejects', () => {
    const raw = JSON.parse(JSON.stringify(legacyDoc()));
    raw.screens[0].root.children[1].styles.justify = 'stretch';
    expect(() => parseProjectDoc(raw)).not.toThrow();
  });

  it('leaves an already-migrated document untouched', () => {
    const current = parseProjectDoc(JSON.parse(JSON.stringify(legacyDoc())));
    const again = parseProjectDoc(JSON.parse(JSON.stringify(current)));
    expect(again.screens[0].root.children[0].styles).toEqual(
      current.screens[0].root.children[0].styles,
    );
  });
});
