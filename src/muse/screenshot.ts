import type { ProjectDoc } from '../types/tree';
import { useProject } from '../store/useProject';
import { useAgent } from '../store/useAgent';
import { useUi } from '../store/useUi';
import { chatStream, segmentImage, MuseError } from './client';
import { buildTokenSheet } from './tokenSheet';
import { buildProjectIndex } from './projectIndex';
import { presentBlueprint } from './loop';

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read that image.'));
    reader.readAsDataURL(file);
  });
}

interface SegmentBox {
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

async function describeBlueprint(
  doc: ProjectDoc,
  imageUrl: string,
  boxes: SegmentBox[],
): Promise<string> {
  const sheet = buildTokenSheet(doc.tokens);
  const index = buildProjectIndex(doc).slice(0, 1400);
  const result = await chatStream({
    model: useAgent.getState().models?.chat.id || 'muse-spark-1.3',
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
            text: `Rebuild this mockup as a blueprint. SAM measured ${boxes.length} elements: ${JSON.stringify(
              boxes,
            ).slice(0, 2600)}`,
          },
          { type: 'image_url', image_url: { url: imageUrl } },
        ] as unknown as string,
      },
    ],
    maxTokens: 1800,
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
    if (agent.demoMode || !agent.configured) {
      addSystem(
        'Screenshot reading needs a muse key (SAM + spark vision). No key on this server.',
      );
      addAgent(
        'I can still build this from words: describe the screen in one line ("a habit tracker home with today\'s progress and a habit list") and I will propose the blueprint. Canvas, drag/drop, inspector and Run mode all work without a key.',
      );
      useUi.getState().toast('No key for vision — describe it instead.', 'warn');
      return;
    }
    useAgent.getState().startTurn();
    useAgent.getState().setLive('Reading the screenshot — SAM is segmenting elements…');
    addSystem('Screenshot dropped — segmenting with SAM…');
    let boxes: SegmentBox[] = [];
    try {
      const seg = await segmentImage(dataUrl);
      boxes = normalizeSegments(seg);
      addSystem(
        `SAM found ${boxes.length} element${boxes.length === 1 ? '' : 's'} — spark is naming and nesting them…`,
      );
    } catch (err) {
      addSystem(
        `SAM segmentation failed (${err instanceof Error ? err.message : String(err)}). Continuing with vision only.`,
      );
    }
    const blueprint = await describeBlueprint(useProject.getState().doc, dataUrl, boxes);
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
    addSystem(
      `Screenshot pipeline failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    useAgent.getState().endTurn();
    useAgent.getState().setLive(null);
  }
}
