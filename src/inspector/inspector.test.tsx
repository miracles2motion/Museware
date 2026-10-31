// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Inspector } from './Inspector';
import { useProject } from '../store/useProject';
import { useUi } from '../store/useUi';
import type { ComponentNode, ProjectDoc, ScreenDoc } from '../types/tree';

/**
 * "Rows and columns are useless and confusing", "widgets barely have
 * properties", "I barely understand styles and events".
 *
 * The panel is where that complaint lives or dies. These pin the three fixes:
 *   · the Style tab is built from the dictionary, so a Row shows the fields
 *     that mean something to a Row and nothing else;
 *   · no two fields are both called "Align" any more (that was the split
 *     brain — align-items in one tab, align-self in another);
 *   · a block with no events says so once, instead of showing three dead
 *     editors.
 */

function node(
  id: string,
  type: ComponentNode['type'],
  children: ComponentNode[] = [],
  props: Record<string, unknown> = {},
  styles: ComponentNode['styles'] = {},
): ComponentNode {
  return { id, type, props, styles, children };
}

function screenDoc(): ScreenDoc {
  return {
    id: 'screen_1',
    name: 'Screen 1',
    entry: true,
    root: node('screen_1_root', 'screen', [
      node(
        'row_a',
        'row',
        [
          node('txt_a', 'text', [], { text: 'Left' }),
          node('btn_a', 'button', [], { text: 'Go' }),
        ],
        {},
        { gap: 'var(--gap-item)', align: 'center' },
      ),
      node('div_a', 'divider'),
      node('card_a', 'card', [node('head_a', 'heading', [], { text: 'Title' })]),
    ]),
  };
}

function docWith(): ProjectDoc {
  return { ...useProject.getState().doc, screens: [screenDoc()], opLog: [], rail: [] };
}

function seed(selectedId: string) {
  useProject.getState().replaceDoc(docWith());
  useUi.setState({
    activeScreenId: 'screen_1',
    selectedId,
    route: 'editor',
    breakpoint: 'compact',
    runMode: false,
    toasts: [],
    propertiesOpen: true,
    inspectorCollapsed: false,
    inspectorWide: false,
  });
}

function labels(): string[] {
  const out: string[] = [];
  for (const el of document.querySelectorAll('.field-label'))
    out.push(el.textContent || '');
  for (const el of document.querySelectorAll('.checkbox-row span'))
    out.push(el.textContent || '');
  return out.map((t) => t.replace(/\s+/g, ' ').trim());
}

function openTab(name: 'Props' | 'Style' | 'Events') {
  const tab = screen.getAllByText(name)[0];
  fireEvent.click(tab);
}

