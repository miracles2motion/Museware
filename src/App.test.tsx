// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import App from './App';
import { useProject } from './store/useProject';
import { useAgent } from './store/useAgent';
import { useUi } from './store/useUi';
import { addScreenBatch } from './ops/screenOps';

beforeAll(() => {
  // No proxy in tests: the app must fall back to the local engine honestly.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('offline in tests'))),
  );
  if (!globalThis.ResizeObserver) {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  }
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});

afterEach(() => {
  cleanup();
  useProject
    .getState()
    .replaceDoc({ ...useProject.getState().doc, screens: [], opLog: [], rail: [] });
  useUi.setState({
    route: 'landing',
    selectedId: null,
    activeScreenId: null,
    runMode: false,
    breakpoint: 'compact',
    toasts: [],
    propertiesOpen: false,
    inspectorCollapsed: false,
    inspectorWide: false,
  });
});

async function boot() {
  render(<App />);
  // Let the boot effect (idb + status) settle.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

describe('the shell actually renders', () => {
  it('opens on the landing page, with the product visible', async () => {
    await boot();
    expect(screen.getByText(/Describe it\. Watch it build\./)).toBeTruthy();
    expect(screen.getAllByText(/Start building/).length).toBeGreaterThan(0);
  });

  it('the hero mini-canvas accepts real nodes before you sign up for anything', async () => {
    await boot();
    const addButton = screen.getAllByText('+ Button')[0];
    fireEvent.click(addButton);
    expect(screen.getByText('You added this')).toBeTruthy();
    fireEvent.click(screen.getByText('↺ 1'));
    expect(screen.queryByText('You added this')).toBeNull();
  });

  it('navigates to the editor and shows the empty-canvas teaching state', async () => {
    await boot();
    const start = screen.getAllByText(/Start building/)[0];
    fireEvent.click(start);
    expect(document.querySelector('.app-shell')).toBeTruthy();
    expect(screen.getByText(/Describe the app, or start with a block\./)).toBeTruthy();
  });

  it('renders a screen into the canvas once one exists', async () => {
    await boot();
    act(() => {
      useUi.getState().setRoute('editor');
    });
    act(() => {
      const doc = useProject.getState().doc;
      const res = useProject
        .getState()
        .applyBatch(addScreenBatch(doc, 'Home'), { source: 'user' });
      expect(res.errors).toHaveLength(0);
      const created = useProject.getState().doc.screens[0];
      useUi.getState().setActiveScreen(created.id);
    });
    expect(document.querySelector('.mw-app')).toBeTruthy();
    expect(document.querySelector('.frame-viewport')).toBeTruthy();
  });

  it('selecting a node opens the schema-driven inspector', async () => {
    await boot();
    act(() => {
      useUi.getState().setRoute('editor');
      const doc = useProject.getState().doc;
      useProject.getState().applyBatch(addScreenBatch(doc, 'Home'), { source: 'user' });
      const created = useProject.getState().doc.screens[0];
      useUi.getState().setActiveScreen(created.id);
      useUi.getState().select(created.root.id);
    });
    expect(screen.getByText('Props')).toBeTruthy();
    expect(screen.getByText('Style')).toBeTruthy();
    expect(screen.getByText('Events')).toBeTruthy();
    expect(document.querySelector('.inspector')).toBeTruthy();
  });

  it('switches breakpoints from the topbar and the keys follow', async () => {
    await boot();
    act(() => {
      useUi.getState().setRoute('editor');
      const doc = useProject.getState().doc;
      useProject.getState().applyBatch(addScreenBatch(doc, 'Home'), { source: 'user' });
      useUi.getState().setActiveScreen(useProject.getState().doc.screens[0].id);
    });
    act(() => {
      useUi.getState().setBreakpoint('expanded');
    });
    expect(useUi.getState().breakpoint).toBe('expanded');
    const frame = document.querySelector('.device-frame');
    expect(frame?.getAttribute('data-bp')).toBe('expanded');
  });

  it('clicking a palette block adds a node with one op', async () => {
    await boot();
    act(() => {
      useUi.getState().setRoute('editor');
      const doc = useProject.getState().doc;
      useProject.getState().applyBatch(addScreenBatch(doc, 'Home'), { source: 'user' });
      useUi.getState().setActiveScreen(useProject.getState().doc.screens[0].id);
    });
    const heading = Array.from(document.querySelectorAll('.palette-item')).find(
      (el) => el.textContent?.trim() === 'Heading',
    );
    expect(heading).toBeTruthy();
    fireEvent.pointerDown(heading!, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(heading!, { clientX: 10, clientY: 10 });
    fireEvent.click(heading!);
    const root = useProject.getState().doc.screens[0].root;
    expect(root.children).toHaveLength(1);
    expect(root.children[0].type).toBe('heading');
    expect(useUi.getState().selectedId).toBe(root.children[0].id);
  });

  it('the style tab writes a real setStyles op', async () => {
    await boot();
    let rootId = '';
    act(() => {
      useUi.getState().setRoute('editor');
      const doc = useProject.getState().doc;
      useProject.getState().applyBatch(addScreenBatch(doc, 'Home'), { source: 'user' });
      const created = useProject.getState().doc.screens[0];
      useUi.getState().setActiveScreen(created.id);
      rootId = created.root.id;
      useUi.getState().select(rootId);
    });
    fireEvent.click(screen.getByText('Style'));
    const swatch = document.querySelector('.swatch[aria-label="openui-accent"]');
    expect(swatch).toBeTruthy();
    fireEvent.click(swatch!);
    const root = useProject.getState().doc.screens[0].root;
    expect(root.styles.background).toBe('var(--openui-accent)');
  });

  it('first-run onboarding shows the probe chips and the three starts', async () => {
    await boot();
    act(() => {
      useUi.getState().setModal('onboardingOpen', true);
    });
    expect(screen.getByText(/The canvas where Muse builds with you/)).toBeTruthy();
    expect(screen.getByText('Builder')).toBeTruthy();
    expect(screen.getByText(/Start from blueprint/)).toBeTruthy();
    expect(screen.getAllByText(/Recreate a screenshot/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Import a preset/)).toBeTruthy();
    fireEvent.click(screen.getByText('Use the local engine'));
    expect(useAgent.getState().demoMode).toBe(true);
  });

  it('settings owns the wonder switch and says what it costs', async () => {
    await boot();
    act(() => {
      useUi.getState().setModal('settingsOpen', true);
    });
    expect(screen.getByText('Wonder mode')).toBeTruthy();
    expect(screen.getByText(/Plan with the architect model/)).toBeTruthy();
    const label = screen.getByText(/Plan with the architect model/).closest('label');
    const box = within(label as HTMLElement).getByRole('checkbox') as HTMLInputElement;
    fireEvent.click(box);
    expect(useAgent.getState().wonder).toBe(true);
    fireEvent.click(box);
    expect(useAgent.getState().wonder).toBe(false);
  });

  it('the phone shell is a tab bar plus one overflow menu, not the desktop bar', async () => {
    await boot();
    act(() => {
      useUi.getState().setRoute('editor');
    });

    const bar = document.querySelector('.mobile-bottom-bar');
    expect(bar).toBeTruthy();
    expect(bar?.querySelectorAll('button').length).toBe(5);
    expect(bar?.textContent).toMatch(/Insert/);
    expect(bar?.textContent).toMatch(/Run/);

    // Everything the desktop bar shows is marked so CSS can hide it on a phone…
    expect(document.querySelectorAll('.topbar-desktop').length).toBeGreaterThan(4);

    // …and the phone menu still reaches all of it.
    const more = document.querySelector('.topbar-mobile button');
    expect(more).toBeTruthy();
    fireEvent.click(more!);
    const menu = document.querySelector('.topbar-mobile .menu');
    expect(menu).toBeTruthy();
    const inside = within(menu as HTMLElement);
    expect(inside.getByText(/Settings & models/)).toBeTruthy();
    expect(inside.getByText(/Export the app/)).toBeTruthy();
    expect(inside.getByText(/Compact 390/)).toBeTruthy();
  });

  it('the inspector panel minimizes to an edge tab and widens on demand', async () => {
    await boot();
    let rootId = '';
    act(() => {
      useUi.getState().setRoute('editor');
      const doc = useProject.getState().doc;
      useProject.getState().applyBatch(addScreenBatch(doc, 'Home'), { source: 'user' });
      const created = useProject.getState().doc.screens[0];
      useUi.getState().setActiveScreen(created.id);
      useUi.getState().select(created.root.id);
      rootId = created.root.id;
    });

    const workspace = document.querySelector('.workspace') as HTMLElement;
    expect(workspace.getAttribute('data-inspector')).toBe('open');
    expect(document.querySelector('.inspector-peek')).toBeNull();

    // Minimize: the panel leaves, the selection and the artboard stay.
    fireEvent.click(screen.getByLabelText('Minimize the panel'));
    expect(useUi.getState().propertiesOpen).toBe(false);
    expect(useUi.getState().inspectorCollapsed).toBe(true);
    expect(workspace.getAttribute('data-inspector')).toBe('closed');
    expect(document.querySelector('.inspector')?.getAttribute('data-open')).toBe('false');
    expect(useUi.getState().selectedId).toBe(rootId);

    // Selecting a node must not fight the user's minimize…
    act(() => {
      useUi.getState().select(null);
      useUi.getState().select(rootId);
    });
    expect(useUi.getState().propertiesOpen).toBe(false);

    // …and the edge tab is the way back.
    const peek = document.querySelector('.inspector-peek') as HTMLElement;
    expect(peek).toBeTruthy();
    fireEvent.click(peek);
    expect(useUi.getState().propertiesOpen).toBe(true);
    expect(workspace.getAttribute('data-inspector')).toBe('open');

    // Maximize hands the panel the wide column.
    fireEvent.click(screen.getByLabelText('Widen the panel'));
    expect(useUi.getState().inspectorWide).toBe(true);
    expect(workspace.getAttribute('data-inspector')).toBe('wide');
    expect(
      screen.getByLabelText('Restore the panel width').getAttribute('aria-pressed'),
    ).toBe('true');
    fireEvent.click(screen.getByLabelText('Restore the panel width'));
    expect(workspace.getAttribute('data-inspector')).toBe('open');

    // The keyboard does the same thing.
    fireEvent.keyDown(window, { key: 'i', ctrlKey: true });
    expect(useUi.getState().propertiesOpen).toBe(false);
    fireEvent.keyDown(window, { key: 'i', ctrlKey: true });
    expect(useUi.getState().propertiesOpen).toBe(true);
  });

  it('run mode executes the tree and Escape leaves it', async () => {
    await boot();
    act(() => {
      useUi.getState().setRoute('editor');
      const doc = useProject.getState().doc;
      useProject.getState().applyBatch(addScreenBatch(doc, 'Home'), { source: 'user' });
      const created = useProject.getState().doc.screens[0];
      useUi.getState().setActiveScreen(created.id);
      useUi.getState().setRunMode(true, created.id);
    });
    expect(screen.getByText(/Editor/)).toBeTruthy();
    expect(document.querySelector('.run-frame')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useUi.getState().runMode).toBe(false);
  });
});
