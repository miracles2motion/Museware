import { create } from 'zustand';
import type { RailEntry } from '../types/tree';
import type { DesignTokens } from '../types/tokens';

export type Breakpoint = 'compact' | 'medium' | 'expanded';
export type Route = 'landing' | 'editor' | 'gallery';

export const BREAKPOINT_WIDTHS: Record<Breakpoint, number> = {
  compact: 390,
  medium: 768,
  expanded: 1280,
};

export interface ColorCardRequest {
  nodeId?: string;
  initialHex?: string;
  title?: string;
}

export interface Toast {
  id: string;
  text: string;
  tone: 'ok' | 'warn' | 'danger' | 'neutral';
}

interface UiStore {
  route: Route;
  selectedId: string | null;
  activeScreenId: string | null;
  breakpoint: Breakpoint;
  leftTab: 'insert' | 'layers';
  leftCollapsed: boolean;
  leftFlyout: boolean;
  chatExpanded: boolean;
  setChatExpanded: (expanded: boolean) => void;
  railCollapsed: boolean;
  mobileRailOpen: boolean;
  propertiesOpen: boolean;
  /** The user pressed minimize; selecting a node must not undo that. */
  inspectorCollapsed: boolean;
  /** The user pressed maximize: the panel takes the wide width. */
  inspectorWide: boolean;
  setPropertiesOpen: (open: boolean) => void;
  setInspectorWide: (wide: boolean) => void;
  minimizeInspector: () => void;
  restoreInspector: () => void;
  toggleInspector: () => void;
  runMode: boolean;
  runScreenId: string | null;
  onboardingOpen: boolean;
  settingsOpen: boolean;
  exportOpen: boolean;
  receiptsOpen: boolean;
  shortcutsOpen: boolean;
  blueprintOpen: boolean;
  colorCard: ColorCardRequest | null;
  theme: 'dark' | 'light' | 'auto';
  toasts: Toast[];
  paletteFilter: string;
  draft: string;
  activePreset: string | null;
  setRoute: (r: Route) => void;
  select: (id: string | null) => void;
  setActiveScreen: (id: string) => void;
  setBreakpoint: (b: Breakpoint) => void;
  setLeftTab: (t: 'insert' | 'layers') => void;
  setLeftFlyout: (open: boolean) => void;
  toggleLeft: () => void;
  toggleRail: () => void;
  setMobileRail: (open: boolean) => void;
  setRunMode: (on: boolean, screenId?: string) => void;
  setModal: (
    key:
      | 'onboardingOpen'
      | 'settingsOpen'
      | 'exportOpen'
      | 'receiptsOpen'
      | 'shortcutsOpen'
      | 'blueprintOpen',
    open: boolean,
  ) => void;
  setColorCard: (req: ColorCardRequest | null) => void;
  setTheme: (t: 'dark' | 'light' | 'auto') => void;
  toast: (text: string, tone?: Toast['tone']) => void;
  dismissToast: (id: string) => void;
  setPaletteFilter: (f: string) => void;
  startPrompt: (text: string) => void;
  setDraft: (text: string) => void;
  setActivePreset: (p: string | null) => void;
}

let toastSeq = 0;

function readPreferences() {
  try {
    const raw = JSON.parse(localStorage.getItem('museware/preferences') || '{}');
    return {
      breakpoint: (['compact', 'medium', 'expanded'].includes(raw.breakpoint)
        ? raw.breakpoint
        : 'compact') as Breakpoint,
      leftTab: (raw.leftTab === 'layers' ? 'layers' : 'insert') as 'insert' | 'layers',
      leftCollapsed: raw.leftCollapsed === true,
      railCollapsed: raw.railCollapsed === true,
      inspectorCollapsed: raw.inspectorCollapsed === true,
      inspectorWide: raw.inspectorWide === true,
      paletteFilter:
        typeof raw.paletteFilter === 'string' ? raw.paletteFilter.slice(0, 200) : '',
    };
  } catch {
    return {
      breakpoint: 'compact' as Breakpoint,
      leftTab: 'insert' as const,
      leftCollapsed: false,
      railCollapsed: false,
      inspectorCollapsed: false,
      inspectorWide: false,
      paletteFilter: '',
    };
  }
}
const preferences = readPreferences();

