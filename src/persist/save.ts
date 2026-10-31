import { openDB, type IDBPDatabase } from 'idb';
import { nanoid } from 'nanoid';
import type { ProjectDoc } from '../types/tree';
import { parseProjectDoc } from './schema';

const DB_NAME = 'museware';
const STORE = 'projects';
const META = 'meta';
const LEGACY = 'current';
const ACTIVE = 'active';
export interface ProjectMeta {
  id: string;
  name: string;
  updatedAt: number;
  screenCount: number;
  kind?: 'web' | 'app';
}
let dbPromise: Promise<IDBPDatabase> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let pending: { id: string; doc: ProjectDoc; onError?: (err: unknown) => void } | null =
  null;
let writes: Promise<void> = Promise.resolve();

function db(): Promise<IDBPDatabase> {
  if (!dbPromise)
    dbPromise = openDB(DB_NAME, 2, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE);
        if (!database.objectStoreNames.contains(META)) database.createObjectStore(META);
      },
    });
  return dbPromise;
}
function metadata(id: string, doc: ProjectDoc): ProjectMeta {
  return {
    id,
    name: doc.name,
    updatedAt: doc.updatedAt,
    screenCount: doc.screens.length,
    kind: doc.kind,
  };
}
/** Atomically copy legacy data without deleting the original recovery copy. */
export async function migrateCurrent(): Promise<void> {
  const database = await db();
  const tx = database.transaction([STORE, META], 'readwrite');
  const projects = tx.objectStore(STORE),
    meta = tx.objectStore(META);
  const old = await projects.get(LEGACY);
  const migrated = await meta.get('legacy-migrated');
  let migratedId: string | null = null;
  if (old && !migrated) {
    const doc = parseProjectDoc(old);
    const id = `p_${nanoid()}`;
    await projects.put(old, id);
    await meta.put(metadata(id, doc), `project:${id}`);
    migratedId = id;
    await meta.put(true, 'legacy-migrated');
  }
  await tx.done;
  if (migratedId) await openProject(migratedId);
}
export async function listProjects(): Promise<ProjectMeta[]> {
  await migrateCurrent();
  const values = await (await db()).getAll(META);
  return values
    .filter(
      (v): v is ProjectMeta =>
        v &&
        typeof v === 'object' &&
        typeof v.id === 'string' &&
        typeof v.name === 'string',
    )
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
async function writeProject(id: string, doc: ProjectDoc, creating = false): Promise<void> {
  const tx = (await db()).transaction([STORE, META], 'readwrite');
  if (!creating && (await tx.objectStore(STORE).getKey(id)) === undefined) {
    await tx.done;
    throw new Error('This project was deleted in another tab; changes were not saved.');
  }
  await tx.objectStore(STORE).put(JSON.parse(JSON.stringify(doc)), id);
  await tx
    .objectStore(META)
    .put({ ...metadata(id, doc), updatedAt: Date.now() }, `project:${id}`);
  await tx.done;
}
function enqueue(id: string, doc: ProjectDoc, creating = false): Promise<void> {
  const task = writes.catch(() => {}).then(() => writeProject(id, doc, creating));
  writes = task;
  return task;
}
export async function flushProject(): Promise<void> {
  if (timer) clearTimeout(timer);
  timer = null;
  const snapshot = pending;
  pending = null;
  if (snapshot) {
    try {
      await enqueue(snapshot.id, snapshot.doc);
    } catch (err) {
      console.warn('museware: save failed', err);
      snapshot.onError?.(err);
    }
  } else await writes.catch(() => {});
}
/** Read for a thumbnail without changing the active project or its autosave key. */
export async function readSavedProject(id: string): Promise<ProjectDoc | null> {
  if (id === LEGACY) return null;
  const raw = await (await db()).get(STORE, id);
  return raw ? parseProjectDoc(raw) : null;
}
export async function openProject(id: string): Promise<ProjectDoc | null> {
  await flushProject();
  if (id === LEGACY) return null;
  const tx = (await db()).transaction([STORE, META], 'readwrite');
  const raw = await tx.objectStore(STORE).get(id);
  if (!raw) {
    await tx.done;
    return null;
  }
  const doc = parseProjectDoc(raw);
  await tx.objectStore(META).put(id, ACTIVE);
  await tx.done;
  return doc;
}
export async function closeProject(id?: string | null): Promise<void> {
  await flushProject();
  const tx = (await db()).transaction(META, 'readwrite');
  if (!id || (await tx.store.get(ACTIVE)) === id) await tx.store.delete(ACTIVE);
  await tx.done;
}
export async function getActiveProjectId(): Promise<string | null> {
  await migrateCurrent();
  const id = await (await db()).get(META, ACTIVE);
  return typeof id === 'string' ? id : null;
}
export async function loadProject(): Promise<ProjectDoc | null> {
  try {
    const id = await getActiveProjectId();
    return id ? await openProject(id) : null;
  } catch (err) {
    console.warn('museware: could not read local project', err);
    return null;
  }
}
export async function createSavedProject(doc: ProjectDoc): Promise<string> {
  const id = `p_${nanoid()}`;
  await enqueue(id, doc, true);
  return id;
}
export function saveProjectSoon(
  id: string,
  doc: ProjectDoc,
  onError?: (err: unknown) => void,
) {
  if (pending && pending.id !== id) void flushProject();
  pending = { id, doc, onError };
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    void flushProject();
  }, 800);
}
export async function saveProjectNow(id: string, doc: ProjectDoc): Promise<boolean> {
  try {
    await enqueue(id, doc);
    return true;
  } catch (err) {
    console.warn('museware: save failed', err);
    return false;
  }
}
export async function renameSavedProject(id: string, name: string): Promise<void> {
  await flushProject();
  const raw = await (await db()).get(STORE, id);
  if (!raw) throw new Error('Project not found');
  const doc = parseProjectDoc(raw);
  await enqueue(id, {
    ...doc,
    name: name.trim().slice(0, 80) || doc.name,
    updatedAt: Date.now(),
  });
}
export async function duplicateSavedProject(id: string): Promise<string> {
  await flushProject();
  const raw = await (await db()).get(STORE, id);
  if (!raw) throw new Error('Project not found');
  const doc = parseProjectDoc(raw);
  return createSavedProject({
    ...doc,
    name: `${doc.name.slice(0, 72)} copy`,
    updatedAt: Date.now(),
  });
}
export async function deleteSavedProject(id: string): Promise<void> {
  await flushProject();
  const tx = (await db()).transaction([STORE, META], 'readwrite');
  await tx.objectStore(STORE).delete(id);
  await tx.objectStore(META).delete(`project:${id}`);
  await tx.done;
  const active = await (await db()).get(META, ACTIVE);
  if (active === id) await closeProject(id);
}
export async function wipeProject(id: string, replacement: ProjectDoc): Promise<void> {
  await flushProject();
  await enqueue(id, replacement);
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
