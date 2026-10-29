import type {
  ComponentNode,
  Op,
  OpEntry,
  OpError,
  ProjectDoc,
  ScreenDoc,
  StyleSet,
} from '../types/tree';
import { opSchema } from '../types/tools';
import type { RawNode } from '../types/tools';
import { isContainerType } from '../types/library';
import {
  MAX_DEPTH,
  MAX_NODES,
  error,
  fieldIssues,
  hydrateNode,
  inspectSubtree,
  normalizeActions,
  normalizeStyles,
  screenOverLimit,
  takenIds,
  textish,
  treeTooDeep,
  withFreshIds,
} from './validate';
import {
  clone,
  countNodes,
  findNode,
  findNodeInDoc,
  findParent,
  isDescendant,
  maxDepth,
  walk,
} from './treeUtils';
import { ID_PATTERN, suggestIds } from './ids';

export interface ApplyOptions {
  source: 'agent' | 'user';
  /** Set by the turn loop: a second addScreen in one turn is E_BUILD_CARD. */
  screenAddsThisTurn?: number;
}

export interface ApplyResult {
  doc: ProjectDoc;
  errors: OpError[];
  summary: string;
  applied: Op[];
  screenAdded: boolean;
}

const containerIds = (doc: ProjectDoc): string[] => {
  const ids: string[] = [];
  for (const s of doc.screens)
    walk(s.root, (n) => {
      if (isContainerType(n.type)) ids.push(n.id);
    });
  return ids;
};

function isClear(value: unknown): boolean {
  // `undefined` / '' means "clear": the inspector's revert-to-inherit and the
  // palette's transparent swatch both write it. Empty CSS is not a value.
  return value === undefined || value === '';
}

function stripUndefined(target: StyleSet, patch: StyleSet) {
  for (const key of Object.keys(patch)) {
    if (isClear(patch[key])) delete target[key];
  }
}

function mergeStyles(base: StyleSet, patch: StyleSet): StyleSet {
  const next: StyleSet = { ...base, ...patch };
  stripUndefined(next, patch);
  if (patch.responsive || base.responsive) {
    next.responsive = {
      medium: { ...(base.responsive?.medium || {}), ...(patch.responsive?.medium || {}) },
      expanded: {
        ...(base.responsive?.expanded || {}),
        ...(patch.responsive?.expanded || {}),
      },
    };
    for (const bp of ['medium', 'expanded'] as const) {
      const patchBp = patch.responsive?.[bp];
      const merged = next.responsive[bp];
      if (patchBp && merged) stripUndefined(merged, patchBp);
    }
    if (!next.responsive.medium || !Object.keys(next.responsive.medium).length) {
      delete next.responsive.medium;
    }
    if (!next.responsive.expanded || !Object.keys(next.responsive.expanded).length) {
      delete next.responsive.expanded;
    }
  }
  return next;
}

function addScreenLimited(screen: ScreenDoc): OpError[] {
  if (screenOverLimit(screen)) {
    return [
      error(
        'E_COUNT',
        `${screen.id} has more than ${MAX_NODES} nodes`,
        'split across screens',
      ),
    ];
  }
  if (treeTooDeep(screen)) {
    return [
      error('E_DEPTH', `${screen.id} is deeper than ${MAX_DEPTH}`, 'flatten one level'),
    ];
  }
  return [];
}

