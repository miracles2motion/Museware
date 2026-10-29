import type {
  Action,
  ComponentNode,
  ComponentType,
  OpError,
  ProjectDoc,
  ScreenDoc,
  StyleSet,
} from '../types/tree';
import type { RawNode } from '../types/tools';
import {
  ICON_NAMES,
  defaultPropsFor,
  defaultStylesFor,
  isContainerType,
  spec,
} from '../types/library';
import { styleValueIssue } from '../types/styleDict';
import { ID_PATTERN, collectIds, generateId, suggestIds } from './ids';
import { knownTokenNames } from '../design/materialize';
import { countNodes, maxDepth, walk } from './treeUtils';

export const MAX_DEPTH = 8;
export const MAX_NODES = 120;

const STATE_KEY = /^[a-z][a-z0-9_]{0,30}$/;
const TEXTISH = new Set([
  'heading',
  'text',
  'label',
  'badge',
  'button',
  'link',
  'input',
  'textarea',
  'checkbox',
  'switch',
]);

export function error(
  code: OpError['code'],
  message: string,
  guidance?: string,
  opIndex?: number,
): OpError {
  return { code, message, guidance, opIndex };
}

export function normalizeStyles(raw: unknown): StyleSet {
  if (!raw || typeof raw !== 'object') return {};
  const out: StyleSet = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (k === 'responsive') {
      if (v && typeof v === 'object') {
        const r = v as Record<string, unknown>;
        out.responsive = {
          medium: r.medium ? normalizeStyles(r.medium) : undefined,
          expanded: r.expanded ? normalizeStyles(r.expanded) : undefined,
        };
      }
      continue;
    }
    if (v === undefined) {
      // Keep the marker so mergeStyles can treat it as "clear this key".
      out[k] = undefined;
      continue;
    }
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v;
      continue;
    }
    /*
     * padding/margin may be a box of four sides (the agent writes these; the
     * inspector writes one value). Every other object is not a style.
     */
    if ((k === 'padding' || k === 'margin') && v && typeof v === 'object') {
      const box: Record<string, string | number> = {};
      for (const side of ['top', 'right', 'bottom', 'left'] as const) {
        const sideValue = (v as Record<string, unknown>)[side];
        if (typeof sideValue === 'string' || typeof sideValue === 'number') {
          box[side] = sideValue;
        }
      }
      if (Object.keys(box).length) out[k] = box;
    }
  }
  return out;
}

export function normalizeActions(value: unknown): Action[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: Action[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const a = item as Record<string, unknown>;
    if (a.type === 'navigate' && typeof a.to === 'string')
      out.push({ type: 'navigate', to: a.to });
    else if (a.type === 'setState' && typeof a.key === 'string')
      out.push({ type: 'setState', key: a.key, value: a.value ?? '' });
    else if (a.type === 'toggle' && typeof a.key === 'string')
      out.push({ type: 'toggle', key: a.key });
    else if (a.type === 'toast' && typeof a.text === 'string')
      out.push({ type: 'toast', text: a.text });
    else if (a.type === 'openUrl' && typeof a.url === 'string')
      out.push({ type: 'openUrl', url: a.url });
    else if (a.type === 'when' && typeof a.key === 'string') {
      out.push({
        type: 'when',
        key: a.key,
        equals: a.equals as string | number | boolean | undefined,
        then: normalizeActions(a.then) || [],
      });
    }
  }
  return out;
}

function normalizeEvents(raw: unknown): ComponentNode['events'] {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const ev: ComponentNode['events'] = {};
  for (const name of ['tap', 'change', 'submit'] as const) {
    const list = normalizeActions(r[name]);
    if (list && list.length) ev[name] = list;
  }
  return Object.keys(ev).length ? ev : undefined;
}

