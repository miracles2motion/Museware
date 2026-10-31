import { findNodeInDoc, findParent } from '../ops/treeUtils';
import { SCAFFOLD_STRINGS } from '../types/library';
import { useAgent } from '../store/useAgent';
import { useProject } from '../store/useProject';
import type { ComponentNode, ProjectDoc, ScreenDoc } from '../types/tree';
import { generateImage, MuseError } from './client';

export type ImageTarget = { id: string; prompt?: string };
export type ImageOutcome = { id: string; ok: boolean; message: string; stop?: boolean };
const rail = (text: string) => useProject.getState().addRail({ role: 'system', text });

/** Nearby meaningful copy and the blueprint section describe the actual subject. */
export function imageSubject(
  doc: ProjectDoc,
  screen: ScreenDoc,
  node: ComponentNode,
  brief?: string,
  context?: string,
): string {
  const parts: string[] = [];
  const add = (text: unknown) => {
    if (typeof text !== 'string') return;
    const clean = text.trim().replace(/\s+/g, ' ');
    if (
      clean &&
      clean.length <= 240 &&
      !SCAFFOLD_STRINGS.has(clean) &&
      !/^(image|hero|picture|photo)$/i.test(clean) &&
      !parts.includes(clean)
    )
      parts.push(clean);
  };
  add(node.props.alt);
  add(node.props.title);
  add(node.name);
  let current = node;
  for (let level = 0; level < 2; level += 1) {
    const parent = findParent(screen.root, current.id)?.parent;
    if (!parent || parent.type === 'screen') break;
    const collect = (child: ComponentNode, depth: number) => {
      if (child.id === node.id || parts.length >= 4 || depth > 3) return;
      add(child.props.title);
      add(child.props.text);
      add(child.props.subtitle);
      child.children.forEach((item) => collect(item, depth + 1));
    };
    collect(parent, 0);
    current = parent;
    if (parts.length >= 2) break;
  }
  const blueprint = doc.blueprint?.text || context || '';
  const related = blueprint
    .split(/\r?\n/)
    .find((line) => line.toLowerCase().includes(node.id.toLowerCase()));
  if (related) add(related.replace(/^\s*[-*]\s*/, '').slice(0, 220));
  add(
    brief
      ?.replace(
        /flat vector(?:-style)?|abstract (?:background|waves)|no text(?: in the image)?/gi,
        '',
      )
      .trim(),
  );
  if (!parts.length) add(screen.name);
  if (!parts.length) add(doc.name);
  // Include the screen's headline as broad brand context, after local product copy.
  const headline = (branch: ComponentNode): string | undefined => {
    if (branch.type === 'heading' && typeof branch.props.text === 'string')
      return branch.props.text;
    for (const child of branch.children) {
      const text = headline(child);
      if (text) return text;
    }
    return undefined;
  };
  add(headline(screen.root));
  return parts.slice(0, 6).join('; ') || 'the featured product or scene';
}

