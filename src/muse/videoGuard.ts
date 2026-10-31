import type { ProjectDoc } from '../types/tree';
import { findNodeInDoc } from '../ops/treeUtils';
/** Fail closed: model-authored video URLs must be literally present in the latest human prompt. */
export function videoSourceViolation(
  ops: unknown[],
  doc: ProjectDoc,
  prompt: string,
): string | null {
  const videoIds = new Set<string>();
  const urls = new Set(
    (prompt.match(/https:\/\/[^\s<>"'`]+/gi) || []).map((url) =>
      url.replace(/[),.;!?]+$/, ''),
    ),
  );
  const visit = (value: unknown): string | null => {
    if (!value || typeof value !== 'object') return null;
    if (Array.isArray(value)) {
      for (const child of value) {
        const bad = visit(child);
        if (bad) return bad;
      }
      return null;
    }
    const obj = value as Record<string, unknown>;
    if (obj.type === 'video') {
      if (typeof obj.id === 'string') videoIds.add(obj.id);
      const props = obj.props as Record<string, unknown> | undefined;
      if (typeof props?.src === 'string' && props.src && !urls.has(props.src))
        return props.src;
    }
    for (const child of Object.values(obj)) {
      const bad = visit(child);
      if (bad) return bad;
    }
    return null;
  };
  for (const op of ops) {
    const bad = visit(op);
    if (bad) return bad;
  }
  for (const op of ops) {
    const obj = op as { op?: string; id?: string; props?: Record<string, unknown> };
    if (
      obj?.op === 'setProps' &&
      obj.id &&
      (videoIds.has(obj.id) || findNodeInDoc(doc, obj.id)?.node.type === 'video')
    ) {
      const src = obj.props?.src;
      if (typeof src === 'string' && src && !urls.has(src)) return src;
    }
  }
  return null;
}
