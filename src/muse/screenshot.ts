import type { ProjectDoc } from '../types/tree';
import { useProject } from '../store/useProject';
import { useAgent } from '../store/useAgent';
import { useUi } from '../store/useUi';
import { chatStream, segmentImage, MuseError, estimateCents } from './client';
import { buildTokenSheet } from './tokenSheet';
import { buildProjectIndex } from './projectIndex';
import { offerKey, presentBlueprint } from './loop';
import { diagnose } from './connection';

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read that image.'));
    reader.readAsDataURL(file);
  });
}

export interface SegmentBox {
  label: string;
  box: [number, number, number, number];
}

function normalizeSegments(raw: unknown): SegmentBox[] {
  const out: SegmentBox[] = [];
  const seen = new Set<string>();
  const visit = (value: unknown, depth = 0) => {
    if (depth > 6 || !value) return;
    if (Array.isArray(value)) {
      value.forEach((v) => visit(v, depth + 1));
      return;
    }
    if (typeof value !== 'object') return;
    const obj = value as Record<string, unknown>;
    const label =
      (typeof obj.label === 'string' && obj.label) ||
      (typeof obj.name === 'string' && obj.name) ||
      (typeof obj.phrase === 'string' && obj.phrase) ||
      '';
    const rawBox: unknown =
      obj.box ??
      obj.bbox ??
      obj.bounds ??
      (obj.x !== undefined ? [obj.x, obj.y, obj.width, obj.height] : null);
    if (label && Array.isArray(rawBox) && rawBox.length >= 4) {
      const nums = rawBox.slice(0, 4).map((n) => Number(n));
      if (nums.every((n) => Number.isFinite(n))) {
        const key = `${label}:${nums.join(',')}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push({ label, box: nums as [number, number, number, number] });
        }
      }
    }
    for (const v of Object.values(obj)) visit(v, depth + 1);
  };
  visit(raw);
  return out.slice(0, 40);
}

export interface SegmentNode {
  label: string;
  box: [number, number, number, number];
  depth: number;
  children: SegmentNode[];
}

const TOL = 2;

function area(box: [number, number, number, number]): number {
  return Math.max(0, box[2]) * Math.max(0, box[3]);
}

function contains(outer: SegmentBox['box'], inner: SegmentBox['box']): boolean {
  return (
    inner[0] >= outer[0] - TOL &&
    inner[1] >= outer[1] - TOL &&
    inner[0] + inner[2] <= outer[0] + outer[2] + TOL &&
    inner[1] + inner[3] <= outer[1] + outer[3] + TOL
  );
}

/**
 * §8.9 step 2: SAM returns a flat pile of boxes. Reading order (y, then x) is
 * what a human sees; containment is what the tree is. A box fully inside another
 * becomes its child, and a near-identical duplicate is dropped (SAM likes to
 * report the label AND the text inside it).
 */
function overlap(a: SegmentBox['box'], b: SegmentBox['box']): number {
  const x = Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]));
  const y = Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
  const inter = x * y;
  const union = area(a) + area(b) - inter;
  return union <= 0 ? 0 : inter / union;
}

export function layoutSegments(boxes: SegmentBox[]): SegmentNode[] {
  const cleaned: SegmentBox[] = [];
  for (const item of boxes) {
    const dup = cleaned.some(
      (other) =>
        other.label.trim().toLowerCase() === item.label.trim().toLowerCase() &&
        overlap(other.box, item.box) > 0.6,
    );
    if (!dup) cleaned.push(item);
  }

  const ordered = [...cleaned].sort((a, b) => {
    const dy = a.box[1] - b.box[1];
    if (Math.abs(dy) > 6) return dy;
    return a.box[0] - b.box[0];
  });

  const nodes: SegmentNode[] = ordered.map((item) => ({
    label: item.label,
    box: item.box,
    depth: 0,
    children: [],
  }));

  // Smallest enclosing box wins, so a label inside a card inside a list row
  // lands on the card, not the row.
  const parentOf = new Map<SegmentNode, SegmentNode>();
  for (const node of nodes) {
    let best: SegmentNode | null = null;
    for (const other of nodes) {
      if (other === node) continue;
      if (!contains(other.box, node.box)) continue;
      if (area(other.box) <= area(node.box)) continue;
      if (!best || area(other.box) < area(best.box)) best = other;
    }
    if (best) parentOf.set(node, best);
  }

  // Guard against a containment cycle (identical boxes with different labels).
  for (const node of nodes) {
    let cursor = parentOf.get(node);
    let hops = 0;
    while (cursor && hops < 8) {
      if (cursor === node) {
        parentOf.delete(node);
        break;
      }
      cursor = parentOf.get(cursor);
      hops += 1;
    }
  }

  const roots: SegmentNode[] = [];
  for (const node of nodes) {
    const parent = parentOf.get(node);
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const setDepth = (list: SegmentNode[], depth: number) => {
    for (const node of list) {
      node.depth = depth;
      setDepth(node.children, depth + 1);
    }
  };
  setDepth(roots, 0);
  return roots;
}

/** Depth-first, reading order — the order the model should name them in. */
export function flattenSegments(roots: SegmentNode[]): SegmentNode[] {
  const out: SegmentNode[] = [];
  const walk = (list: SegmentNode[]) => {
    for (const node of list) {
      out.push(node);
      walk(node.children);
    }
  };
  walk(roots);
  return out;
}

/**
 * The one batched prompt input: every element with its geometry, its depth and
 * its index. The model answers per index, so nothing is skipped or re-asked.
 */
export function elementsOutline(roots: SegmentNode[], limit = 40): string {
  const rows = flattenSegments(roots).slice(0, limit);
  return rows
    .map((node, i) => {
      const [x, y, w, h] = node.box.map((n) => Math.round(n));
      const pad = '  '.repeat(Math.min(node.depth, 6));
      return `${i + 1}. ${pad}${node.label} @ ${x},${y} ${w}x${h}`;
    })
    .join('\n');
}

/**
 * §8.9 step 3: crop every box so spark can read the pixels, not just the label.
 * One batched pass, one request — never one call per element. In a test
 * environment there is no 2d context, and the pipeline falls back to the
 * full image (still a single call).
 */
async function cropRegions(
  imageUrl: string,
  roots: SegmentNode[],
  maxCrops = 24,
): Promise<Array<{ label: string; b64: string }>> {
  if (typeof document === 'undefined') return [];
  const nodes = flattenSegments(roots).slice(0, maxCrops);
  if (!nodes.length) return [];
  const image = new Image();
  const loaded = await new Promise<boolean>((resolve) => {
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = imageUrl;
  });
  if (!loaded) return [];
  const crops: Array<{ label: string; b64: string }> = [];
  for (const node of nodes) {
    const [x, y, w, h] = node.box;
    const scale = Math.min(1, 512 / Math.max(w, h, 1));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return [];
    ctx.drawImage(image, x, y, w, h, 0, 0, canvas.width, canvas.height);
    // JPEG keeps the request small; these crops are scouting, not output.
    const b64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1] || '';
    if (b64) crops.push({ label: node.label, b64 });
  }
  return crops;
}

async function describeBlueprint(
  doc: ProjectDoc,
  imageUrl: string,
  roots: SegmentNode[],
): Promise<string> {
  const sheet = buildTokenSheet(doc.tokens);
  const index = buildProjectIndex(doc).slice(0, 1400);
  const outline = elementsOutline(roots);
  const crops = await cropRegions(imageUrl, roots);
  const model = useAgent.getState().models?.chat.id || 'muse-spark-1.3';
  const started = Date.now();
  let result;
  try {
    result = await chatStream({
      model,
      effort: 'low',
      messages: [
        {
          role: 'system',
          content: `You recreate UIs as Museware blueprints. Format exactly: RULES, then "SCREEN: <Name>", component lines "- <id> (<type>) <what it does>", a LOOK line with hard numbers, STATE, WIRING. Library types only (screen, row, col, grid, card, hero, section, form, heading, text, label, badge, button, input, image, list, table, stat, chart, navbar, bottomnav, link, icon, avatar, progress). Keep copy verbatim. Never invent hexes.\n\nTOKEN SHEET:\n${sheet}\n\nEXISTING CANVAS (keep ids unique):\n${index}`,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Rebuild this mockup as a blueprint. SAM measured ${flattenSegments(roots).length} elements, already sorted in reading order and nested by containment (indent = child). Name EVERY numbered element in one pass — type from the library, text verbatim, role, and which Museware container it belongs in. Geometry is a scaffold, never absolute output: the tree stays responsive.\n\nELEMENTS:\n${outline}`,
            },
            { type: 'image_url', image_url: { url: imageUrl } },
            ...crops.flatMap((crop, i) => [
              { type: 'text', text: `crop ${i + 1} — ${crop.label}:` },
              {
                type: 'image_url',
                image_url: { url: `data:image/jpeg;base64,${crop.b64}` },
              },
            ]),
          ] as unknown as string,
        },
      ],
      maxTokens: 1800,
    });
  } catch (error) {
    const source = useAgent.getState().keySource;
    useAgent
      .getState()
      .addReceipt({
        role: 'vision',
        model,
        status: 'failed',
        latencyMs: Date.now() - started,
        promptChars: sheet.length + index.length + outline.length,
        toolNames: [],
        ...(source === 'none'
          ? {}
          : { key: source === 'session' ? ('user' as const) : ('house' as const) }),
      });
    throw error;
  }
  useAgent
    .getState()
    .addReceipt({
      role: 'vision',
      model: result.model,
      latencyMs: result.latencyMs,
      promptChars: sheet.length + index.length + outline.length,
      toolNames: [],
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      cachedTokens: result.usage.cachedTokens,
      cents: estimateCents(result.model, result.usage),
      ...(useAgent.getState().keySource === 'none'
        ? {}
        : {
            key:
              useAgent.getState().keySource === 'session'
                ? ('user' as const)
                : ('house' as const),
          }),
    });
  return result.text;
}

