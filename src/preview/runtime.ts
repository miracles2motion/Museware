import { createContext, useContext } from 'react';
import type { Action, ScreenDoc } from '../types/tree';

export interface RuntimeApi {
  screenId: string;
  state: Record<string, unknown>;
  screens: ScreenDoc[];
  setKey: (key: string, value: unknown) => void;
  toast: (text: string) => void;
  navigate: (to: string) => void;
  openUrl: (url: string) => void;
}

export const RuntimeContext = createContext<RuntimeApi | null>(null);

export function useRuntime(): RuntimeApi | null {
  return useContext(RuntimeContext);
}

/** The whole no-code verb set, interpreted in order. Nested `when` is ≤2 deep. */
export function runActions(
  actions: Action[] | undefined,
  api: RuntimeApi,
  depth = 1,
): void {
  if (!actions || depth > 3) return;
  for (const action of actions) {
    switch (action.type) {
      case 'navigate':
        api.navigate(action.to);
        break;
      case 'setState':
        api.setKey(action.key, action.value);
        break;
      case 'toggle':
        api.setKey(action.key, !api.state[action.key]);
        break;
      case 'toast':
        api.toast(action.text);
        break;
      case 'openUrl':
        api.openUrl(action.url);
        break;
      case 'when': {
        const current = api.state[action.key];
        const matches =
          action.equals === undefined ? Boolean(current) : current === action.equals;
        if (matches) runActions(action.then, api, depth + 1);
        break;
      }
      default:
        break;
    }
  }
}

export function isVisible(
  node: { visibleWhen?: { key: string; equals?: string | number | boolean } },
  state: Record<string, unknown> | null,
): boolean {
  if (!node.visibleWhen) return true;
  if (!state) return true;
  const value = state[node.visibleWhen.key];
  if (node.visibleWhen.equals === undefined) return Boolean(value);
  return value === node.visibleWhen.equals;
}

export function screenSlugForLabel(screens: ScreenDoc[], label: string): string | null {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const hit = screens.find(
    (s) =>
      s.id === slug || s.id.includes(slug) || s.name.toLowerCase() === label.toLowerCase(),
  );
  return hit ? hit.id : null;
}
