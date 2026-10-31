import { useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useProject, createProject } from './store/useProject';
import { useUi, type Route } from './store/useUi';
import { useAgent } from './store/useAgent';
import {
  getActiveProjectId,
  migrateCurrent,
  openProject,
  saveProjectSoon,
} from './persist/save';
import { fetchStatus } from './muse/client';
import { offerKey } from './muse/loop';
import { resolveStaleKeyCards } from './muse/cards';
import { diagnose, houseKeySentence } from './muse/connection';
import { hasSessionKey } from './muse/sessionKey';
import { Editor } from './shell/Editor';
import { Home } from './shell/Home';
import { Landing } from './shell/Landing';
import { Gallery } from './shell/Gallery';
import { Modals } from './shell/Modals';
import { RunMode } from './preview/RunMode';
import { Toasts } from './components/ui';

export function routeFromHash(
  hash = typeof window === 'undefined' ? '' : window.location.hash,
): { route: Route; projectId: string | null } {
  if (hash === '#/app') return { route: 'editor', projectId: null };
  const match = /^#\/app\/(p_[A-Za-z0-9_-]+)$/.exec(hash);
  if (match) return { route: 'editor', projectId: match[1] };
  if (hash === '#/projects') return { route: 'projects', projectId: null };
  if (hash === '#/gallery') return { route: 'gallery', projectId: null };
  return { route: 'landing', projectId: null };
}

export default function App() {
  const [booting, setBooting] = useState(true);
  const route = useUi((s) => s.route);
  const runMode = useUi((s) => s.runMode);
  const theme = useUi((s) => s.theme);
  const doc = useProject((s) => s.doc);
  const ready = useProject((s) => s.ready);
  const projectId = useProject((s) => s.projectId);
  const warned = useRef(new Set<string>());

  // Boot: restore the local project, then ask the proxy who it is.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let destination = routeFromHash(window.location.hash);
      let id: string | null = null;
      let restored = createProject();
      try {
        await migrateCurrent();
        if (destination.route === 'editor') {
          id = destination.projectId || (await getActiveProjectId());
          const stored = id ? await openProject(id) : null;
          if (stored && id) restored = stored;
          else {
            id = null;
            destination = { route: 'landing', projectId: null };
          }
        }
      } catch (err) {
        console.warn('museware: could not read local project', err);
        destination = { route: 'landing', projectId: null };
        id = null;
      }
      if (cancelled) return;
      useProject.getState().hydrate(restored, id);
      const first = restored.screens.find((s) => s.entry) || restored.screens[0];
      if (first) useUi.getState().setActiveScreen(first.id);
      useUi.getState().setRoute(destination.route, id || undefined);
      setBooting(false);

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
          buildImages: status.buildImages,
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
    if (booting || route !== 'editor') return;
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
  }, [route, booting]);

  // Back/forward or an edited URL opens the named project; replaceState emits no hashchange.
  useEffect(() => {
    if (booting) return;
    let sequence = 0;
    const sync = async () => {
      const ticket = ++sequence;
      const destination = routeFromHash();
      if (destination.route !== 'editor') {
        useUi.setState({ route: destination.route });
        return;
      }
      try {
        const id = destination.projectId || (await getActiveProjectId());
        if (!id) {
          if (ticket === sequence) useUi.getState().setRoute('landing');
          return;
        }
        if (id !== useProject.getState().projectId || useUi.getState().route !== 'editor') {
          const doc = await openProject(id);
          if (ticket !== sequence) return;
          if (!doc) throw new Error('Project no longer exists.');
          useProject.getState().hydrate(doc, id);
          const first = doc.screens.find((s) => s.entry) || doc.screens[0];
          if (first) useUi.getState().setActiveScreen(first.id);
        }
        if (ticket !== sequence) return;
        if (!destination.projectId)
          window.history.replaceState(null, '', `#/app/${encodeURIComponent(id)}`);
        useUi.setState({ route: 'editor' });
      } catch (err) {
        if (ticket !== sequence) return;
        console.warn('museware: could not open project', err);
        useUi.getState().toast('That project could not be opened.', 'warn');
        useUi.getState().setRoute('projects');
      }
    };
    const onChange = () => {
      void sync();
    };
    window.addEventListener('hashchange', onChange);
    window.addEventListener('popstate', onChange);
    return () => {
      sequence++;
      window.removeEventListener('hashchange', onChange);
      window.removeEventListener('popstate', onChange);
    };
  }, [booting]);

  // Autosave is bound to the document's project ID, never a global active pointer.
  useEffect(() => {
    if (!ready || booting || route !== 'editor' || !projectId) return;
    saveProjectSoon(projectId, doc, () => {
      if (warned.current.has(projectId)) return;
      warned.current.add(projectId);
      useUi
        .getState()
        .toast(
          'This project could not be saved. It may have been deleted in another tab.',
          'warn',
        );
    });
  }, [doc, ready, booting, route, projectId]);

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

  if (booting)
    return (
      <div className="boot-splash" role="status" aria-label="Loading Museware">
        <Sparkles size={32} />
        <strong>museware</strong>
        <div className="boot-progress">
          <span />
        </div>
      </div>
    );

  return (
    <>
      {route === 'landing' && <Landing />}
      {route === 'projects' && <Home />}
      {route === 'gallery' && <Gallery />}
      {route === 'editor' && <Editor />}
      {runMode && route === 'editor' && <RunMode />}
      <Modals />
      <Toasts />
    </>
  );
}
