import { create } from 'zustand';
import { useAgent } from './useAgent';
import { nanoid } from 'nanoid';
import type { CustomComponent, ProjectDoc, RailEntry, ScreenDoc } from '../types/tree';
import type { DesignTokens } from '../types/tokens';
import { MUSEWARE_DEFAULT_THEME, cloneTheme } from '../design/starter';
import { applyOps, type ApplyResult } from '../ops/apply';
import { clone } from '../ops/treeUtils';
import { collectIds } from '../ops/ids';

const RAIL_CAP = 400;
const CARD_DATA_CAP = 8000;

export interface Snapshot {
  screens: ScreenDoc[];
  tokens: DesignTokens;
  customComponents: CustomComponent[];
  kind: 'web' | 'app';
  name: string;
  blueprint?: ProjectDoc['blueprint'];
}

export function createProject(name = 'Untitled project'): ProjectDoc {
  return {
    format: 'museware/1',
    name,
    screens: [],
    tokens: cloneTheme(MUSEWARE_DEFAULT_THEME),
    opLog: [],
    rail: [],
    kind: 'web',
    customComponents: [],
    layoutVersion: 2,
    automatedImageBudget: { used: 0 },
    updatedAt: Date.now(),
  };
}

function snapshotOf(doc: ProjectDoc): Snapshot {
  return {
    screens: clone(doc.screens),
    tokens: clone(doc.tokens),
    customComponents: clone(doc.customComponents),
    kind: doc.kind,
    name: doc.name,
    ...(doc.blueprint ? { blueprint: { ...doc.blueprint } } : {}),
  };
}

function fromSnapshot(snap: Snapshot, doc: ProjectDoc): ProjectDoc {
  return {
    ...doc,
    screens: clone(snap.screens),
    tokens: clone(snap.tokens),
    customComponents: clone(snap.customComponents),
    kind: snap.kind,
    name: snap.name,
    blueprint: snap.blueprint ? { ...snap.blueprint } : undefined,
    updatedAt: Date.now(),
  };
}

function trimCardData(entry: RailEntry): RailEntry {
  if (!entry.card || entry.card.kind === 'thinking') return entry;
  const data = entry.card.data || {};
  const text = typeof data.blueprint === 'string' ? data.blueprint : '';
  if (text.length > 6000) {
    return {
      ...entry,
      card: {
        ...entry.card,
        data: {
          ...data,
          blueprint: `${text.slice(0, 6000)}\n…full text in the Design panel`,
        },
      },
    };
  }
  const serialized = JSON.stringify(data);
  if (serialized.length > CARD_DATA_CAP) {
    return {
      ...entry,
      card: { ...entry.card, data: { truncated: true, note: 'card data trimmed on save' } },
    };
  }
  return entry;
}

interface ScreenBuildSnapshot {
  before: ScreenDoc | null;
  after: ScreenDoc;
}

interface ProjectStore {
  doc: ProjectDoc;
  projectId: string | null;
  ready: boolean;
  documentEpoch: number;
  undoStack: Snapshot[];
  redoStack: Snapshot[];
  lastResult: ApplyResult | null;
  screenBuilds: Record<string, ScreenBuildSnapshot>;
  rememberScreenBuild: (cardId: string, screenId: string, before: ScreenDoc | null) => void;
  undoScreenBuild: (cardId: string, screenId: string) => string;
  hydrate: (doc: ProjectDoc, projectId?: string | null) => void;
  replaceDoc: (doc: ProjectDoc) => void;
  applyBatch: (
    rawOps: unknown[],
    opts: { source: 'agent' | 'user'; screenAddsThisTurn?: number },
  ) => ApplyResult;
  undo: () => string | null;
  redo: () => string | null;
  setName: (name: string) => void;
  setKind: (kind: 'web' | 'app') => void;
  addRail: (
    entry: Omit<RailEntry, 'id' | 'at'> & { id?: string; at?: number },
  ) => RailEntry;
  patchRail: (id: string, patch: Partial<RailEntry> & { card?: RailEntry['card'] }) => void;
  setBlueprint: (text: string, decided?: boolean) => void;
  replaceTheme: (tokens: DesignTokens) => void;
  setScreensEntry: (screenId: string) => void;
  /** Sticky marker: this project was shaped by contributor-tier output. */
  markContributor: () => void;
}

