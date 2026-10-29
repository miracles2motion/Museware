import { describe, expect, it } from 'vitest';
import { TOOL_DEFS, toolParameters } from '../muse/loop';
import { TOOL_NAMES, opSchema } from './tools';
import type { Op } from './tree';
import { OP_NAMES, editCanvasWire, opWireAt, readCanvasWire } from './wire';

/*
 * This file guards the wire schema against BOTH incidents that killed every
 * turn before a single token (even a bare "Hello" — the tools array rides on
 * every request):
 *
 * 1. `$ref` recursion -> "Recursive JSON schemas are not currently supported"
 * 2. nesting depth -> "JSON schema exceeds the maximum nesting depth of 10
 *    levels" (edit_canvas measured 27 against Meta's cap of 10)
 *
 * The wire is now deliberately SHALLOW: it names each op and leaves the
 * payload open; structure lives in TOOL_DESCRIPTIONS and the runtime
 * validator (`opSchema`) remains the authority.
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

/** JSON-Schema nesting depth: objects/arrays on a path each count one level. */
function schemaDepth(node: unknown, d = 1): number {
  if (Array.isArray(node)) return Math.max(d, ...node.map((v) => schemaDepth(v, d + 1)));
  if (node && typeof node === 'object')
    return Math.max(d, ...Object.values(node).map((v) => schemaDepth(v, d + 1)));
  return d;
}

/** Just enough of a JSON Schema to read the emitted document. */
interface Schema {
  type?: string;
  properties?: Record<string, Schema>;
  items?: Schema;
  anyOf?: Schema[];
  enum?: string[];
  additionalProperties?: unknown;
  [extra: string]: unknown;
}

function editCanvasParams(): Schema & {
  properties: { ops: Schema & { items: Schema } };
} {
  return toolParameters('edit_canvas') as unknown as Schema & {
    properties: { ops: Schema & { items: Schema } };
  };
}

describe('the schemas sent to the model', () => {
  it('covers every tool', () => {
    expect(TOOL_DEFS.map((t) => t.function.name).sort()).toEqual([...TOOL_NAMES].sort());
    for (const def of TOOL_DEFS) {
      expect(def.function.description.length).toBeGreaterThan(10);
    }
  });

  it('carries not a single $ref anywhere', () => {
    for (const t of TOOL_DEFS) {
      expect(findRefs(t.function.parameters), t.function.name).toEqual([]);
    }
  });

  it('stays under the Meta nesting cap for every tool — headroom 8, cap is 10', () => {
    for (const t of TOOL_DEFS) {
      const d = schemaDepth(t.function.parameters);
      expect(d, `${t.function.name} is ${d} deep`).toBeLessThanOrEqual(8);
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
  });

  it('has no empty sub-schema, which some validators refuse to interpret', () => {
    for (const name of TOOL_NAMES) {
      const json = JSON.stringify(toolParameters(name));
      expect(json, `${name} sends an empty additionalProperties`).not.toContain(
        '"additionalProperties":{}',
      );
    }
  });

  it('names every op on the wire (shallow mirror)', () => {
    const opEnum = editCanvasParams().properties.ops.items.properties?.op?.enum;
    expect(opEnum).toEqual([...OP_NAMES]);
  });

  it('leaves the op payload open at the wire', () => {
    expect(editCanvasParams().properties.ops.items.additionalProperties).not.toBe(false);
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

    // The wire is guidance; `opSchema` is the authority — everything that
    // passes the wire must survive real validation too.
    for (const op of (wire.success ? wire.data.ops : []) as unknown as Op[]) {
      const parsed = opSchema.safeParse(op);
      expect(parsed.success, `validator refused ${op.op}`).toBe(true);
    }
  });

  it('keeps read_canvas argumentless on purpose', () => {
    expect(readCanvasWire.safeParse({}).success).toBe(true);
    // Extras are stripped, not fatal: the runtime ignores them anyway.
    const parsed = readCanvasWire.safeParse({ extra: 1 });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(Object.keys(parsed.data)).toEqual([]);
  });

  it('keeps op building generic', () => {
    expect(() => opWireAt()).not.toThrow();
  });
});

describe('the runtime authority (what the wire no longer describes)', () => {
  it('accepts a full add with styles, events and children', () => {
    const parsed = opSchema.safeParse({
      op: 'add',
      parentId: 'col_main',
      node: {
        id: 'btn_go',
        type: 'button',
        props: { text: 'Go', events: { tap: [{ type: 'navigate', to: 'details' }] } },
        styles: {
          background: 'var(--openui-accent)',
          responsive: { expanded: { gap: '16' } },
        },
        children: [],
      },
    });
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it('accepts setProps as the events channel (§4.2)', () => {
    const parsed = opSchema.safeParse({
      op: 'setProps',
      id: 'order_btn',
      props: { events: { tap: [{ type: 'navigate', to: 'home' }] } },
    });
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it('still refuses an unknown op name', () => {
    expect(opSchema.safeParse({ op: 'explode', id: 'x' }).success).toBe(false);
  });
});
