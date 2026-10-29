import { isContainerType } from '../types/library';
import type { ProjectDoc } from '../types/tree';

/**
 * LAYOUT v2 — the one-time move that ended the split brain.
 *
 * Before the style dictionary, a Row or Column kept its `gap`, `align` and
 * `wrap` in PROPS while a Screen kept them in STYLES, and `styles.align`
 * meant align-self while `props.align` meant align-items. One word, two homes,
 * two meanings — the reason the same "Align" appeared twice in the panel.
 *
 * This migration moves each value to the home that matches what it always did:
 *
 *   props.gap|align|wrap  → styles.gap|align|wrap   (containers: align-items)
 *   props.pad             → styles.padding          (card: it was padding all along)
 *   styles.align          → styles.selfAlign        (it always compiled to align-self)
 *   styles.justify:stretch → dropped                (never a valid justify-content)
 *
 * It runs on every load, is idempotent, and is guarded by `layoutVersion` so a
 * migrated document is never touched twice — the fallback in cssGen keeps old
 * docs rendering identically even if they are never saved again.
 */

const LAYOUT_KEYS = ['gap', 'align', 'wrap'] as const;

type LooseNode = {
  type?: string;
  props?: Record<string, unknown>;
  styles?: Record<string, unknown>;
  children?: LooseNode[];
  responsive?: unknown;
};

type Block = Record<string, unknown>;

function dropInvalidJustify(block: Block | undefined) {
  if (!block) return;
  if (block.justify === 'stretch') delete block.justify;
}

function migrateNode(node: LooseNode | undefined) {
  if (!node || typeof node !== 'object') return;
  const props: Block = node.props && typeof node.props === 'object' ? node.props : {};
  const styles: Block = node.styles && typeof node.styles === 'object' ? node.styles : {};
  const container = isContainerType(String(node.type));

  /*
   * On a LEAF, styles.align used to mean align-self (it compiled to align-self,
   * and the old panel offered it under "Align"). It moves to selfAlign, which
   * is the same rule under its own name.
   *
   * On a CONTAINER, `align` now means align-items, so a migrated container must
   * not be demoted a second time. That is what `layoutVersion` is for: this
   * function is a one-way trip per document, and parseProjectDoc stamps every
   * document it opens.
   */
  if (!container && styles.align !== undefined && styles.selfAlign === undefined) {
    styles.selfAlign = styles.align;
    delete styles.align;
  }

  if (container) {
    for (const key of LAYOUT_KEYS) {
      if (props[key] === undefined) continue;
      if (styles[key] === undefined) styles[key] = props[key];
      delete props[key];
    }
    if (node.type === 'card' && props.pad !== undefined) {
      if (styles.padding === undefined) styles.padding = props.pad;
      delete props.pad;
    }
  }

  dropInvalidJustify(styles);
  const responsive = styles.responsive as
    | { medium?: Block; expanded?: Block }
    | undefined;
  dropInvalidJustify(responsive?.medium);
  dropInvalidJustify(responsive?.expanded);

  node.props = props;
  node.styles = styles;
  for (const child of node.children || []) migrateNode(child);
}

/**
 * Mutates a *copy*. Safe on raw JSON (before zod) and on a typed document; the
 * version marker is what makes the second call a no-op.
 */
export function migrateLayoutV2<T>(doc: T): T {
  const anyDoc = doc as unknown as { layoutVersion?: number; screens?: LooseNode[] };
  if (!anyDoc || typeof anyDoc !== 'object') return doc;
  if ((anyDoc.layoutVersion || 1) >= 2) return doc;

  const copy = JSON.parse(JSON.stringify(doc)) as {
    layoutVersion?: number;
    screens?: LooseNode[];
  };
  for (const screen of copy.screens || []) {
    const loose = screen as unknown as { root?: LooseNode };
    if (loose.root) migrateNode(loose.root);
  }
  copy.layoutVersion = 2;
  return copy as unknown as T;
}

/** True when a document still carries pre-v2 layout props. */
export function needsLayoutMigration(doc: ProjectDoc): boolean {
  return (doc.layoutVersion || 1) < 2;
}