export function hydrateNode(
  raw: RawNode,
  taken: Set<string>,
  opts: { prefix?: string; forceId?: string } = {},
): ComponentNode {
  const type = raw.type as ComponentType;
  let id = opts.forceId || raw.id || '';
  if (!id) {
    const base = opts.prefix ? `${opts.prefix}_${type}` : type;
    id = generateId(base as ComponentType, taken);
    if (opts.prefix) id = `${opts.prefix}_${id}`.slice(0, 31);
    if (taken.has(id) || !ID_PATTERN.test(id)) id = generateId(type, taken);
  }
  taken.add(id);
  const children = (raw.children || []).map((c) =>
    hydrateNode(c, taken, { prefix: opts.prefix }),
  );
  const props: Record<string, unknown> = {
    ...defaultPropsFor(type),
    ...(raw.props && typeof raw.props === 'object'
      ? (raw.props as Record<string, unknown>)
      : {}),
  };
  const styles: StyleSet = {
    ...defaultStylesFor(type),
    ...normalizeStyles(raw.styles),
  };
  return {
    id,
    type,
    props,
    styles,
    children: isContainerType(type) ? children : [],
    ...(raw.events ? { events: normalizeEvents(raw.events) } : {}),
    ...(raw.visibleWhen ? { visibleWhen: raw.visibleWhen } : {}),
  };
}

export function actionDepthIssue(actions: Action[] | undefined, depth = 1): string | null {
  if (!actions) return null;
  for (const a of actions) {
    if (a.type === 'when') {
      if (depth > 2) return 'nested when-actions are limited to two levels';
      const inner = actionDepthIssue(a.then, depth + 1);
      if (inner) return inner;
    }
  }
  return null;
}

export function tokenRefIssue(
  styles: StyleSet,
  tokens: ProjectDoc['tokens'],
): string | null {
  const known = knownTokenNames(tokens);
  const strings: unknown[] = [];
  const collect = (value: unknown) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const inner of Object.values(value as Record<string, unknown>)) strings.push(inner);
      return;
    }
    strings.push(value);
  };
  for (const [k, v] of Object.entries(styles)) {
    if (k === 'responsive') continue;
    collect(v);
  }
  for (const block of [styles.responsive?.medium, styles.responsive?.expanded]) {
    if (!block) continue;
    for (const v of Object.values(block)) collect(v);
  }
  for (const value of strings) {
    if (typeof value !== 'string') continue;
    const matches = value.matchAll(/var\((--[a-z0-9-]+)/gi);
    for (const m of matches) {
      const name = m[1].replace(/^--/, '');
      if (!known.has(name)) return name;
    }
  }
  return null;
}