function applyOne(
  doc: ProjectDoc,
  op: Op,
  options: ApplyOptions,
  index: number,
): OpError[] {
  const errors: OpError[] = [];
  const taken = takenIds(doc);

  switch (op.op) {
    case 'add': {
      const hit = findNodeInDoc(doc, op.parentId);
      if (!hit) {
        return [
          error(
            'E_NO_PARENT',
            `no node with id ${op.parentId}`,
            `containers: ${containerIds(doc).slice(0, 20).join(', ')}`,
            index,
          ),
        ];
      }
      if (!isContainerType(hit.node.type)) {
        return [
          error(
            'E_NOT_CONTAINER',
            `${hit.node.id} is a ${hit.node.type} (a leaf)`,
            'pick a container',
            index,
          ),
        ];
      }
      const raw = op.node as unknown as RawNode;
      // hydrateNode registers the fresh ids in `taken`, so snapshot the doc's
      // ids first — otherwise every add would report its own ids as taken.
      const existing = new Set(taken);
      const node = hydrateNode(raw, taken);
      const sub = inspectSubtree(node, doc, existing, op.parentId, { requireProps: true });
      if (sub.length) return sub.map((e) => ({ ...e, opIndex: index }));
      const parentDepth = depthOf(doc, op.parentId);
      if (parentDepth + maxDepth(node) - 1 > MAX_DEPTH) {
        return [
          error(
            'E_DEPTH',
            `adding ${node.id} would exceed depth ${MAX_DEPTH}`,
            'flatten the tree',
            index,
          ),
        ];
      }
      const at = Math.max(
        0,
        Math.min(op.index ?? hit.node.children.length, hit.node.children.length),
      );
      hit.node.children.splice(at, 0, node);
      if (screenOverLimit(hit.screen)) {
        return [
          error(
            'E_COUNT',
            `${hit.screen.id} exceeds ${MAX_NODES} nodes`,
            'split or remove',
            index,
          ),
        ];
      }
      break;
    }
    case 'remove': {
      const hit = findNodeInDoc(doc, op.id);
      if (!hit)
        return [
          error('E_NO_PARENT', `no node with id ${op.id}`, 'list the canvas first', index),
        ];
      if (hit.screen.root.id === op.id) {
        return [
          error(
            'E_BAD_OP',
            'the screen root cannot be removed',
            'remove the screen instead',
            index,
          ),
        ];
      }
      const parent = findParent(hit.screen.root, op.id);
      if (!parent)
        return [error('E_NO_PARENT', `no parent for ${op.id}`, undefined, index)];
      parent.parent.children.splice(parent.index, 1);
      break;
    }
    case 'move': {
      const hit = findNodeInDoc(doc, op.id);
      const target = findNodeInDoc(doc, op.parentId);
      if (!hit) return [error('E_NO_PARENT', `no node with id ${op.id}`, undefined, index)];
      if (!target)
        return [error('E_NO_PARENT', `no node with id ${op.parentId}`, undefined, index)];
      if (!isContainerType(target.node.type)) {
        return [error('E_NOT_CONTAINER', `${target.node.id} is a leaf`, undefined, index)];
      }
      if (hit.screen.root.id === op.id) {
        return [error('E_BAD_OP', 'the screen root cannot move', undefined, index)];
      }
      if (isDescendant(hit.screen.root, op.id, op.parentId) || op.id === op.parentId) {
        return [error('E_BAD_OP', 'cannot move a node inside itself', undefined, index)];
      }
      if (hit.screen.id !== target.screen.id) {
        return [
          error(
            'E_BAD_OP',
            'move is within one screen; use add + remove to cross screens',
            undefined,
            index,
          ),
        ];
      }
      const own = findParent(hit.screen.root, op.id);
      if (!own) return [error('E_NO_PARENT', `no parent for ${op.id}`, undefined, index)];
      own.parent.children.splice(own.index, 1);
      const at = Math.max(
        0,
        Math.min(op.index ?? target.node.children.length, target.node.children.length),
      );
      target.node.children.splice(at, 0, hit.node);
      if (treeTooDeep(hit.screen)) {
        return [
          error(
            'E_DEPTH',
            `${hit.screen.id} would exceed depth ${MAX_DEPTH}`,
            undefined,
            index,
          ),
        ];
      }
      break;
    }
    case 'setProps': {
      const hit = findNodeInDoc(doc, op.id);
      if (!hit) return [error('E_NO_PARENT', `no node with id ${op.id}`, undefined, index)];
      const incoming = { ...op.props };
      if ('events' in incoming) {
        const rawEvents = incoming.events as Record<string, unknown> | undefined;
        const next: ComponentNode['events'] = { ...(hit.node.events || {}) };
        for (const name of ['tap', 'change', 'submit'] as const) {
          if (rawEvents && name in rawEvents) {
            const list = normalizeActions(rawEvents[name]);
            if (list && list.length) next[name] = list;
            else delete next[name];
          }
        }
        hit.node.events = Object.keys(next).length ? next : undefined;
        delete incoming.events;
      }
      if ('visibleWhen' in incoming) {
        const vw = incoming.visibleWhen as ComponentNode['visibleWhen'] | null | undefined;
        if (vw && typeof vw === 'object' && typeof vw.key === 'string') {
          hit.node.visibleWhen = {
            key: vw.key,
            ...(vw.equals !== undefined ? { equals: vw.equals } : {}),
          };
        } else {
          delete hit.node.visibleWhen;
        }
        delete incoming.visibleWhen;
      }
      if ('id' in incoming) delete incoming.id;
      // A null/undefined prop value removes it — "revert to the component default".
      const dropped = Object.keys(incoming).filter(
        (key) => incoming[key] === null || incoming[key] === undefined,
      );
      const props = { ...hit.node.props, ...incoming };
      for (const key of dropped) delete props[key];
      hit.node.props = props;
      const issues = fieldIssues(hit.node, doc);
      if (issues.length) return issues.map((e) => ({ ...e, opIndex: index }));
      break;
    }
    case 'setStyles': {
      const hit = findNodeInDoc(doc, op.id);
      if (!hit) return [error('E_NO_PARENT', `no node with id ${op.id}`, undefined, index)];
      hit.node.styles = mergeStyles(hit.node.styles, normalizeStyles(op.styles));
      const issues = fieldIssues(hit.node, doc);
      if (issues.length) return issues.map((e) => ({ ...e, opIndex: index }));
      break;
    }
    case 'setText': {
      const hit = findNodeInDoc(doc, op.id);
      if (!hit) return [error('E_NO_PARENT', `no node with id ${op.id}`, undefined, index)];
      if (!textish(hit.node.type)) {
        return [
          error(
            'E_BAD_OP',
            `${hit.node.id} (${hit.node.type}) has no text`,
            'use setProps',
            index,
          ),
        ];
      }
      hit.node.props = { ...hit.node.props, text: op.text };
      break;
    }
    case 'rename': {
      const hit = findNodeInDoc(doc, op.id);
      if (!hit) return [error('E_NO_PARENT', `no node with id ${op.id}`, undefined, index)];
      hit.node.name = op.name.slice(0, 40);
      break;
    }
    case 'addScreen': {
      if ((options.screenAddsThisTurn || 0) >= 1) {
        return [
          error(
            'E_BUILD_CARD',
            'a second addScreen in one turn is blocked (law 12)',
            'end the turn with finish(); the user picks how to build',
            index,
          ),
        ];
      }
      const rawScreen = op.screen as unknown as {
        id: string;
        name: string;
        entry?: boolean;
        mockData?: ScreenDoc['mockData'];
        root: RawNode;
      };
      if (!ID_PATTERN.test(rawScreen.id) && !/^[a-z][a-z0-9_]{0,30}$/.test(rawScreen.id)) {
        return [
          error(
            'E_BAD_OP',
            `screen id "${rawScreen.id}" is not a slug`,
            'e.g. habit_tracker',
            index,
          ),
        ];
      }
      if (doc.screens.some((s) => s.id === rawScreen.id)) {
        const free = suggestIds(rawScreen.id, new Set(doc.screens.map((s) => s.id)));
        return [
          error(
            'E_NAME_TAKEN',
            `screen ${rawScreen.id} already exists`,
            `free: ${free.join(', ')}`,
            index,
          ),
        ];
      }
      if (rawScreen.root.type !== 'screen') {
        return [error('E_BAD_OP', 'a screen root must be type "screen"', undefined, index)];
      }
      const existing = new Set(taken);
      const root = hydrateNode(
        { ...rawScreen.root, id: rawScreen.root.id || `${rawScreen.id}_root` },
        taken,
      );
      const sub = inspectSubtree(root, doc, existing, rawScreen.id, { requireProps: true });
      if (sub.length) return sub.map((e) => ({ ...e, opIndex: index }));
      const screen: ScreenDoc = {
        id: rawScreen.id,
        name: rawScreen.name.slice(0, 40),
        root,
        ...(rawScreen.mockData ? { mockData: rawScreen.mockData } : {}),
      };
      const limits = addScreenLimited(screen);
      if (limits.length) return limits;
      const makeEntry = rawScreen.entry || doc.screens.length === 0;
      if (makeEntry) for (const s of doc.screens) delete s.entry;
      if (makeEntry) screen.entry = true;
      doc.screens.push(screen);
      break;
    }
    case 'removeScreen': {
      const idx = doc.screens.findIndex((s) => s.id === op.id);
      if (idx < 0) {
        return [
          error(
            'E_SCREEN_MISSING',
            `no screen ${op.id}`,
            `screens: ${doc.screens.map((s) => s.id).join(', ')}`,
            index,
          ),
        ];
      }
      if (doc.screens.length === 1) {
        return [error('E_BAD_OP', 'the last screen cannot be removed', undefined, index)];
      }
      const wasEntry = doc.screens[idx].entry;
      doc.screens.splice(idx, 1);
      if (wasEntry && doc.screens[0]) doc.screens[0].entry = true;
      break;
    }
    case 'renameScreen': {
      const screen = doc.screens.find((s) => s.id === op.id);
      if (!screen) {
        return [
          error(
            'E_SCREEN_MISSING',
            `no screen ${op.id}`,
            `screens: ${doc.screens.map((s) => s.id).join(', ')}`,
            index,
          ),
        ];
      }
      screen.name = op.name.slice(0, 40);
      break;
    }
    case 'setEntry': {
      const screen = doc.screens.find((s) => s.id === op.id);
      if (!screen) {
        return [
          error(
            'E_SCREEN_MISSING',
            `no screen ${op.id}`,
            `screens: ${doc.screens.map((s) => s.id).join(', ')}`,
            index,
          ),
        ];
      }
      for (const s of doc.screens) delete s.entry;
      screen.entry = true;
      break;
    }
    case 'setTokens': {
      const patch = op.patch as Record<string, unknown>;
      const theme = doc.tokens.openuiTheme;
      const hexish = /^#[0-9A-Fa-f]{6}$/;
      const checkColors = (map: unknown, label: string): OpError[] => {
        if (!map || typeof map !== 'object') return [];
        const out: OpError[] = [];
        for (const [k, v] of Object.entries(map as Record<string, unknown>)) {
          if (typeof v !== 'string' || !hexish.test(v)) {
            out.push(
              error(
                'E_BAD_OP',
                `${label}.${k} is not a six-digit hex colour`,
                'e.g. 6D5CFF with a leading hash',
                index,
              ),
            );
          }
        }
        return out;
      };
      const colorErrors = [
        ...checkColors(patch.light_colors, 'light_colors'),
        ...checkColors(patch.dark_colors, 'dark_colors'),
      ];
      if (colorErrors.length) return colorErrors;
      for (const key of ['brand_color', 'secondary_color'] as const) {
        const v = patch[key];
        if (v !== undefined && (typeof v !== 'string' || !hexish.test(v))) {
          return [
            error('E_BAD_OP', `${key} must be a six-digit hex colour`, undefined, index),
          ];
        }
      }
      const nextTheme = { ...theme };
      if (typeof patch.title === 'string') doc.tokens.title = patch.title;
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) continue;
        const nt = nextTheme as unknown as Record<string, unknown>;
        if (
          k === 'light_colors' ||
          k === 'dark_colors' ||
          k === 'radii_dp' ||
          k === 'metrics_dp'
        ) {
          nt[k] = {
            ...((nt[k] as Record<string, unknown>) || {}),
            ...(v as Record<string, unknown>),
          };
        } else if (k === 'foundations' && v && typeof v === 'object') {
          nextTheme.foundations = {
            ...(nextTheme.foundations || {}),
            ...(v as Record<string, unknown>),
          };
        } else {
          nt[k] = v;
        }
      }
      const applyPalette = (
        mode: 'light_colors' | 'dark_colors',
        brand: string,
        secondary: string,
      ) => {
        const colors = { ...((nextTheme[mode] as Record<string, string>) || {}) };
        colors.openui_accent = brand;
        colors.openui_accent_pressed = brand;
        colors.openui_text_brand = brand;
        colors.openui_border_accent = brand;
        colors.openui_secondary = secondary;
        nextTheme[mode] = colors;
      };
      const brand =
        typeof patch.brand_color === 'string'
          ? patch.brand_color
          : String(nextTheme.brand_color);
      const secondary =
        typeof patch.secondary_color === 'string'
          ? patch.secondary_color
          : String(nextTheme.secondary_color);
      nextTheme.brand_color = brand;
      nextTheme.secondary_color = secondary;
      if (
        typeof patch.brand_color === 'string' ||
        typeof patch.secondary_color === 'string'
      ) {
        applyPalette('light_colors', brand, secondary);
        applyPalette('dark_colors', brand, secondary);
      }
      doc.tokens.openuiTheme = nextTheme;
      break;
    }
    case 'saveComponent': {
      if (doc.customComponents.some((c) => c.name === op.name)) {
        return [
          error(
            'E_NAME_TAKEN',
            `a component named ${op.name} exists`,
            `free: ${suggestIds(op.name, new Set(doc.customComponents.map((c) => c.name))).join(', ')}`,
            index,
          ),
        ];
      }
      if (!ID_PATTERN.test(op.name)) {
        return [
          error('E_BAD_OP', 'component names follow the id rules', 'e.g. habit_row', index),
        ];
      }
      const root = hydrateNode(op.root as unknown as RawNode, taken, {
        forceId: op.root.id,
      });
      const sub = inspectSubtree(root, doc, new Set(), op.name);
      if (sub.length) return sub.map((e) => ({ ...e, opIndex: index }));
      doc.customComponents.push({
        name: op.name,
        description: op.description.slice(0, 120),
        root,
      });
      break;
    }
    case 'placeComponent': {
      const comp = doc.customComponents.find((c) => c.name === op.name);
      if (!comp) {
        return [
          error(
            'E_BAD_OP',
            `no custom component ${op.name}`,
            `available: ${doc.customComponents.map((c) => c.name).join(', ') || 'none'}`,
            index,
          ),
        ];
      }
      const hit = findNodeInDoc(doc, op.parentId);
      if (!hit) return [error('E_NO_PARENT', `no node ${op.parentId}`, undefined, index)];
      if (!isContainerType(hit.node.type)) {
        return [error('E_NOT_CONTAINER', `${hit.node.id} is a leaf`, undefined, index)];
      }
      const copy = withFreshIds(comp.root, op.name, taken);
      const at = Math.max(
        0,
        Math.min(op.index ?? hit.node.children.length, hit.node.children.length),
      );
      hit.node.children.splice(at, 0, copy);
      if (screenOverLimit(hit.screen)) {
        return [
          error('E_COUNT', `${hit.screen.id} exceeds ${MAX_NODES} nodes`, undefined, index),
        ];
      }
      break;
    }
    default:
      return [error('E_BAD_OP', 'unknown op', undefined, index)];
  }
  return errors;
}

