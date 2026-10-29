/**
 * Card answers. One dispatcher so live muse and the local muse behave the same
 * from the UI's point of view: tap → card leaves → one-line receipt → action.
 */
import type { RailEntry } from '../types/tree';
import { useProject } from '../store/useProject';
import { useAgent } from '../store/useAgent';
import { useUi } from '../store/useUi';
import { generateImage } from './client';
import { imageBrief } from './prompts';
import {
  adjustBlueprint,
  approveBlueprint,
  runAgentTurn,
  runFillQueue,
  stopAgent,
} from './loop';
import { demoAddImageToHero, demoAnswerChoice, startDemoBuild } from './demo/agent';
import { findNodeInDoc } from '../ops/treeUtils';
import { setSessionKey } from './sessionKey';

function system(text: string) {
  useProject.getState().addRail({ role: 'system', text });
}

function findCard(cardId: string): RailEntry | undefined {
  return useProject.getState().doc.rail.find((r) => r.id === cardId);
}

function markCard(
  cardId: string,
  state: 'answered' | 'cancelled' | 'expired',
  extra: Record<string, unknown> = {},
) {
  const entry = findCard(cardId);
  if (!entry?.card) return;
  useProject.getState().patchRail(cardId, {
    card: {
      ...entry.card,
      state,
      data: { ...entry.card.data, ...extra },
    },
  });
}

export interface ChoiceOption {
  label: string;
  hexes?: string[];
  note?: string;
}