/** Cheap shape check of one prop against its property sheet. */
function propIssues(n: ComponentNode, requireAll: boolean): OpError[] {
  const component = spec(n.type);
  if (!component) return [];
  const errors: OpError[] = [];
  for (const def of component.props) {
    const raw = n.props[def.key];
    const value = raw === undefined || raw === null ? undefined : raw;

    if (value === undefined) {
      if (requireAll && def.required) {
        errors.push(
          error(
            'E_BAD_OP',
            `${n.id} (${n.type}) needs a ${def.key}`,
            `${def.label}: ${def.hint}`,
          ),
        );
      }
      continue;
    }

    const empty =
      (typeof value === 'string' && !value.trim()) ||
      (Array.isArray(value) && value.length === 0);
    if (requireAll && def.required && empty) {
      errors.push(
        error('E_BAD_OP', `${n.id} (${n.type}) has an empty ${def.key}`, def.hint),
      );
      continue;
    }

    if (def.kind === 'select' || def.kind === 'tone') {
      const allowed = def.options || [];
      // Options are labels; a numeric option ('Level 2') may arrive as 2.
      const asText = typeof value === 'number' ? String(value) : value;
      if (typeof asText !== 'string' || !allowed.includes(asText)) {
        errors.push(
          error(
            'E_BAD_OP',
            `${n.id}: ${def.key} "${String(value)}" is not allowed`,
            `${def.key} must be one of: ${allowed.join(', ')}`,
          ),
        );
      }
      continue;
    }
    if (def.kind === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        errors.push(
          error('E_BAD_OP', `${n.id}: ${def.key} must be a number`, def.hint),
        );
      } else if (
        (def.min !== undefined && value < def.min) ||
        (def.max !== undefined && value > def.max)
      ) {
        errors.push(
          error(
            'E_BAD_OP',
            `${n.id}: ${def.key} is ${value}, outside ${def.min}–${def.max}`,
            def.hint,
          ),
        );
      }
      continue;
    }
    if (def.kind === 'toggle') {
      if (typeof value !== 'boolean') {
        errors.push(
          error('E_BAD_OP', `${n.id}: ${def.key} is true or false`, def.hint),
        );
      }
      continue;
    }
    if (def.kind === 'screen') {
      // A link may point at a screen that a later batch creates, so the shape
      // is checked and the target is resolved at run time (it says so if it is
      // missing). Blocking here would refuse a half-built import.
      if (typeof value !== 'string') {
        errors.push(error('E_BAD_OP', `${n.id}: ${def.key} must be a screen id`, def.hint));
      }
      continue;
    }
    if (def.kind === 'text' || def.kind === 'longtext' || def.kind === 'data') {
      const ok =
        typeof value === 'string' ||
        typeof value === 'number' ||
        (Array.isArray(value) && value.every((v) => typeof v === 'string'));
      if (!ok) {
        errors.push(
          error('E_BAD_OP', `${n.id}: ${def.key} must be text`, def.hint),
        );
      }
    }
  }
  return errors;
}

/** A style key the dictionary names must hold a value it can compile. */
function styleIssues(n: ComponentNode): OpError[] {
  const errors: OpError[] = [];
  const check = (block: Record<string, unknown>, where: string) => {
    for (const [key, value] of Object.entries(block)) {
      if (key === 'responsive' || value === undefined) continue;
      if (key === 'responsive') continue;
      const issue = styleValueIssue(key, value);
      if (issue) {
        errors.push(
          error(
            'E_BAD_OP',
            `${n.id}${where}: ${issue}`,
            'align/selfAlign: start|center|end|stretch · justify: start|center|end|space-between · grow: 0|1 · width/height: match|hug|length',
          ),
        );
      }
    }
  };
  check(n.styles as Record<string, unknown>, '');
  const medium = n.styles.responsive?.medium;
  const expanded = n.styles.responsive?.expanded;
  if (medium) check(medium as Record<string, unknown>, ' (medium)');
  if (expanded) check(expanded as Record<string, unknown>, ' (expanded)');
  return errors;
}

/** Field-level checks shared by new subtrees and setProps edits. */
export function fieldIssues(
  n: ComponentNode,
  doc: ProjectDoc,
  opts: { requireProps?: boolean } = {},
): OpError[] {
  const errors: OpError[] = [];
  if (!isContainerType(n.type) && (n.children || []).length > 0) {
    errors.push(error('E_NOT_CONTAINER', `${n.id} (${n.type}) cannot hold children`));
  }
  const icon = n.props.icon ?? n.props.name;
  if (
    (n.type === 'icon' || n.type === 'iconbutton' || n.type === 'fab') &&
    icon !== undefined
  ) {
    if (typeof icon !== 'string' || !(ICON_NAMES as readonly string[]).includes(icon)) {
      errors.push(
        error(
          'E_BAD_OP',
          `"${String(icon)}" is not in the icon whitelist`,
          `use one of: ${ICON_NAMES.slice(0, 10).join(', ')}…`,
        ),
      );
    }
  }
  if ((n.type === 'image' || n.type === 'avatar') && n.props.src) {
    const src = String(n.props.src);
    if (!/^(https:\/\/|data:image\/)/.test(src)) {
      errors.push(
        error('E_BAD_OP', `${n.id}: image src must start with https:// or data:image/`),
      );
    }
  }
  const bind = n.props.bindKey;
  if (bind !== undefined && (typeof bind !== 'string' || !STATE_KEY.test(bind))) {
    errors.push(
      error('E_BAD_OP', `${n.id}: bindKey "${String(bind)}" is not lower_snake_case`),
    );
  }
  for (const evName of ['tap', 'change', 'submit'] as const) {
    const issue = actionDepthIssue(n.events?.[evName]);
    if (issue) errors.push(error('E_BAD_OP', `${n.id}: ${issue}`));
  }
  errors.push(...propIssues(n, Boolean(opts.requireProps)));
  // A range whose ends are crossed renders as a slider that cannot move.
  if (
    typeof n.props.min === 'number' &&
    typeof n.props.max === 'number' &&
    n.props.min > n.props.max
  ) {
    errors.push(
      error(
        'E_BAD_OP',
        `${n.id}: min is ${n.props.min} but max is ${n.props.max}`,
        'min must be the smaller number',
      ),
    );
  }
  errors.push(...styleIssues(n));
  const tokenIssue = tokenRefIssue(n.styles, doc.tokens);
  if (tokenIssue) {
    errors.push(
      error(
        'E_TOKEN_UNKNOWN',
        `${n.id}: style references undefined token --${tokenIssue}`,
        'use a token from the token sheet, or a literal hex',
      ),
    );
  }
  return errors;
}

