import { openDB, type IDBPDatabase } from 'idb';
import type { ProjectDoc } from '../types/tree';
import { parseProjectDoc } from './schema';

const DB_NAME = 'museware';
const STORE = 'projects';
const KEY = 'current';

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE);
      },
    });
  }
  return dbPromise;
}

export async function loadProject(): Promise<ProjectDoc | null> {
  try {
    const raw = await (await db()).get(STORE, KEY);
    if (!raw) return null;
    return parseProjectDoc(raw);
  } catch (err) {
    console.warn('museware: could not read local project', err);
    return null;
  }
}

let timer: ReturnType<typeof setTimeout> | null = null;
let pending: ProjectDoc | null = null;

export function saveProjectSoon(doc: ProjectDoc) {
  pending = doc;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    const snapshot = pending;
    pending = null;
    if (snapshot) void saveProjectNow(snapshot);
  }, 800);
}

export async function saveProjectNow(doc: ProjectDoc): Promise<boolean> {
  try {
    await (await db()).put(STORE, JSON.parse(JSON.stringify(doc)), KEY);
    return true;
  } catch (err) {
    console.warn('museware: save failed', err);
    return false;
  }
}

export async function wipeProject(): Promise<void> {
  try {
    await (await db()).delete(STORE, KEY);
  } catch (err) {
    console.warn('museware: wipe failed', err);
  }
}

export function downloadProjectFile(doc: ProjectDoc) {
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${doc.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'project'}.museware.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2500);
}

export async function readProjectFile(file: File): Promise<ProjectDoc> {
  const text = await file.text();
  return parseProjectDoc(JSON.parse(text));
}

export async function readThemeFile(file: File): Promise<unknown> {
  return JSON.parse(await file.text());
}