export const useProject = create<ProjectStore>((set, get) => ({
  doc: createProject(),
  projectId: null,
  ready: false,
  documentEpoch: 0,
  undoStack: [],
  redoStack: [],
  lastResult: null,
  screenBuilds: {},

  hydrate: (doc, projectId = null) =>
    set((state) => ({
      doc,
      projectId,
      ready: true,
      documentEpoch: state.documentEpoch + 1,
      undoStack: [],
      redoStack: [],
      screenBuilds: {},
    })),

  replaceDoc: (doc) =>
    set((state) => ({
      doc,
      documentEpoch: state.documentEpoch + 1,
      undoStack: [],
      redoStack: [],
      screenBuilds: {},
    })),

  rememberScreenBuild: (cardId, screenId, before) => {
    const after = get().doc.screens.find((screen) => screen.id === screenId);
    if (after)
      set((s) => ({
        screenBuilds: {
          ...s.screenBuilds,
          [`${cardId}:${screenId}`]: {
            before: before ? clone(before) : null,
            after: clone(after),
          },
        },
      }));
  },
  undoScreenBuild: (cardId, screenId) => {
    const state = get();
    const key = `${cardId}:${screenId}`;
    const record = state.screenBuilds[key];
    if (!record) return 'Screen-specific build history is unavailable for this card.';
    const index = state.doc.screens.findIndex((screen) => screen.id === screenId);
    if (
      index < 0 ||
      JSON.stringify(state.doc.screens[index]) !== JSON.stringify(record.after)
    )
      return 'This screen changed after the build. Undo would overwrite newer changes, so it was not applied.';
    if (record.before) {
      const otherIds = new Set<string>();
      state.doc.screens
        .filter((screen) => screen.id !== screenId)
        .forEach((screen) => collectIds(screen.root, otherIds));
      if ([...collectIds(record.before.root)].some((id) => otherIds.has(id)))
        return 'Cannot restore: another screen now uses an original node ID.';
    }
    const screens = clone(state.doc.screens);
    if (record.before) {
      const restored = clone(record.before);
      if (screens[index].entry) restored.entry = true;
      else delete restored.entry;
      screens[index] = restored;
    } else {
      const wasEntry = screens[index].entry;
      screens.splice(index, 1);
      if (wasEntry && screens.length && !screens.some((screen) => screen.entry))
        screens[0].entry = true;
    }
    const builds = { ...state.screenBuilds };
    delete builds[key];
    set({
      doc: {
        ...state.doc,
        screens,
        updatedAt: Date.now(),
        opLog: [
          ...state.doc.opLog,
          {
            at: Date.now(),
            source: 'user' as const,
            batch: [],
            summary: `Undo build of ${screenId}`,
          },
        ].slice(-2000),
      },
      screenBuilds: builds,
      undoStack: [...state.undoStack, snapshotOf(state.doc)].slice(-50),
      redoStack: [],
    });
    return '';
  },

  applyBatch: (rawOps, opts) => {
    const state = get();
    const before = state.doc;
    const result = applyOps(rawOps, before, opts);
    if (result.errors.length) {
      set({ lastResult: result });
      return result;
    }
    const undoStack = [...state.undoStack, snapshotOf(before)].slice(-50);
    set({ doc: result.doc, undoStack, redoStack: [], lastResult: result });
    return result;
  },

  undo: () => {
    const { undoStack, redoStack, doc } = get();
    if (!undoStack.length) return null;
    const snap = undoStack[undoStack.length - 1];
    const entry = {
      at: Date.now(),
      source: 'user' as const,
      batch: [],
      summary: 'undo',
    };
    const next = fromSnapshot(snap, doc);
    next.opLog = [...doc.opLog, entry].slice(-2000);
    set({
      doc: next,
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, snapshotOf(doc)].slice(-50),
    });
    return 'undo';
  },

  redo: () => {
    const { undoStack, redoStack, doc } = get();
    if (!redoStack.length) return null;
    const snap = redoStack[redoStack.length - 1];
    const next = fromSnapshot(snap, doc);
    next.opLog = [
      ...doc.opLog,
      { at: Date.now(), source: 'user' as const, batch: [], summary: 'redo' },
    ].slice(-2000);
    set({
      doc: next,
      redoStack: redoStack.slice(0, -1),
      undoStack: [...undoStack, snapshotOf(doc)].slice(-50),
    });
    return 'redo';
  },

  setName: (name) =>
    set((s) => ({ doc: { ...s.doc, name: name.slice(0, 80), updatedAt: Date.now() } })),

  setKind: (kind) => set((s) => ({ doc: { ...s.doc, kind, updatedAt: Date.now() } })),

  addRail: (entry) => {
    const full: RailEntry = trimCardData({
      id: entry.id || nanoid(),
      at: entry.at || Date.now(),
      role: entry.role,
      text: entry.text,
      ...(entry.reasoningReplayed ? { reasoningReplayed: true } : {}),
      ...(entry.card ? { card: entry.card } : {}),
    });
    set((s) => ({ doc: { ...s.doc, rail: [...s.doc.rail, full].slice(-RAIL_CAP) } }));
    if (
      (full.role === 'system' ||
        (full.role === 'agent' && full.text === 'Applying the next tool actions.')) &&
      thinkingId &&
      useAgent.getState().busy &&
      thinkingEpoch === get().documentEpoch &&
      !/\b(error|failed|failure|exhausted|rejected|unauthori[sz]ed|skipped|budget spent)\b/i.test(
        full.text,
      ) &&
      !/^Images:/i.test(full.text)
    ) {
      const thinking = get().doc.rail.find((item) => item.id === thinkingId);
      if (thinking?.card) {
        const data = thinking.card.data;
        get().patchRail(thinking.id, {
          card: {
            ...thinking.card,
            data: {
              ...data,
              entryIds: [...(Array.isArray(data.entryIds) ? data.entryIds : []), full.id],
              lines: [...(Array.isArray(data.lines) ? data.lines : []), full.text],
            },
          },
        });
      }
    }
    return full;
  },

  patchRail: (id, patch) =>
    set((s) => ({
      doc: {
        ...s.doc,
        rail: s.doc.rail.map((r) =>
          r.id === id ? trimCardData({ ...r, ...patch, card: patch.card ?? r.card }) : r,
        ),
      },
    })),

  setBlueprint: (text, decided = false) =>
    set((s) => ({
      doc: {
        ...s.doc,
        blueprint: { text, decided, updatedAt: Date.now() },
        updatedAt: Date.now(),
      },
    })),

  replaceTheme: (tokens) =>
    set((s) => ({ doc: { ...s.doc, tokens: clone(tokens), updatedAt: Date.now() } })),

  markContributor: () =>
    set((s) =>
      s.doc.builtWithContributor
        ? {}
        : { doc: { ...s.doc, builtWithContributor: true, updatedAt: Date.now() } },
    ),

  setScreensEntry: (screenId) =>
    set((s) => ({
      doc: {
        ...s.doc,
        screens: s.doc.screens.map((s2) => {
          if (s2.id === screenId) return { ...s2, entry: true };
          const copy = { ...s2 };
          delete copy.entry;
          return copy;
        }),
        updatedAt: Date.now(),
      },
    })),
}));