/** Structural + vocabulary checks over a whole subtree that is about to enter the doc. */
export function inspectSubtree(
  node: ComponentNode,
  doc: ProjectDoc,
  existingIds: Set<string>,
  path = 'root',
  opts: { requireProps?: boolean } = {},
): OpError[] {
  const errors: OpError[] = [];
  const seen = new Set<string>();
  walk(node, (n, depth) => {
    if (!ID_PATTERN.test(n.id)) {
      errors.push(
        error('E_BAD_OP', `${path}: id "${n.id}" does not match ^[a-z][a-z0-9_]{2,30}$`),
      );
    }
    if (seen.has(n.id) || existingIds.has(n.id)) {
      errors.push(
        error(
          'E_NAME_TAKEN',
          `id "${n.id}" is already used`,
          `free alternatives: ${suggestIds(n.id, new Set([...existingIds, ...seen])).join(', ')}`,
        ),
      );
    }
    seen.add(n.id);
    if (depth + 1 > MAX_DEPTH) {
      errors.push(
        error(
          'E_DEPTH',
          `tree is deeper than ${MAX_DEPTH} at ${n.id}`,
          'flatten one level',
        ),
      );
    }
    errors.push(...fieldIssues(n, doc, opts));
  });
  return errors;
}

export function makeScreen(
  id: string,
  name: string,
  root: ComponentNode,
  entry?: boolean,
): ScreenDoc {
  return { id, name, root, ...(entry ? { entry: true } : {}) };
}

export function screenOverLimit(screen: ScreenDoc): boolean {
  return countNodes(screen.root) > MAX_NODES;
}

export function treeTooDeep(screen: ScreenDoc): boolean {
  return maxDepth(screen.root) > MAX_DEPTH;
}

/** Fresh ids for a copied subtree (custom components place-as-copy). */
export function withFreshIds(
  node: ComponentNode,
  prefix: string,
  taken: Set<string>,
): ComponentNode {
  const copy: ComponentNode = {
    ...node,
    id: '',
    props: JSON.parse(JSON.stringify(node.props)),
    styles: JSON.parse(JSON.stringify(node.styles)),
    children: [],
  };
  const base = `${prefix}_${node.type}`.slice(0, 20);
  copy.id = generateId(base as ComponentType, taken);
  taken.add(copy.id);
  copy.children = (node.children || []).map((c) => withFreshIds(c, prefix, taken));
  return copy;
}

export function takenIds(doc: ProjectDoc): Set<string> {
  const ids = new Set<string>();
  for (const s of doc.screens) collectIds(s.root, ids);
  return ids;
}

export function textish(type: string): boolean {
  return TEXTISH.has(type);
}
