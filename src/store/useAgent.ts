import { create } from 'zustand';
import type { RailEntry } from '../types/tree';
import type { BudgetState, HouseKeyState } from '../muse/client';

export interface ModelRoleInfo {
  id: string;
  role: string;
  effort: string | null;
}

export interface ModelMatrix {
  builder: ModelRoleInfo;
  architect: ModelRoleInfo;
  chat: ModelRoleInfo;
  contributor: ModelRoleInfo;
  image: ModelRoleInfo;
  sam: ModelRoleInfo;
  voice: ModelRoleInfo;
}

export interface ProbeResult {
  model: string;
  ok: boolean;
  ms: number;
  status?: number;
  detail?: string;
}

export interface Receipt {
  id: string;
  at: number;
  role: string;
  model: string;
  promptChars: number;
  toolNames: string[];
  latencyMs: number;
  status?: 'success' | 'failed';
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  cents?: number;
  /** Whose money this call spent. */
  key?: 'house' | 'user';
}

export interface ProgressPart {
  id: string;
  label: string;
  state: 'queued' | 'active' | 'done' | 'failed' | 'stopped';
  note?: string;
  problems?: string;
}

export interface ProgressState {
  title: string;
  parts: ProgressPart[];
  live: string;
  startedAt: number;
}

interface AgentStore {
  busy: boolean;
  stopping: boolean;
  liveText: string;
  liveLine: string | null;
  heartbeatAt: number;
  turnCalls: number;
  turnStartedAt: number;
  receipts: Receipt[];
  sessionCents: number;
  sessionRequests: number;
  turns: number;
  configured: boolean;
  demoMode: boolean;
  /** The owner's shared key, as the server sees it. */
  houseKey: HouseKeyState;
  houseKeyDetail: string | null;
  budget: BudgetState | null;
  live: boolean;
  buildImages: number;
  /** Attempts in the current/latest automated build; manual requests are separate. */
  buildImageUsage: { used: number; cap: number; documentEpoch: number } | null;
  /** Set while a turn is parked waiting for the visitor's key. */
  pendingRetry: string | null;
  /** Opt-in Wonder mode: planning rounds run on the architect role. */
  wonder: boolean;
  setWonder: (on: boolean) => void;
  /** Dev/testing only: the 20x-cheaper contributor tier. Never ships. */
  contributorMode: boolean;
  setContributorMode: (on: boolean) => void;
  statusError: string | null;
  models: ModelMatrix | null;
  keySource: 'env' | 'session' | 'none';
  probes: Record<string, ProbeResult>;
  probing: boolean;
  progress: ProgressState | null;
  reviewNotes: string | null;
  verification: 'idle' | 'running' | 'pass' | 'problems' | 'unverified';
  interrupted: boolean;
  lastError: string | null;
  busySignatures: string[];
  startTurn: () => void;
  stopRequested: () => boolean;
  requestStop: () => void;
  endTurn: () => void;
  setLive: (line: string | null) => void;
  appendText: (text: string) => void;
  resetText: () => void;
  bumpCalls: () => number;
  addReceipt: (r: Omit<Receipt, 'id' | 'at'>) => void;
  setStatus: (s: {
    configured: boolean;
    demoMode: boolean;
    houseKey?: HouseKeyState;
    houseKeyDetail?: string | null;
    budget?: BudgetState | null;
    live?: boolean;
    buildImages?: number;
    statusError?: string | null;
    models?: ModelMatrix | null;
    keySource?: 'env' | 'session' | 'none';
  }) => void;
  setProbe: (p: ProbeResult) => void;
  setProbing: (b: boolean) => void;
  setProgress: (p: ProgressState | null) => void;
  patchProgress: (patch: Partial<ProgressState>) => void;
  patchPart: (id: string, patch: Partial<ProgressPart>) => void;
  setVerification: (v: AgentStore['verification'], notes?: string | null) => void;
  setInterrupted: (b: boolean) => void;
  setError: (e: string | null) => void;
  setPendingRetry: (text: string | null) => void;
}