function depthOf(doc: ProjectDoc, id: string): number {
  for (const screen of doc.screens) {
    const found = findNode(screen.root, id);
    if (!found) continue;
    let depth = 1;
    let cursor: ComponentNode | null = found;
    for (;;) {
      const parent: { parent: ComponentNode; index: number } | null = cursor
        ? findParent(screen.root, cursor.id)
        : null;
      if (!parent) break;
      depth += 1;
      cursor = parent.parent;
    }
    return depth;
  }
  return 0;
}

export function summarize(batch: Op[]): string {
  const counts: Record<string, number> = {};
  for (const op of batch) counts[op.op] = (counts[op.op] || 0) + 1;
  const parts: string[] = [];
  if (counts.add) parts.push(`add ${counts.add}`);
  if (counts.addScreen) parts.push(`${counts.addScreen} screen`);
  if (counts.setStyles) parts.push(`style ${counts.setStyles}`);
  if (counts.setProps) parts.push(`props ${counts.setProps}`);
  if (counts.setText) parts.push(`text ${counts.setText}`);
  if (counts.remove) parts.push(`remove ${counts.remove}`);
  if (counts.move) parts.push(`move ${counts.move}`);
  if (counts.setTokens) parts.push('design tokens');
  if (counts.saveComponent) parts.push('save component');
  if (counts.placeComponent) parts.push('place component');
  if (counts.rename) parts.push('rename');
  if (counts.removeScreen) parts.push('remove screen');
  if (counts.renameScreen) parts.push('rename screen');
  if (counts.setEntry) parts.push('entry screen');
  const tail = parts.join(' + ') || `${batch.length} ops`;
  return tail;
}

