import { findNodeInDoc, findParent } from '../ops/treeUtils';
import { SCAFFOLD_STRINGS } from '../types/library';
import { useAgent, type AssetJob } from '../store/useAgent';
import { useProject } from '../store/useProject';
import type { ComponentNode, ProjectDoc, ScreenDoc } from '../types/tree';
import { generateImage, MuseError } from './client';

export type ImageTarget = { id: string; prompt?: string };
export type ImageOutcome = {
  id: string;
  ok: boolean;
  message: string;
  stop?: boolean;
  attempts?: number;
};
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

/** Wide editorial slots get more detail than compact product cards. */
export function imageSizeFor(screen: ScreenDoc, node: ComponentNode): string {
  if (node.type === 'hero' || /hero|story|banner/i.test(`${node.id} ${node.name || ''}`))
    return '1200x640';
  let current = node;
  let parent = findParent(screen.root, current.id)?.parent;
  while (parent && parent.type !== 'screen') {
    if (parent.type === 'card' || parent.type === 'grid' || parent.type === 'list')
      return '768x768';
    if (
      parent.type === 'hero' ||
      /hero|story|banner/i.test(`${parent.id} ${parent.name || ''}`)
    )
      return '1200x640';
    current = parent;
    parent = findParent(screen.root, current.id)?.parent;
  }
  return '768x768';
}

/** Muse's size is an aspect hint, not a pixel guarantee. Read the returned image. */
async function actualImageSize(
  src: string,
): Promise<{ width: number; height: number } | null> {
  if (typeof Image === 'undefined') return null;
  return new Promise((resolve) => {
    const image = new Image();
    const timer = setTimeout(() => resolve(null), 2000);
    image.onload = () => {
      clearTimeout(timer);
      resolve(
        image.naturalWidth && image.naturalHeight
          ? { width: image.naturalWidth, height: image.naturalHeight }
          : null,
      );
    };
    image.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    image.src = src;
  });
}

// Serialize even manual and automated calls against the same provider.
let imageTurn: Promise<void> = Promise.resolve();
async function singleImageCall(
  prompt: string,
  size: string,
  signal?: AbortSignal,
): Promise<string> {
  const previous = imageTurn;
  let release!: () => void;
  imageTurn = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    if (signal?.aborted) throw new Error('Stopped before image generation.');
    return await generateImage(prompt, size);
  } finally {
    release();
  }
}

/** Shared by the agent, build pass, and inspector. Each image is one undoable op. */
export async function illustrateTarget(
  target: ImageTarget,
  options: {
    signal?: AbortSignal;
    onlyEmpty?: boolean;
    context?: string;
    retry?: boolean;
    takeAttempt?: () => boolean;
  } = {},
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
  const size = imageSizeFor(hit.screen, node);
  let attempts = 0;
  try {
    let src = '';
    let previousFailure = '';
    for (;;) {
      if (options.signal?.aborted) throw new Error('Stopped before image generation.');
      if (options.takeAttempt && !options.takeAttempt())
        throw new Error(
          `Automated image call cap exhausted before retry.${previousFailure ? ` Previous failure: ${previousFailure}` : ''}`,
        );
      attempts += 1;
      try {
        src = await singleImageCall(prompt, size, options.signal);
        break;
      } catch (err) {
        previousFailure = err instanceof Error ? err.message : String(err);
        const permanent =
          err instanceof MuseError &&
          ['house_key_exhausted', 'no_key', 'house_key_rejected', 'unauthorized'].includes(
            err.code,
          );
        if (!options.retry || attempts >= 2 || permanent || options.signal?.aborted)
          throw err;
        rail(
          `Image ${node.id} attempt failed: ${err instanceof Error ? err.message : String(err)}. Retrying in 3 seconds.`,
        );
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 3000);
          options.signal?.addEventListener(
            'abort',
            () => {
              clearTimeout(timer);
              resolve();
            },
            { once: true },
          );
        });
      }
    }
    const actual = await actualImageSize(src);
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
        attempts,
      });
    const result = useProject.getState().applyBatch(
      [
        {
          op: 'setProps',
          id: node.id,
          props: {
            [key]: src,
            assetWidth: actual?.width ?? null,
            assetHeight: actual?.height ?? null,
            assetAspectWidth: Number(size.split('x')[0]),
            assetAspectHeight: Number(size.split('x')[1]),
          },
        },
      ],
      {
        source: 'agent',
      },
    );
    if (result.errors.length) throw new Error(result.errors[0].message);
    return finish({ id: node.id, ok: true, message: 'Image applied.', attempts });
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
    return finish({ id: node.id, ok: false, message, stop, attempts });
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
  cardId?: string,
  reserveAttempt?: () => boolean,
): Promise<ImageOutcome[]> {
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
  return queueAssetTargets(targets, context, limit, signal, cardId, true, reserveAttempt);
}