export async function answerChoice(cardId: string, index: number): Promise<void> {
  const entry = findCard(cardId);
  if (!entry?.card || entry.card.state !== 'pending') return;
  const options = (entry.card.data.options as ChoiceOption[]) || [];
  const option = options[index];
  if (!option) return;
  if (useAgent.getState().busy) stopAgent();
  if (useAgent.getState().demoMode) {
    await demoAnswerChoice(cardId, entry, option);
    return;
  }
  markCard(cardId, 'answered', { picked: option.label });
  system(`✓ Picked: ${option.label}`);
  useProject.getState().addRail({ role: 'user', text: option.label });

  /*
   * A tap is a decision, so the app honours it here instead of hoping the model
   * will: the swatches the user just looked at become the token sheet. That is
   * the difference between "picked" and "repainted", and it is why the card no
   * longer has to be answered twice to mean anything.
   */
  const hexes = (option.hexes ?? [])
    .filter((hex) => /^#[0-9A-Fa-f]{6}$/.test(hex))
    .slice(0, 2);
  if (hexes.length) {
    const brand = hexes[0];
    const secondary = hexes[1] || brand;
    const res = useProject
      .getState()
      .applyBatch(
        [{ op: 'setTokens', patch: { brand_color: brand, secondary_color: secondary } }],
        {
          source: 'user',
        },
      );
    if (res.errors.length) useUi.getState().toast(res.errors[0].message, 'danger');
    else
      system(
        `🎨 ${brand}${secondary === brand ? '' : ` / ${secondary}`} — applied to the token sheet`,
      );
  }

  const question = String(
    (entry.card.data as { question?: string }).question || 'a choice card',
  );
  await runAgentTurn(option.label, {
    pick: { question, label: option.label, hexes },
  });
}

export async function answerBlueprint(
  cardId: string,
  action: 'build' | 'adjust' | 'cancel',
  wish = '',
): Promise<void> {
  const entry = findCard(cardId);
  if (!entry?.card) return;
  if (useAgent.getState().busy) stopAgent();
  if (action === 'cancel') {
    markCard(cardId, 'cancelled');
    system('Blueprint cancelled — it stays in the log if you want it back.');
    return;
  }
  if (action === 'adjust') {
    if (!wish.trim()) return;
    const count = Number(entry.card.data.adjustCount || 0);
    if (count >= 3) {
      useUi
        .getState()
        .toast('Three adjustment rounds used. Build or cancel this blueprint.', 'warn');
      return;
    }
    markCard(cardId, 'answered', { adjustedWith: wish });
    system('✓ Adjusting the blueprint');
    if (useAgent.getState().demoMode) {
      useProject.getState().addRail({ role: 'user', text: wish });
      useProject.getState().addRail({
        role: 'agent',
        text: `Noted: ${wish}. The local engine keeps the plan as-is for now — with a muse key this round rewrites the blueprint with Wonder. Approve the existing plan, or clear it and ask again.`,
      });
      system('Adjust rounds need a muse key; the plan stands as-is.');
      const current = findCard(cardId);
      if (current?.card)
        useProject
          .getState()
          .patchRail(cardId, { card: { ...current.card, state: 'pending' } });
      return;
    }
    const adjusted = await adjustBlueprint(wish, count + 1);
    if (!adjusted) {
      const current = findCard(cardId);
      if (current?.card)
        useProject
          .getState()
          .patchRail(cardId, { card: { ...current.card, state: 'pending' } });
    }
    return;
  }

  markCard(cardId, 'answered');
  const doc = useProject.getState().doc;
  if (!doc.blueprint) return;
  system('✓ Blueprint approved');
  if (useAgent.getState().demoMode) {
    await startDemoBuild('steady');
  } else {
    await approveBlueprint('steady');
  }
}

export async function answerBuildChoice(
  cardId: string,
  mode: 'blueprint' | 'steady' | 'fast' | 'not_now',
): Promise<void> {
  const entry = findCard(cardId);
  if (!entry?.card) return;
  if (useAgent.getState().busy) stopAgent();
  markCard(cardId, mode === 'not_now' ? 'cancelled' : 'answered', { mode });
  if (mode === 'not_now') {
    system('Left alone — drag anything by hand. Undo is shared with mine.');
    return;
  }
  if (mode === 'blueprint') {
    system('Blueprint first — say what the app is for and I will plan it.');
    useProject.getState().addRail({
      role: 'agent',
      text: 'Good call. Tell me the product in one line (who it is for and what it does) and I will propose the screens, ids, LOOK numbers and wiring before building anything.',
    });
    return;
  }
  system(
    mode === 'fast'
      ? 'Fast screens — final verify gate stays on.'
      : 'Steady screens — one at a time, reviewed.',
  );
  if (useAgent.getState().demoMode) {
    if (!useProject.getState().doc.blueprint?.text) {
      useProject.getState().addRail({
        role: 'agent',
        text: 'No blueprint yet — ask me to design the product and I will propose one first (law three: decide up front, fill in blanks).',
      });
      return;
    }
    await startDemoBuild(mode);
  } else {
    await runFillQueue({ mode });
  }
}

export async function applyColorCard(
  hex: string,
  scope: 'everywhere' | 'element',
  nodeId?: string,
  styleKey = 'background',
  breakpoint: 'compact' | 'medium' | 'expanded' = 'compact',
  cardId?: string,
): Promise<void> {
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) {
    useUi.getState().toast('That is not a six-digit hex colour.', 'warn');
    return;
  }
  if (scope === 'everywhere') {
    const res = useProject
      .getState()
      .applyBatch(
        [{ op: 'setTokens', patch: { brand_color: hex, secondary_color: hex } }],
        { source: 'user' },
      );
    if (res.errors.length) {
      useUi.getState().toast(res.errors[0].message, 'danger');
      return;
    }
    system(`🎨 ${hex} — applied everywhere`);
    useUi.getState().toast('Every surface repainted from the token.', 'ok');
  } else if (nodeId) {
    const hit = findNodeInDoc(useProject.getState().doc, nodeId);
    const res = useProject.getState().applyBatch(
      [
        {
          op: 'setStyles',
          id: nodeId,
          styles:
            breakpoint === 'compact'
              ? { [styleKey]: hex }
              : { responsive: { [breakpoint]: { [styleKey]: hex } } },
        },
      ],
      {
        source: 'user',
      },
    );
    if (res.errors.length) {
      useUi.getState().toast(res.errors[0].message, 'danger');
      return;
    }
    system(`🎨 ${hex} — just ${hit?.node.id || 'that element'}`);
  }
  if (cardId) markCard(cardId, 'answered', { picked: hex, scope });
  useUi.getState().setColorCard(null);
}

/**
 * Paste → store in this tab → retry the parked turn, in that order. The turn
 * that failed fires again by itself: one paste, no re-typing.
 */
export async function submitKey(cardId: string, rawKey: string): Promise<void> {
  const key = rawKey.trim();
  if (!key) return;
  setSessionKey(key);
  markCard(cardId, 'answered', { source: 'user' });
  useAgent.getState().setStatus({
    configured: true,
    demoMode: false,
    keySource: 'session',
    statusError: null,
  });
  system('✓ Your key is stored in this tab only — it never touches the bundle.');
  const retry = useAgent.getState().pendingRetry;
  useAgent.getState().setPendingRetry(null);
  if (retry?.trim()) await runAgentTurn(retry);
}

/** "Not now": the canvas still works by hand, and demo is an explicit choice. */
export function dismissKey(cardId: string, useDemo: boolean): void {
  markCard(cardId, 'cancelled', { demo: useDemo });
  useAgent.getState().setPendingRetry(null);
  if (useDemo) {
    useAgent.getState().setStatus({ configured: false, demoMode: true, keySource: 'none' });
    system(
      'Local engine on — the real pipeline, no key, no credit. Switch it off in Settings.',
    );
    return;
  }
  system('No key — the canvas still works by hand. Add one any time in Settings.');
}