/**
 * The single mutation point. Validates and applies a whole batch on a clone;
 * ANY failure means nothing from the batch lands (all-or-nothing, §3.3).
 */
export function applyOps(
  rawOps: unknown[],
  doc: ProjectDoc,
  options: ApplyOptions,
): ApplyResult {
  const parsed: Op[] = [];
  const errors: OpError[] = [];
  rawOps.forEach((raw, i) => {
    const r = opSchema.safeParse(raw);
    if (!r.success) {
      const issue = r.error.issues[0];
      errors.push(
        error(
          'E_BAD_OP',
          `${issue.path.join('.') || 'op'}: ${issue.message}`,
          'fix the offending field and retry strict JSON',
          i,
        ),
      );
      return;
    }
    parsed.push(r.data as unknown as Op);
  });
  if (errors.length)
    return { doc, errors, summary: 'rejected', applied: [], screenAdded: false };

  const next = clone(doc);
  let screenAdds = options.screenAddsThisTurn || 0;
  let screenAdded = false;
  for (let i = 0; i < parsed.length; i += 1) {
    const op = parsed[i];
    const opErrors = applyOne(next, op, { ...options, screenAddsThisTurn: screenAdds }, i);
    if (opErrors.length) {
      return {
        doc,
        errors: opErrors,
        summary: 'rejected',
        applied: [],
        screenAdded: false,
      };
    }
    if (op.op === 'addScreen') {
      screenAdds += 1;
      screenAdded = true;
    }
  }

  const summary = summarize(parsed);
  const entry: OpEntry = { at: Date.now(), source: options.source, batch: parsed, summary };
  next.opLog = [...next.opLog, entry].slice(-2000);
  next.updatedAt = Date.now();
  return { doc: next, errors: [], summary, applied: parsed, screenAdded };
}

export function nodeCountOf(doc: ProjectDoc): number {
  return doc.screens.reduce((n, s) => n + countNodes(s.root), 0);
}

export { normalizeStyles };
