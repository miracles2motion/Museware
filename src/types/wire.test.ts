import { describe, expect, it } from 'vitest';
import { TOOL_DEFS, toolParameters } from '../muse/loop';
import { TOOL_NAMES, opSchema } from './tools';
import type { Op } from './tree';
import { editCanvasWire, opWireAt, readCanvasWire } from './wire';

/**
 * The bug this file exists for: Meta refused every turn with
 *
 *     400 {"message":"Recursive JSON schemas are not currently supported"}
 *
 * because `edit_canvas`'s parameters described a tree with `z.lazy` and the
 * emitter answered with 24 `$ref`s pointing back at the same schema. The turn
 * died before a single token, long after the key had been verified, so it read
 * like a key problem. Nothing in that schema may ever go back to being a
 * reference.
 */

/** Every `$ref` in the emitted schema, with the path that leads to it. */
function findRefs(node: unknown, path = '$'): string[] {
  if (Array.isArray(node)) return node.flatMap((v, i) => findRefs(v, `${path}[${i}]`));
  if (!node || typeof node !== 'object') return [];
  const out: string[] = [];
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === '$ref') out.push(`${path}.$ref -> ${String(value)}`);
    else out.push(...findRefs(value, `${path}.${key}`));
  }
  return out;
}

/** True only for a genuine cycle: an object that contains itself. */
function hasCycle(root: unknown): boolean {
  const path = new Set<object>();
  const walk = (node: unknown): boolean => {
    if (!node || typeof node !== 'object') return false;
    if (path.has(node as object)) return true;
    path.add(node as object);
    const found = Object.values(node as Record<string, unknown>).some(walk);
    path.delete(node as object);
    return found;
  };
  return walk(root);
}

/** Longest chain of nested `children` arrays the emitted schema describes. */
function childrenDepth(node: unknown, depth = 0): number {
  if (Array.isArray(node)) {
    return node.reduce((max, v) => Math.max(max, childrenDepth(v, depth)), depth);
  }
  if (!node || typeof node !== 'object') return depth;
  const record = node as Record<string, unknown>;
  let max = depth;
  for (const [key, value] of Object.entries(record)) {
    max = Math.max(max, childrenDepth(value, key === 'children' ? depth + 1 : depth));
  }
  return max;
}

/** Just enough of a JSON Schema to read the emitted document. */
interface Schema {
  type?: string;
  properties?: Record<string, Schema>;
  additionalProperties?: boolean | Schema;
  items?: Schema;
  anyOf?: Schema[];
}

function schemaOf(params: Record<string, unknown>): Schema {
  return params as unknown as Schema;
}

/** The `add` op's node schema. */
function nodeSchemaOf(params: Record<string, unknown>): Schema {
  const ops = schemaOf(params).properties?.ops?.items?.anyOf ?? [];
  const branch = ops.find((o) => o.properties?.node);
  if (!branch?.properties?.node) throw new Error('edit_canvas lost the add op');
  return branch.properties.node;
}

/** The op branch that owns a given property, e.g. `setStyles`. */
function opBranch(params: Record<string, unknown>, key: string): Schema {
  const ops = schemaOf(params).properties?.ops?.items?.anyOf ?? [];
  const branch = ops.find((o) => o.properties?.[key]);
  if (!branch?.properties?.[key])
    throw new Error(`edit_canvas lost the op carrying ${key}`);
  return branch.properties[key];
}