export const useAgent = create<AgentStore>((set, get) => ({
  busy: false,
  stopping: false,
  liveText: '',
  liveLine: null,
  heartbeatAt: 0,
  turnCalls: 0,
  turnStartedAt: 0,
  receipts: [],
  sessionCents: 0,
  sessionRequests: 0,
  turns: 0,
  configured: false,
  demoMode: true,
  houseKey: 'absent',
  houseKeyDetail: null,
  budget: null,
  live: false,
  buildImages: 3,
  buildImageUsage: null,
  pendingRetry: null,
  wonder: (() => {
    try {
      return localStorage.getItem('museware/wonder') === '1';
    } catch {
      return false;
    }
  })(),
  contributorMode: false,
  setContributorMode: (contributorMode) => set({ contributorMode }),
  setWonder: (wonder) => {
    try {
      localStorage.setItem('museware/wonder', wonder ? '1' : '0');
    } catch {
      /* private mode */
    }
    set({ wonder });
  },
  statusError: null,
  models: null,
  keySource: 'none',
  probes: {},
  probing: false,
  progress: null,
  reviewNotes: null,
  verification: 'idle',
  interrupted: false,
  lastError: null,
  busySignatures: [],

  startTurn: () =>
    set({
      busy: true,
      stopping: false,
      liveText: '',
      liveLine: null,
      turnCalls: 0,
      turnStartedAt: Date.now(),
      heartbeatAt: Date.now(),
      verification: 'idle',
      reviewNotes: null,
      lastError: null,
      interrupted: false,
      turns: get().turns + 1,
    }),
  stopRequested: () => get().stopping,
  requestStop: () => set({ stopping: true }),
  endTurn: () => set({ busy: false, stopping: false, liveLine: null }),
  setLive: (liveLine) => set({ liveLine, heartbeatAt: Date.now() }),
  appendText: (text) =>
    set((s) => ({
      liveText: `${s.liveText}${text}`.slice(-6000),
      heartbeatAt: Date.now(),
    })),
  resetText: () => set({ liveText: '' }),
  bumpCalls: () => {
    const next = get().turnCalls + 1;
    set({ turnCalls: next });
    return next;
  },
  addReceipt: (r) => {
    const receipt: Receipt = {
      ...r,
      id: `rc${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
      at: Date.now(),
    };
    set((s) => ({
      receipts: [...s.receipts, receipt].slice(-200),
      sessionCents: s.sessionCents + (r.cents || 0),
      sessionRequests: s.sessionRequests + 1,
    }));
  },
  setStatus: (s) =>
    set({
      configured: s.configured,
      demoMode: s.demoMode,
      houseKey: s.houseKey ?? get().houseKey,
      houseKeyDetail: s.houseKeyDetail ?? null,
      budget: s.budget ?? null,
      live: s.live ?? false,
      buildImages: s.buildImages ?? get().buildImages,
      statusError: s.statusError ?? null,
      models: s.models ?? get().models,
      keySource: s.keySource ?? get().keySource,
    }),
  setProbe: (p) => set((s) => ({ probes: { ...s.probes, [p.model]: p } })),
  setProbing: (probing) => set({ probing }),
  setProgress: (progress) => set({ progress }),
  patchProgress: (patch) =>
    set((s) => ({ progress: s.progress ? { ...s.progress, ...patch } : null })),
  patchPart: (id, patch) =>
    set((s) => ({
      progress: s.progress
        ? {
            ...s.progress,
            parts: s.progress.parts.map((p) => (p.id === id ? { ...p, ...patch } : p)),
          }
        : null,
    })),
  setVerification: (verification, notes = null) =>
    set({ verification, reviewNotes: notes }),
  setInterrupted: (interrupted) => set({ interrupted }),
  setError: (lastError) => set({ lastError }),
  setPendingRetry: (pendingRetry) => set({ pendingRetry }),
}));

export const RAIL_ENTRY_CAP = 100;

export type { RailEntry };