/** Shared by the agent, build pass, and inspector. Each image is one undoable op. */
export async function illustrateTarget(
  target: ImageTarget,
  options: { signal?: AbortSignal; onlyEmpty?: boolean; context?: string } = {},
): Promise<ImageOutcome> {
  const doc = useProject.getState().doc;
  const documentEpoch = useProject.getState().documentEpoch;
  const hit = findNodeInDoc(doc, target.id);
  rail(`Illustrating ${target.id}…`);
  const finish = (outcome: ImageOutcome): ImageOutcome => {
    if (useProject.getState().documentEpoch === documentEpoch)
      rail(
        outcome.ok
          ? `🖼 ${target.id} saved — image is undoable.`
          : `Image not generated for ${target.id}: ${outcome.message}`,
      );
    return outcome;
  };
  const node = hit?.node;
  if (!node || !['hero', 'image', 'card'].includes(node.type))
    return finish({
      id: target.id,
      ok: false,
      message: 'Target must be an existing hero, image, or card.',
    });
  const key = node.type === 'image' ? 'src' : 'image';
  const previous = JSON.stringify([node.props.src, node.props.image]);
  if (options.onlyEmpty && (node.props.src || node.props.image))
    return finish({ id: node.id, ok: false, message: 'Already has an image.' });
  const agent = useAgent.getState();
  if (agent.demoMode)
    return finish({
      id: node.id,
      ok: false,
      stop: true,
      message:
        'Image generation needs a muse key; the local engine cannot generate images.',
    });
  if (
    agent.keySource !== 'session' &&
    (agent.houseKey === 'exhausted' || agent.budget?.exhausted)
  )
    return finish({
      id: node.id,
      ok: false,
      stop: true,
      message: 'Shared key budget exhausted; image generation skipped.',
    });
  if (options.signal?.aborted)
    return finish({
      id: node.id,
      ok: false,
      stop: true,
      message: 'Stopped before image generation.',
    });
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
  const subject = imageSubject(doc, hit.screen, node, target.prompt, options.context);
  const paletteHint = palette.length
    ? ` Accent colors and props inspired by ${palette.join(', ')}.`
    : '';
  const prompt = `Professional subject-driven photograph of ${subject.slice(0, 700)}. Warm natural light, shallow depth of field, carefully styled real-world materials.${paletteHint}`;
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
      useProject.getState().documentEpoch !== documentEpoch ||
      JSON.stringify([current.props.src, current.props.image]) !== previous ||
      (options.onlyEmpty && (current.props.src || current.props.image))
    )
      return finish({
        id: node.id,
        ok: false,
        message: 'Image not applied because the target changed or the action was stopped.',
      });
    const result = useProject
      .getState()
      .applyBatch([{ op: 'setProps', id: node.id, props: { [key]: src } }], {
        source: 'agent',
      });
    if (result.errors.length) throw new Error(result.errors[0].message);
    return finish({ id: node.id, ok: true, message: 'Image applied.' });
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
    if (
      err instanceof MuseError &&
      err.code === 'house_key_exhausted' &&
      agent.keySource !== 'session'
    )
      useAgent.setState({ houseKey: 'exhausted' });
    return finish({ id: node.id, ok: false, message, stop });
  }
}

export async function illustrateTargets(
  targets: ImageTarget[],
  options: { signal?: AbortSignal; onlyEmpty?: boolean } = {},
): Promise<ImageOutcome[]> {
  const outcomes: ImageOutcome[] = [];
  const documentEpoch = useProject.getState().documentEpoch;
  const eligible = targets.slice(0, 6);
  for (const target of eligible) {
    if (useProject.getState().documentEpoch !== documentEpoch) break;
    const outcome = await illustrateTarget(target, options);
    outcomes.push(outcome);
    if (useProject.getState().documentEpoch !== documentEpoch) break;
    if (outcome.stop) {
      const skipped = eligible.slice(outcomes.length);
      rail(
        `Image generation stopped: ${outcome.message}${skipped.length ? `; skipped ${skipped.map((item) => item.id).join(', ')}` : ''}.`,
      );
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
  eligibleIds?: ReadonlySet<string>,
): Promise<ImageOutcome[]> {
  const documentEpoch = useProject.getState().documentEpoch;
  const targets: ImageTarget[] = [];
  const visit = (node: ComponentNode) => {
    if (
      (node.type === 'hero' || node.type === 'image') &&
      (!eligibleIds || eligibleIds.has(node.id)) &&
      !node.props.src &&
      !node.props.image
    )
      targets.push({ id: node.id });
    node.children.forEach(visit);
  };
  for (const screen of useProject.getState().doc.screens)
    if (screenIds.includes(screen.id)) visit(screen.root);
  const cap = Math.max(0, Math.min(30, Math.floor(Number.isFinite(limit) ? limit : 3)));
  if (targets.length > cap)
    rail(
      `Auto-illustration limited to ${cap} image(s); ${targets.length - cap} skipped and remain placeholders: ${targets
        .slice(cap)
        .map((item) => item.id)
        .join(', ')}.`,
    );
  const outcomes: ImageOutcome[] = [];
  for (const target of targets.slice(0, cap)) {
    if (useProject.getState().documentEpoch !== documentEpoch) break;
    if (signal?.aborted) {
      const remaining = targets.slice(outcomes.length, cap);
      rail(
        `Auto-illustration stopped; skipped ${remaining.map((item) => item.id).join(', ')}.`,
      );
      break;
    }
    const result = await illustrateTarget(target, { signal, onlyEmpty: true, context });
    outcomes.push(result);
    if (useProject.getState().documentEpoch !== documentEpoch) break;
    if (result.stop) {
      const remaining = targets.slice(outcomes.length, cap);
      rail(
        `Auto-illustration stopped: ${result.message}${remaining.length ? `; skipped ${remaining.map((item) => item.id).join(', ')}` : ''}.`,
      );
      break;
    }
  }
  return outcomes;
}
