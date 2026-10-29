import { z } from 'zod';
import { nodeSchema, styleSchema } from '../types/tools';
import type { ProjectDoc } from '../types/tree';
import { MUSEWARE_DEFAULT_THEME, cloneTheme } from '../design/starter';
import { migrateLayoutV2 } from './migrate';

const styleSet = styleSchema;

const actionSchemaLoose = z
  .object({ type: z.string(), key: z.string().optional(), to: z.string().optional() })
  .passthrough();

const railCardSchema = z
  .object({
    kind: z.enum([
      'build_choice',
      'blueprint',
      'choice',
      'color',
      'progress',
      'error',
      'key',
    ]),
    state: z.enum(['pending', 'answered', 'cancelled', 'expired']),
    data: z.record(z.unknown()),
  })
  .passthrough();

export const railEntrySchema = z
  .object({
    id: z.string().min(1),
    at: z.number(),
    role: z.enum(['user', 'agent', 'system', 'card']),
    text: z.string(),
    card: railCardSchema.optional(),
  })
  .passthrough();

export const screenSchema = z
  .object({
    id: z.string().min(1).max(31),
    name: z.string().min(1).max(80),
    root: nodeSchema,
    entry: z.boolean().optional(),
    mockData: z
      .record(z.array(z.record(z.union([z.string(), z.number(), z.boolean()]))))
      .optional(),
  })
  .passthrough();

const customComponentSchema = z
  .object({
    name: z.string().min(1).max(40),
    description: z.string().max(200).default(''),
    root: nodeSchema,
    preview: z.string().optional(),
  })
  .passthrough();

const tokensSchema = z
  .object({
    title: z.string().default('Imported theme'),
    specVersion: z.string().default('openui-1.0'),
    openuiTheme: z
      .object({
        brand_color: z.string().default('#2563EB'),
        secondary_color: z.string().default('#6366F1'),
        light_colors: z.record(z.string()).default({}),
        dark_colors: z.record(z.string()).default({}),
      })
      .passthrough(),
    tokens: z.array(z.record(z.unknown())).default([]),
  })
  .passthrough();

export const projectSchema = z
  .object({
    format: z.literal('museware/1'),
    name: z.string().min(1).max(80).default('Untitled project'),
    screens: z.array(screenSchema).default([]),
    tokens: tokensSchema.default(() => cloneTheme(MUSEWARE_DEFAULT_THEME) as never),
    opLog: z
      .array(
        z
          .object({
            at: z.number(),
            source: z.enum(['agent', 'user']),
            batch: z.array(z.record(z.unknown())).default([]),
            summary: z.string().default(''),
          })
          .passthrough(),
      )
      .default([]),
    rail: z.array(railEntrySchema).default([]),
    kind: z.enum(['web', 'app']).default('web'),
    customComponents: z.array(customComponentSchema).default([]),
    blueprint: z
      .object({ text: z.string(), decided: z.boolean(), updatedAt: z.number() })
      .optional(),
    builtWithContributor: z.boolean().optional(),
    updatedAt: z.number().default(() => Date.now()),
  })
  .passthrough();

export { styleSet, actionSchemaLoose };

/** Import a project doc, merging import-safe defaults for anything missing. */
export function parseProjectDoc(input: unknown): ProjectDoc {
  /*
   * Migrate the RAW json before zod sees it: a v1 document may hold a style
   * value the dictionary now rejects (justify:'stretch'), and refusing to open
   * somebody's project to teach them a rule is the wrong trade. Migration
   * rewrites it to something valid and version-stamped, so this is a no-op on
   * the second load.
   */
  const parsed = projectSchema.parse(migrateLayoutV2(input)) as unknown as ProjectDoc;
  const doc: ProjectDoc = {
    ...parsed,
    tokens: {
      ...cloneTheme(MUSEWARE_DEFAULT_THEME),
      ...(parsed.tokens as typeof parsed.tokens),
    },
    screens: parsed.screens.map((s) => ({
      ...s,
      root: {
        ...s.root,
        props: s.root.props || {},
        styles: s.root.styles || {},
        children: s.root.children || [],
      },
    })),
  };
  if (!doc.screens.length) doc.screens = [];
  if (doc.screens.length && !doc.screens.some((s) => s.entry)) doc.screens[0].entry = true;
  doc.layoutVersion = Math.max(2, doc.layoutVersion || 2);
  return doc;
}
