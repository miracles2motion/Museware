/**
 * The schemas the MODEL sees, as opposed to the ones we validate with.
 *
 * `src/types/tools.ts` describes the tree truthfully, and a tree is recursive:
 * a node has children, a style can carry responsive overrides that are
 * themselves styles, and a `when` action can carry more actions. That is
 * correct for validation and fatal for a wire schema — Meta refuses the whole
 * request with
 *
 *     400 {"message":"Recursive JSON schemas are not currently supported"}
 *
 * so every turn died before a single token was generated.
 *
 * These mirrors are deliberately BOUNDED: nesting stops after `WIRE_DEPTH`, a
 * `when` may contain plain actions but not another `when`, and styles are one
 * flat level plus `responsive.medium` / `responsive.expanded`. The result has no
 * `$ref` anywhere — `src/types/wire.test.ts` fails the build if one ever
 * reappears.
 *
 * What the model may emit is therefore a subset of what `opSchema` accepts. The
 * runtime validator is still the authority: the wire schema is guidance, and it
 * refuses to describe anything we would not accept anyway.
 */
import { z } from 'zod';
import { ALL_TYPES, idSchema } from './tools';

/**
 * Nesting is bounded PER OP, not globally, because the cost is per occurrence:
 * `add` is where a real tree arrives (root -> container -> row -> leaf), while a
 * new screen's root and a saved component start shallow and grow through the
 * further `add` ops that ride in the same batch. Every extra level multiplies
 * the schema that is sent on all 24 calls of a turn.
 */
export const WIRE_ADD_DEPTH = 3;
export const WIRE_SCREEN_DEPTH = 1;
export const WIRE_COMPONENT_DEPTH = 2;

const screenId = z.string().regex(/^[a-z][a-z0-9_]{0,30}$/);
const stateKey = z.string().regex(/^[a-z][a-z0-9_]{0,30}$/);
const scalar = z.union([z.string().max(240), z.number(), z.boolean()]);

/**
 * A style map, one level deep.
 *
 * `catchall` is doing two jobs here. Emitting `additionalProperties: scalar`
 * says "any CSS-ish key with a scalar value", which is what the canvas wants;
 * a plain `z.object` would have emitted `additionalProperties: false` and, under
 * constrained decoding, styles would have become impossible to write at all —
 * only `responsive` would have survived. The second job is validation: a value
 * that is itself an object is refused, so nesting cannot recurse.
 */
const flatStyles = z.object({}).catchall(scalar);

const styleWire = z
  .object({
    responsive: z
      .object({
        medium: flatStyles.optional(),
        expanded: flatStyles.optional(),
      })
      .catchall(scalar)
      .optional(),
  })
  .catchall(scalar);

/*
 * Actions are not described here at all. They travel through `setProps` as
 * `{events:{tap:[…]}}` (§4.2), so the node schema stays small; `tools.ts` keeps
 * the strict action validator. The tool description names the action types.
 */

/**
 * A node, generated `depth` times rather than referenced. Each level is a
 * distinct zod object, so the emitted JSON is a finite tree with no `$ref`.
 */
function nodeWire(depth: number): z.ZodTypeAny {
  const base = {
    id: idSchema.optional(),
    name: z.string().max(40).optional(),
    type: z.enum(ALL_TYPES),
    /*
     * Props are left open so nested patches fit — events ride through
     * `setProps` (§4.2: "the AI writes the same structure through edit_canvas
     * (setProps on events)"), so a per-node `events` block would have been
     * 3.6 kB of schema repeated at every nesting level for something the model
     * sets with a second op anyway.
     */
    props: z.record(z.unknown()).optional(),
    styles: styleWire.optional(),
    visibleWhen: z
      .object({
        key: stateKey,
        equals: z.union([z.string().max(120), z.number(), z.boolean()]).optional(),
      })
      .optional(),
  };
  if (depth <= 0) return z.object(base);
  return z.object({
    ...base,
    children: z
      .array(nodeWire(depth - 1))
      .max(120)
      .optional(),
  });
}

const screenWireAt = (depth: number) =>
  z.object({
    id: screenId,
    name: z.string().min(1).max(40),
    root: nodeWire(depth),
    entry: z.boolean().optional(),
    mockData: z
      .record(z.array(z.record(z.union([z.string(), z.number(), z.boolean()]))).max(20))
      .optional(),
  });

export function opWireAt(
  addDepth = WIRE_ADD_DEPTH,
  screenDepth = WIRE_SCREEN_DEPTH,
  componentDepth = WIRE_COMPONENT_DEPTH,
) {
  return z.discriminatedUnion('op', [
    z.object({
      op: z.literal('add'),
      parentId: idSchema,
      index: z.number().int().min(0).max(200).optional(),
      node: nodeWire(addDepth),
    }),
    z.object({ op: z.literal('remove'), id: idSchema }),
    z.object({
      op: z.literal('move'),
      id: idSchema,
      parentId: idSchema,
      index: z.number().int().min(0).max(200).optional(),
    }),
    /*
     * Open on purpose: props carry `events` ({tap:[{type:'navigate',…}]}),
     * `visibleWhen` and free-form component props, all handled by
     * `apply.ts`'s setProps case. Describing them here would mean describing
     * `when.then` — the recursion that broke every turn.
     */
    z.object({ op: z.literal('setProps'), id: idSchema, props: z.record(z.unknown()) }),
    z.object({ op: z.literal('setStyles'), id: idSchema, styles: styleWire }),
    z.object({ op: z.literal('setText'), id: idSchema, text: z.string().max(2000) }),
    z.object({ op: z.literal('rename'), id: idSchema, name: z.string().min(1).max(40) }),
    z.object({ op: z.literal('addScreen'), screen: screenWireAt(screenDepth) }),
    z.object({ op: z.literal('removeScreen'), id: screenId }),
    z.object({
      op: z.literal('renameScreen'),
      id: screenId,
      name: z.string().min(1).max(40),
    }),
    z.object({ op: z.literal('setEntry'), id: screenId }),
    z.object({ op: z.literal('setTokens'), patch: z.record(z.unknown()) }),
    z.object({
      op: z.literal('saveComponent'),
      name: z.string().min(3).max(31),
      description: z.string().max(120),
      root: nodeWire(componentDepth),
    }),
    z.object({
      op: z.literal('placeComponent'),
      name: z.string().min(3).max(31),
      parentId: idSchema,
      index: z.number().int().min(0).max(200).optional(),
    }),
  ]);
}

export const editCanvasWire = z.object({
  screen_id: z.string().max(31).optional(),
  ops: z.array(opWireAt()).min(1).max(40),
});

/** `read_canvas` takes nothing: an explicit empty object, not `passthrough`. */
export const readCanvasWire = z.object({});