describe('the schemas sent to the model', () => {
  it('describes every tool the loop can call', () => {
    expect(TOOL_DEFS.map((d) => d.function.name)).toEqual(TOOL_NAMES);
    for (const def of TOOL_DEFS) {
      expect(def.function.description.length).toBeGreaterThan(10);
    }
  });

  it('has no $ref and no cycle in any tool', () => {
    for (const name of TOOL_NAMES) {
      const params = toolParameters(name);
      expect(findRefs(params), `${name} still emits a reference`).toEqual([]);
      expect(hasCycle(params), `${name} contains a cycle`).toBe(false);
      expect(() => JSON.stringify(params)).not.toThrow();
    }
  });

  it('declares an object with properties, which is what the API expects', () => {
    for (const name of TOOL_NAMES) {
      const params = toolParameters(name) as { type?: string; properties?: unknown };
      expect(params.type, name).toBe('object');
      expect(params.properties, name).toBeTypeOf('object');
    }
  });

  it('never ships definitions — a schema that needs them needs $ref', () => {
    for (const name of TOOL_NAMES) {
      const params = toolParameters(name) as Record<string, unknown>;
      expect(params.definitions, name).toBeUndefined();
      expect(params.$schema, name).toBeUndefined();
    }
  });

  it('stays inside a size budget, because it rides on every call of a turn', () => {
    const bytes = TOOL_DEFS.reduce(
      (sum, d) => sum + JSON.stringify(d.function.parameters).length,
      0,
    );
    expect(bytes).toBeLessThan(24_000);
    // edit_canvas is the big one; a runaway nesting bound shows up here first.
    expect(JSON.stringify(toolParameters('edit_canvas')).length).toBeLessThan(20_000);
  });

  it('has no empty sub-schema, which some validators refuse to interpret', () => {
    for (const name of TOOL_NAMES) {
      const json = JSON.stringify(toolParameters(name));
      expect(json, `${name} sends an empty additionalProperties`).not.toContain(
        '"additionalProperties":{}',
      );
    }
  });

  it('names every op the canvas can perform', () => {
    const json = JSON.stringify(toolParameters('edit_canvas'));
    for (const op of [
      'add',
      'remove',
      'move',
      'setProps',
      'setStyles',
      'setText',
      'rename',
      'addScreen',
      'removeScreen',
      'renameScreen',
      'setEntry',
      'setTokens',
      'saveComponent',
      'placeComponent',
    ]) {
      expect(json, `edit_canvas lost the ${op} op`).toContain(`"${op}"`);
    }
  });

  it('bounds nesting, so the schema stays small and deep trees come as more ops', () => {
    expect(childrenDepth(toolParameters('edit_canvas'))).toBeLessThanOrEqual(5);
  });

  /*
   * A schema that says `additionalProperties: false` while the canvas wants
   * `background`, `padding` or a `tap` handler is worse than no schema: under
   * constrained decoding the design simply cannot be written. These are the
   * three places that used to be closed.
   */
  it('lets a node carry real style keys, not just responsive overrides', () => {
    const styles = nodeSchemaOf(toolParameters('edit_canvas')).properties?.styles;
    expect(styles?.additionalProperties).not.toBe(false);
    expect(styles?.properties?.responsive?.additionalProperties).not.toBe(false);
  });

  it('lets setStyles write flat style keys', () => {
    const styles = opBranch(toolParameters('edit_canvas'), 'styles');
    expect(styles.additionalProperties).not.toBe(false);
  });

  it('lets setProps carry events, which is how actions are written', () => {
    const props = opBranch(toolParameters('edit_canvas'), 'props');
    expect(props.additionalProperties).not.toBe(false);
  });

  it('still accepts what the canvas really does, and the validator agrees', () => {
    const real = {
      screen_id: 'home',
      ops: [
        {
          op: 'add',
          parentId: 'root',
          node: {
            type: 'card',
            styles: { padding: 'var(--pad-card)', responsive: { expanded: { gap: '16' } } },
            children: [
              {
                type: 'row',
                children: [{ type: 'button', props: { text: 'Order', tone: 'primary' } }],
              },
            ],
          },
        },
        {
          op: 'setProps',
          id: 'order_btn',
          props: { events: { tap: [{ type: 'navigate', to: 'home' }] } },
        },
        {
          op: 'setStyles',
          id: 'home_card',
          styles: { background: 'var(--openui-surface)' },
        },
        { op: 'addScreen', screen: { id: 'menu', name: 'Menu', root: { type: 'screen' } } },
        { op: 'setText', id: 'order_btn', text: 'Order now' },
      ],
    };
    const wire = editCanvasWire.safeParse(real);
    expect(wire.success, wire.success ? '' : JSON.stringify(wire.error.issues)).toBe(true);

    // The wire is guidance; `opSchema` in the runtime is the authority, so
    // anything it lets through must also survive validation.
    for (const op of (wire.success ? wire.data.ops : []) as unknown as Op[]) {
      const parsed = opSchema.safeParse(op);
      expect(parsed.success, `validator refused ${op.op}`).toBe(true);
    }
  });

  it('refuses a nested style value, which is how recursion used to sneak in', () => {
    const nested = { id: 'home_card', styles: { a: { b: { c: '1' } } } };
    expect(
      editCanvasWire.safeParse({ ops: [{ op: 'setStyles', ...nested }] }).success,
    ).toBe(false);
  });

  it('keeps op building generic, so depth stays a tunable trade-off', () => {
    expect(() => opWireAt(1)).not.toThrow();
    expect(() => opWireAt(4, 2, 2)).not.toThrow();
    // read_canvas takes no arguments; an empty object keeps the API happy.
    expect(readCanvasWire.safeParse({}).success).toBe(true);
  });
});
