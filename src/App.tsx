import { useEffect } from 'react';
import { useProject, createProject } from './store/useProject';
import { useUi, type Route } from './store/useUi';
import { useAgent } from './store/useAgent';
import { loadProject, saveProjectSoon } from './persist/save';
import { parseProjectDoc } from './persist/schema';
import { fetchStatus } from './muse/client';
import { hasSessionKey } from './muse/sessionKey';
import { Editor } from './shell/Editor';
import { Landing } from './shell/Landing';
import { Gallery } from './shell/Gallery';
import { Modals } from './shell/Modals';
import { RunMode } from './preview/RunMode';
import { Toasts } from './components/ui';

function routeFromHash(): Route {
  if (typeof window === 'undefined') return 'landing';
  if (window.location.hash.startsWith('#/app')) return 'editor';
  if (window.location.hash.startsWith('#/gallery')) return 'gallery';
  return 'landing';
}

export default function App() {
  const route = useUi((s) => s.route);
  const runMode = useUi((s) => s.runMode);
  const theme = useUi((s) => s.theme);
  const doc = useProject((s) => s.doc);
  const ready = useProject((s) => s.ready);

  // Boot: restore the local project, then ask the proxy who it is.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let restored = createProject();
      try {
        const stored = await loadProject();
        if (stored) restored = parseProjectDoc(stored);
      } catch {
        restored = createProject();
      }
      if (cancelled) return;
      useProject.getState().hydrate(restored);
      const first = restored.screens.find((s) => s.entry) || restored.screens[0];
      if (first) useUi.getState().setActiveScreen(first.id);

      try {
        const status = await fetchStatus();
        useAgent.getState().setStatus({
          configured: status.configured || hasSessionKey(),
          demoMode: !status.configured && !hasSessionKey(),
          models: status.models,
          keySource: status.source,
          statusError: null,
        });
      } catch (err) {
        useAgent.getState().setStatus({
          configured: hasSessionKey(),
          demoMode: !hasSessionKey(),
          keySource: hasSessionKey() ? 'session' : 'none',
          statusError:
            err instanceof Error ? err.message : 'The muse proxy is not reachable.',
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Chrome theme (dark by default, light + system supported).
  useEffect(() => {
    const apply = () => {
      const resolved =
        theme === 'auto'
          ? window.matchMedia('(prefers-color-scheme: light)').matches
            ? 'light'
            : 'dark'
          : theme;
      document.documentElement.dataset.mwTheme = resolved;
    };
    apply();
    if (theme !== 'auto') return;
    const media = window.matchMedia('(prefers-color-scheme: light)');
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  // Hash routing — deep links work without a router dependency.
  useEffect(() => {
    const sync = () => useUi.getState().setRoute(routeFromHash());
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    sync();
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);

  // Persist on every change (debounced, IndexedDB).
  useEffect(() => {
    if (!ready) return;
    saveProjectSoon(doc);
  }, [doc, ready]);

  // Global shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing =
        el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.tagName === 'SELECT' ||
          el.isContentEditable);
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        if (typing) return;
        e.preventDefault();
        if (e.shiftKey) useProject.getState().redo();
        else useProject.getState().undo();
        return;
      }
      if (mod && e.key === 'Enter') {
        e.preventDefault();
        const screens = useProject.getState().doc.screens;
        const active = useUi.getState().activeScreenId || screens[0]?.id;
        if (useUi.getState().runMode) useUi.getState().setRunMode(false);
        else if (active) useUi.getState().setRunMode(true, active);
        return;
      }
      if (mod && e.key === '\\') {
        e.preventDefault();
        useUi.getState().toggleLeft();
        return;
      }
      if (typing) return;
      if (e.key === '1') useUi.getState().setBreakpoint('compact');
      if (e.key === '2') useUi.getState().setBreakpoint('medium');
      if (e.key === '3') useUi.getState().setBreakpoint('expanded');
      if (e.key === '?') useUi.getState().setModal('shortcutsOpen', true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      {route === 'landing' && <Landing />}
      {route === 'gallery' && <Gallery />}
      {route === 'editor' && <Editor />}
      {runMode && route === 'editor' && <RunMode />}
      <Modals />
      <Toasts />
    </>
  );
}
