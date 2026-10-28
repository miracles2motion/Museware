const STORAGE = 'museware/session-key';

/** A pasted key lives in sessionStorage only — it dies with the tab. */
export function getSessionKey(): string {
  try {
    return sessionStorage.getItem(STORAGE) || '';
  } catch {
    return '';
  }
}

export function setSessionKey(key: string): void {
  try {
    if (key) sessionStorage.setItem(STORAGE, key.trim());
    else sessionStorage.removeItem(STORAGE);
  } catch {
    /* storage blocked — key stays in memory for this page only */
  }
}

export function hasSessionKey(): boolean {
  return Boolean(getSessionKey());
}
