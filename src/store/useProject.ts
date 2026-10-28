import { create } from 'zustand';
import { nanoid } from 'nanoid';
import type { CustomComponent, ProjectDoc, RailEntry, ScreenDoc } from '../types/tree';
import type { DesignTokens } from '../types/tokens';
import { MUSEWARE_DEFAULT_THEME, cloneTheme } from '../design/starter';
import { applyOps, type ApplyResult } from '../ops/apply';
import { clone } from '../ops/treeUtils';

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
  if (!entry.card) return entry;
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

interface ProjectStore {
  doc: ProjectDoc;
  ready: boolean;
  undoStack: Snapshot[];
  redoStack: Snapshot[];
  lastResult: ApplyResult | null;
  hydrate: (doc: ProjectDoc) => void;
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
  ready: false,
  undoStack: [],
  redoStack: [],
  lastResult: null,

  hydrate: (doc) => set({ doc, ready: true, undoStack: [], redoStack: [] }),

  replaceDoc: (doc) => set({ doc, undoStack: [], redoStack: [] }),

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
      ...(entry.card ? { card: entry.card } : {}),
    });
    set((s) => ({ doc: { ...s.doc, rail: [...s.doc.rail, full].slice(-RAIL_CAP) } }));
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
