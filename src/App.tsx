import { useEffect } from 'react';
import { useProject, createProject } from './store/useProject';
import { useUi, type Route } from './store/useUi';
import { useAgent } from './store/useAgent';
import { loadProject, saveProjectSoon } from './persist/save';
import { parseProjectDoc } from './persist/schema';
import { fetchStatus } from './muse/client';
import { offerKey } from './muse/loop';
import { resolveStaleKeyCards } from './muse/cards';
import { diagnose, houseKeySentence } from './muse/connection';
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

      const userKey = hasSessionKey();
      try {
        const status = await fetchStatus();
        // Three honest states: a working key (yours or the house's), a dead or
        // absent house key (ask for yours — never fake it with the local engine),
        // or a dev machine with no key at all, where the local engine is the
        // documented offline path and CI's only path.
        // ok and unverified are both usable: unverified means the key is set
        // but we could not reach Meta to check it, so we let the real call
        // report its own failure instead of blocking on a guess.
        const houseOk = status.houseKey === 'ok' || status.houseKey === 'unverified';
        const usable = Boolean(userKey || (houseOk && status.configured));
        const devNoKey = !usable && import.meta.env.DEV;
        useAgent.getState().setStatus({
          configured: usable,
          demoMode: devNoKey,
          houseKey: status.houseKey,
          houseKeyDetail: status.houseKeyDetail ?? null,
          budget: status.budget ?? null,
          live: Boolean(status.live),
          models: status.models,
          keySource: userKey ? 'session' : status.source,
          statusError: null,
        });
        if (devNoKey) {
          useProject.getState().addRail({
            role: 'system',
            text: 'No key on this machine — local engine on. Add one in Settings for the real models.',
          });
        } else if (!usable) {
          // One sentence, naming the actual cause — never a guess.
          offerKey(houseKeySentence(status.houseKey, status.houseKeyDetail), '');
        } else if (userKey) {
          resolveStaleKeyCards(
            'Your key is set for this tab — picking up where we left off.',
          );
        } else {
          // The key works, so any key card left over from an earlier failure is
          // an accusation that is no longer true. Take it off the screen.
          resolveStaleKeyCards(
            'The shared key answers Meta — any earlier key error is cleared.',
          );
        }
      } catch (err) {
        // The proxy is unreachable (plain `vite` with no middleware, a static
        // preview, or a deployment whose api/ folder never shipped). Nothing can
        // be spent, so the local engine is the honest mode — but say WHY, once,
        // in the visitor's own words rather than making them guess.
        useProject.getState().addRail({ role: 'system', text: diagnose(err).text });
        useAgent.getState().setStatus({
          configured: userKey,
          demoMode: !userKey,
          houseKey: 'absent',
          models: null,
          keySource: userKey ? 'session' : 'none',
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

  // First run (§9.1): the first time the editor appears without a key, show the
  // one-screen setup — paste a key, watch the models prove themselves, pick a
  // start. Once only; the Topbar keeps a door to it forever.
  useEffect(() => {
    if (route !== 'editor') return;
    let seen = false;
    try {
      seen = Boolean(localStorage.getItem('museware/onboarded'));
    } catch {
      seen = true;
    }
    if (seen || hasSessionKey()) return;
    try {
      localStorage.setItem('museware/onboarded', '1');
    } catch {
      /* private mode — the modal simply shows again next time */
    }
    useUi.getState().setModal('onboardingOpen', true);
  }, [route]);

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
      if (mod && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        useUi.getState().toggleInspector();
        return;
      }
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