/** Run a build's requested assets serially and keep its card's job history. */
export async function queueAssetTargets(
  targets: ImageTarget[],
  context: string,
  limit: number,
  signal?: AbortSignal,
  cardId?: string,
  onlyEmpty = false,
  reserveAttempt?: () => boolean,
): Promise<ImageOutcome[]> {
  const documentEpoch = useProject.getState().documentEpoch;
  const cap = Math.max(0, Math.min(30, Math.floor(Number.isFinite(limit) ? limit : 3)));
  const jobs: AssetJob[] = targets.map((target, i) => {
    const hit = findNodeInDoc(useProject.getState().doc, target.id);
    return {
      nodeId: target.id,
      prompt: hit
        ? imageSubject(
            useProject.getState().doc,
            hit.screen,
            hit.node,
            target.prompt,
            context,
          )
        : target.prompt,
      size: hit ? imageSizeFor(hit.screen, hit.node) : '768x768',
      state: i < cap ? 'queued' : 'skipped',
      ...(i >= cap ? { reason: 'Automated image call cap' } : {}),
    };
  });
  const initialCard = cardId
    ? useProject.getState().doc.rail.find((entry) => entry.id === cardId)
    : undefined;
  const previous = Array.isArray(initialCard?.card?.data.assets)
    ? (initialCard.card.data.assets as AssetJob[])
    : cardId && useAgent.getState().assetDocumentEpoch === documentEpoch
      ? useAgent.getState().assetJobs
      : [];
  const publish = () => {
    if (useProject.getState().documentEpoch !== documentEpoch) return;
    const copy = [
      ...previous.filter((old) => !jobs.some((job) => job.nodeId === old.nodeId)),
      ...jobs,
    ].map((job) => ({ ...job }));
    useAgent.setState({
      assetJobs: copy,
      assetDocumentEpoch: documentEpoch,
      assetsPending: new Set(
        copy.filter((job) => job.state === 'running').map((job) => job.nodeId),
      ),
    });
    const card = cardId
      ? useProject.getState().doc.rail.find((entry) => entry.id === cardId)
      : undefined;
    if (card?.card?.kind === 'progress')
      useProject.getState().patchRail(card.id, {
        card: { ...card.card, data: { ...card.card.data, assets: copy } },
      });
  };
  publish();
  let attempts = 0;
  const outcomes: ImageOutcome[] = [];
  for (let i = 0; i < jobs.length; i += 1) {
    const job = jobs[i];
    if (job.state === 'skipped') continue;
    if (useProject.getState().documentEpoch !== documentEpoch) break;
    if (signal?.aborted || attempts >= cap) {
      job.state = 'skipped';
      job.reason = signal?.aborted ? 'Stopped' : 'Automated image call cap exhausted';
      publish();
      continue;
    }
    job.state = 'running';
    publish();
    const result = await illustrateTarget(targets[i], {
      signal,
      onlyEmpty,
      context,
      retry: true,
      takeAttempt: () => {
        if (attempts >= cap || (reserveAttempt && !reserveAttempt())) return false;
        attempts += 1;
        return true;
      },
    });
    outcomes.push(result);
    if (useProject.getState().documentEpoch !== documentEpoch) break;
    job.state = result.ok ? 'done' : 'failed';
    if (!result.ok) job.reason = result.message;
    if (result.stop) {
      for (const later of jobs.slice(i + 1))
        if (later.state === 'queued') {
          later.state = 'skipped';
          later.reason = result.message;
        }
      publish();
      break;
    }
    publish();
  }
  if (useProject.getState().documentEpoch === documentEpoch) {
    publish();
    const skipped = jobs.filter((job) => job.state === 'skipped');
    if (skipped.length)
      rail(
        `Auto-illustration skipped ${skipped.length} asset(s) (budget cap or unavailable): ${skipped.map((job) => `${job.nodeId} (${job.reason || 'not generated'})`).join(', ')}. Placeholders remain.`,
      );
  }
  return outcomes;
}
