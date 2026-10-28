import type { ComponentNode, ComponentType, ProjectDoc, ScreenDoc } from '../types/tree';
import { defaultStylesFor, isContainerType } from '../types/library';
import { hydrateNode, takenIds } from './validate';
import { findNode, findParent } from './treeUtils';
import { slugify } from './ids';

export function emptyScreen(
  name: string,
  opts: { entry?: boolean; id?: string } = {},
): ScreenDoc {
  const base = opts.id || slugify(name) || 'screen';
  return {
    id: base,
    name,
    ...(opts.entry ? { entry: true } : {}),
    root: {
      id: `${base}_root`.slice(0, 31),
      type: 'screen',
      name: 'Screen',
      props: { title: name, layout: 'flex-col', scroll: true },
      styles: { ...defaultStylesFor('screen') },
      children: [],
    },
  };
}

export function addScreenBatch(doc: ProjectDoc, name: string): unknown[] {
  const used = new Set(doc.screens.map((s) => s.id));
  let base = slugify(name) || 'screen';
  let n = 2;
  while (used.has(base)) {
    base = `${slugify(name)}_${n}`.slice(0, 31);
    n += 1;
  }
  const screen = emptyScreen(name, { id: base, entry: doc.screens.length === 0 });
  return [{ op: 'addScreen', screen }];
}

export function duplicateScreenBatch(doc: ProjectDoc, screenId: string): unknown[] {
  const source = doc.screens.find((s) => s.id === screenId);
  if (!source) return [];
  const used = new Set(doc.screens.map((s) => s.id));
  let base = `${source.id}_copy`;
  let n = 2;
  while (used.has(base)) {
    base = `${source.id}_copy${n}`;
    n += 1;
  }
  const taken = takenIds(doc);
  const cloneNode = (node: ComponentNode): ComponentNode => {
    const fresh = hydrateNode(
      {
        type: node.type,
        props: JSON.parse(JSON.stringify(node.props)),
        styles: JSON.parse(JSON.stringify(node.styles)),
        ...(node.events ? { events: node.events } : {}),
        ...(node.visibleWhen ? { visibleWhen: node.visibleWhen } : {}),
        ...(node.name ? { name: node.name } : {}),
      },
      taken,
    );
    fresh.children = node.children.map(cloneNode);
    return fresh;
  };
  const root = cloneNode(source.root);
  return [
    {
      op: 'addScreen',
      screen: {
        id: base,
        name: `${source.name} copy`,
        root: { ...root, id: `${base}_root`.slice(0, 31) },
        ...(source.mockData ? { mockData: source.mockData } : {}),
      },
    },
  ];
}

export function insertNodeBatch(
  doc: ProjectDoc,
  type: ComponentType,
  parentId?: string | null,
): { ops: unknown[]; parentId: string } | { error: string } {
  const screen =
    doc.screens.find((s) => (parentId ? findNode(s.root, parentId) : false)) ||
    doc.screens.find((s) => s.entry) ||
    doc.screens[0];
  if (!screen) return { error: 'Create a screen first.' };
  let parent: ComponentNode = screen.root;
  if (parentId) {
    const hit = findNode(screen.root, parentId);
    if (hit) {
      parent = isContainerType(hit.type)
        ? hit
        : findParent(screen.root, hit.id)?.parent || screen.root;
    }
  }
  const taken = takenIds(doc);
  const node = hydrateNode({ type }, taken);
  return {
    ops: [{ op: 'add', parentId: parent.id, index: parent.children.length, node }],
    parentId: parent.id,
  };
}

export function deleteScreenBatch(doc: ProjectDoc, screenId: string): unknown[] {
  if (doc.screens.length <= 1) return [];
  return [{ op: 'removeScreen', id: screenId }];
}

export function renameScreenBatch(
  doc: ProjectDoc,
  screenId: string,
  name: string,
): unknown[] {
  const screen = doc.screens.find((s) => s.id === screenId);
  if (!screen) return [];
  return [{ op: 'renameScreen', id: screenId, name }];
}

export function setEntryScreen(doc: ProjectDoc, screenId: string): boolean {
  return doc.screens.some((s) => s.id === screenId);
}

export function duplicateNodeBatch(
  doc: ProjectDoc,
  nodeId: string,
): { ops: unknown[] } | { error: string } {
  const screen = doc.screens.find((s) => findNode(s.root, nodeId));
  if (!screen) return { error: 'Select a node first.' };
  const node = findNode(screen.root, nodeId);
  if (!node) return { error: 'That node is gone.' };
  if (screen.root.id === nodeId) return { error: 'The screen root cannot be duplicated.' };
  const parent = findParent(screen.root, nodeId);
  if (!parent) return { error: 'No parent for that node.' };
  const taken = takenIds(doc);
  const cloneNode = (src: ComponentNode): ComponentNode => {
    const fresh = hydrateNode(
      {
        type: src.type,
        props: JSON.parse(JSON.stringify(src.props)),
        styles: JSON.parse(JSON.stringify(src.styles)),
        ...(src.events ? { events: src.events } : {}),
        ...(src.visibleWhen ? { visibleWhen: src.visibleWhen } : {}),
      },
      taken,
    );
    fresh.children = src.children.map(cloneNode);
    return fresh;
  };
  const copy = cloneNode(node);
  return {
    ops: [{ op: 'add', parentId: parent.parent.id, index: parent.index + 1, node: copy }],
  };
}
