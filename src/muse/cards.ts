/**
 * Card answers. One dispatcher so live muse and the local muse behave the same
 * from the UI's point of view: tap → card leaves → one-line receipt → action.
 */
import type { RailEntry } from '../types/tree';
import {
  brandContrastWarning,
  brandDirectionOps,
  canCreateBrandDirection,
} from '../design/brandDirection';
import { findNodeInDoc } from '../ops/treeUtils';
import { applyOps } from '../ops/apply';
import { useProject } from '../store/useProject';
import { useAgent } from '../store/useAgent';
import { useUi } from '../store/useUi';
import { illustrateTarget } from './imagery';
import { visualBaseline, type VisualDraft } from './visualDrafts';
import { clearReference, getReference, isReferenceBlueprint } from './referenceSession';
import { nameProjectFromBlueprint } from './projectName';
import {
  adjustBlueprint,
  approveBlueprint,
  runAgentTurn,
  runFillQueue,
  stopAgent,
} from './loop';
import { demoAnswerChoice, startDemoBuild } from './demo/agent';
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
  const allHexes = (option.hexes ?? [])
    .filter((hex) => /^#[0-9A-Fa-f]{6}$/.test(hex))
    .slice(0, 4);
  const hexes = allHexes.slice(0, 2);
  let applied: 'system' | 'accents' | 'none' = 'none';
  if (hexes.length) {
    const brand = hexes[0];
    const secondary = hexes[1] || brand;
    const fresh = canCreateBrandDirection(useProject.getState().doc);
    const ops = fresh
      ? brandDirectionOps(brand, secondary)
      : [{ op: 'setTokens', patch: { brand_color: brand, secondary_color: secondary } }];
    const res = useProject.getState().applyBatch(ops, { source: 'user' });
    if (res.errors.length) {
      useUi.getState().toast(res.errors[0].message, 'danger');
      return;
    }
    applied = fresh ? 'system' : 'accents';
    useProject.getState().snapshotProjectTheme();
    system(
      fresh
        ? `🎨 ${brand}${secondary === brand ? '' : ` / ${secondary}`} — starter colour system applied`
        : `🎨 ${brand}${secondary === brand ? '' : ` / ${secondary}`} — brand and accent fields updated; existing surfaces and other design settings kept`,
    );
    const warning = brandContrastWarning(useProject.getState().doc);
    if (warning) system(warning);
  }
  markCard(cardId, 'answered', { picked: option.label });
  system(`✓ Picked: ${option.label}`);
  useProject.getState().addRail({ role: 'user', text: option.label });

  const question = String(
    (entry.card.data as { question?: string }).question || 'a choice card',
  );
  await runAgentTurn(option.label, {
    pick: {
      question,
      label: option.label,
      hexes,
      referenceHexes: allHexes.slice(2),
      note: option.note,
      applied,
      protectTokens: applied === 'accents',
    },
  });
}

