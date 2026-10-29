import { z } from 'zod';
import type { Action, ComponentType } from './tree';
import { CONTAINER_TYPES, LEAF_TYPES } from './tree';
import { ICON_NAMES } from './library';
import type { DesignTokens } from './tokens';

export const ALL_TYPES = [...CONTAINER_TYPES, ...LEAF_TYPES] as const;

const stateKey = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,30}$/, 'state keys are lower_snake_case');

export const idSchema = z
  .string()
  .regex(
    /^[a-z][a-z0-9_]{2,30}$/,
    'ids are lower_snake_case, 3–31 chars, starting with a letter',
  );

export const styleValue = z.union([z.string().max(240), z.number()]);

export type RawStyles = Record<string, unknown>;

const alignEnum = z.enum(['start', 'center', 'end', 'stretch']);
const spaceBox = z.object({
  top: styleValue.optional(),
  right: styleValue.optional(),
  bottom: styleValue.optional(),
  left: styleValue.optional(),
});

/**
 * The style keys the dictionary names, validated by name. Everything else still
 * passes through: raw CSS (marginTop, fontFamily) is the escape hatch, and old
 * documents must keep loading.
 *
 * `responsive` stays recursive — the runtime can afford depth; only the WIRE
 * mirror must stay shallow (see wire.ts). This schema is never sent to the
 * model.
 */
export const styleSchema: z.ZodType<RawStyles> = z.lazy(() =>
  z
    .object({
      align: alignEnum.optional(),
      selfAlign: alignEnum.optional(),
      justify: z.enum(['start', 'center', 'end', 'space-between']).optional(),
      wrap: z.boolean().optional(),
      grow: z.union([z.literal(0), z.literal(1)]).optional(),
      gap: styleValue.optional(),
      padding: z.union([styleValue, spaceBox]).optional(),
      margin: z.union([styleValue, spaceBox]).optional(),
      width: z.union([z.enum(['match', 'hug']), styleValue]).optional(),
      height: z.union([z.enum(['match', 'hug']), styleValue]).optional(),
      minWidth: z.union([z.enum(['match', 'hug']), styleValue]).optional(),
      maxWidth: z.union([z.enum(['match', 'hug']), styleValue]).optional(),
      minHeight: z.union([z.enum(['match', 'hug']), styleValue]).optional(),
      maxHeight: z.union([z.enum(['match', 'hug']), styleValue]).optional(),
      overflow: z.enum(['visible', 'hidden', 'auto']).optional(),
      responsive: z
        .object({ medium: styleSchema.optional(), expanded: styleSchema.optional() })
        .optional(),
    })
    .catchall(z.unknown()),
) as unknown as z.ZodType<RawStyles>;

const navigateAction = z.object({
  type: z.literal('navigate'),
  to: z.string().min(1).max(31),
});
const setStateAction = z.object({
  type: z.literal('setState'),
  key: stateKey,
  value: z.union([z.string().max(240), z.number(), z.boolean(), z.null()]),
});
const toggleAction = z.object({ type: z.literal('toggle'), key: stateKey });
const toastAction = z.object({
  type: z.literal('toast'),
  text: z.string().min(1).max(120),
});
const openUrlAction = z.object({
  type: z.literal('openUrl'),
  url: z.string().url().max(500),
});

export const actionSchema: z.ZodType<Action> = z.lazy(() =>
  z.union([
    navigateAction,
    setStateAction,
    toggleAction,
    toastAction,
    openUrlAction,
    z.object({
      type: z.literal('when'),
      key: stateKey,
      equals: z.union([z.string().max(120), z.number(), z.boolean()]).optional(),
      then: z.array(actionSchema).max(10),
    }),
  ]),
) as unknown as z.ZodType<Action>;

export const eventsSchema = z
  .object({
    tap: z.array(actionSchema).max(12).optional(),
    change: z.array(actionSchema).max(12).optional(),
    submit: z.array(actionSchema).max(12).optional(),
  })
  .optional();

export interface RawNode {
  id?: string;
  name?: string;
  type: ComponentType;
  props?: Record<string, unknown>;
  styles?: RawStyles;
  children?: RawNode[];
  events?: z.infer<typeof eventsSchema>;
  visibleWhen?: { key: string; equals?: string | number | boolean };
}

