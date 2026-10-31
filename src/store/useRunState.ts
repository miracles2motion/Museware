import { create } from 'zustand';

/** Ephemeral values for the currently running preview; never persisted. */
export const useRunState = create<{ values: Record<string, unknown> }>(() => ({
  values: {},
}));