export const useUi = create<UiStore>((set, get) => ({
  route: (typeof window !== 'undefined' && window.location.hash.startsWith('#/app')
    ? 'editor'
    : typeof window !== 'undefined' && window.location.hash.startsWith('#/gallery')
      ? 'gallery'
      : 'landing') as Route,
  selectedId: null,
  activeScreenId: null,
  breakpoint: preferences.breakpoint,
  leftTab: preferences.leftTab,
  leftCollapsed: preferences.leftCollapsed,
  leftFlyout: false,
  railCollapsed: preferences.railCollapsed,
  chatExpanded: (() => {
    try {
      return localStorage.getItem('museware/chatExpanded') === '1';
    } catch {
      return false;
    }
  })(),
  setChatExpanded: (chatExpanded) => {
    try {
      localStorage.setItem('museware/chatExpanded', chatExpanded ? '1' : '0');
    } catch {
      /* storage unavailable */
    }
    set({ chatExpanded });
  },
  mobileRailOpen: false,
  propertiesOpen: false,
  inspectorCollapsed: preferences.inspectorCollapsed,
  inspectorWide: preferences.inspectorWide,
  runMode: false,
  runScreenId: null,
  onboardingOpen: false,
  settingsOpen: false,
  exportOpen: false,
  receiptsOpen: false,
  shortcutsOpen: false,
  blueprintOpen: false,
  colorCard: null,
  theme: (() => {
    try {
      const saved = localStorage.getItem('museware/theme');
      return saved === 'light' || saved === 'auto' || saved === 'dark' ? saved : 'dark';
    } catch {
      return 'dark' as const;
    }
  })(),
  toasts: [],
  paletteFilter: preferences.paletteFilter,
  draft: '',
  activePreset: null,

  setRoute: (route) => {
    if (typeof window !== 'undefined') {
      const hash = route === 'editor' ? '#/app' : route === 'gallery' ? '#/gallery' : '#/';
      if (window.location.hash !== hash) window.history.pushState(null, '', hash);
    }
    set({ route });
  },
  // Selecting a node opens the panel unless the user minimized it on purpose.
  select: (selectedId) =>
    set((s) => ({
      selectedId,
      propertiesOpen: selectedId ? s.propertiesOpen || !s.inspectorCollapsed : false,
    })),
  setPropertiesOpen: (propertiesOpen) => set({ propertiesOpen, inspectorCollapsed: false }),
  setInspectorWide: (inspectorWide) => set({ inspectorWide }),
  minimizeInspector: () => set({ propertiesOpen: false, inspectorCollapsed: true }),
  restoreInspector: () => set({ propertiesOpen: true, inspectorCollapsed: false }),
  toggleInspector: () =>
    set((s) =>
      s.propertiesOpen && !s.inspectorCollapsed
        ? { propertiesOpen: false, inspectorCollapsed: true }
        : { propertiesOpen: true, inspectorCollapsed: false },
    ),
  setActiveScreen: (activeScreenId) => set({ activeScreenId, selectedId: null }),
  setBreakpoint: (breakpoint) => set({ breakpoint }),
  setLeftTab: (leftTab) => set({ leftTab }),
  setLeftFlyout: (leftFlyout) => set({ leftFlyout }),
  toggleLeft: () => set((s) => ({ leftCollapsed: !s.leftCollapsed })),
  toggleRail: () => set((s) => ({ railCollapsed: !s.railCollapsed })),
  setMobileRail: (mobileRailOpen) => {
    set({ mobileRailOpen });
    if (mobileRailOpen) get().setChatExpanded(true);
  },
  setRunMode: (runMode, screenId) =>
    set((s) => ({
      runMode,
      runScreenId: runMode ? screenId || s.activeScreenId : null,
      selectedId: runMode ? null : s.selectedId,
      mobileRailOpen: false,
    })),
  setModal: (key, open) =>
    set(() => {
      const patch: Record<string, boolean> = {
        onboardingOpen: false,
        settingsOpen: false,
        exportOpen: false,
        receiptsOpen: false,
        shortcutsOpen: false,
        blueprintOpen: false,
      };
      if (open) patch[key] = true;
      return patch;
    }),
  setColorCard: (colorCard) => set({ colorCard }),
  setTheme: (theme) => {
    if (typeof document !== 'undefined') {
      const resolved =
        theme === 'auto'
          ? window.matchMedia('(prefers-color-scheme: light)').matches
            ? 'light'
            : 'dark'
          : theme;
      document.documentElement.dataset.mwTheme = resolved;
    }
    try {
      localStorage.setItem('museware/theme', theme);
    } catch {
      /* private mode */
    }
    set({ theme });
  },
  toast: (text, tone = 'neutral') => {
    toastSeq += 1;
    const id = `t${toastSeq}`;
    set((s) => ({ toasts: [...s.toasts, { id, text, tone }].slice(-3) }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 4200);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setPaletteFilter: (paletteFilter) => set({ paletteFilter }),
  startPrompt: (text) => {
    set({ draft: text, railCollapsed: false, mobileRailOpen: true });
    get().setChatExpanded(true);
  },
  setDraft: (draft) => set({ draft }),
  setActivePreset: (activePreset) => set({ activePreset }),
}));

export interface RailDraft {
  entry: RailEntry;
  tokens?: DesignTokens;
}

useUi.subscribe((state, previous) => {
  const keys = [
    'breakpoint',
    'leftTab',
    'leftCollapsed',
    'railCollapsed',
    'inspectorCollapsed',
    'inspectorWide',
    'paletteFilter',
  ] as const;
  if (keys.every((key) => state[key] === previous[key])) return;
  try {
    const {
      breakpoint,
      leftTab,
      leftCollapsed,
      railCollapsed,
      inspectorCollapsed,
      inspectorWide,
      paletteFilter,
    } = state;
    localStorage.setItem(
      'museware/preferences',
      JSON.stringify({
        breakpoint,
        leftTab,
        leftCollapsed,
        railCollapsed,
        inspectorCollapsed,
        inspectorWide,
        paletteFilter,
      }),
    );
  } catch {
    /* storage unavailable */
  }
});