beforeEach(() => {
  if (!globalThis.ResizeObserver) {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

afterEach(() => {
  cleanup();
});

describe('a Row gets the fields a Row needs', () => {
  beforeEach(() => {
    seed('row_a');
    render(<Inspector />);
    openTab('Style');
  });

  it('explains that container spacing and contents live in Style', () => {
    openTab('Props');
    expect(screen.getByText(/Row \(horizontal\) has no content of its own/i)).toBeTruthy();
  });

  it('offers scoped redesign and restyle controls for a container', () => {
    expect(screen.getByRole('button', { name: /Redesign this section/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Restyle this widget/i })).toBeTruthy();
    expect(screen.getByLabelText('Scoped design instruction')).toBeTruthy();
  });

  it('offers Align children and Distribute children, named for what they do', () => {
    const all = labels();
    expect(all).toContain('Align children');
    expect(all).toContain('Distribute children');
    expect(all).toContain('Space between children');
    expect(all).toContain('Wrap to new lines');
  });

  it('never shows the bare word Align, let alone twice', () => {
    const all = labels();
    expect(all).not.toContain('Align');
    expect(all.filter((l) => l === 'Align children')).toHaveLength(1);
  });

  it('shows its current gap and alignment from styles', () => {
    const selects = Array.from(document.querySelectorAll('select')) as HTMLSelectElement[];
    const values = selects.map((s) => s.value);
    expect(values).toContain('center');
    const gapInput = document.querySelector('.input[value="var(--gap-item)"]');
    expect(gapInput).toBeTruthy();
  });

  it('writes alignment as a real setStyles op', () => {
    const selects = Array.from(document.querySelectorAll('select')) as HTMLSelectElement[];
    const align = selects[0];
    fireEvent.change(align, { target: { value: 'end' } });
    const row = useProject.getState().doc.screens[0].root.children[0];
    expect(row.styles.align).toBe('end');
  });

  it('offers Match / Hug / Fixed on width, and writes the word', () => {
    const group = document.querySelector('[aria-label="Width mode"]');
    expect(group).toBeTruthy();
    const fixed = group!.querySelector('[aria-label="Fixed — an exact length"]');
    fireEvent.click(fixed as Element);
    const row = useProject.getState().doc.screens[0].root.children[0];
    expect(row.styles.width).toBe('320px');
    const hug = group!.querySelector('[aria-label="Hug — fit the content"]');
    fireEvent.click(hug as Element);
    expect(useProject.getState().doc.screens[0].root.children[0].styles.width).toBe('hug');
  });

  it('shows unset height as Hug and only shows Match after it is applied', () => {
    const group = document.querySelector('[aria-label="Height mode"]')!;
    const hug = group.querySelector('[aria-label="Hug — fit the content"]')!;
    const match = group.querySelector('[aria-label="Match — fill the parent"]')!;
    expect(hug.getAttribute('aria-pressed')).toBe('true');
    expect(match.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(match);
    expect(useProject.getState().doc.screens[0].root.children[0].styles.height).toBe(
      'match',
    );
    expect(match.getAttribute('aria-pressed')).toBe('true');
  });

  it('toggling “Fill leftover space” writes grow as a number', () => {
    const toggle = screen.getByLabelText('Fill leftover space') as HTMLInputElement;
    fireEvent.click(toggle);
    const row = useProject.getState().doc.screens[0].root.children[0];
    expect(row.styles.grow).toBe(1);
    fireEvent.click(toggle);
    expect(useProject.getState().doc.screens[0].root.children[0].styles.grow).toBe(0);
  });

  it('unchecking Wrap writes nowrap rather than clearing the key', () => {
    const wrap = screen.getByLabelText('Wrap to new lines') as HTMLInputElement;
    expect(wrap.checked).toBe(false);
    fireEvent.click(wrap);
    const row = useProject.getState().doc.screens[0].root.children[0];
    expect(row.styles.wrap).toBe(true);
    fireEvent.click(wrap);
    expect(useProject.getState().doc.screens[0].root.children[0].styles.wrap).toBe(false);
  });

  it('shows no type section for a Row — it holds no text', () => {
    expect(labels()).not.toContain('Text size');
  });
});

describe('a Heading gets type fields, not container fields', () => {
  beforeEach(() => {
    seed('head_a');
    render(<Inspector />);
    openTab('Style');
  });

  it('offers widget restyle without a section redesign action', () => {
    expect(screen.getByRole('button', { name: /Restyle this widget/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Redesign this section/i })).toBeNull();
  });

  it('offers text styling', () => {
    const all = labels();
    expect(all).toContain('Text size');
    expect(all).toContain('Weight');
    expect(all).toContain('Text align');
  });

  it('does not offer align-children on something that has no children', () => {
    expect(labels()).not.toContain('Align children');
  });

  it('offers Align in parent and Fill leftover space — it is a child', () => {
    const all = labels();
    expect(all).toContain('Align in parent');
    expect(all).toContain('Fill leftover space');
  });
});

describe('the screen can turn its own scrolling off', () => {
  /*
   * The property sheet defaults `scroll` to true and the CSS engine treats an
   * ABSENT flag as scrolling, so a project saved before the toggle existed must
   * show it ON — otherwise the panel says "Scrolls off" about a screen that
   * scrolls, which is the same class of lie as a dead control.
   */
  it('shows Scrolls on for a screen whose document has no flag at all', () => {
    seed('screen_1_root');
    render(<Inspector />);
    openTab('Props');
    const toggle = screen.getByLabelText('Scrolls') as HTMLInputElement;
    expect(toggle.checked).toBe(true);
  });

  it('turning it off writes a real setProps op', () => {
    seed('screen_1_root');
    render(<Inspector />);
    openTab('Props');
    fireEvent.click(screen.getByLabelText('Scrolls'));
    expect(useProject.getState().doc.screens[0].root.props.scroll).toBe(false);
  });
});

describe('the events tab tells the truth', () => {
  it('a Divider says it has no events, once', () => {
    seed('div_a');
    render(<Inspector />);
    openTab('Events');
    expect(screen.getByText(/This block has no events/)).toBeTruthy();
    expect(screen.queryByText('When tapped')).toBeNull();
    expect(screen.queryByText('When changed')).toBeNull();
    expect(screen.queryByText('When submitted')).toBeNull();
  });

  it('a Button offers tap and nothing else', () => {
    seed('btn_a');
    render(<Inspector />);
    openTab('Events');
    expect(screen.getByText('When tapped')).toBeTruthy();
    expect(screen.queryByText('When changed')).toBeNull();
    expect(screen.queryByText('When submitted')).toBeNull();
  });

  it('a Row is a layout, not a tap target — and says so', () => {
    seed('row_a');
    render(<Inspector />);
    openTab('Events');
    expect(screen.queryByText('When tapped')).toBeNull();
    expect(screen.getByText(/This block has no events/)).toBeTruthy();
  });

  it('a Card is tappable: it is a surface you can put a whole action on', () => {
    seed('card_a');
    render(<Inspector />);
    openTab('Events');
    expect(screen.getByText('When tapped')).toBeTruthy();
  });
});

describe('judge-friendly inspector sections', () => {
  it('opens layout, space and size and collapses the rest by default', () => {
    seed('row_a');
    render(<Inspector />);
    openTab('Style');
    const groups = Array.from(
      document.querySelectorAll('details.insp-section'),
    ) as HTMLDetailsElement[];
    expect(groups.find((e) => e.textContent?.startsWith('Layout'))?.open).toBe(true);
    expect(groups.find((e) => e.textContent?.startsWith('Size'))?.open).toBe(true);
    expect(groups.find((e) => e.textContent?.startsWith('Effects'))?.open).toBe(false);
  });
});
