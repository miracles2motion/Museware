import { findNodeInDoc } from '../ops/treeUtils';
import { useAgent } from '../store/useAgent';
import { useProject } from '../store/useProject';
import type { ComponentNode } from '../types/tree';
import { generateImage, MuseError } from './client';

export type ImageTarget = { id: string; prompt?: string };
export type ImageOutcome = { id: string; ok: boolean; message: string; stop?: boolean };
const rail = (text: string) => useProject.getState().addRail({ role: 'system', text });

/** Shared by the agent, build pass, and inspector. Each image is one undoable op. */
export async function illustrateTarget(
  target: ImageTarget,
  options: { signal?: AbortSignal; onlyEmpty?: boolean } = {},
): Promise<ImageOutcome> {
  const doc = useProject.getState().doc;
  const hit = findNodeInDoc(doc, target.id);
  const node = hit?.node;
  if (!node || !['hero', 'image', 'card'].includes(node.type))
    return {
      id: target.id,
      ok: false,
      message: 'Target must be an existing hero, image, or card.',
    };
  const key = node.type === 'image' ? 'src' : 'image';
  const previous = node.props[key];
  if (options.onlyEmpty && (node.props.src || node.props.image))
    return { id: node.id, ok: false, message: 'Already has an image.' };
  const agent = useAgent.getState();
  if (agent.demoMode)
    return {
      id: node.id,
      ok: false,
      stop: true,
      message:
        'Image generation needs a muse key; the local engine cannot generate images.',
    };
  if (
    agent.keySource !== 'session' &&
    (agent.houseKey === 'exhausted' || agent.budget?.exhausted)
  )
    return {
      id: node.id,
      ok: false,
      stop: true,
      message: 'Shared key budget exhausted; image generation skipped.',
    };
  if (options.signal?.aborted)
    return {
      id: node.id,
      ok: false,
      stop: true,
      message: 'Stopped before image generation.',
    };
  const light = doc.tokens.openuiTheme.light_colors || {};
  const palette = [
    ...new Set(
      [
        doc.tokens.openuiTheme.brand_color,
        doc.tokens.openuiTheme.secondary_color,
        light.openui_bg,
      ].filter((v): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)),
    ),
  ].slice(0, 3);
  const subject =
    target.prompt ||
    `${node.type === 'hero' ? 'Hero' : node.type === 'card' ? 'Product card' : 'Editorial'} image for ${hit.screen.name}, ${doc.name}. ${String(node.props.title || node.props.alt || '')}`;
  const prompt = `${subject.slice(0, 700)}. Complement this palette: ${palette.join(', ')}. Professional polished visual, no text, no logos.`;
  try {
    const src = await generateImage(
      prompt,
      node.type === 'hero' ? '1200x640' : '1024x1024',
    );
    const current = findNodeInDoc(useProject.getState().doc, node.id)?.node;
    if (
      options.signal?.aborted ||
      !current ||
      current.type !== node.type ||
      current.props[key] !== previous ||
      (options.onlyEmpty && (current.props.src || current.props.image))
    )
      return {
        id: node.id,
        ok: false,
        message: 'Image not applied because the target changed or the action was stopped.',
      };
    const result = useProject
      .getState()
      .applyBatch([{ op: 'setProps', id: node.id, props: { [key]: src } }], {
        source: 'agent',
      });
    if (result.errors.length) throw new Error(result.errors[0].message);
    rail(`🖼 muse-image illustrated ${node.id}; image saved and undoable.`);
    return { id: node.id, ok: true, message: 'Image applied.' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stop =
      err instanceof MuseError &&
      [
        'house_key_exhausted',
        'no_key',
        'house_key_rejected',
        'house_key_rate_limited',
        'unauthorized',
        'rate_limited',
      ].includes(err.code);
    rail(
      `Image generation for ${node.id} failed: ${message}. The image remains unchanged.`,
    );
    return { id: node.id, ok: false, message, stop };
  }
}

export async function illustrateTargets(
  targets: ImageTarget[],
  options: { signal?: AbortSignal; onlyEmpty?: boolean } = {},
): Promise<ImageOutcome[]> {
  const outcomes: ImageOutcome[] = [];
  for (const target of targets.slice(0, 6)) {
    const outcome = await illustrateTarget(target, options);
    outcomes.push(outcome);
    if (outcome.stop) {
      rail(`Image generation stopped: ${outcome.message}`);
      break;
    }
  }
  return outcomes;
}

export async function autoIllustrate(
  screenIds: string[],
  context: string,
  limit: number,
  signal?: AbortSignal,
): Promise<ImageOutcome[]> {
  const targets: ImageTarget[] = [];
  const visit = (node: ComponentNode, screenName: string) => {
    if (
      (node.type === 'hero' || node.type === 'image') &&
      !node.props.src &&
      !node.props.image
    )
      targets.push({
        id: node.id,
        prompt: `${node.type} for ${screenName}. Project context: ${context.slice(0, 500)}. ${String(node.props.title || node.props.alt || '')}`,
      });
    node.children.forEach((child) => visit(child, screenName));
  };
  for (const screen of useProject.getState().doc.screens)
    if (screenIds.includes(screen.id)) visit(screen.root, screen.name);
  const cap = Math.max(0, Math.min(30, Math.floor(Number.isFinite(limit) ? limit : 3)));
  if (targets.length > cap)
    rail(
      `Auto-illustration limited to ${cap} image(s); ${targets.length - cap} remain empty.`,
    );
  const outcomes: ImageOutcome[] = [];
  for (const target of targets.slice(0, cap)) {
    const result = await illustrateTarget(target, { signal, onlyEmpty: true });
    outcomes.push(result);
    if (result.stop) {
      rail(`Auto-illustration stopped: ${result.message}`);
      break;
    }
  }
  return outcomes;
}