export async function answerBlueprint(
  cardId: string,
  action: 'build' | 'adjust' | 'cancel',
  wish = '',
  preserveScreenId?: string,
): Promise<void> {
  const entry = findCard(cardId);
  if (!entry?.card) return;
  if (useAgent.getState().busy) stopAgent();
  if (action === 'cancel') {
    const state = useProject.getState();
    clearReference(state.documentEpoch, state.doc.blueprint?.text || '');
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

  const currentProject = useProject.getState();
  const plan = currentProject.doc.blueprint?.text || '';
  if (
    isReferenceBlueprint(currentProject.doc, plan) &&
    !getReference(currentProject.documentEpoch, plan)
  ) {
    useUi
      .getState()
      .toast(
        'The screenshot is no longer in this session. Attach and send it again to make a new recreation plan.',
        'warn',
      );
    return;
  }
  markCard(cardId, 'answered');
  const doc = useProject.getState().doc;
  if (!doc.blueprint) return;
  if (useAgent.getState().demoMode) {
    useProject.getState().setBlueprint(doc.blueprint.text, true);
    nameProjectFromBlueprint(doc.blueprint.text);
    await startDemoBuild('steady');
  } else {
    await approveBlueprint('steady', preserveScreenId);
  }
}

/** Apply exactly the chosen temporary screen only after explicit approval. */
export async function acceptVisualDraft(
  cardId: string,
  draft: VisualDraft,
  epoch: number,
  baseline: string,
): Promise<void> {
  const state = useProject.getState();
  const entry = state.doc.rail.find((item) => item.id === cardId);
  if (
    useAgent.getState().busy ||
    state.documentEpoch !== epoch ||
    entry?.card?.state !== 'pending' ||
    visualBaseline(state.doc) !== baseline
  ) {
    useUi
      .getState()
      .toast('The project or blueprint changed. Please generate new directions.', 'warn');
    return;
  }
  const plan = state.doc.blueprint?.text || '';
  if (isReferenceBlueprint(state.doc, plan) && !getReference(epoch, plan)) {
    useUi
      .getState()
      .toast(
        'The screenshot is no longer in this session. Send it again to make a new recreation plan.',
        'warn',
      );
    return;
  }
  const existing = state.doc.screens.find((screen) => screen.id === draft.screen.id);
  if (existing?.root.children.length) {
    useUi
      .getState()
      .toast('This screen already contains work. It was not replaced.', 'warn');
    return;
  }
  const screen = draft.screen;
  const clearedProps = existing
    ? Object.fromEntries(
        Object.keys(existing.root.props)
          .filter((key) => !(key in screen.root.props))
          .map((key) => [key, null]),
      )
    : {};
  const clearedStyles = existing
    ? Object.fromEntries(
        Object.keys(existing.root.styles)
          .filter((key) => !(key in screen.root.styles) && key !== 'responsive')
          .map((key) => [key, '']),
      )
    : {};
  const ops: unknown[] = existing
    ? [
        {
          op: 'setProps',
          id: existing.root.id,
          props: { ...clearedProps, ...screen.root.props },
        },
        {
          op: 'setStyles',
          id: existing.root.id,
          styles: { ...clearedStyles, ...screen.root.styles },
        },
        ...screen.root.children.map((node) => ({
          op: 'add',
          parentId: existing.root.id,
          node,
        })),
      ]
    : [{ op: 'addScreen', screen: { ...screen, entry: state.doc.screens.length === 0 } }];
  // Preflight the complete batch and verify that the committed root matches the
  // candidate, including removals and responsive styles. Never silently substitute.
  const staged = applyOps(ops, state.doc, { source: 'user', screenAddsThisTurn: 0 });
  const actual = staged.doc.screens.find((item) => item.id === screen.id)?.root;
  const canonical = (value: unknown): string =>
    JSON.stringify(value, (_key, item: unknown) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
      return Object.fromEntries(
        Object.entries(item)
          .filter(([, part]) => part !== undefined)
          .sort(([a], [b]) => a.localeCompare(b)),
      );
    });
  if (staged.errors.length || !actual || canonical(actual) !== canonical(screen.root)) {
    useUi
      .getState()
      .toast(
        'This direction could not be applied exactly and safely. Your project was not changed.',
        'warn',
      );
    return;
  }
  const applied = state.applyBatch(ops, { source: 'user', screenAddsThisTurn: 0 });
  if (applied.errors.length) {
    useUi
      .getState()
      .toast(
        `Could not apply this direction safely: ${applied.errors[0].message}`,
        'danger',
      );
    return;
  }
  useUi.getState().setActiveScreen(screen.id);
  system(
    `✓ ${draft.label} chosen. Its first-screen draft is now editable; the finishing pass protects its chosen layout.`,
  );
  await answerBlueprint(cardId, 'build', '', screen.id);
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
    const currentDoc = useProject.getState().doc;
    const fresh = canCreateBrandDirection(currentDoc);
    const existingSecondary = currentDoc.tokens.openuiTheme.secondary_color;
    const existingBrand = currentDoc.tokens.openuiTheme.brand_color;
    const secondary =
      !fresh && existingSecondary && existingSecondary !== existingBrand
        ? existingSecondary
        : hex;
    const ops = fresh
      ? brandDirectionOps(hex, hex)
      : [{ op: 'setTokens', patch: { brand_color: hex, secondary_color: secondary } }];
    const res = useProject.getState().applyBatch(ops, { source: 'user' });
    if (res.errors.length) {
      useUi.getState().toast(res.errors[0].message, 'danger');
      return;
    }
    system(
      fresh
        ? `🎨 ${hex} — starter colour system applied`
        : `🎨 ${hex} — brand and accent fields updated; existing surfaces and other design settings kept`,
    );
    const warning = brandContrastWarning(useProject.getState().doc);
    if (warning) system(warning);
    useUi
      .getState()
      .toast(fresh ? 'Starter colour system applied.' : 'Brand and accents updated.', 'ok');
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
export async function illustrate(nodeId: string, brief?: string): Promise<void> {
  useAgent.getState().setLive('Generating an image…');
  try {
    const result = await illustrateTarget({ id: nodeId, prompt: brief });
    useUi
      .getState()
      .toast(
        result.ok ? 'Image generated and saved.' : `Image not generated: ${result.message}`,
        result.ok ? 'ok' : 'warn',
      );
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
  await illustrate(heroId);
}