/** Screenshot → Canvas: SAM measures, spark reads, output = a normal approval card. */
export async function recreateFromScreenshot(file: File): Promise<void> {
  const agent = useAgent.getState();
  const addSystem = (text: string) =>
    useProject.getState().addRail({ role: 'system', text });
  const addAgent = (text: string) => useProject.getState().addRail({ role: 'agent', text });
  try {
    const dataUrl = await readAsDataUrl(file);
    // Only an explicitly chosen local engine pre-empts the pipeline. A stale or
    // failed boot status must NOT: if a key exists, dropping a screenshot should
    // just work, and if it truly does not, the proxy will say so in its own words.
    if (agent.demoMode) {
      if (agent.statusError) {
        addSystem(
          `The muse proxy is not answering on this deployment (${agent.statusError}), so the local engine is running. Vision needs the proxy.`,
        );
      } else {
        addSystem(
          'The local engine is on, and it has no vision model (SAM + spark). That is a setting, not a suggestion that you did something wrong.',
        );
      }
      addAgent(
        'I can still build this from words: describe the screen in one line ("a habit tracker home with today\'s progress and a habit list") and I will propose the blueprint. Canvas, drag/drop, inspector and Run mode all work without a key.',
      );
      useUi.getState().toast('No vision without the proxy — describe it instead.', 'warn');
      return;
    }
    useAgent.getState().startTurn();
    useAgent.getState().setLive('Reading the screenshot — SAM is segmenting elements…');
    addSystem('Screenshot dropped — segmenting with SAM…');
    let roots: SegmentNode[] = [];
    try {
      const seg = await segmentImage(dataUrl);
      roots = layoutSegments(normalizeSegments(seg));
      const total = flattenSegments(roots).length;
      addSystem(
        `SAM found ${total} element${total === 1 ? '' : 's'} — sorted in reading order, nested by containment, spark is naming all of them in one pass…`,
      );
    } catch (err) {
      const why = diagnose(err);
      // A key problem or a missing deployment will fail the next call too, so we
      // stop here and say the true thing instead of blaming the screenshot.
      if (why.kind !== 'other') {
        addSystem(why.text);
        if (why.offerKey) offerKey(why.text, '');
        else
          addAgent(
            'The canvas, drag/drop, the inspector and the export all work without the proxy. Screenshot reading is the one thing that needs it.',
          );
        useUi
          .getState()
          .toast('Vision is unavailable — the reason is in the rail.', 'warn');
        return;
      }
      addSystem(
        `SAM segmentation failed (${err instanceof Error ? err.message : String(err)}). Continuing with vision only.`,
      );
    }
    const blueprint = await describeBlueprint(useProject.getState().doc, dataUrl, roots);
    if (!blueprint.trim()) {
      addAgent(
        'I could not read that image clearly. Try a cleaner screenshot, or describe the screen in one line.',
      );
      return;
    }
    presentBlueprint(blueprint);
    addSystem('Recreation drafted — approve it to fill the screen, or adjust.');
  } catch (err) {
    if (err instanceof MuseError && err.code === 'aborted') return;
    const why = diagnose(err);
    addSystem(
      why.kind === 'other'
        ? `Screenshot pipeline failed: ${why.text}`
        : `Screenshot pipeline stopped: ${why.text}`,
    );
    if (why.offerKey) offerKey(why.text, '');
  } finally {
    useAgent.getState().endTurn();
    useAgent.getState().setLive(null);
  }
}