export const selectActiveScreen = (screenId: string | null) => (doc: ProjectDoc) =>
  doc.screens.find((s) => s.id === screenId) ||
  doc.screens.find((s) => s.entry) ||
  doc.screens[0];

// Thinking state is stored in the project rail, not in transient component state.
let thinkingId: string | null = null;
let thinkingEpoch = -1;
let beforeScreenCount = 0;
let beforeBlueprint = '';
let beforeProgress: ReturnType<typeof useAgent.getState>['progress'] = null;
useAgent.subscribe((state, previous) => {
  if (state.busy && !previous.busy) {
    const project = useProject.getState();
    thinkingEpoch = project.documentEpoch;
    beforeScreenCount = project.doc.screens.length;
    beforeBlueprint = project.doc.blueprint?.text || '';
    beforeProgress = previous.progress;
    const card = project.addRail({
      role: 'card',
      text: 'Thinking',
      card: {
        kind: 'thinking',
        state: 'pending',
        data: {
          expanded: false,
          lines: [],
          entryIds: [],
          active: true,
          summary: 'Thinking',
        },
      },
    });
    thinkingId = card.id;
  }
  if (!thinkingId || thinkingEpoch !== useProject.getState().documentEpoch) return;
  const project = useProject.getState();
  const card = project.doc.rail.find((item) => item.id === thinkingId);
  if (!card?.card) return;
  if (state.busy && state.liveLine && state.liveLine !== previous.liveLine) {
    const lines = Array.isArray(card.card.data.lines) ? card.card.data.lines : [];
    project.patchRail(card.id, {
      card: {
        ...card.card,
        data: { ...card.card.data, lines: [...lines, state.liveLine] },
      },
    });
  }
  if (state.busy && state.progress && state.progress !== previous.progress) {
    const current = useProject.getState().doc.rail.find((item) => item.id === thinkingId);
    if (current?.card) {
      const data = current.card.data;
      const lines = Array.isArray(data.lines) ? data.lines : [];
      const done = state.progress.parts.filter((part) => part.state === 'done').length;
      const changed = state.progress.parts.find(
        (part) =>
          !previous.progress?.parts.some(
            (old) =>
              old.id === part.id && old.state === part.state && old.note === part.note,
          ),
      );
      const detail = changed
        ? ` · ${changed.label}: ${changed.state}${changed.note ? ` — ${changed.note}` : ''}`
        : '';
      const line = `${state.progress.title} — ${done} of ${state.progress.parts.length}${detail}`;
      if (lines[lines.length - 1] !== line)
        project.patchRail(current.id, {
          card: { ...current.card, data: { ...data, lines: [...lines, line] } },
        });
    }
  }
  if (!state.busy && previous.busy) {
    const current = project.doc.rail.find((item) => item.id === thinkingId);
    if (!current?.card) return;
    const parts: string[] = [];
    if (project.doc.blueprint?.text && project.doc.blueprint.text !== beforeBlueprint)
      parts.push('Planned');
    const built =
      (state.progress !== beforeProgress
        ? state.progress?.parts.filter((part) => part.state === 'done').length
        : 0) || Math.max(0, project.doc.screens.length - beforeScreenCount);
    if (built) parts.push(`built ${built} screen${built === 1 ? '' : 's'}`);
    const generated = (
      Array.isArray(current.card.data.lines) ? current.card.data.lines : []
    ).filter(
      (line) => typeof line === 'string' && /saved — image is undoable\./.test(line),
    ).length;
    if (generated) parts.push(`generated ${generated} image${generated === 1 ? '' : 's'}`);
    const lines = Array.isArray(current.card.data.lines) ? current.card.data.lines : [];
    project.patchRail(current.id, {
      card: {
        ...current.card,
        state: 'answered',
        data: {
          ...current.card.data,
          active: false,
          expanded: false,
          summary: parts.join(', ') || (state.interrupted ? 'Stopped' : 'Finished'),
          lines: state.liveText ? [...lines, state.liveText] : lines,
        },
      },
    });
    thinkingId = null;
  }
});
