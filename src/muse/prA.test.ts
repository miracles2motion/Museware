import { describe, expect, it } from 'vitest';
import { createProject } from '../store/useProject';
import { emptyScreen } from '../ops/screenOps';
import { generateFullCss } from '../canvas/cssGen';
import { generateProjectFiles } from '../export/reactCodegen';
import { styleValueIssue } from '../types/styleDict';
import { ALL_TYPES } from '../types/tools';
import { lintScreen } from './qualityLint';
import { BLUEPRINT_PROMPT, fillPrompt } from './prompts';
import type { ComponentNode } from '../types/tree';

const node = (
  id: string,
  type: ComponentNode['type'],
  props: Record<string, unknown> = {},
  styles: ComponentNode['styles'] = {},
  children: ComponentNode[] = [],
): ComponentNode => ({ id, type, props, styles, children });
function fixture(children: ComponentNode[]) {
  const screen = emptyScreen('Home', { id: 'home', entry: true });
  screen.root.children = children;
  return { ...createProject(), kind: 'web' as const, screens: [screen] };
}
describe('PR-A components and responsive laws', () => {
  it('emits no phone spans, clamps 600/1024 spans, keeps glass and exports the CSS', () => {
    const card = node(
      'lead_card',
      'card',
      {},
      { colSpan: 4, rowSpan: 2, backdropBlur: 'md', aspectRatio: '4/3' },
    );
    const doc = fixture([
      node('bento_grid', 'grid', { columns: 3 }, { columns: 3 }, [card]),
    ]);
    const css = generateFullCss(doc);
    const base = css.match(/(?:^|\n)\.n-lead_card\{([^}]*)\}/)?.[1] || '';
    expect(base).not.toMatch(/grid-column|grid-row/);
    expect(base).toContain('backdrop-filter:blur(12px)');
    expect(base).toContain('-webkit-backdrop-filter:blur(12px)');
    expect(base).toContain('aspect-ratio:4/3');
    expect(css).toContain(
      '@container mw (min-width:600px){.n-lead_card{grid-column:span 2}}',
    );
    expect(css).toContain(
      '@container mw (min-width:1024px){.n-lead_card{grid-column:span 3}}',
    );
    expect(css).toContain(
      '@container mw (min-width:1024px){.n-lead_card{grid-row:span 2}}',
    );
    expect(generateProjectFiles(doc)['src/nodes.css']).toContain(
      '@container mw (min-width:1024px){.n-lead_card{grid-column:span 3}}',
    );
    expect(styleValueIssue('colSpan', 5)).not.toBeNull();
    expect(styleValueIssue('rowSpan', 3)).toBeNull();
    expect(styleValueIssue('colSpan', 'full')).toBeNull();
    expect(styleValueIssue('backdropBlur', 'huge')).not.toBeNull();
  });
  it('emits full spans and sticky plus media ratios at the intended breakpoints', () => {
    const doc = fixture([
      node('grid_two', 'grid', { columns: 4 }, { columns: 4 }, [
        node(
          'cell_full',
          'card',
          {},
          { colSpan: 'full', rowSpan: 3, position: 'sticky', aspectRatio: '16/9' },
        ),
      ]),
      node('heading_ratio', 'heading', {}, { aspectRatio: '4/5' }),
    ]);
    const css = generateFullCss(doc);
    const base = css.match(/(?:^|\n)\.n-cell_full\{([^}]*)\}/)?.[1] || '';
    const heading = css.match(/(?:^|\n)\.n-heading_ratio\{([^}]*)\}/)?.[1] || '';
    expect(base).toContain('position:sticky;top:0;z-index:20');
    expect(base).toContain('aspect-ratio:16/9');
    expect(heading).not.toContain('aspect-ratio');
    expect(base).not.toContain('grid-column');
    expect(css).toContain(
      '@container mw (min-width:600px){.n-cell_full{grid-column:span 2}}',
    );
    expect(css).toContain(
      '@container mw (min-width:1024px){.n-cell_full{grid-column:span 4}}',
    );
    expect(css).toContain(
      '@container mw (min-width:1024px){.n-cell_full{grid-row:span 3}}',
    );
  });
  it('blocks malformed accordion lines but accepts real mock data, and warns on excess glow', () => {
    const faq = node('faq_check', 'accordion', {
      items: 'Good? | Yes\nBroken line',
      dataKey: 'faq',
    });
    const doc = fixture([
      faq,
      node('glow_a', 'section', { surface: 'glow' }),
      node('glow_b', 'section', { surface: 'glow' }),
      node('glow_c', 'section', { surface: 'glow' }),
    ]);
    let findings = lintScreen(doc.screens[0]);
    expect(findings.some((f) => f.nodeId === 'faq_check' && f.severity === 'block')).toBe(
      true,
    );
    expect(findings.some((f) => f.nodeId === 'glow_c' && f.severity === 'warn')).toBe(true);
    doc.screens[0].mockData = { faq: [{ question: 'Good?', answer: 'Yes' }] };
    findings = lintScreen(doc.screens[0]);
    expect(findings.some((f) => f.nodeId === 'faq_check' && f.severity === 'block')).toBe(
      false,
    );
  });
  it('validates and lints section, ratio, marquee, accordion and grid composition', () => {
    const grid = node('grid_a', 'grid', { columns: 3 }, { columns: 3 }, [
      node('card_a', 'card', {}, { colSpan: 2 }),
      node('card_b', 'card'),
      node('card_c', 'card'),
    ]);
    const section = node('section_a', 'section', { title: 'Tea', surface: 'accent' }, {}, [
      node('heading_a', 'heading', { text: 'Tea' }),
    ]);
    const doc = fixture([
      grid,
      section,
      node('sec_b', 'section', { surface: 'accent' }),
      ...['a', 'b', 'c'].map((id) => node(`mq_${id}`, 'marquee', { items: 'A,B,C' })),
      node('faq_a', 'accordion', { items: 'Invalid answer' }),
      node('text_a', 'text', {}, { aspectRatio: '1/1' }),
    ]);
    const f = lintScreen(doc.screens[0]);
    for (const phrase of [
      'orphan cell',
      'duplicates',
      'accent section',
      'fewer than four',
      'More than two marquees',
      'Question | Answer',
      'Aspect ratio',
    ])
      expect(
        f.some((x) => x.message.includes(phrase)),
        phrase,
      ).toBe(true);
    expect(ALL_TYPES).toContain('marquee');
    expect(ALL_TYPES).toContain('accordion');
    expect(styleValueIssue('aspectRatio', '5/2')).not.toBeNull();
  });
  it('exports semantic sections, native FAQ, repeated motion-safe marquee, and floating navbar', () => {
    const doc = fixture([
      node('nav_a', 'navbar', { variant: 'floating', brand: 'Tea' }),
      node('section_a', 'section', {
        eyebrow: 'Small',
        title: 'Big',
        subtitle: 'Fine',
        align: 'center',
        surface: 'glow',
        bleed: true,
      }),
      node('mq_a', 'marquee', { items: 'A,B,C,D', variant: 'pills', speed: 20 }),
      node('faq_a', 'accordion', { dataKey: 'faq' }),
    ]);
    doc.screens[0].mockData = { faq: [{ question: 'Why?', answer: 'Because.' }] };
    const files = generateProjectFiles(doc);
    const source =
      Object.entries(files).find(([k]) => k.startsWith('src/screens/'))?.[1] || '';
    expect(source).toContain('data-variant="floating"');
    expect(source).toContain('mw-sec-head');
    expect(source).toContain('data-bleed={true}');
    expect(source.match(/className="mw-marquee-group"/g)).toHaveLength(2);
    expect(source).toContain('<details><summary>Why?</summary>');
    const css = files['src/nodes.css'];
    expect(css).toContain(
      '@container mw (min-width:600px){.mw-nav[data-variant="floating"]',
    );
    expect(css).toContain('prefers-reduced-motion:reduce');
    expect(css).toContain('.mw-accordion details');
    expect(css).toContain('.mw-sec-title');
    expect(css).toContain('border-radius:999px');
  });
  it('flips both prompts to the actual vocabulary and the span example', () => {
    expect(BLUEPRINT_PROMPT).toContain('Use marquee, accordion, and bento spans');
    const fill = fillPrompt({
      screenName: 'Tea',
      section: 'Tea',
      lookLine: '',
      tokenSheet: '',
      indexRules: '',
      existingIndex: '',
    });
    expect(fill).toContain('In a 3-column grid, the lead card spans 2');
    expect(fill).toContain('never invent unsupported types');
  });
});
