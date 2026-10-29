/**
 * The schemas the MODEL sees, as opposed to the ones we validate with.
 *
 * Two production incidents shaped this file, and both died on the same
 * symptom — every turn failed before a single token, even a bare "Hello",
 * because the tools array rides on EVERY request:
 *
 * 1. `400 Recursive JSON schemas are not currently supported` — a truthful,
 *    recursive tree schema emitted `$ref`s. Fixed by inlining (no `$ref`
 *    anywhere; `wire.test.ts` fails the build if one reappears).
 * 2. `400 JSON schema exceeds the maximum nesting depth of 10 levels` —
 *    even the BOUNDED tree mirror inlined to ~27 levels (an op union × node ×
 *    children × styles × responsive). The fix is the shape Sketchware always
 *    used: the schema stays SHALLOW — it names the op, leaves the payload
 *    open — and the STRUCTURE moves to the prompt (`TOOL_DESCRIPTIONS.edit_canvas`
 *    carries the one-line grammar). `opSchema` in `tools.ts` remains the
 *    runtime authority and validates every payload exactly as deeply as
 *    before; the wire just stops describing it.
 *
 * `wire.test.ts` enforces: no `$ref`, every tool ≤ 8 levels deep (Meta's cap is
 * 10), every op name present.
 */
import { z } from 'zod';

/**
 * THE SHALLOW MIRROR. Each op is named; the payload is open at the wire
 * (`catchall(unknown)`) and judged by the runtime validator.
 */
export const OP_NAMES = [
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
] as const;

export function opWireAt(): z.ZodTypeAny {
  return z.object({ op: z.enum(OP_NAMES) }).catchall(z.unknown());
}

export const editCanvasWire = z.object({
  screen_id: z.string().max(31).optional(),
  ops: z.array(opWireAt()).min(1).max(40),
});

/** `read_canvas` takes nothing: an explicit empty object, not `passthrough`. */
export const readCanvasWire = z.object({});

/** Shallow image target mirror, validated again by the runtime tool schema. */
export const illustrateImagesWire = z.object({
  targets: z
    .array(z.object({ id: z.string(), prompt: z.string().optional() }))
    .min(1)
    .max(6),
});
