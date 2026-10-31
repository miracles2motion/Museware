// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Inspector } from './Inspector';
import { Palette } from '../palette/Palette';
import { RunMode } from '../preview/RunMode';
import { createProject, useProject } from '../store/useProject';
import { useUi } from '../store/useUi';
import { emptyScreen } from '../ops/screenOps';
import { createSavedProject, saveProjectNow, readSavedProject } from '../persist/save';
import { generateCss } from '../canvas/cssGen';
import { materializeCss } from '../design/materialize';
import type { ComponentNode } from '../types/tree';

function node(
  id: string,
  type: ComponentNode['type'],
  props: Record<string, unknown> = {},
): ComponentNode {
  return { id, type, props, styles: {}, children: [] };
}
function seed() {
  const page = emptyScreen('Home', { id: 'home', entry: true });
  page.root.children = [
    node('list_items', 'list', { dataKey: 'items' }),
    node('input_brew', 'input', { bindKey: 'brew_size', placeholder: 'Brew size' }),
    node('text_title', 'heading', { text: 'Hello' }),
  ];
  page.mockData = { items: [{ label: 'Tea', count: 2 }] };
  useProject.getState().hydrate({ ...createProject(), screens: [page] });
  useUi.setState({
    activeScreenId: 'home',
    selectedId: 'list_items',
    route: 'editor',
    breakpoint: 'compact',
    propertiesOpen: true,
    inspectorCollapsed: false,
    runMode: false,
  });
  return page;
}
beforeEach(seed);
afterEach(cleanup);
describe('inspector tells the truth', () => {
  it('edits, duplicates, deletes and saves screen-local data rows with undo', async () => {
    render(<Inspector />);
    fireEvent.click(screen.getByRole('button', { name: 'Rows: 1 · View' }));
    fireEvent.change(screen.getByLabelText('Row 1 label'), { target: { value: 'Coffee' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add row' }));
    expect(useProject.getState().doc.screens[0].mockData?.items).toEqual([
      { label: 'Coffee', count: 2 },
      { label: '', count: 0 },
    ]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Duplicate' })[0]);
    expect(useProject.getState().doc.screens[0].mockData?.items).toHaveLength(3);
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[1]);
    expect(useProject.getState().doc.screens[0].mockData?.items).toHaveLength(2);
    expect(
      useProject.getState().setDataRows('home', 'items', [{ invalid: null }] as never),
    ).toBe(false);
    const doc = useProject.getState().doc;
    const id = await createSavedProject(doc);
    expect(await saveProjectNow(id, doc)).toBe(true);
    expect((await readSavedProject(id))?.screens[0].mockData?.items).toEqual(
      doc.screens[0].mockData?.items,
    );
    useProject.getState().undo();
    expect(useProject.getState().doc.screens[0].mockData?.items).toHaveLength(3);
  });
  it('offers typography and emits the selected family with defined aliases', () => {
    useUi.setState({ selectedId: 'text_title' });
    render(<Inspector />);
    fireEvent.click(screen.getByText('Style'));
    expect(screen.getByText('Typography')).toBeTruthy();
    fireEvent.click(screen.getByText('Typography'));
    fireEvent.change(screen.getByLabelText('Font family'), {
      target: { value: 'var(--openui-font-heading)' },
    });
    const doc = useProject.getState().doc;
    expect(generateCss(doc)).toContain('font-family:var(--openui-font-heading)');
    expect(materializeCss(doc.tokens)).toContain(
      '--openui-font-heading:var(--font-heading)',
    );
  });
  it('places a saved component in the screen root when a leaf is selected', () => {
    const doc = useProject.getState().doc;
    useProject.getState().replaceDoc({
      ...doc,
      customComponents: [
        { name: 'Saved block', description: 'saved', root: node('saved_root', 'card') },
      ],
    });
    render(<Palette />);
    expect(screen.getByText('Components')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Saved block/ }));
    expect(useProject.getState().doc.screens[0].root.children).toHaveLength(4);
  });
  it('shows edit usage counts and live run values, and selects the node', () => {
    useUi.setState({ selectedId: null });
    const { unmount } = render(<Inspector />);
    expect(screen.getByRole('button', { name: 'brew_size · used by 1 node' })).toBeTruthy();
    unmount();
    useUi.setState({ runMode: true, runScreenId: 'home' });
    render(<RunMode />);
    fireEvent.change(screen.getByPlaceholderText('Brew size'), { target: { value: '2' } });
    fireEvent.click(screen.getByText('Screen state'));
    const panel = screen.getByText('Bindings on this screen').closest('.bindings-section')!;
    fireEvent.click(
      within(panel as HTMLElement).getByRole('button', { name: 'brew_size · 2' }),
    );
    expect(useUi.getState().selectedId).toBe('input_brew');
    expect(useUi.getState().runMode).toBe(false);
  });
  it('uses launcher layering and has no inspector field inline styles', () => {
    expect(readFileSync('src/design/app.css', 'utf8')).toMatch(
      /\.chat-launcher\s*\{[^}]*z-index:\s*var\(--mw-z-launcher\)/,
    );
    expect(readFileSync('src/design/mw.css', 'utf8')).toMatch(/--mw-z-launcher:\s*45/);
    expect(readFileSync('src/inspector/Fields.tsx', 'utf8')).not.toMatch(/\bstyle=/);
  });
});
