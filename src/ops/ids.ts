import type { ComponentType, ComponentNode, ProjectDoc } from '../types/tree';

const PREFIX: Partial<Record<ComponentType, string>> = {
  screen: 'scr',
  row: 'row',
  col: 'col',
  grid: 'grid',
  card: 'card',
  hero: 'hero',
  section: 'sec',
  form: 'form',
  tabs: 'tabs',
  heading: 'txt',
  text: 'txt',
  label: 'lbl',
  badge: 'chip',
  divider: 'div',
  icon: 'ico',
  image: 'img',
  avatar: 'img',
  progress: 'bar',
  spinner: 'spin',
  button: 'btn',
  iconbutton: 'btn',
  input: 'input',
  textarea: 'input',
  select: 'input',
  checkbox: 'chk',
  switch: 'sw',
  slider: 'slider',
  datepicker: 'date',
  navbar: 'nav',
  bottomnav: 'nav',
  link: 'link',
  fab: 'fab',
  list: 'list',
  table: 'tbl',
  stat: 'stat',
  chart: 'chart',
};

export const ID_PATTERN = /^[a-z][a-z0-9_]{2,30}$/;

export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30);
  return /^[a-z]/.test(slug) ? slug : `s_${slug || 'screen'}`.slice(0, 31);
}

export function prefixFor(type: ComponentType): string {
  return PREFIX[type] || 'node';
}

let counter = 0;
function entropy(): string {
  counter = (counter + 1) % 4096;
  const n = Math.floor(Math.random() * 46656).toString(36);
  return `${n}${counter.toString(36)}`.slice(-4);
}

export function generateId(type: ComponentType, taken: Set<string>): string {
  const base = prefixFor(type);
  for (let i = 0; i < 100; i += 1) {
    const id = `${base}_${entropy()}`.slice(0, 18);
    if (!taken.has(id)) return id;
  }
  let n = 1;
  while (taken.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

export function collectIds(node: ComponentNode, into = new Set<string>()): Set<string> {
  into.add(node.id);
  for (const c of node.children || []) collectIds(c, into);
  return into;
}

export function projectIds(doc: ProjectDoc): Set<string> {
  const ids = new Set<string>();
  for (const s of doc.screens) collectIds(s.root, ids);
  return ids;
}

/** Suggested free ids for E_NAME_TAKEN guidance. */
export function suggestIds(base: string, taken: Set<string>): string[] {
  const stem = ID_PATTERN.test(base) ? base : `node_${slugify(base)}`.slice(0, 24);
  const out: string[] = [];
  for (let i = 2; out.length < 3 && i < 400; i += 1) {
    const candidate = `${stem}_${i}`.slice(0, 31);
    if (!taken.has(candidate) && ID_PATTERN.test(candidate)) out.push(candidate);
  }
  return out;
}