/**
 * On boot, a key that turns out to be healthy must not leave yesterday's
 * accusation in the rail. Any pending key card is marked answered, once.
 * Returns true when something was cleared.
 */
export function resolveStaleKeyCards(text: string): boolean {
  const rail = useProject.getState().doc.rail;
  const pending = rail.filter(
    (entry) =>
      entry.role === 'card' && entry.card?.kind === 'key' && entry.card.state === 'pending',
  );
  if (!pending.length) return false;
  for (const entry of pending) markCard(entry.id, 'answered');
  useAgent.getState().setPendingRetry(null);
  system(text);
  return true;
}

/**
 * The key was never the problem — re-check it and take the card away instead of
 * leaving an accusation on screen. Used by the card's own "Re-check" action.
 */
export function clearKeyCard(cardId: string, text: string): void {
  markCard(cardId, 'answered');
  useAgent.getState().setPendingRetry(null);
  useAgent.getState().setError(null);
  system(text);
}

export async function retryTurn(cardId: string, text: string): Promise<void> {
  markCard(cardId, 'answered');
  if (!text.trim()) return;
  if (useAgent.getState().demoMode) {
    await runAgentTurn(text);
    return;
  }
  await runAgentTurn(text);
}

/**
 * §6.1 image role: muse-image illustrates the node you point at, and the asset
 * lands in the project tree (props.image), so it survives reload and export.
 */
export async function illustrate(
  nodeId: string,
  brief = 'a clean editorial illustration, no text, no logos',
): Promise<void> {
  const doc = useProject.getState().doc;
  const hit = findNodeInDoc(doc, nodeId);
  if (!hit) {
    useUi.getState().toast('Pick a node first.', 'warn');
    return;
  }
  const node = hit.node;
  if (node.type !== 'hero' && node.type !== 'image' && node.type !== 'card') {
    useUi.getState().toast('Images go on a hero, an image or a card.', 'warn');
    return;
  }
  const light = doc.tokens.openuiTheme.light_colors || {};
  const palette = [
    light.openui_accent,
    light.openui_secondary,
    light.openui_accent_subtle,
    light.openui_bg,
    light.openui_text_primary,
  ].filter(Boolean) as string[];

  if (useAgent.getState().demoMode) {
    if (node.type === 'hero') {
      await demoAddImageToHero(`node-${Date.now() % 99999}`);
      useUi.getState().toast('Illustrated from your palette (local).', 'ok');
    } else {
      useUi
        .getState()
        .toast('Images need a muse key — the local engine has no image model.', 'warn');
    }
    return;
  }

  const wide = node.type === 'hero';
  const size = wide ? '1200x640' : '1024x1024';
  useAgent.getState().setLive('Generating an image…');
  try {
    const src = await generateImage(
      imageBrief(
        brief,
        palette[3] || 'transparent',
        palette,
        wide ? 1200 : 1024,
        wide ? 640 : 1024,
      ),
      size,
    );
    const res = useProject
      .getState()
      .applyBatch([{ op: 'setProps', id: node.id, props: { image: src } }], {
        source: 'agent',
      });
    if (res.errors.length) throw new Error(res.errors[0].message);
    system(
      `🖼 muse-image illustrated ${node.id} — a real asset, persisted with the project and carried into the export.`,
    );
  } catch (err) {
    useUi
      .getState()
      .toast(
        `Image generation failed: ${err instanceof Error ? err.message : String(err)}`,
        'danger',
      );
    if (node.type === 'hero') {
      await demoAddImageToHero(`node-${Date.now() % 99999}`);
      system('Fell back to a palette placeholder so the canvas never breaks.');
    }
  } finally {
    useAgent.getState().setLive(null);
  }
}

/** The rail's one-tap path: find the first hero and illustrate it. */
export async function generateHeroImage(): Promise<void> {
  const doc = useProject.getState().doc;
  let heroId = '';
  for (const screen of doc.screens) {
    const stack = [screen.root];
    while (stack.length) {
      const node = stack.pop()!;
      if (node.type === 'hero') {
        heroId = node.id;
        break;
      }
      stack.push(...node.children);
    }
    if (heroId) break;
  }
  if (!heroId) {
    useUi.getState().toast('Add a hero first — then I illustrate it.', 'warn');
    return;
  }
  await illustrate(heroId, 'abstract hero illustration for a product landing page');
}