export const nodeSchema: z.ZodType<RawNode> = z.lazy(() =>
  z
    .object({
      id: idSchema.optional(),
      name: z.string().max(40).optional(),
      type: z.enum(ALL_TYPES),
      props: z.record(z.unknown()).optional(),
      styles: styleSchema.optional(),
      children: z.array(nodeSchema).max(120).optional(),
      events: eventsSchema,
      visibleWhen: z
        .object({
          key: stateKey,
          equals: z.union([z.string().max(120), z.number(), z.boolean()]).optional(),
        })
        .optional(),
    })
    .passthrough(),
) as unknown as z.ZodType<RawNode>;

const screenIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,30}$/, 'screen ids are lower_snake_case slugs');

const screenSchema = z.object({
  id: screenIdSchema,
  name: z.string().min(1).max(40),
  root: nodeSchema,
  entry: z.boolean().optional(),
  mockData: z
    .record(z.array(z.record(z.union([z.string(), z.number(), z.boolean()]))).max(20))
    .optional(),
});

export const opSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('add'),
    parentId: idSchema,
    index: z.number().int().min(0).max(200).optional(),
    node: nodeSchema,
  }),
  z.object({ op: z.literal('remove'), id: idSchema }),
  z.object({
    op: z.literal('move'),
    id: idSchema,
    parentId: idSchema,
    index: z.number().int().min(0).max(200).optional(),
  }),
  z.object({ op: z.literal('setProps'), id: idSchema, props: z.record(z.unknown()) }),
  z.object({ op: z.literal('setStyles'), id: idSchema, styles: styleSchema }),
  z.object({ op: z.literal('setText'), id: idSchema, text: z.string().max(2000) }),
  z.object({ op: z.literal('rename'), id: idSchema, name: z.string().min(1).max(40) }),
  z.object({ op: z.literal('addScreen'), screen: screenSchema }),
  z.object({ op: z.literal('removeScreen'), id: screenIdSchema }),
  z.object({
    op: z.literal('renameScreen'),
    id: screenIdSchema,
    name: z.string().min(1).max(40),
  }),
  z.object({ op: z.literal('setEntry'), id: screenIdSchema }),
  z.object({ op: z.literal('setTokens'), patch: z.record(z.unknown()) }),
  z.object({
    op: z.literal('saveComponent'),
    name: z.string().min(3).max(31),
    description: z.string().max(120),
    root: nodeSchema,
  }),
  z.object({
    op: z.literal('placeComponent'),
    name: z.string().min(3).max(31),
    parentId: idSchema,
    index: z.number().int().min(0).max(200).optional(),
  }),
]);

export const toolSchemas = {
  read_canvas: z.object({}).passthrough(),
  set_design_tokens: z.object({
    patch: z
      .object({
        brand_color: z
          .string()
          .regex(/^#[0-9A-Fa-f]{6}$/)
          .optional(),
        secondary_color: z
          .string()
          .regex(/^#[0-9A-Fa-f]{6}$/)
          .optional(),
        theme_mode: z.string().max(20).optional(),
        corner_profile: z.string().max(20).optional(),
        density: z.string().max(20).optional(),
        radii_dp: z.record(z.number()).optional(),
        metrics_dp: z.record(z.number()).optional(),
        light_colors: z.record(z.string()).optional(),
        dark_colors: z.record(z.string()).optional(),
        font_heading: z.string().max(160).optional(),
        font_body: z.string().max(160).optional(),
      })
      .passthrough(),
    title: z.string().max(60).optional(),
  }),
  propose_blueprint: z.object({ blueprint_text: z.string().min(20).max(14000) }),
  ask_choice: z.object({
    question: z.string().min(3).max(160),
    options: z
      .array(
        z.object({
          label: z.string().min(1).max(60),
          hexes: z
            .array(z.string().regex(/^#[0-9A-Fa-f]{6}$/))
            .max(4)
            .optional(),
          note: z.string().max(120).optional(),
        }),
      )
      .min(2)
      .max(4),
  }),
  edit_canvas: z.object({
    screen_id: z.string().max(31).optional(),
    ops: z.array(opSchema).min(1).max(40),
  }),
  finish: z.object({ summary: z.string().min(3).max(400) }),
} as const;

export type ToolName = keyof typeof toolSchemas;

export const TOOL_NAMES: ToolName[] = [
  'read_canvas',
  'set_design_tokens',
  'propose_blueprint',
  'ask_choice',
  'edit_canvas',
  'finish',
];

export interface ToolCall {
  id: string;
  name: ToolName;
  argsText: string;
}

export interface ToolResult {
  ok: boolean;
  name: ToolName;
  code?: string;
  message?: string;
  data?: unknown;
}

export interface DesignTokenPatch {
  patch: Partial<DesignTokens['openuiTheme']> & Record<string, unknown>;
  title?: string;
}

export const ICON_ENUM = [...ICON_NAMES];
