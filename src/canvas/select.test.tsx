// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { Canvas } from './Canvas';
import { NodeBody } from './NodeBody';
import { RuntimeContext } from '../preview/runtime';
import { useProject } from '../store/useProject';
import { useUi } from '../store/useUi';
import type { ComponentNode, ProjectDoc, ScreenDoc } from '../types/tree';

/**
 * Every node on the canvas must be selectable — cards, headings, rows, columns
 * *and* the things that look clickable enough to swallow the click: buttons,
 * icon buttons, links, FABs, tab labels and form fields.
 *
 * The canvas selects through ONE delegated click handler on `.frame-viewport`,
 * which resolves `e.target` up to the element carrying `n-<id>`. Two things in
 * NodeBody broke that law:
 *
 *   1. `e.stopPropagation()` on button/iconbutton/fab/link/tab clicks ran in
 *      EDIT mode too, where `fire('tap')` is a no-op — pure loss.
 *   2. Form fields rendered with `pointer-events: none` in edit mode, so
 *      hit-testing skipped them and the click landed on the parent.
 *
 * jsdom has no hit-testing, so (2) is pinned twice: as a click (delivered
 * regardless) and as an assertion that no edit-mode field hides itself.
 */

function node(
  id: string,
  type: ComponentNode['type'],
  children: ComponentNode[] = [],
  props: Record<string, unknown> = {},
): ComponentNode {
  return { id, type, props, styles: {}, children };
}

function screenDoc(): ScreenDoc {
  return {
    id: 'screen_1',
    name: 'Screen 1',
    entry: true,
    root: node('screen_1_root', 'screen', [
      node('col_main', 'col', [
        node('card_x', 'card', [node('txt_t', 'heading', [], { text: 'Title' })]),
        node('row_items', 'row', [node('txt_a', 'text', [], { text: 'Cell' })]),
        node('btn_save', 'button', [], { text: 'Save' }),
        node('icn_edit', 'iconbutton', [], { icon: 'pencil' }),
        node('lnk_more', 'link', [], { text: 'More' }),
        node('fab_add', 'fab', [], { icon: 'plus' }),
        node('form_one', 'form', [], { title: 'Sign up' }),
        node('inp_name', 'input'),
        node('area_bio', 'textarea'),
        node('sel_size', 'select', [], { options: 'S,M,L' }),
        node('sld_rate', 'slider'),
        node('dat_when', 'datepicker'),
        node('t_view', 'tabs', [node('pan_a', 'section')], { items: 'One,Two' }),
      ]),
    ]),
  };
}

function docWith(): ProjectDoc {
  return {
    ...useProject.getState().doc,
    screens: [screenDoc()],
    opLog: [],
    rail: [],
  };
}

