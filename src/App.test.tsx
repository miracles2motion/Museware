// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from './App';
import { useProject } from './store/useProject';
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
