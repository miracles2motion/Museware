// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { TextField } from './Fields';
import { Editor } from '../shell/Editor';
import { createProject, useProject } from '../store/useProject';
import { useUi } from '../store/useUi';
import { emptyScreen } from '../ops/screenOps';
import type { ComponentNode } from '../types/tree';

function setup(type: 'accordion' | 'list' | 'marquee' | 'image') {
  const page = emptyScreen('Tea', { id: 'tea', entry: true });
  const props =
    type === 'accordion'
      ? { items: 'Why tea? | It tastes good.' }
      : type === 'list'
        ? { dataKey: 'tea_picks' }
        : type === 'marquee'
          ? { items: 'One, Two' }
          : { alt: 'Tea' };
  page.root.children = [
    { id: 'widget', type, props, styles: {}, children: [] } as ComponentNode,
  ];
  page.mockData = { tea_picks: [{ title: 'Tea', detail: 'Roasted', meta: 'Hot' }] };
  useProject.getState().hydrate({ ...createProject(), screens: [page] });
  useUi.setState({
    activeScreenId: 'tea',
    selectedId: 'widget',
    propertiesOpen: true,
    inspectorCollapsed: false,
    inspectorWide: false,
    inspectorDrawerOpen: false,
    route: 'editor',
  });
}
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  localStorage.removeItem('museware/inspectorWide');
  setup('accordion');
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('full-size content editor', () => {
  it('only offers expansion on multiline fields, saves, and restores focus', async () => {
    const onCommit = vi.fn();
    render(
      <>
        <TextField label="Short" value="One" onCommit={onCommit} />
        <TextField label="Long" value="Original" multiline onCommit={onCommit} />
      </>,
    );
    expect(screen.queryByRole('button', { name: 'Expand Short' })).toBeNull();
    const original = screen.getByLabelText('Long');
    fireEvent.click(screen.getByRole('button', { name: 'Expand Long' }));
    const dialog = screen.getByRole('dialog', { name: 'Long' });
    const editor = within(dialog).getByRole('textbox', { name: 'Long content' });
    expect((editor as HTMLTextAreaElement).value).toBe('Original');
    fireEvent.change(editor, { target: { value: 'New\ncontent' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(onCommit).toHaveBeenCalledWith('New\ncontent');
    expect((original as HTMLTextAreaElement).value).toBe('New\ncontent');
    await waitFor(() => expect(document.activeElement).toBe(original));
  });
  it('Escape and backdrop cancel overlay changes and return focus', async () => {
    const onCommit = vi.fn();
    render(<TextField label="Long" value="Original" multiline onCommit={onCommit} />);
    const original = screen.getByLabelText('Long');
    fireEvent.click(screen.getByRole('button', { name: 'Expand Long' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Long content' }), {
      target: { value: 'Discard' },
    });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onCommit).not.toHaveBeenCalled();
    expect((original as HTMLTextAreaElement).value).toBe('Original');
    await waitFor(() => expect(document.activeElement).toBe(original));
    fireEvent.click(screen.getByRole('button', { name: 'Expand Long' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Long content' }), {
      target: { value: 'Discard again' },
    });
    fireEvent.mouseDown(screen.getByRole('dialog').closest('.modal-shell')!);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onCommit).not.toHaveBeenCalled();
  });
  it('counts accordion pairs live and saves through existing props ops', () => {
    render(<Editor />);
    fireEvent.click(screen.getByRole('button', { name: 'Expand Questions and answers' }));
    const dialog = screen.getByRole('dialog', { name: 'Questions and answers' });
    expect(within(dialog).getByText('1 Question | Answer pair')).toBeTruthy();
    fireEvent.change(
      within(dialog).getByRole('textbox', { name: 'Questions and answers content' }),
      { target: { value: 'Why? | Because\nWhen? | Today\nnot a pair' } },
    );
    expect(within(dialog).getByText('2 Question | Answer pairs')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(useProject.getState().doc.screens[0].root.children[0].props.items).toBe(
      'Why? | Because\nWhen? | Today\nnot a pair',
    );
  });
  it('counts dataset rows, validates on Save, and preserves the existing key order', () => {
    setup('list');
    render(<Editor />);
    fireEvent.click(screen.getByRole('button', { name: 'Expand DATA ROWS' }));
    const dialog = screen.getByRole('dialog', { name: 'DATA ROWS' });
    expect(within(dialog).getByText('1 rows · 3 fields per row')).toBeTruthy();
    const editor = within(dialog).getByRole('textbox', { name: 'DATA ROWS content' });
    fireEvent.change(editor, {
      target: { value: 'Hojicha | Roasted | Hot\nMatcha | Green | Fresh' },
    });
    expect(within(dialog).getByText('2 rows · 3 fields per row')).toBeTruthy();
    fireEvent.change(editor, { target: { value: 'Hojicha | Roasted | Hot | Extra' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(within(dialog).getByRole('alert').textContent).toContain('at most 3 fields');
    expect(useProject.getState().doc.screens[0].mockData?.tea_picks).toEqual([
      { title: 'Tea', detail: 'Roasted', meta: 'Hot' },
    ]);
    fireEvent.change(editor, {
      target: { value: 'Hojicha | Roasted | Hot\nMatcha | Green | Fresh' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(useProject.getState().doc.screens[0].mockData?.tea_picks).toEqual([
      { title: 'Hojicha', detail: 'Roasted', meta: 'Hot' },
      { title: 'Matcha', detail: 'Green', meta: 'Fresh' },
    ]);
  });
  it('Escape from a dialog button cancels without deselecting the widget', async () => {
    render(<Editor />);
    const source = screen.getByRole('textbox', { name: /Questions and answers/ });
    fireEvent.click(screen.getByRole('button', { name: 'Expand Questions and answers' }));
    const dialog = screen.getByRole('dialog', { name: 'Questions and answers' });
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' });
    cancel.focus();
    fireEvent.keyDown(cancel, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Questions and answers' })).toBeNull();
    expect(useUi.getState().selectedId).toBe('widget');
    await waitFor(() => expect(document.activeElement).toBe(source));
  });
  it('does not overwrite a shared dataset changed while its overlay is open', () => {
    setup('list');
    render(<Editor />);
    fireEvent.click(screen.getByRole('button', { name: 'Expand DATA ROWS' }));
    const dialog = screen.getByRole('dialog', { name: 'DATA ROWS' });
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'DATA ROWS content' }), {
      target: { value: 'My draft | Roast | Hot' },
    });
    act(() => {
      useProject.getState().applyBatch(
        [
          {
            op: 'setMockData',
            screenId: 'tea',
            key: 'tea_picks',
            rows: [{ title: 'Elsewhere', detail: 'Changed', meta: 'Now' }],
          },
        ],
        { source: 'agent' },
      );
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(within(dialog).getByRole('alert').textContent).toContain(
      'Rows changed elsewhere',
    );
    expect(useProject.getState().doc.screens[0].mockData?.tea_picks?.[0].title).toBe(
      'Elsewhere',
    );
  });
  it.each([
    ['marquee', 'Items'],
    ['image', 'Alt text'],
  ] as const)('allows expanding %s content', (type, label) => {
    setup(type);
    render(<Editor />);
    if (type === 'image') fireEvent.click(screen.getByText('Advanced'));
    expect(screen.getByRole('button', { name: `Expand ${label}` })).toBeTruthy();
  });
});

describe('wide inspector', () => {
  it('persists a chosen width and temporarily widens for the field editor', () => {
    setup('list');
    const view = render(<Editor />);
    const workspace = view.container.querySelector('.workspace')!;
    expect(workspace.getAttribute('data-inspector')).toBe('open');
    fireEvent.click(screen.getByRole('button', { name: 'Field editor' }));
    expect(workspace.getAttribute('data-inspector')).toBe('wide');
    expect(useUi.getState().inspectorWide).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Close field editor' }));
    expect(workspace.getAttribute('data-inspector')).toBe('open');
    fireEvent.click(screen.getByRole('button', { name: 'Wide panel' }));
    expect(localStorage.getItem('museware/inspectorWide')).toBe('true');
    expect(workspace.getAttribute('data-inspector')).toBe('wide');
    fireEvent.click(screen.getByRole('button', { name: 'Field editor' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close field editor' }));
    expect(workspace.getAttribute('data-inspector')).toBe('wide');
    fireEvent.click(screen.getByRole('button', { name: 'Wide panel' }));
    expect(localStorage.getItem('museware/inspectorWide')).toBe('false');
  }, 15000);
  it('keeps the canvas flexible beside the token-sized inspector', () => {
    const css = readFileSync('src/design/app.css', 'utf8');
    const tokens = readFileSync('src/design/mw.css', 'utf8');
    expect(tokens).toMatch(/--mw-inspector-w-wide:\s*400px/);
    expect(css).toMatch(/\.workspace\s*\{[^}]*display:\s*flex/);
    expect(css).toMatch(/\.canvas-area\s*\{[^}]*flex:\s*1/);
    expect(css).toMatch(/--mw-inspector-now:\s*min\(var\(--mw-inspector-w-wide\)/);
  });
  it('restores the explicit stored choice on a fresh store module', async () => {
    localStorage.setItem('museware/inspectorWide', 'true');
    vi.resetModules();
    const fresh = await import('../store/useUi');
    expect(fresh.useUi.getState().inspectorWide).toBe(true);
  });
});