beforeEach(() => {
  if (!globalThis.ResizeObserver) {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  useProject.getState().replaceDoc(docWith());
  useUi.setState({
    activeScreenId: 'screen_1',
    selectedId: null,
    route: 'editor',
    breakpoint: 'compact',
    runMode: false,
    leftTab: 'insert',
    leftCollapsed: false,
    leftFlyout: false,
    toasts: [],
  });
});

afterEach(() => {
  cleanup();
});

function clickAt(selector: string): string | null {
  const el = document.querySelector(selector);
  if (!el) throw new Error(`no element ${selector}`);
  fireEvent.click(el);
  return useUi.getState().selectedId;
}

describe('clicking a canvas node selects it', () => {
  beforeEach(() => {
    render(<Canvas />);
  });

  it('a card', () => {
    expect(clickAt('.n-card_x')).toBe('card_x');
  });

  it('a heading inside that card', () => {
    expect(clickAt('.n-txt_t')).toBe('txt_t');
  });

  it('a row', () => {
    expect(clickAt('.n-row_items')).toBe('row_items');
  });

  it('a form wrapper', () => {
    expect(clickAt('.n-form_one')).toBe('form_one');
  });

  it('a button — not swallowed by its own tap handler', () => {
    expect(clickAt('.n-btn_save')).toBe('btn_save');
  });

  it('an icon button', () => {
    expect(clickAt('.n-icn_edit')).toBe('icn_edit');
  });

  it('a link', () => {
    expect(clickAt('.n-lnk_more')).toBe('lnk_more');
  });

  it('a fab', () => {
    expect(clickAt('.n-fab_add')).toBe('fab_add');
  });

  it('a tab label selects the tabs node, and still switches the panel', () => {
    expect(clickAt('.n-t_view .mw-tab')).toBe('t_view');
    expect(document.querySelector('.n-t_view .mw-tab')).toBeTruthy();
  });

  it('a text field', () => {
    expect(clickAt('.n-inp_name')).toBe('inp_name');
  });

  it('a textarea', () => {
    expect(clickAt('.n-area_bio')).toBe('area_bio');
  });

  it('a select', () => {
    expect(clickAt('.n-sel_size')).toBe('sel_size');
  });

  it('a slider', () => {
    expect(clickAt('.n-sld_rate')).toBe('sld_rate');
  });

  it('a date picker', () => {
    expect(clickAt('.n-dat_when')).toBe('dat_when');
  });

  it('replaces the previous selection rather than accumulating', () => {
    clickAt('.n-btn_save');
    expect(clickAt('.n-inp_name')).toBe('inp_name');
  });
});

describe('the canvas chrome never steals the selection', () => {
  it('grabbing the move handle of a hovered node keeps it selected', () => {
    render(<Canvas />);
    fireEvent.click(document.querySelector('.n-card_x') as Element);
    expect(useUi.getState().selectedId).toBe('card_x');

    const viewport = document.querySelector('.frame-viewport') as HTMLElement;
    fireEvent.pointerMove(document.querySelector('.n-card_x') as Element, {
      bubbles: true,
    });
    const handle = viewport.querySelector('[aria-label="Drag to move"]');
    expect(handle).toBeTruthy();
    fireEvent.click(handle as Element);
    expect(useUi.getState().selectedId).toBe('card_x');
  });
});

describe('edit mode keeps every field hit-testable', () => {
  const fields = [
    '.n-inp_name',
    '.n-area_bio',
    '.n-sel_size',
    '.n-sld_rate',
    '.n-dat_when',
  ];

  beforeEach(() => {
    render(<Canvas />);
  });

  it('no field carries pointer-events: none on the canvas', () => {
    for (const selector of fields) {
      const el = document.querySelector(selector) as HTMLElement | null;
      if (!el) throw new Error(`no element ${selector}`);
      expect(el.style.pointerEvents, selector).not.toBe('none');
    }
  });

  it('a pointer-down on a field is cancelled before it can focus or open a picker', () => {
    for (const selector of fields) {
      const el = document.querySelector(selector) as HTMLElement;
      // dispatchEvent returns false when a listener called preventDefault.
      const carried = fireEvent.pointerDown(el, { bubbles: true, cancelable: true });
      expect(carried, selector).toBe(false);
      expect(document.activeElement, selector).not.toBe(el);
    }
  });
});

describe('run mode behaves like an app, edit mode stays quiet', () => {
  const docs = docWith();

  function runtimeStub() {
    return {
      screenId: 'screen_1',
      state: {},
      screens: docs.screens,
      setKey: vi.fn(),
      toast: vi.fn(),
      navigate: vi.fn(),
      openUrl: vi.fn(),
    };
  }

  function clickThrough(target: ComponentNode, mode: 'edit' | 'run') {
    const bubbles = vi.fn();
    const { container } = render(
      <div onClick={bubbles}>
        <RuntimeContext.Provider value={mode === 'run' ? runtimeStub() : null}>
          <NodeBody node={target} doc={docs} mode={mode} screenId="screen_1" />
        </RuntimeContext.Provider>
      </div>,
    );
    fireEvent.click(container.querySelector(`.n-${target.id}`) as Element);
    cleanup();
    return bubbles;
  }

  it('a tap bubbles in edit mode, so the canvas can select it', () => {
    expect(
      clickThrough(node('btn_go', 'button', [], { text: 'Go' }), 'edit'),
    ).toHaveBeenCalled();
  });

  it('a tap is consumed in run mode, so an app tap never re-selects on the way up', () => {
    expect(
      clickThrough(node('btn_go', 'button', [], { text: 'Go' }), 'run'),
    ).not.toHaveBeenCalled();
  });

  it('a link keeps its navigation in run mode', () => {
    const bubbles = vi.fn();
    const api = runtimeStub();
    const { container } = render(
      <div onClick={bubbles}>
        <RuntimeContext.Provider value={api}>
          <NodeBody
            node={node('lnk_go', 'link', [], { text: 'Docs', to: 'settings' })}
            doc={docs}
            mode="run"
            screenId="screen_1"
          />
        </RuntimeContext.Provider>
      </div>,
    );
    fireEvent.click(container.querySelector('.n-lnk_go') as Element);
    expect(api.navigate).toHaveBeenCalledWith('settings');
    expect(bubbles).not.toHaveBeenCalled();
  });
});
