import { validateVisualFinish, type VisualFinishGuard } from './visualFinishGuard';
import { stopVisualPreview } from './visualDrafts';
import { videoSourceViolation } from './videoGuard';
import {
  getReference,
  isReferenceBlueprint,
  screenshotReferenceNotice,
  stopScreenshot,
  updateReference,
} from './referenceSession';
import { z } from 'zod';
import { editCanvasWire, readCanvasWire, illustrateImagesWire } from '../types/wire';
import { TOOL_NAMES, toolSchemas, type ToolName } from '../types/tools';
import { useAgent } from '../store/useAgent';
import { useProject } from '../store/useProject';
import { useUi } from '../store/useUi';
import { buildTokenSheet } from './tokenSheet';
import { buildProjectIndex } from './projectIndex';
import { BUILDER_PROPS_PRIMER } from './propsPrimer';
import { buildScopeContext, scopedPrimer } from './scopeContext';
import { preferenceNote } from './designMemory';
import { nameProjectAfterBuild, nameProjectFromBlueprint } from './projectName';
import { canvasOutline, subtreeOutline } from './canvasOutline';
import {
  parseBlueprint,
  blueprintScreenSections,
  blueprintGlobalContext,
} from './blueprintParse';
import { parseTypedOptions } from './typedOptions';
import {
  MuseError,
  chatStream,
  estimateCents,
  type ChatMessage,
  type ChatResult,
} from './client';
import {
  BLUEPRINT_PROMPT,
  JSON_CORRECTION,
  SYSTEM_PROMPT,
  TYPED_OPTIONS_CORRECTION,
  adjustBlueprintPrompt,
  fillPrompt,
  rebuildNote,
  reviewerPrompt,
} from './prompts';
import { captureVisualReviewCollage } from '../export/visualReview';
import type { Action, OpError, ProjectDoc, ScreenDoc } from '../types/tree';
import { entryScreen, findNodeInDoc, clone, walk } from '../ops/treeUtils';
import { applyOps } from '../ops/apply';
import { filterScopedOps } from './scope';
import {
  lintScreen,
  lintMotion,
  lintRemovedImageVoids,
  type LintFinding,
} from './qualityLint';
import { beginTurnJournal, endTurnJournal, type TurnJournal } from './turnJournal';
import { isKeepalive } from './keepalive';
import {
  startBuildPresenter,
  stopBuildPresenter,
  buildTimeline,
  buildCardId,
  buildCaption,
  finishBuildPresenter,
} from './buildPresenter';
import {
  autoIllustrate,
  illustrateTargets,
  queueAssetTargets,
  type ImageTarget,
} from './imagery';

const TURN_CALL_CAP = 24;
const MAX_RESULT = 8000;

const TOOL_DESCRIPTIONS: Record<ToolName, string> = {
  read_canvas:
    'Read the compact canvas index (screens, ids, actions, state keys). ≤4000 chars.',
  set_design_tokens:
    'Patch the design tokens: brand_color, secondary_color, radii_dp, metrics_dp, light_colors, dark_colors, fonts. Repaints the canvas.',
  propose_blueprint:
    'Show a plain-text blueprint to the user for approval. Does not build. Format: RULES, per screen SCREEN/component lines/LOOK with hard numbers, STATE, WIRING.',
  ask_choice:
    'Ask the user to pick 1 of 2–4 whole directions. Each option has a label and up to 4 hex swatches. The card leaves on tap.',
  edit_canvas:
    'Apply a batch of ops to the canvas. Add parents before children and split large screens into ordered batches of at most 12 ops. Each batch is all-or-nothing; the hard limit is 40 ops. ' +
    'Each op = {op:"add",parentId,node:{type,id?,props?,styles?,children?}} | {op:"remove",id} | {op:"move",id,parentId} | ' +
    '{op:"setProps",id,props} | {op:"setStyles",id,styles} | {op:"setText",id,text} | {op:"setMockData",screenId,key,rows} | {op:"rename",id,name} | ' +
    '{op:"addScreen",screen:{id,name,root}} | {op:"removeScreen",id} | {op:"renameScreen",id,name} | {op:"setEntry",id} | ' +
    '{op:"setTokens",patch} | {op:"saveComponent",name,description,root} | {op:"placeComponent",name,parentId}. ' +
    'Nest at most 3 levels inside one add node; deeper structure is more add ops with parentId in the same call. ' +
    'Events ride on setProps: {events:{tap:[{type:"navigate",to:"home"}]}} — types navigate, setState, toggle, toast, openUrl, when. ' +
    'styles keys: gap, align(start|center|end|stretch = align children), justify(start|center|end|space-between = distribute), wrap, grow(1 = fill leftover space), selfAlign, padding, width/height ("match"|"hug"|length), background, color, fontSize, fontWeight, textAlign, borderRadius, boxShadow, opacity. ' +
    'styles also include colSpan(1–4|full), rowSpan(1–3), backdropBlur(none|sm|md|lg), aspectRatio(auto|1/1|4/3|16/9|4/5|21/9), position(static|relative|sticky). ' +
    `WIDGET PROPS from the library (source of truth):\n${BUILDER_PROPS_PRIMER}\n` +
    'Fill every list/table/chart dataKey with setMockData: 5–20 realistic rows matching the brief; a dataKey without rows ships an empty section. setMockData replaces all rows at that screen/key, so preserve existing data unless replacement is intended. Video src must be in the user prompt; leave it empty for a procedural reel. ' +
    'Long batches: split them into several edit_canvas calls of at most 12 ops each. An oversized call can be cut off mid-JSON and dropped without being applied.',
  illustrate_images:
    'Generate images for up to six existing hero, image or card nodes: targets [{id, prompt?}]. Preserve the requested medium, mood, lighting and restrictions in each prompt. Do not generate images for image-free designs; existing images are preserved during automatic builds.',
  finish: 'End the turn with a two-sentence user-facing summary.',
};

/**
 * The wire schema for a tool. `edit_canvas` and `read_canvas` use the shallow
 * mirrors from `src/types/wire.ts`. Two upstream refusals are why:
 *
 * - `400 Recursive JSON schemas are not currently supported` — the truthful
 *   schemas in `src/types/tools.ts` are recursive.
 * - `400 JSON schema exceeds the maximum nesting depth of 10 levels` — even a
 *   bounded tree mirror inlined to ~27 levels. The wire now names the op and
 *   leaves the payload open; `TOOL_DESCRIPTIONS.edit_canvas` carries the
 *   grammar and `opSchema` remains the runtime authority.
 */
function wireSchema(name: ToolName) {
  if (name === 'edit_canvas') return editCanvasWire;
  if (name === 'read_canvas') return readCanvasWire;
  if (name === 'illustrate_images') return illustrateImagesWire;
  return toolSchemas[name];
}

/**
 * Cosmetic but load-bearing clean-up of the emitted JSON Schema:
 *
 * - `additionalProperties: {}` (what `z.record(z.unknown())` becomes) means
 *   "anything", and `true` says the same thing in a form every validator
 *   accepts.
 * - an empty `required` list carries no information and is dropped, because a
 *   schema nobody can read is a schema the model guesses at.
 *
 * Emptied containers are removed bottom-up, so a parent never keeps a key that
 * points at nothing.
 */
function tighten(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(tighten);
  if (!node || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    // JSON object keys are already strings; omit this redundant draft-7 keyword
    // to preserve the exact tool contract accepted by the model provider.
    if (key === 'propertyNames') continue;
    const next = tighten(value);
    // An empty `properties` stays: a no-argument tool still reads as an object.
    if (key === 'required' && Array.isArray(next) && next.length === 0) continue;
    if (key === 'additionalProperties' && next && typeof next === 'object') {
      if (Object.keys(next as object).length === 0) {
        out[key] = true;
        continue;
      }
    }
    out[key] = next;
  }
  return out;
}

/** Inline reused schemas and preserve the established, reference-free tool contract. */
export function toolParameters(name: ToolName): Record<string, unknown> {
  const raw = z.toJSONSchema(wireSchema(name), {
    target: 'draft-7',
    unrepresentable: 'any',
    reused: 'inline',
  }) as Record<string, unknown>;
  delete raw.$schema;
  delete raw.definitions;
  return tighten(raw) as Record<string, unknown>;
}

export const TOOL_DEFS = TOOL_NAMES.map((name) => ({
  type: 'function' as const,
  function: {
    name,
    description: TOOL_DESCRIPTIONS[name],
    parameters: toolParameters(name),
  },
}));

let controller: AbortController | null = null;
let running = false;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let turnScreenAdds = 0;
let changedThisTurn = false;

/**
 * The one turn that starts from a card tap, or null.
 *
 * Why this exists: `history()` replays prose only, so a tap used to arrive at
 * the model as a bare user line — "Museware Default" — with no trace of the
 * card that asked for it and no trace that the question was already answered.
 * The model answered that line by offering directions again, every tap, for as
 * long as the user was willing to tap: a loop that costs money and builds
 * nothing. A tap is a DECISION, not a new request, and this is what tells the
 * model that.
 */
let pickTurn: PickDirective | null = null;

export interface PickDirective {
  question: string;
  label: string;
  hexes: string[];
  referenceHexes?: string[];
  note?: string;
  applied?: 'system' | 'accents' | 'none';
  protectTokens?: boolean;
}

/**
 * A greeting is not a build order. The first turn of the loop in the wild was
 * "Hello" answered with a look-choice card, so the app now refuses to open the
 * design flow on small talk — belt as well as braces, because a prompt rule is
 * only a request and this is a guarantee.
 */
const SMALL_TALK =
  /^(?:hi|hii+|hey|heya|hello|yo|sup|hiya|good (?:morning|afternoon|evening)|how are you|how's it going|thanks|thank you|cheers)[\s!.,?~-]*$/i;

export function isSmallTalk(text: string): boolean {
  return SMALL_TALK.test(text.trim());
}

let smallTalkTurn = false;

/** The sentence that turns a tap into a decision the model cannot re-ask. */
export function pickReceipt(pick: PickDirective): string {
  const colours = pick.hexes.length
    ? ` The chosen brand ${pick.hexes[0]}${pick.hexes[1] ? ` and secondary ${pick.hexes[1]}` : ''} were applied. ` +
      (pick.applied === 'accents'
        ? 'Only brand and accent fields were updated; the existing surfaces and other settings were kept. Preserve the existing design system.'
        : 'A starter colour system was applied; refine the overall art direction to suit the brief, preserving the chosen brand and explicit user preferences.')
    : '';
  const cues = pick.referenceHexes?.length
    ? ` Other displayed swatches: ${pick.referenceHexes.join(', ')}. They are visual cues with no assigned token roles; do not guess their roles.`
    : '';
  const note = pick.note ? ` The selected direction was described as: ${pick.note}.` : '';
  return (
    `PICK RECEIPT: the user just tapped "${pick.label}" on your card "${pick.question}". ` +
    `That decision is final and is already recorded.${colours}${cues}${note} ` +
    'Do NOT call ask_choice in this turn, do not offer more directions, and do not stop at an ' +
    'acknowledgement. You may refine other design details to suit the brief when no user system is protected. ' +
    'Then call propose_blueprint with the plan for their app — or, if a ' +
    'blueprint is already on screen, build the screens it asks for.'
  );
}

/**
 * What has already been decided, restated on every turn.
 *
 * `history()` carries the last few prose lines and nothing else, so without
 * this the model begins each turn with no memory of the cards it sent or the
 * palette the user chose — which is exactly how "Museware Default Blue" got
 * offered back to the person who had just picked it.
 */
export function decisionLedger(doc: ProjectDoc): string {
  const picks: string[] = [];
  for (const entry of doc.rail) {
    const card = entry.card;
    if (card?.kind !== 'choice' || card.state !== 'answered') continue;
    const data = card.data as { question?: string; picked?: string };
    if (!data.picked) continue;
    picks.push(
      data.question ? `"${data.picked}" (for "${data.question}")` : `"${data.picked}"`,
    );
  }
  const theme = doc.tokens.openuiTheme;
  return [
    picks.length
      ? `DECIDED ALREADY — tapped: ${picks.slice(-4).join('; ')}. Never ask for these again.`
      : '',
    `TOKEN SHEET NOW — brand ${theme.brand_color}, secondary ${theme.secondary_color}.`,
    ...doc.rail
      .filter(
        (entry) =>
          entry.role === 'system' &&
          entry.text.startsWith('scope:') &&
          /section .+ (?:redesigned|restyled) at /.test(entry.text),
      )
      .slice(-5)
      .map((entry) => entry.text),
    doc.blueprint?.text
      ? `BUILD STATE — blueprint ${doc.blueprint.decided ? 'APPROVED' : 'not yet approved'}; screens in doc: ${doc.screens.length}; last verification: ${useAgent.getState().verification}. Never claim a build is waiting for approval when this line says APPROVED.`
      : 'No blueprint yet.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function isAgentRunning(): boolean {
  return running;
}

export function stopAgent(): void {
  controller?.abort();
  stopScreenshot();
  stopVisualPreview();
  useAgent.getState().requestStop();
  useUi.getState().toast('Stopping after the current step…', 'warn');
}

function addSystem(text: string) {
  if (buildTimeline(text)) return;
  if (isKeepalive(text)) {
    console.debug(text);
    return;
  }
  useProject.getState().addRail({ role: 'system', text });
}

function addAgent(text: string) {
  if (!text.trim()) return undefined;
  if (buildCaption(text)) return undefined;
  return useProject.getState().addRail({ role: 'agent', text: text.slice(0, 4000) });
}

function addCard(
  kind: 'build_choice' | 'blueprint' | 'choice' | 'color' | 'progress' | 'error' | 'key',
  data: Record<string, unknown>,
  text = '',
) {
  return useProject.getState().addRail({
    role: 'card',
    text,
    card: { kind, state: 'pending', data },
  });
}

function startHeartbeat(_anchor: number) {
  // Network keepalives are diagnostics, not conversational progress.
  stopHeartbeat();
}

function recordNarration(text: string): ReturnType<typeof addAgent> {
  if (!text.trim()) return;
  if (buildTimeline(text))
    return useProject.getState().doc.rail.find((entry) => entry.id === buildCardId());
  const project = useProject.getState();
  const card = [...project.doc.rail]
    .reverse()
    .find(
      (entry) =>
        (entry.card?.kind === 'thinking' || entry.card?.kind === 'progress') &&
        entry.card.state === 'pending',
    );
  if (!card?.card) return;
  const timeline = Array.isArray(card.card.data.timeline) ? card.card.data.timeline : [];
  project.patchRail(card.id, {
    card: {
      ...card.card,
      data: {
        ...card.card.data,
        timeline: [...timeline, { at: Date.now(), text: text.slice(0, 4000) }],
      },
    },
  });
  return card;
}

function stopHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

/** Repair common incomplete JSON without changing already-valid arguments. */
export function repairJson(raw: string): string | null {
  let text = raw.trim();
  if (text.startsWith('```')) {
    text = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();
  }
  if (!text) return '{}';

  // Remove commas before a closing bracket, but never edit text inside strings.
  const removeTrailingCommas = (value: string) => {
    let output = '';
    let inString = false;
    let escaped = false;
    for (let i = 0; i < value.length; i += 1) {
      const ch = value[i];
      if (inString) {
        output += ch;
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
      } else {
        if (ch === '"') inString = true;
        if (ch === ',' && /^[\s]*[}\]]/.test(value.slice(i + 1))) continue;
        output += ch;
      }
    }
    return output;
  };

  const close = (prefix: string): string | null => {
    const stack: string[] = [];
    let inString = false;
    let escaped = false;
    for (const ch of prefix) {
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
      } else if (ch === '"') inString = true;
      else if (ch === '{' || ch === '[') stack.push(ch === '{' ? '}' : ']');
      else if (ch === '}' || ch === ']') {
        if (stack.pop() !== ch) return null;
      }
    }
    let result = prefix;
    if (inString) {
      if (escaped) result = result.slice(0, -1);
      result += '"';
    }
    result += stack.reverse().join('');
    return result;
  };
  const valid = (candidate: string | null): string | null => {
    if (candidate === null) return null;
    for (const attempt of [candidate, removeTrailingCommas(candidate)]) {
      try {
        JSON.parse(attempt);
        return attempt;
      } catch {
        /* try the next candidate */
      }
    }
    return null;
  };
  const original = valid(text);
  if (original !== null) return original;
  const closed = valid(close(text));
  if (closed !== null) return closed;

  // Fall back at value boundaries, keeping the longest complete prefix.
  let inString = false;
  let escaped = false;
  const boundaries: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') {
        inString = false;
        boundaries.push(i + 1);
      }
    } else if (ch === '"') inString = true;
    else if (ch === '}' || ch === ']' || ch === ',' || /[0-9eE]/.test(ch))
      boundaries.push(i + 1);
  }
  for (let i = boundaries.length - 1; i >= 0; i -= 1) {
    const candidate = valid(close(text.slice(0, boundaries[i])));
    if (candidate !== null) return candidate;
  }
  return null;
}

const TOOL_SPLIT_NUDGE =
  'Your previous tool call did not arrive complete and was dropped, not applied. Re-send the same work as SEVERAL edit_canvas calls of at most 12 ops each; run finish() only after every op has been applied.';

/** Use existing saved prose only. Preserve the first few user messages as
 * historical context even after the recent window moves on; newest instructions
 * still win. Bound older messages and label any truncation rather than inventing
 * a structured brief or changing the saved document. */
function history(doc: ProjectDoc): ChatMessage[] {
  const conversation = doc.rail.filter(
    (r) => (r.role === 'user' || r.role === 'agent') && r.text.trim(),
  );
  const recent = conversation.slice(-8);
  const recentIds = new Set(recent.map((entry) => entry.id));
  let remaining = 12000;
  const earliest = conversation.filter((entry) => entry.role === 'user').slice(0, 4);
  const older = earliest
    .filter((entry) => !recentIds.has(entry.id))
    .flatMap((entry) => {
      if (remaining <= 0) return [];
      const limit = Math.min(8000, remaining);
      const content =
        entry.text.length > limit
          ? `${entry.text.slice(0, limit)}\n[Earlier message truncated for context.]`
          : entry.text;
      remaining -= Math.min(entry.text.length, limit);
      return [{ role: 'user' as const, content }];
    });
  const firstUserId = earliest[0]?.id;
  return [
    ...older,
    ...recent.map((entry) => {
      const limit = entry.role === 'user' && entry.id === firstUserId ? 8000 : 700;
      const content =
        entry.text.length > limit
          ? `${entry.text.slice(0, limit - 240)}\n[Message truncated for context.]\n${entry.text.slice(-240)}`
          : entry.text;
      return {
        role: entry.role === 'user' ? ('user' as const) : ('assistant' as const),
        content,
      };
    }),
  ];
}

/** A current complete theme chosen through ThemePicker/import is evidenced by
 * its user replacement op. No invented provenance, migration or persistent lock. */
function canonicalTheme(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalTheme).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, v]) => `${JSON.stringify(key)}:${canonicalTheme(v)}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
function hasExplicitCurrentTheme(doc: ProjectDoc): boolean {
  for (const entry of [...doc.opLog].reverse()) {
    for (const op of [...entry.batch].reverse()) {
      if (op.op !== 'setTokens') continue;
      if (entry.source !== 'user' || !op.replace) return false;
      return (
        canonicalTheme(op.patch.openuiTheme) === canonicalTheme(doc.tokens.openuiTheme)
      );
    }
  }
  return false;
}

function contextMessages(
  doc: ProjectDoc,
  userText: string,
  extraSystem: string[] = [],
): ChatMessage[] {
  const sheet = buildTokenSheet(doc.tokens);
  const activeScreenId = useUi.getState().activeScreenId;
  const index = buildProjectIndex(doc, {
    selectionId: useUi.getState().selectedId,
    activeScreenId,
  });
  return [
    {
      role: 'system',
      content: `${SYSTEM_PROMPT}\n\nPROJECT TOKENS (honor explicitly supplied designs; defaults are not mandatory):\n${sheet}`,
    },
    {
      role: 'system',
      content: `CANVAS INDEX:\n${index}\n\n${decisionLedger(doc)}\nEARLIER USER MESSAGES below are historical context. Honor the approved plan, but later explicit user corrections take precedence over earlier context or plan details. PROJECT MEMORY (honor and cite relevant preferences):\n${(doc.designNotes || []).slice(-10).join('\n') || 'none'}${extraSystem.length ? `\n${extraSystem.join('\n')}` : ''}`,
    },
    ...history(doc),
    { role: 'user', content: userText },
  ];
}

function recordReceipt(
  result: ChatResult,
  role: string,
  promptChars: number,
  toolNames: string[],
) {
  useAgent.getState().addReceipt({
    role,
    model: result.model,
    promptChars,
    toolNames,
    latencyMs: result.latencyMs,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    cachedTokens: result.usage.cachedTokens,
    cents: estimateCents(result.model, result.usage),
    key: useAgent.getState().keySource === 'session' ? 'user' : 'house',
  });
}

function formatErrors(errors: OpError[]): string {
  return errors
    .slice(0, 8)
    .map((e) => `${e.code}: ${e.message}${e.guidance ? ` — ${e.guidance}` : ''}`)
    .join('\n');
}

interface ScopedDraft {
  rootId: string;
  rootIds?: ReadonlySet<string>;
  screenId: string;
  stylesOnly: boolean;
  initial: string;
  doc: ProjectDoc;
  ops: unknown[];
  dropped: number;
  dropReasons: string[];
  summary: string;
  receipt: {
    model: string;
    promptChars: number;
    latencyMs: number;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    cents: number;
    toolNames: string[];
  };
}

interface ImageBudget {
  remaining: number;
  cardId?: string;
  cap?: number;
  unknown?: boolean;
  documentEpoch?: number;
}

function publishImageBudget(budget: ImageBudget) {
  if (
    budget.cap !== undefined &&
    budget.documentEpoch === useProject.getState().documentEpoch
  )
    useAgent.setState({
      buildImageUsage: {
        used: budget.cap - budget.remaining,
        cap: budget.cap,
        documentEpoch: budget.documentEpoch,
      },
    });
}

/** Persistent per-project automated call allowance; old projects without a ledger fail closed. */
function projectImageBudget(cardId?: string): ImageBudget {
  const { doc, documentEpoch } = useProject.getState();
  const configured = Math.max(0, useAgent.getState().buildImages);
  const ledger = doc.automatedImageBudget;
  if (!ledger) {
    return { remaining: 0, documentEpoch, cardId, unknown: true };
  }
  const cap = ledger.cap ?? configured;
  if (ledger.cap === undefined)
    useProject.setState({ doc: { ...doc, automatedImageBudget: { ...ledger, cap } } });
  return { remaining: Math.max(0, cap - ledger.used), cap, documentEpoch, cardId };
}
function reserveImageAttempt(budget: ImageBudget): boolean {
  if (budget.remaining <= 0) return false;
  if (budget.documentEpoch !== undefined) {
    const state = useProject.getState();
    if (state.documentEpoch !== budget.documentEpoch || !state.doc.automatedImageBudget)
      return false;
    useProject.setState({
      doc: {
        ...state.doc,
        automatedImageBudget: {
          ...state.doc.automatedImageBudget,
          used: state.doc.automatedImageBudget.used + 1,
        },
      },
    });
  }
  budget.remaining -= 1;
  publishImageBudget(budget);
  return true;
}

/** Animation declarations at any breakpoint can override a chosen preset. */
function touchesAnimationStyles(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value).some(
    ([key, nested]) =>
      /^animation(?:$|[A-Z-])/i.test(key) || touchesAnimationStyles(nested),
  );
}

interface ToolLoopOptions {
  messages: ChatMessage[];
  maxCalls: number;
  role?: string;
  effort?: string;
  model?: string;
  onProgress?: (line: string) => void;
  scope?: ScopedDraft;
  repairIds?: string[];
  protectedMotionIds?: string[];
  allowReplaceImages?: boolean;
  imageBudget?: ImageBudget;
  protectDesignTokens?: boolean;
  imageContext?: string;
  suppressAutoImages?: boolean;
  documentEpoch?: number;
  draftGuard?: VisualFinishGuard;
  protectedScreen?: ScreenDoc;
  journal?: TurnJournal;
}

interface ToolLoopResult {
  text: string;
  finished: boolean;
  choiceAsked: boolean;
  changed: boolean;
  screenAdded: boolean;
  calls: number;
  stopped: boolean;
}

async function executeToolLoop(opts: ToolLoopOptions): Promise<ToolLoopResult> {
  const models = useAgent.getState().models;
  // One pinned model per role: the role picks the model, never the other way
  // round. Wonder mode can only move a planning turn onto the architect role.
  // The contributor tier is a dev/testing switch with a legal catch (§6.1):
  // its output can never leave a production build, so touching it marks the doc.
  const contributor = useAgent.getState().contributorMode && import.meta.env.DEV;
  const model =
    opts.model ||
    (contributor
      ? models?.contributor.id
      : opts.role === 'architect'
        ? useAgent.getState().wonder
          ? 'muse-wonder-1.0'
          : models?.architect.id
        : models?.builder.id) ||
    'muse-spark-1.3';
  if (contributor) useProject.getState().markContributor();
  const effort = opts.effort || 'medium';
  const messages = [...opts.messages];
  let calls = 0;
  let finished = false;
  let choiceAsked = false;
  let correctedPick = false;
  let stopped = false;
  let replayRailId: string | undefined;
  const changedBefore = useProject.getState().doc.opLog.length;

  while (calls < opts.maxCalls) {
    if (
      controller?.signal.aborted ||
      (opts.documentEpoch !== undefined &&
        useProject.getState().documentEpoch !== opts.documentEpoch)
    ) {
      stopped = true;
      break;
    }
    let result: ChatResult;
    try {
      const promptChars = messages.reduce(
        (n, m) =>
          n +
          (typeof m.content === 'string'
            ? m.content.length
            : (m.content as Array<{ text?: string }>).reduce(
                (sum, part) => sum + (part.text?.length || 0),
                0,
              )),
        0,
      );
      result = await chatStream({
        model,
        effort,
        messages,
        tools: opts.draftGuard
          ? TOOL_DEFS.filter((t) =>
              ['read_canvas', 'edit_canvas', 'finish'].includes(t.function.name),
            )
          : opts.scope
            ? TOOL_DEFS.filter((t) =>
                ['read_canvas', 'edit_canvas', 'finish'].includes(t.function.name),
              ).map((tool) => ({
                ...tool,
                function: {
                  ...tool.function,
                  description: tool.function.description?.replace(
                    BUILDER_PROPS_PRIMER,
                    [...(opts.scope?.rootIds || [opts.scope!.rootId])]
                      .map((id) => findNodeInDoc(opts.scope!.doc, id)?.node)
                      .filter((node): node is NonNullable<typeof node> => Boolean(node))
                      .map(scopedPrimer)
                      .join('\n'),
                  ),
                },
              }))
            : opts.repairIds
              ? TOOL_DEFS.filter((t) =>
                  ['edit_canvas', 'illustrate_images', 'finish'].includes(t.function.name),
                )
              : TOOL_DEFS,
        signal: controller?.signal,
        onText: (t) => useAgent.getState().appendText(t),
        onRetry: () => useAgent.getState().resetText(),
        onNotice: (n) => addSystem(n),
      });
      if (replayRailId) {
        useProject.getState().patchRail(replayRailId, { reasoningReplayed: true });
        replayRailId = undefined;
      }
      if (opts.scope) {
        const r = opts.scope.receipt;
        r.model = result.model;
        r.promptChars += promptChars;
        r.latencyMs += result.latencyMs;
        r.inputTokens += result.usage.inputTokens;
        r.outputTokens += result.usage.outputTokens;
        r.cachedTokens += result.usage.cachedTokens;
        r.cents += estimateCents(result.model, result.usage);
        r.toolNames.push(...result.toolCalls.map((c) => c.name));
      } else
        recordReceipt(
          result,
          contributor ? 'contributor' : opts.role || 'builder',
          promptChars,
          result.toolCalls.map((c) => c.name),
        );
    } catch (err) {
      if (err instanceof MuseError && err.code === 'aborted') {
        stopped = true;
        break;
      }
      throw err;
    }

    if (
      controller?.signal.aborted ||
      (opts.documentEpoch !== undefined &&
        useProject.getState().documentEpoch !== opts.documentEpoch)
    ) {
      stopped = true;
      break;
    }
    if (result.text) useAgent.getState().resetText();

    if (result.finishReason === 'length') {
      addSystem(
        'The model hit the output cap mid-call — that batch was dropped before it could corrupt anything. Asking for smaller chunks.',
      );
      messages.push({ role: 'user', content: TOOL_SPLIT_NUDGE });
      calls += 1;
      if (calls < opts.maxCalls) continue;
      break;
    }

    if (!result.toolCalls.length) {
      if (/\{\s*"op"|<\/?[a-z]+>|```/.test(result.text)) {
        addSystem('Correction: prose only — the canvas changes through tools.');
        messages.push({ role: 'assistant', content: result.text });
        messages.push({ role: 'user', content: JSON_CORRECTION });
        calls += 1;
        if (calls < opts.maxCalls) continue;
      }
      const typed =
        opts.scope || opts.repairIds || opts.draftGuard
          ? null
          : parseTypedOptions(result.text);
      if (typed) {
        /*
         * Same loop, typed instead of tool-called: options printed as prose
         * after a tap. The fallback must not turn those into a second card —
         * it corrects the model once, then stops asking either way.
         */
        if (pickTurn) {
          if (!correctedPick) {
            correctedPick = true;
            addSystem('Correction: the user already picked — no second choice card.');
            messages.push({ role: 'assistant', content: result.text });
            messages.push({
              role: 'user',
              content: `${TYPED_OPTIONS_CORRECTION} ${pickReceipt(pickTurn)}`,
            });
            calls += 1;
            if (calls < opts.maxCalls) continue;
          }
          if (result.text) addAgent(result.text);
          break;
        }
        addCard(
          'choice',
          {
            question: typed.question,
            options: typed.options,
            source: 'typed',
          },
          typed.question,
        );
        choiceAsked = true;
        addAgent(
          'Those are tappable above now — pick one. (The model typed them as text; the fallback caught it.)',
        );
        break;
      }
      if (result.text && !opts.scope && !opts.repairIds) addAgent(result.text);
      break;
    }

    let assistantRailId =
      result.text && !opts.scope && !opts.repairIds
        ? recordNarration(result.text)
        : undefined;
    const repaired = result.toolCalls.map((call, index) => ({
      call,
      id: call.id || `call_${calls}_${call.name}_${index}`,
      args: repairJson(call.arguments || ''),
    }));
    const validCalls = repaired.filter(
      (item): item is typeof item & { args: string } => item.args !== null,
    );
    const usable = validCalls.slice(0, Math.max(0, opts.maxCalls - calls));
    const dropped = repaired.length - usable.length;
    if (dropped)
      addSystem(
        `${dropped} tool call(s) were invalid or exceeded the call limit and were dropped; the rest ran.`,
      );
    if (usable.length)
      messages.push({
        role: 'assistant',
        content: result.text || '',
        ...(result.reasoningEncrypted
          ? { reasoning: { encrypted_content: result.reasoningEncrypted } }
          : {}),
        tool_calls: usable.map(({ call, id, args }) => ({
          id,
          type: 'function' as const,
          function: { name: call.name, arguments: args },
        })),
      });

    if (usable.length && result.reasoningEncrypted) {
      if (!assistantRailId && !opts.scope && !opts.repairIds)
        assistantRailId = recordNarration('Applying the next tool actions.');
      replayRailId = assistantRailId?.id;
    }
    let endTurn = false;
    for (const { call, id, args: cleanArgs } of usable) {
      calls += 1;
      useAgent.getState().bumpCalls();
      if (controller?.signal.aborted) {
        stopped = true;
        break;
      }
      const name = call.name as ToolName;
      let outcome: string;
      try {
        const parsedArgs = JSON.parse(cleanArgs) as unknown;
        const schema = toolSchemas[name];
        if (!schema) throw new Error(`unknown tool ${name}`);
        const args = schema.parse(parsedArgs);
        const res = await runTool(name, args, opts);
        outcome = res.text;
        if (res.endTurn) endTurn = true;
        if (res.choiceAsked) choiceAsked = true;
        if (res.finished) finished = true;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const code = /JSON/i.test(message) ? 'E_BAD_ARGS' : 'E_BAD_OP';
        outcome = `${code}: ${message.slice(0, 500)}. Fix the tool arguments and retry strict JSON.`;
      }
      messages.push({
        role: 'tool',
        tool_call_id: id,
        name,
        content: outcome.slice(0, MAX_RESULT),
      });
      if (endTurn || finished || choiceAsked) break;
    }
    if (dropped && !stopped && !endTurn && !finished && !choiceAsked) {
      messages.push({ role: 'user', content: TOOL_SPLIT_NUDGE });
      calls += 1;
      if (calls < opts.maxCalls) continue;
    }
    if (stopped || endTurn || finished || choiceAsked) break;
  }

  const changed = useProject.getState().doc.opLog.length > changedBefore;
  return {
    text: '',
    finished,
    choiceAsked,
    changed: changed || changedThisTurn,
    screenAdded: turnScreenAdds > 0,
    calls,
    stopped,
  };
}

interface ToolOutcome {
  text: string;
  finished?: boolean;
  endTurn?: boolean;
  choiceAsked?: boolean;
}

async function runTool(
  name: ToolName,
  args: unknown,
  opts: ToolLoopOptions,
): Promise<ToolOutcome> {
  if (
    smallTalkTurn &&
    (name === 'ask_choice' || name === 'propose_blueprint' || name === 'edit_canvas')
  ) {
    return {
      text:
        'E_SMALL_TALK: that message was a greeting, not a build order. No card, no blueprint, ' +
        'no ops. Answer in one or two sentences and call finish().',
    };
  }
  if (opts.draftGuard && !['read_canvas', 'edit_canvas', 'finish'].includes(name))
    return {
      text: 'The approved visual direction may only be finished with screen edits.',
    };
  if (opts.scope && !['read_canvas', 'edit_canvas', 'finish'].includes(name))
    return { text: 'E_SCOPE: this tool is not allowed for scoped work.' };
  if (opts.repairIds && !['edit_canvas', 'illustrate_images', 'finish'].includes(name))
    return { text: 'E_SCOPE: quality repair may only edit affected nodes.' };
  const doc = opts.scope?.doc || useProject.getState().doc;
  switch (name) {
    case 'read_canvas':
      if (opts.scope) {
        const roots = opts.scope.rootIds || [opts.scope.rootId];
        const outlines = [...roots]
          .map((id) => findNodeInDoc(doc, id)?.node)
          .filter((node): node is NonNullable<typeof node> => Boolean(node))
          .map(subtreeOutline);
        return {
          text: outlines.length ? outlines.join('\n') : 'Scoped node no longer exists.',
        };
      }
      return {
        text: buildProjectIndex(doc, {
          selectionId: useUi.getState().selectedId,
          activeScreenId: useUi.getState().activeScreenId,
        }),
      };

    case 'set_design_tokens': {
      if (opts.journal && !buildCardId()) startBuildPresenter(opts.journal);
      if (pickTurn?.protectTokens || opts.protectDesignTokens)
        return {
          text: 'E_THEME_PROTECTED: the existing design system was preserved. Do not change it without an explicit user request.',
        };
      const a = args as { patch: Record<string, unknown>; title?: string };
      const patch: Record<string, unknown> = { ...a.patch };
      if (a.title) patch.title = a.title;
      const res = useProject
        .getState()
        .applyBatch([{ op: 'setTokens', patch }], { source: 'agent' });
      if (res.errors.length) return { text: `REJECTED\n${formatErrors(res.errors)}` };
      changedThisTurn = true;
      useAgent.getState().setLive('Repainting the canvas with your tokens…');
      addSystem(`🎨 Design updated — ${res.summary}`);
      return { text: 'ok: tokens applied everywhere. Canvas repainted.' };
    }

    case 'propose_blueprint': {
      const a = args as { blueprint_text: string };
      const parsed = presentBlueprint(a.blueprint_text);
      addAgent(
        parsed.screens.length > 1
          ? `Blueprint ready — ${parsed.screens.length} screens. Approve it and I'll fill them, or tweak the plan first.`
          : "Blueprint ready. Approve it and I'll build the screen, or tweak the plan first.",
      );
      return {
        text: 'ok: blueprint persisted and the approval card is on screen. Call finish().',
        endTurn: true,
      };
    }

    case 'ask_choice': {
      /*
       * The deterministic half of the loop fix. The receipt above tells the
       * model not to ask again; this makes it impossible. A second card in a
       * turn that started from a tap would be the same question the user just
       * answered, so no card is added and the model is told what to do next.
       */
      if (pickTurn) {
        return {
          text:
            `E_CHOICE_REPEAT: the user already answered "${pickTurn.question}" with ` +
            `"${pickTurn.label}" — that is the loop they are stuck in, and no card was added. ` +
            'Call propose_blueprint now with the plan, or edit_canvas if a blueprint already exists.',
        };
      }
      const a = args as {
        question: string;
        options: Array<{ label: string; hexes?: string[] }>;
      };
      addCard(
        'choice',
        { question: a.question, options: a.options, source: 'tool' },
        a.question,
      );
      return {
        text: 'ok: choice card is on screen. The user answers by tapping. End the turn now.',
        endTurn: true,
        choiceAsked: true,
      };
    }

    case 'edit_canvas': {
      if (opts.journal && !buildCardId()) startBuildPresenter(opts.journal);
      const a = args as { screen_id?: string; ops: unknown[] };
      if (
        (opts.protectDesignTokens || pickTurn?.protectTokens) &&
        Array.isArray(a.ops) &&
        a.ops.some((op) => (op as { op?: string } | null)?.op === 'setTokens')
      )
        return {
          text: 'E_THEME_PROTECTED: the user-selected design system is preserved; no operations in this batch were applied.',
        };
      const userPrompt =
        [...useProject.getState().doc.rail].reverse().find((entry) => entry.role === 'user')
          ?.text || '';
      if (videoSourceViolation(a.ops, opts.scope?.doc || doc, userPrompt))
        return { text: 'REJECTED: video source must appear exactly in the user’s prompt.' };
      if (opts.protectedScreen) {
        const staged = applyOps(a.ops, doc, {
          source: 'agent',
          screenAddsThisTurn: turnScreenAdds,
        });
        if (staged.errors.length)
          return { text: `REJECTED (nothing applied)\n${formatErrors(staged.errors)}` };
        const protectedAfter = staged.doc.screens.find(
          (screen) => screen.id === opts.protectedScreen!.id,
        );
        if (
          !protectedAfter ||
          JSON.stringify(protectedAfter) !== JSON.stringify(opts.protectedScreen)
        ) {
          addSystem('A proposed change to the chosen visual direction was blocked.');
          return {
            text: 'REJECTED (nothing applied): the selected visual direction must remain unchanged while building other screens.',
          };
        }
      }
      if (opts.draftGuard) {
        const reason = validateVisualFinish(doc, opts.draftGuard, a.ops);
        if (reason) {
          addSystem(`A proposed finishing change was not applied: ${reason}`);
          return {
            text: `REJECTED (nothing applied): ${reason} Keep the selected design and use only explicit approved interactions.`,
          };
        }
      }
      if (opts.scope) {
        const filtered = filterScopedOps(
          opts.scope.doc,
          opts.scope.rootIds || opts.scope.rootId,
          a.ops,
          opts.scope.stylesOnly,
        );
        opts.scope.dropped += filtered.dropped;
        if (filtered.dropped) {
          opts.scope.dropReasons.push(
            ...filtered.droppedOps.map((raw) => {
              const op = raw as {
                op?: string;
                id?: string;
                props?: Record<string, unknown>;
              };
              return `${op?.op || 'operation'}${op?.op === 'setProps' ? `(${Object.keys(op.props || {}).join(', ')})` : ''} on ${op?.id || 'unknown'} was blocked by the styles-only or subtree guard`;
            }),
          );
          const content = filtered.droppedOps.flatMap((raw) => {
            const op = raw as { op?: string; props?: Record<string, unknown> };
            if (!opts.scope?.stylesOnly || !['setText', 'setProps'].includes(op?.op || ''))
              return [];
            return [
              op.op === 'setProps'
                ? `setProps(${Object.keys(op.props || {}).join(', ') || 'content'})`
                : 'setText',
            ];
          });
          addSystem(
            `scope:${opts.scope.rootId} — dropped ${filtered.dropped} out-of-scope or unsafe operation(s)${content.length ? `; dropped: ${content.join(', ')} — use style-semantic select, toggle, icon or tone props, or flip the box to full edit` : ''}.`,
          );
        }
        if (!filtered.allowed.length)
          return {
            text: 'E_SCOPE: no permitted operations; explicit ids are required on added nodes.',
          };
        const staged = applyOps(filtered.allowed, opts.scope.doc, { source: 'agent' });
        if (staged.errors.length)
          return { text: `REJECTED (nothing staged)\n${formatErrors(staged.errors)}` };
        opts.scope.doc = staged.doc;
        opts.scope.ops.push(...filtered.allowed);
        return {
          text: `ok: staged ${filtered.allowed.length} scoped operations; ${filtered.dropped} dropped.`,
        };
      }
      if (opts.repairIds) {
        const ids = new Set(opts.repairIds);
        const filtered = a.ops.filter((raw) => {
          const op = raw as {
            op?: string;
            id?: string;
            props?: Record<string, unknown>;
            styles?: Record<string, unknown>;
          };
          if (!op.id || !ids.has(op.id) || !findNodeInDoc(doc, op.id)) return false;
          if (
            opts.protectedMotionIds?.includes(op.id) &&
            op.op === 'setProps' &&
            op.props &&
            'motion' in op.props
          )
            return false;
          if (
            opts.protectedMotionIds?.includes(op.id) &&
            op.op === 'setStyles' &&
            op.styles &&
            touchesAnimationStyles(op.styles)
          )
            return false;
          if (!['setProps', 'setStyles', 'setText'].includes(op.op || '')) return false;
          // Images are set only by the image tool, never by untrusted repair prose or guessed URLs.
          if (
            op.op === 'setProps' &&
            op.props &&
            ('src' in op.props || 'image' in op.props)
          )
            return false;
          return true;
        });
        if (filtered.length !== a.ops.length)
          addSystem(
            'Repair tried to restructure the page or change something outside its findings; dropped (repair mends, it does not redesign).',
          );
        if (!filtered.length)
          return { text: 'E_SCOPE: no operations target a reported finding.' };
        a.ops = filtered;
      }
      if (
        turnScreenAdds >= 1 &&
        Array.isArray(a.ops) &&
        a.ops.some((o) => (o as { op?: string }).op === 'addScreen')
      ) {
        return {
          text: 'E_BUILD_CARD: a second addScreen in one turn is blocked. End the turn with finish(); the user picks a mode on the card.',
        };
      }
      useAgent.getState().setLive('Writing canvas changes…');
      const res = useProject.getState().applyBatch(a.ops, {
        source: 'agent',
        screenAddsThisTurn: turnScreenAdds,
      });
      if (res.errors.length) {
        return { text: `REJECTED (nothing applied)\n${formatErrors(res.errors)}` };
      }
      changedThisTurn = true;
      const addScreens = a.ops.filter(
        (o) => (o as { op?: string }).op === 'addScreen',
      ).length;
      turnScreenAdds += addScreens;
      useAgent.getState().setLive(`${res.summary} — ${a.ops.length} ops applied`);
      addSystem(`✦ ${res.summary} — applied to ${a.screen_id || 'the canvas'}`);
      if (addScreens > 0) {
        addCard('build_choice', { reason: 'first-screen' }, 'Build it — how?');
        addAgent(
          'Screens exist. How do you want to build them out? Blueprint first (recommended), steady screens, or fast screens.',
        );
        return {
          text: 'ok: applied. Law 12 — the turn ends here; the user picks a build mode on the card. Do not add another screen this turn.',
          endTurn: true,
        };
      }
      return { text: `ok: ${res.summary} (${a.ops.length} ops applied).` };
    }

    case 'illustrate_images': {
      if (opts.journal && !buildCardId()) startBuildPresenter(opts.journal);
      if (opts.suppressAutoImages)
        return {
          text: 'Reference recreation uses placeholders for unavailable source assets; automatic image generation is disabled.',
        };
      const requested = (args as { targets: ImageTarget[] }).targets;
      const ids = opts.repairIds ? new Set(opts.repairIds) : null;
      const eligible = requested.filter((target) => {
        if (!ids) {
          if (opts.imageBudget) {
            const current = findNodeInDoc(doc, target.id)?.node;
            if (!current) {
              addSystem(`Image target ${target.id} does not exist; ignored.`);
              return false;
            }
            if (current.props.src || current.props.image) {
              addSystem(
                `Automatic image generation skipped ${target.id}: it already has an image.`,
              );
              return false;
            }
          }
          return true;
        }
        const hit = findNodeInDoc(doc, target.id);
        if (!hit) {
          addSystem(`Repair invented ${target.id}; ignored.`);
          return false;
        }
        if (!ids.has(target.id)) {
          addSystem(`Repair image ${target.id} is outside its findings; ignored.`);
          return false;
        }
        if (!['image', 'hero', 'card'].includes(hit.node.type)) {
          addSystem(`Repair image ${target.id} is not an image target; ignored.`);
          return false;
        }
        if (!opts.allowReplaceImages && (hit.node.props.src || hit.node.props.image)) {
          addSystem(`Repair skipped ${target.id}: it already has an image.`);
          return false;
        }
        return true;
      });
      const budget = opts.imageBudget;
      const allowed = eligible;
      if (budget?.unknown && allowed.length)
        addSystem(
          'Automated image usage for this older project is unknown; automatic generation is paused to avoid exceeding its project cap. Manual image requests remain separate.',
        );
      if (!allowed.length)
        return { text: 'No eligible image targets; placeholders remain.' };
      const results = budget
        ? await queueAssetTargets(
            allowed,
            opts.imageContext || '',
            budget.remaining,
            controller?.signal,
            budget.cardId,
            !opts.allowReplaceImages,
            () => reserveImageAttempt(budget),
          )
        : await illustrateTargets(allowed, {
            signal: controller?.signal,
            onlyEmpty: Boolean(opts.repairIds && !opts.allowReplaceImages),
            context: opts.imageContext,
          });
      return {
        text: results.length
          ? results.map((r) => `${r.id}: ${r.ok ? 'applied' : r.message}`).join('\n')
          : 'No automatic image requests were run; check the asset status for the reason. Placeholders remain.',
      };
    }

    case 'finish': {
      const a = args as { summary: string };
      if (opts.scope) opts.scope.summary = String(a.summary || '').slice(0, 1000);
      if (!opts.scope && !opts.repairIds) {
        useProject.getState().snapshotProjectTheme();
        addAgent(a.summary);
      }
      return { text: 'ok: turn finished.', finished: true };
    }

    default:
      return { text: `E_BAD_ARGS: unknown tool ${String(name)}` };
  }
}

async function reviewer(
  task: string,
  outline: string,
  findings: string,
  snapshot?: string,
): Promise<{ verdict: 'pass' | 'problems' | 'error'; notes: string }> {
  const models = useAgent.getState().models;
  try {
    const wonder = useAgent.getState().wonder;
    const hasImage = Boolean(snapshot && snapshot.startsWith('data:image/'));
    const userContent = hasImage
      ? ([
          { type: 'text', text: reviewerPrompt(task, outline, findings, true) },
          { type: 'image_url', image_url: { url: snapshot } },
        ] as unknown as string)
      : reviewerPrompt(task, outline, findings, false);

    const systemPrompt = hasImage
      ? 'You are a strict design reviewer with vision. Inspect the rendered canvas screenshot alongside the outline. Reply with PASS or PROBLEMS only.'
      : 'You are a strict design reviewer. Reply with PASS or PROBLEMS only.';

    const request = () =>
      chatStream({
        model: (wonder ? models?.architect.id : models?.chat.id) || 'muse-spark-1.3',
        effort: wonder ? 'max' : 'medium',
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          { role: 'user', content: userContent },
        ],
        signal: controller?.signal,
        maxTokens: 700,
      });
    let result = await request();
    recordReceipt(result, 'reviewer', outline.length, []);
    if (
      !result.text.trim() &&
      result.finishReason === 'stop' &&
      !controller?.signal.aborted
    ) {
      result = await request();
      recordReceipt(result, 'reviewer', outline.length, []);
    }
    if (
      !result.text.trim() &&
      result.finishReason === 'stop' &&
      !controller?.signal.aborted
    ) {
      result = await chatStream({
        model: models?.chat.id || 'muse-spark-1.3',
        effort: 'low',
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          { role: 'user', content: userContent },
        ],
        signal: controller?.signal,
        maxTokens: 700,
      });
      recordReceipt(result, 'reviewer', outline.length, []);
      if (!result.text.trim())
        return { verdict: 'error', notes: 'reviewer unavailable after 3 attempts' };
    }
    const text = result.text.trim();
    if (/^PASS\b/i.test(text)) return { verdict: 'pass', notes: '' };
    if (/^PROBLEMS/i.test(text)) return { verdict: 'problems', notes: text.slice(0, 1200) };
    return text
      ? { verdict: 'problems', notes: text.slice(0, 1200) }
      : {
          verdict: 'error',
          notes: `empty response (finish_reason: ${result.finishReason || 'unknown'})`,
        };
  } catch (err) {
    return {
      verdict: 'error',
      notes: (err instanceof Error ? err.message : String(err)).slice(0, 200),
    };
  }
}

function findingsFor(
  doc: ProjectDoc,
  screenIds: string[],
  before?: ProjectDoc,
): LintFinding[] {
  const findings = doc.screens
    .filter((screen) => screenIds.includes(screen.id))
    .flatMap((screen) => lintScreen(screen, doc.tokens, new Set(), doc.kind));
  const all = [...(before ? lintRemovedImageVoids(before, doc) : []), ...findings];
  const composition = all.filter((finding) => finding.code === 'composition');
  const chosen = new Set(
    [
      ...composition.filter((finding) => finding.severity === 'block'),
      ...composition.filter((finding) => finding.severity !== 'block'),
    ].slice(0, 4),
  );
  return all.filter((finding) => finding.code !== 'composition' || chosen.has(finding));
}

function formatFindings(findings: LintFinding[]): string {
  return findings.length
    ? findings.map((f) => `[${f.severity}] ${f.nodeId}: ${f.message}`).join('\n')
    : 'No lint findings.';
}

function imageIdsFromFindings(doc: ProjectDoc, findings: LintFinding[]): string[] {
  return [
    ...new Set(findings.filter((f) => f.code === 'imagery').map((f) => f.nodeId)),
  ].filter((id) => {
    const node = findNodeInDoc(doc, id)?.node;
    return (
      node &&
      ['image', 'hero', 'card'].includes(node.type) &&
      !node.props.src &&
      !node.props.image
    );
  });
}
function repairSummary(ids: string[]) {
  if (!ids.length) return;
  const doc = useProject.getState().doc;
  const missing = ids.filter((id) => {
    const node = findNodeInDoc(doc, id)?.node;
    return !node || !(node.props.src || node.props.image);
  });
  addSystem(
    `Restored ${ids.length - missing.length} of ${ids.length} flagged images${missing.length ? ` (${missing.join(', ')} still empty or missing)` : ''}.`,
  );
}
function publishImageWarnings(doc: ProjectDoc, findings: LintFinding[]) {
  const ids = imageIdsFromFindings(doc, findings);
  useAgent.setState({
    imageWarnings: new Set(ids),
    imageWarningEpoch: useProject.getState().documentEpoch,
  });
  if (ids.length)
    addSystem(
      `Images still empty: ${ids.join(', ')}. Placeholders remain; see warning badges.`,
    );
}

export async function verifyGate(
  task: string,
  doc: ProjectDoc,
  screenIds: string[],
  imageBudget: ImageBudget = projectImageBudget(),
  before?: ProjectDoc,
  suppressAutoImages = false,
): Promise<void> {
  const reviewEpoch = useProject.getState().documentEpoch;
  useAgent.getState().setVerification('running');
  let findings = findingsFor(doc, screenIds, before);
  const motionAdvisories = () =>
    doc.screens
      .filter((screen) => screenIds.includes(screen.id))
      .flatMap(lintMotion)
      .filter((finding) => finding.advisory);
  const blocking = findings.filter((f) => f.severity === 'block');
  if (blocking.length) {
    useAgent.getState().setVerification('problems', formatFindings(blocking));
    addSystem(
      `Quality lint found ${blocking.length} blocking issue(s); attempting one targeted repair.\n${formatFindings(blocking)}`,
    );
    useAgent.getState().setLive('Repairing quality issues…');
    const repairFindings = findings.filter(
      (finding) => finding.severity === 'block' || finding.code === 'imagery',
    );
    const affected = [...new Set(repairFindings.map((finding) => finding.nodeId))];
    const flaggedImages = imageIdsFromFindings(doc, repairFindings);
    try {
      await executeToolLoop({
        messages: [
          {
            role: 'system',
            content:
              'Repair ONLY the listed quality findings in the affected screen outline. Use setProps, setText or setStyles only on existing nodes; never add or move nodes; do not alter unrelated nodes or screens. Do not invent image URLs. You may call illustrate_images only on listed affected IDs if image budget remains; otherwise leave image placeholders in place. Use small edit_canvas batches then finish.',
          },
          {
            role: 'user',
            content: `FINDINGS:\n${formatFindings(repairFindings)}\nAFFECTED OUTLINE:\n${affected
              .map((id) => findNodeInDoc(doc, id)?.node)
              .filter((node) => node !== undefined)
              .map(subtreeOutline)
              .join('\n')}`,
          },
        ],
        maxCalls: 8,
        role: 'builder',
        effort: 'high',
        repairIds: affected,
        protectedMotionIds: motionAdvisories()
          .filter((f) => f.protectMotion)
          .map((f) => f.nodeId),
        imageBudget,
        imageContext: task,
        suppressAutoImages,
        documentEpoch: reviewEpoch,
      });
    } catch (err) {
      if (useProject.getState().documentEpoch !== reviewEpoch) return;
      addSystem(
        `Quality repair failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (useProject.getState().documentEpoch !== reviewEpoch) return;
    repairSummary(flaggedImages);
    doc = useProject.getState().doc;
    findings = findingsFor(doc, screenIds, before);
  }
  if (controller?.signal.aborted) {
    publishImageWarnings(doc, findings);
    useAgent
      .getState()
      .setVerification('unverified', 'Stopped during repair; review was not completed.');
    addSystem('Unverified — stopped during repair; review was not completed.');
    return;
  }
  const remaining = findings.filter((f) => f.severity === 'block');
  if (remaining.length) {
    publishImageWarnings(doc, findings);
    const notes = formatFindings(findings);
    useAgent.getState().setVerification('problems', notes);
    addSystem(`Not verified — quality lint still found blocking issues:\n${notes}`);
    return;
  }
  const outline = `${canvasOutline(doc, screenIds)}\nCURRENT TOKEN SHEET (text only):\n${buildTokenSheet(doc.tokens)}`;
  let snapshot = '';
  try {
    snapshot = await captureVisualReviewCollage(doc, screenIds[0]);
  } catch {
    // Graceful fallback to text outline if capture is unavailable
  }
  const first = await reviewer(
    task,
    outline,
    formatFindings(findings.filter((f) => !f.advisory)),
    snapshot,
  );
  if (useProject.getState().documentEpoch !== reviewEpoch || controller?.signal.aborted)
    return;
  if (first.verdict === 'pass') {
    publishImageWarnings(doc, findings);
    useAgent
      .getState()
      .setVerification('pass', findings.length ? formatFindings(findings) : null);
    addSystem(
      `✓ Verified — lint passed and reviewer said PASS${findings.length ? ` (warnings:\n${formatFindings(findings)})` : ''}`,
    );
    return;
  }
  if (first.verdict === 'error') {
    publishImageWarnings(doc, findings);
    useAgent
      .getState()
      .setVerification(
        'unverified',
        `${first.notes || 'Reviewer failed.'}\n${formatFindings(findings)}`,
      );
    addSystem(
      `Unverified — lint passed, but reviewer failed (${first.notes || 'no detail'}).\n${formatFindings(findings)}`,
    );
    return;
  }
  const actionable = findings.filter((finding) => !finding.advisory);
  const affected = new Set(actionable.map((finding) => finding.nodeId));
  const advisoryOnlyIds = new Set(
    motionAdvisories()
      .filter((finding) => !affected.has(finding.nodeId))
      .map((finding) => finding.nodeId),
  );
  for (const screen of doc.screens.filter((screen) => screenIds.includes(screen.id)))
    walk(screen.root, (node) => {
      if (
        !advisoryOnlyIds.has(node.id) &&
        new RegExp(`(^|[^a-z0-9_])${node.id}([^a-z0-9_]|$)`, 'i').test(first.notes)
      )
        affected.add(node.id);
    });
  if (!affected.size) {
    publishImageWarnings(doc, findings);
    useAgent
      .getState()
      .setVerification(
        'problems',
        `Reviewer reported problems without identifying affected nodes: ${first.notes}`,
      );
    addSystem(
      'Not verified — reviewer reported problems but identified no existing nodes to repair safely.',
    );
    return;
  }
  const flaggedImages = imageIdsFromFindings(doc, findings).filter((id) =>
    affected.has(id),
  );
  addSystem('Reviewer saw problems — one scoped repair round.');
  try {
    await executeToolLoop({
      messages: contextMessages(
        doc,
        `${rebuildNote(first.notes)}\nComposition hints:\n${formatFindings(findings.filter((f) => f.code === 'composition' && !f.advisory))}\nRepair only these existing ids: ${[...affected].join(', ')}. Never restructure the page or replace healthy images.`,
      ),
      maxCalls: 8,
      role: 'builder',
      effort: 'high',
      repairIds: [...affected],
      protectedMotionIds: motionAdvisories()
        .filter((f) => f.protectMotion)
        .map((f) => f.nodeId),
      imageBudget,
      imageContext: task,
      suppressAutoImages,
      documentEpoch: reviewEpoch,
    });
  } catch (err) {
    if (useProject.getState().documentEpoch !== reviewEpoch) return;
    addSystem(`Repair call failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (useProject.getState().documentEpoch !== reviewEpoch) return;
  repairSummary(flaggedImages);
  const after = useProject.getState().doc;
  findings = findingsFor(after, screenIds, before);
  publishImageWarnings(after, findings);
  if (findings.some((f) => f.severity === 'block')) {
    useAgent.getState().setVerification('problems', formatFindings(findings));
    addSystem(
      `Not verified — rebuild introduced blocking quality issues:\n${formatFindings(findings)}`,
    );
    return;
  }
  let secondSnapshot = '';
  try {
    secondSnapshot = await captureVisualReviewCollage(after, screenIds[0]);
  } catch {
    // Graceful fallback to text outline if capture is unavailable
  }
  const second = await reviewer(
    task,
    `${canvasOutline(after, screenIds)}\nCURRENT TOKEN SHEET (text only):\n${buildTokenSheet(after.tokens)}`,
    formatFindings(findings.filter((f) => !f.advisory)),
    secondSnapshot,
  );
  if (useProject.getState().documentEpoch !== reviewEpoch || controller?.signal.aborted)
    return;
  const state =
    second.verdict === 'pass'
      ? 'pass'
      : second.verdict === 'error'
        ? 'unverified'
        : 'problems';
  useAgent
    .getState()
    .setVerification(
      state,
      [second.notes, findings.length ? formatFindings(findings) : '']
        .filter(Boolean)
        .join('\n') || null,
    );
  addSystem(
    state === 'pass'
      ? '✓ Rebuild verified — PASS'
      : state === 'unverified'
        ? `Unverified — reviewer failed (${second.notes || 'no detail'}).`
        : `Not verified — reviewer still saw problems: ${second.notes}`,
  );
}

/**
 * The key card (§2b): one honest card, one paste field, one retry. It appears
 * when the shared key is gone or out of budget — never a silent demo fallback,
 * because a scripted build pretending to be muse is the lie this product exists
 * to avoid.
 */
export function offerKey(detail: string, retryText: string) {
  const agent = useAgent.getState();
  agent.setPendingRetry(retryText || null);
  const already = useProject
    .getState()
    .doc.rail.some(
      (entry) =>
        entry.role === 'card' &&
        entry.card?.kind === 'key' &&
        entry.card.state === 'pending',
    );
  addSystem(detail);
  if (already) return;
  addCard(
    'key',
    { reason: detail, retryText: retryText || '', houseKey: useAgent.getState().houseKey },
    'Add your Meta API key',
  );
}

function wrapError(err: unknown, userText: string) {
  const message = err instanceof Error ? err.message : String(err);
  const code = err instanceof MuseError ? err.code : 'error';
  useAgent.getState().setError(message);
  if (code === 'house_key_exhausted') {
    useAgent.getState().setStatus({
      configured: false,
      demoMode: false,
      houseKey: 'exhausted',
      statusError: message,
    });
    offerKey(`The shared key for this demo is out of budget. ${message}`, userText);
    return;
  }
  if (code === 'house_key_rejected') {
    // A refused key is NOT a spent budget. Say which one it was.
    useAgent.getState().setStatus({
      configured: false,
      demoMode: false,
      houseKey: 'rejected',
      statusError: message,
    });
    offerKey(
      `The server's shared key was rejected by Meta — not a budget problem, the key itself. ${message}`,
      userText,
    );
    return;
  }
  if (code === 'house_key_rate_limited') {
    useAgent.getState().setStatus({
      configured: false,
      demoMode: false,
      houseKey: 'rate_limited',
      statusError: message,
    });
    offerKey(`Meta is rate-limiting the shared key right now. ${message}`, userText);
    return;
  }
  if (code === 'no_key') {
    useAgent
      .getState()
      .setStatus({ configured: false, demoMode: false, houseKey: 'absent' });
    offerKey('No muse key on this server yet.', userText);
    return;
  }
  addCard('error', { message, code, retryText: userText }, 'That did not finish.');
}

/** Persist-on-create + approval card. Shared by the tool, the screenshot path and the local engine. */
export function presentBlueprint(text: string) {
  const doc = useProject.getState().doc;
  useProject.getState().setBlueprint(text, false);
  const parsed = parseBlueprint(text, doc.tokens);
  addCard(
    'blueprint',
    {
      blueprint: text,
      screens: parsed.screens.map((s) => ({ id: s.id, name: s.name })),
      look: parsed.look,
      stateKeys: parsed.stateKeys,
      wiring: parsed.wiring,
      title: parsed.screens.map((s) => s.name).join(' · '),
    },
    'Blueprint ready for approval',
  );
  return parsed;
}

export interface TurnOptions {
  role?: 'builder' | 'architect';
  effort?: string;
  silent?: boolean;
  resumeJournal?: string;
  skipVerify?: boolean;
  /** Set when this turn is the answer to a choice card the user just tapped. */
  pick?: PickDirective;
}

/** One user turn: paced, streamed, tool-validated, verified (§8.1). */
export async function runAgentTurn(
  userText: string,
  opts: TurnOptions = {},
): Promise<void> {
  userText = userText.slice(0, 8000);
  if (running) {
    useUi.getState().toast('muse is already working — Stop first.', 'warn');
    return;
  }
  running = true;
  controller = new AbortController();
  turnScreenAdds = 0;
  changedThisTurn = false;
  pickTurn = opts.pick ?? null;
  smallTalkTurn = isSmallTalk(userText);
  const agent = useAgent.getState();
  agent.startTurn();
  const startedAt = Date.now();
  startHeartbeat(startedAt);
  const before = useProject.getState().doc;
  const journal = beginTurnJournal(userText);
  if (!smallTalkTurn) {
    useAgent.setState({
      assetJobs: [],
      assetDocumentEpoch: useProject.getState().documentEpoch,
      assetsPending: new Set(),
    });
    startBuildPresenter(journal);
  }
  useAgent.getState().setInterruptionCard(null);
  let terminal: 'receipt' | 'interrupted' | 'failed' | 'discard' = 'discard';
  let terminalMessage = '';
  const interrupted = (reason: 'error' | 'stopped' | 'cap', message?: string) => {
    terminal = reason === 'error' ? 'failed' : 'interrupted';
    terminalMessage = message || '';
    endTurnJournal(journal);
    useAgent
      .getState()
      .setInterruptionCard(
        reason === 'error'
          ? null
          : { kind: 'interrupted', journal, reason, message, cardId: buildCardId() },
      );
  };

  if (useAgent.getState().demoMode) {
    const { runDemoTurn } = await import('./demo/agent');
    try {
      await runDemoTurn(userText, { stopSignal: controller.signal, turnScreenAdds });
      terminal = journal.entries.length ? 'receipt' : 'discard';
    } catch (err) {
      if (err instanceof MuseError && err.code === 'aborted') interrupted('stopped');
      else interrupted('error', err instanceof Error ? err.message : String(err));
    } finally {
      finishBuildPresenter(terminal, {
        screens: useProject.getState().doc.screens.length,
        message: terminalMessage,
        retryText: userText,
      });
      stopBuildPresenter();
      journal.unsubscribe?.();
      stopHeartbeat();
      useAgent.getState().endTurn();
      running = false;
      controller = null;
      pickTurn = null;
      smallTalkTurn = false;
    }
    return;
  }

  try {
    const isPlanning = !before.blueprint?.text && before.screens.length === 0;
    const activeScreenId = useUi.getState().activeScreenId;
    const existingProjectGuidance =
      before.screens.length > 0
        ? `EXISTING USER PROJECT GUIDANCE:
The user has ${before.screens.length} existing screen(s) in this project (active: "${activeScreenId || before.screens[0]?.id || 'current'}").
- The user is actively building and designing this project. Acknowledge and work with their existing screens and sections.
- When the user asks for suggestions, review, critique, or advice: respond directly with actionable design suggestions in prose and offer specific edits.
- When the user asks to redesign, edit, restyle, fix, or add something to a section or screen: use edit_canvas to update existing nodes or add new elements to the current screen (${activeScreenId || before.screens[0]?.id || 'active screen'}), or use set_design_tokens for theme/color adjustments.
- If a node is selected, target that specific node/section.
- DO NOT propose a blueprint, do not call ask_choice, and DO NOT call addScreen unless the user explicitly requested a brand new screen.`
        : '';
    const messages = contextMessages(before, userText, [
      ...(isPlanning ? [BLUEPRINT_PROMPT] : []),
      ...(existingProjectGuidance ? [existingProjectGuidance] : []),
      ...(pickTurn ? [pickReceipt(pickTurn)] : []),
      ...(opts.resumeJournal ? [opts.resumeJournal] : []),
    ]);
    // Wonder mode (§6.1): an opt-in, 4x-priced planning round on the architect
    // role. Only the FIRST turn — before anything exists to fill — and never
    // for the routine edits that follow.
    const wonder = useAgent.getState().wonder && before.screens.length === 0;
    const imageBudget = projectImageBudget();
    const repairFollowup =
      /\b(fix|repair|restore|mend|correct)\b/i.test(userText) && before.screens.length > 0;
    const explicitReplace =
      /\b(replace|regenerate|redo)\b/i.test(userText) &&
      /\b(image|images|photo|photos|picture|pictures)\b/i.test(userText);
    const manualImageRequest =
      /\b(generate|illustrate|replace|regenerate|redo)\b/i.test(userText) &&
      /\b(image|images|photo|photos|picture|pictures)\b/i.test(userText) &&
      !repairFollowup;
    const initialFindings = repairFollowup
      ? findingsFor(
          before,
          before.screens.map((screen) => screen.id),
        )
      : [];
    const isImageRepair =
      repairFollowup && /\b(image|images|photo|photos|picture|pictures)\b/i.test(userText);
    // Advisory findings are not repair instructions. Derive protection from
    // the uncapped motion lint, so a crowded findings list cannot hide it.
    const explicitIds = new Set<string>();
    if (repairFollowup)
      for (const screen of before.screens)
        walk(screen.root, (node) => {
          if (new RegExp(`(^|[^a-z0-9_])${node.id}([^a-z0-9_]|$)`, 'i').test(userText))
            explicitIds.add(node.id);
        });
    const repairIds = new Set(
      initialFindings
        .filter((f) => !f.advisory && (!isImageRepair || f.code === 'imagery'))
        .map((f) => f.nodeId),
    );
    explicitIds.forEach((id) => repairIds.add(id));
    const explicitMotionRequest =
      /\b(?:motion|animation)\b/i.test(userText) &&
      /\b(?:none|off|disable|disabled|remove|stop|rise|fade|slide|scale)\b/i.test(userText);
    const protectedMotionIds = repairFollowup
      ? before.screens
          .flatMap(lintMotion)
          .filter(
            (f) => f.protectMotion && !(explicitMotionRequest && explicitIds.has(f.nodeId)),
          )
          .map((f) => f.nodeId)
      : [];
    const flaggedImages = imageIdsFromFindings(before, initialFindings).filter((id) =>
      repairIds.has(id),
    );
    const result = await executeToolLoop({
      messages,
      repairIds: repairFollowup ? [...repairIds] : undefined,
      protectedMotionIds,
      allowReplaceImages: repairFollowup && explicitReplace,
      imageContext: userText,
      imageBudget:
        manualImageRequest || (repairFollowup && explicitReplace) ? undefined : imageBudget,
      maxCalls: TURN_CALL_CAP,
      role: opts.role || (wonder ? 'architect' : 'builder'),
      effort: opts.effort || (wonder ? 'max' : 'medium'),
      journal,
    });
    if (result.changed && !buildCardId()) {
      startBuildPresenter(journal);
    }
    if (result.changed && !result.choiceAsked) terminal = 'receipt';
    if (repairFollowup) {
      repairSummary(flaggedImages);
      const now = useProject.getState().doc;
      publishImageWarnings(
        now,
        findingsFor(
          now,
          now.screens.map((screen) => screen.id),
        ),
      );
    }
    if (result.stopped) {
      interrupted('stopped');
      return;
    }
    if (!result.finished && !result.choiceAsked && result.calls >= TURN_CALL_CAP) {
      interrupted('cap');
      return;
    }
    if (result.changed && !result.choiceAsked && !opts.skipVerify) {
      const doc = useProject.getState().doc;
      const ids = doc.screens
        .filter((screen) => {
          const old = before.screens.find((item) => item.id === screen.id);
          return !old || JSON.stringify(old) !== JSON.stringify(screen);
        })
        .map((screen) => screen.id);
      // Routine edits must not spend image credits on pre-existing empty nodes.
      const newlyAdded = new Set<string>();
      const collectNew = (node: import('../types/tree').ComponentNode) => {
        if (!findNodeInDoc(before, node.id)) newlyAdded.add(node.id);
        node.children.forEach(collectNew);
      };
      doc.screens
        .filter((screen) => ids.includes(screen.id))
        .forEach((screen) => collectNew(screen.root));
      await autoIllustrate(
        ids,
        userText,
        imageBudget.remaining,
        controller.signal,
        newlyAdded,
        buildCardId(),
        () => reserveImageAttempt(imageBudget),
      );
      if (controller.signal.aborted) {
        interrupted('stopped');
        return;
      }
      await verifyGate(
        userText,
        useProject.getState().doc,
        ids.length ? ids : doc.screens.map((screen) => screen.id),
        imageBudget,
        before,
      );
      if (controller.signal.aborted) {
        interrupted('stopped');
        return;
      }
    }
    const entryBefore = before.screens.find((screen) => screen.entry);
    if (
      result.finished &&
      result.changed &&
      !result.choiceAsked &&
      !controller.signal.aborted &&
      (!entryBefore || entryBefore.root.children.length === 0)
    )
      nameProjectAfterBuild();
    if (!result.finished && !result.choiceAsked && !result.stopped) {
      addAgent("That's where this turn landed. Look it over, or tell me the next move.");
    }
  } catch (err) {
    if (err instanceof MuseError && err.code === 'aborted') interrupted('stopped');
    else if (
      err instanceof MuseError &&
      [
        'house_key_exhausted',
        'house_key_rejected',
        'house_key_rate_limited',
        'no_key',
      ].includes(err.code)
    ) {
      wrapError(err, userText);
      interrupted('error', err.message);
      terminal = 'discard';
    } else interrupted('error', err instanceof Error ? err.message : String(err));
  } finally {
    const currentScreens = useProject.getState().doc.screens;
    const changedScreens = currentScreens.filter(
      (screen) =>
        JSON.stringify(screen) !==
        JSON.stringify(before.screens.find((old) => old.id === screen.id)),
    ).length;
    finishBuildPresenter(terminal, {
      screens: changedScreens,
      message: terminalMessage,
      retryText: userText,
    });
    stopBuildPresenter();
    journal.unsubscribe?.();
    stopHeartbeat();
    useAgent.getState().endTurn();
    running = false;
    controller = null;
    pickTurn = null;
    smallTalkTurn = false;
  }
}

/** One-click redesign is staged and checked before a single atomic commit. */
export async function runScopedAction(
  nodeId: string,
  instruction: string,
  stylesOnly = false,
  batch?: { screenId: string; type: string; count?: number },
): Promise<void> {
  if (running) {
    useUi.getState().toast('muse is already working — Stop first.', 'warn');
    return;
  }
  const before = useProject.getState().doc;
  const documentEpoch = useProject.getState().documentEpoch;
  const hit = findNodeInDoc(before, nodeId);
  if (!hit) {
    useUi.getState().toast('That selection no longer exists.', 'warn');
    return;
  }
  if (batch && (hit.screen.id !== batch.screenId || hit.node.type !== batch.type)) {
    useUi.getState().toast('That widget or screen has changed; start a new edit.', 'warn');
    return;
  }
  const targets: (typeof hit.node)[] = [];
  if (batch)
    walk(hit.screen.root, (n) => {
      if (n.type === batch.type) targets.push(n);
    });
  else targets.push(hit.node);
  if (batch?.count !== undefined && targets.length !== batch.count) {
    useUi.getState().toast('The matching widgets changed; start a new edit.', 'warn');
    return;
  }
  if (targets.length > 20) {
    useUi
      .getState()
      .toast('Batch edits are limited to 20 widgets; no changes made.', 'warn');
    return;
  }
  const widgetEdit = stylesOnly;
  const contentIntent = /\b(text|label|say|copy|rename|icon|placeholder|title)\b/i.test(
    instruction,
  );
  if (contentIntent) stylesOnly = false;
  const preference = preferenceNote(instruction, 'global');
  if (preference)
    useProject
      .getState()
      .addDesignNote(
        preference.replace(
          'user preference:',
          `user preference for ${nodeId} (${hit.node.type}):`,
        ),
      );
  if (useAgent.getState().demoMode) {
    addSystem(`scope:${nodeId} — scoped redesign requires a muse key; nothing changed.`);
    return;
  }
  if (contentIntent) addSystem(`scope:${nodeId} — content + style edit`);
  const initialTargets = new Map(targets.map((n) => [n.id, JSON.stringify(n)]));
  const scope: ScopedDraft = {
    rootId: nodeId,
    rootIds: batch ? new Set(targets.map((n) => n.id)) : undefined,
    screenId: hit.screen.id,
    stylesOnly,
    initial: JSON.stringify(hit.node),
    doc: clone(before),
    ops: [],
    dropped: 0,
    dropReasons: [],
    summary: '',
    receipt: {
      model: '',
      promptChars: 0,
      latencyMs: 0,
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      cents: 0,
      toolNames: [],
    },
  };
  running = true;
  controller = new AbortController();
  turnScreenAdds = 0;
  changedThisTurn = false;
  smallTalkTurn = false;
  pickTurn = null;
  useAgent.getState().startTurn();
  startHeartbeat(Date.now());
  let status: 'success' | 'failed' = 'failed';
  try {
    const scopedMessages = (): Array<{ role: 'system' | 'user'; content: string }> => [
      {
        role: 'system',
        content: `You are editing ONLY ${batch ? `the listed widget IDs: ${targets.map((n) => n.id).join(', ')}. Only setStyles${stylesOnly ? ' and setProps for library select, toggle, icon or tone props' : ', setText, setProps or rename'} on those IDs; no structural changes.` : `subtree ${nodeId}. ${stylesOnly ? 'Use setStyles and setProps only for library select, toggle, icon or tone props on this selected widget; preserve structure, content, events and everything else.' : 'Change only nodes inside this subtree; never move or delete the selected root. New nodes MUST have explicit unique ids, including nested children.'}`} WIDGET PROPS from the library:\n${targets.map(scopedPrimer).join('\n')}\nDesign law: colors ONLY as token names or var(--openui-*) — never raw hex, rgb or rgba. fontWeight supports 300, 400, 500, 600, 700 and 800; follow the user’s requested weight and the available font. Spacing and radii from the token sheet. setStyles MERGES — change only the keys the instruction needs; preserve the rest. Match the widget's existing style vocabulary. Honor and cite relevant project memory in your response. Use edit_canvas in small batches then finish. No other screens, tokens, or nodes may be touched.\nTOKENS:\n${buildTokenSheet(before.tokens)}`,
      },
      {
        role: 'user',
        content: buildScopeContext(
          useProject.getState().doc,
          nodeId,
          instruction,
          !stylesOnly && scope.dropReasons.length
            ? `${scope.dropped} dropped: ${scope.dropReasons[0]}; content setProps are now permitted within the original scope.`
            : '',
        ),
      },
    ];
    const run = () =>
      executeToolLoop({
        scope,
        maxCalls: 12,
        role: 'builder',
        effort: 'medium',
        messages: scopedMessages(),
      });
    let result = await run();
    if (
      stylesOnly &&
      result.finished &&
      !result.stopped &&
      !controller.signal.aborted &&
      !scope.ops.length &&
      scope.dropped > 0
    ) {
      addSystem(`scope:${nodeId} — retrying with content edits allowed`);
      stylesOnly = false;
      scope.stylesOnly = false;
      scope.summary = '';
      result = await run();
    }
    if (result.stopped || controller.signal.aborted) {
      addSystem(`scope:${nodeId} — stopped; staged changes discarded.`);
      return;
    }
    if (!result.finished) {
      addSystem(`scope:${nodeId} — action did not finish; staged changes discarded.`);
      return;
    }
    if (!scope.ops.length) {
      addSystem(`scope:${nodeId} — no permitted changes were made.`);
      status = 'success';
      return;
    }
    if (batch) {
      const touched = new Set(scope.ops.map((op) => (op as { id?: string }).id));
      if (targets.some((n) => !touched.has(n.id))) {
        addSystem(
          `scope:${nodeId} — batch did not cover every matching widget; staged changes discarded.`,
        );
        return;
      }
    }
    const current = findNodeInDoc(useProject.getState().doc, nodeId);
    if (
      !current ||
      useProject.getState().documentEpoch !== documentEpoch ||
      current.screen.id !== scope.screenId ||
      JSON.stringify(current.node) !== scope.initial ||
      targets.some((n) => {
        const now = findNodeInDoc(useProject.getState().doc, n.id);
        return (
          !now ||
          now.screen.id !== scope.screenId ||
          JSON.stringify(now.node) !== initialTargets.get(n.id)
        );
      }) ||
      (batch &&
        (() => {
          const screen = useProject
            .getState()
            .doc.screens.find((s) => s.id === scope.screenId);
          let count = 0;
          if (screen)
            walk(screen.root, (n) => {
              if (n.type === batch.type) count++;
            });
          return count !== targets.length;
        })())
    ) {
      addSystem(
        `scope:${nodeId} — selection changed while muse was working; staged changes discarded to protect your edits.`,
      );
      return;
    }
    const commit = useProject
      .getState()
      .applyBatch(scope.ops, { source: 'agent', lesson: instruction });
    if (commit.errors.length) {
      addSystem(
        `scope:${nodeId} — could not apply the staged changes: ${formatErrors(commit.errors)}`,
      );
      return;
    }
    status = 'success';
    if (scope.summary.trim()) addAgent(scope.summary);
    const after = useProject.getState();
    const undoGroup = after.undoStack[after.undoStack.length - 1];
    const epoch = after.documentEpoch;
    useUi
      .getState()
      .toast(
        `Restyled ${String(hit.node.props.name || hit.node.props.text || hit.node.type)} —`,
        'ok',
        {
          label: 'Undo',
          run: () => {
            const state = useProject.getState();
            if (
              state.documentEpoch !== epoch ||
              state.undoStack[state.undoStack.length - 1] !== undoGroup
            ) {
              useUi
                .getState()
                .toast('Undo is no longer the latest edit; nothing was undone.', 'warn');
              return;
            }
            state.undo();
          },
        },
      );
    const changedIds = new Set(
      scope.ops.map((raw) => (raw as { id?: string }).id).filter(Boolean),
    );
    const screen = after.doc.screens.find((s) => s.id === scope.screenId);
    const warnings = screen
      ? lintScreen(screen, after.doc.tokens, new Set(), after.doc.kind).filter(
          (f) =>
            f.code === 'token' &&
            f.severity === 'warn' &&
            changedIds.has(f.nodeId) &&
            f.message.startsWith('raw color in '),
        )
      : [];
    const sameType: string[] = [];
    if (!batch && screen)
      walk(screen.root, (n) => {
        if (n.type === hit.node.type) sameType.push(n.id);
      });
    useProject.getState().addRail({
      role: 'system',
      text: `scope:${nodeId} — section ${nodeId} ${stylesOnly ? 'restyled' : 'redesigned'} at ${new Date().toISOString()}; ${scope.ops.length} ${scope.ops.length === 1 ? 'change' : 'changes'} applied in one undo group${scope.dropped ? `, ${scope.dropped} blocked` : ''}${warnings.length ? ` · warn: ${warnings.map((f) => f.message).join('; ')}` : ''}.`,
      ...(!batch && widgetEdit && sameType.length > 1 && sameType.length <= 20
        ? {
            scopedBatch: {
              nodeId,
              screenId: scope.screenId,
              type: hit.node.type,
              instruction,
              count: sameType.length,
            },
          }
        : {}),
    });
  } catch (err) {
    addSystem(
      `scope:${nodeId} — action failed; no staged changes applied: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    useAgent.getState().addReceipt({
      role: `scope:${nodeId}`,
      ...scope.receipt,
      toolNames: [...new Set(scope.receipt.toolNames)],
      status,
      key: useAgent.getState().keySource === 'session' ? 'user' : 'house',
    });
    stopHeartbeat();
    useAgent.getState().endTurn();
    running = false;
    controller = null;
    smallTalkTurn = false;
    pickTurn = null;
  }
}

export interface FillOptions {
  mode: 'blueprint' | 'steady' | 'fast';
  preserveScreenId?: string;
}

/** The fill queue: one screen at a time, N-of-M, Stop, per-screen snapshots. */
export async function runFillQueue(options: FillOptions): Promise<void> {
  if (running) return;
  const doc = useProject.getState().doc;
  const blueprint = doc.blueprint?.text || '';
  const documentEpoch = useProject.getState().documentEpoch;
  const referenceBuild = isReferenceBlueprint(doc, blueprint);
  const reference = referenceBuild ? getReference(documentEpoch, blueprint) : null;
  if (referenceBuild && !reference) {
    useUi
      .getState()
      .toast(
        'The screenshot is no longer in this session. Attach and send it again to make a new recreation plan.',
        'warn',
      );
    return;
  }
  if (!blueprint) {
    await runAgentTurn('Build the screens for this project.');
    return;
  }
  running = true;
  controller = new AbortController();
  turnScreenAdds = 1;
  changedThisTurn = false;
  useAgent.getState().startTurn();
  const startedAt = Date.now();
  startHeartbeat(startedAt);

  const parsed = parseBlueprint(blueprint, doc.tokens);
  const targets: ScreenDoc[] = parsed.screens.length ? parsed.screens : [...doc.screens];
  const sections = blueprintScreenSections(blueprint);
  const globalContext = blueprintGlobalContext(blueprint);
  const protectDesignTokens = hasExplicitCurrentTheme(doc);
  if (!targets.length) {
    const name = doc.name.trim().slice(0, 40) || 'Landing';
    targets.push({
      id: 'screen_plan',
      name,
      entry: true,
      root: {
        id: 'screen_plan_root',
        type: 'screen',
        props: { layout: 'flex-col', scroll: true },
        styles: {},
        children: [],
      },
    });
    addSystem(
      "The plan's screen headers were not in a format I could split — building it as ONE screen from the whole plan.",
    );
  }
  // The turn's existing card becomes the queue card; never append a duplicate.
  const pending = [...useProject.getState().doc.rail]
    .reverse()
    .find((entry) => entry.card?.kind === 'thinking' && entry.card.state === 'pending');
  const card = pending ?? addCard('progress', {}, 'Building screens');
  const queueJournal = beginTurnJournal(blueprint);
  const unsubscribeProject = useProject.subscribe((state) => {
    if (state.documentEpoch !== documentEpoch) controller?.abort();
  });
  if (referenceBuild)
    addSystem(
      'The builder will receive the screenshot again for each build request; this can increase usage. Missing source images remain placeholders, not original assets. Run and downloads show abstract placeholder artwork.',
    );
  startBuildPresenter(queueJournal);
  useProject.getState().patchRail(card.id, {
    text: 'Building screens',
    card: {
      kind: 'progress',
      state: 'pending',
      data: {
        ...(useProject.getState().doc.rail.find((entry) => entry.id === card.id)?.card
          ?.data || {}),
        title: 'Building screens',
        parts: targets.map((s) => ({ id: s.id, label: s.name, state: 'queued' })),
        startedAt,
      },
    },
  });
  useAgent.getState().setProgress({
    title: 'Building screens',
    startedAt,
    live: '',
    parts: targets.map((s) => ({ id: s.id, label: s.name, state: 'queued' as const })),
  });

  const imageBudget = projectImageBudget(card.id);
  if (imageBudget.unknown)
    addSystem(
      'Automated image usage for this older project is unknown; automatic generation is paused to avoid exceeding its project cap. Manual image requests remain separate.',
    );
  useAgent.setState({
    assetJobs: [],
    assetDocumentEpoch: useProject.getState().documentEpoch,
    assetsPending: new Set(),
  });
  publishImageBudget(imageBudget);
  const beforeScreens = new Map(
    doc.screens.map((screen) => [screen.id, structuredClone(screen)]),
  );
  const completed = new Set<string>();
  const finishedScreens = new Set<string>();
  let queueFailure = '';
  try {
    for (let i = 0; i < targets.length; i += 1) {
      if (controller.signal.aborted) break;
      const target = targets[i];
      const selectedDraft =
        target.id === options.preserveScreenId
          ? useProject.getState().doc.screens.find((screen) => screen.id === target.id)
          : undefined;
      if (target.id === options.preserveScreenId && !selectedDraft?.root.children.length)
        throw new Error('The selected preview is no longer available.');
      const explicitUserText = doc.rail
        .filter((entry) => entry.role === 'user')
        .map((entry) => entry.text)
        .join('\n');
      const draftGuard: VisualFinishGuard | undefined = selectedDraft
        ? {
            screen: structuredClone(selectedDraft),
            evidence: referenceBuild
              ? explicitUserText
              : `${parsed.wiring.join('\n')}\n${explicitUserText}`,
            userText: explicitUserText,
          }
        : undefined;
      const protectedScreen =
        options.preserveScreenId && target.id !== options.preserveScreenId
          ? useProject
              .getState()
              .doc.screens.find((screen) => screen.id === options.preserveScreenId)
          : undefined;
      if (
        options.preserveScreenId &&
        target.id !== options.preserveScreenId &&
        !protectedScreen
      )
        throw new Error('The selected visual direction is no longer available.');
      const existing = useProject.getState().doc.screens.find((s) => s.id === target.id);
      if (!existing) {
        const provisional = parsed.screens.find((s) => s.id === target.id);
        const create = useProject.getState().applyBatch(
          [
            {
              op: 'addScreen',
              screen: provisional
                ? {
                    id: provisional.id,
                    name: provisional.name,
                    root: { ...provisional.root, children: [] },
                    ...(provisional.entry ? { entry: true } : {}),
                  }
                : {
                    id: target.id,
                    name: target.name,
                    root: target.root,
                    entry: useProject.getState().doc.screens.length === 0,
                  },
            },
          ],
          { source: 'agent', screenAddsThisTurn: 0 },
        );
        if (create.errors.length) {
          useAgent.getState().patchPart(target.id, {
            state: 'failed',
            note: create.errors.map((e) => e.code).join(', '),
          });
          continue;
        }
        changedThisTurn = true;
      }
      useAgent.getState().patchPart(target.id, { state: 'active' });
      useAgent
        .getState()
        .patchProgress({ live: `Screens ${i + 1} of ${targets.length} — ${target.name}…` });
      useProject.getState().patchRail(card.id, {
        card: {
          kind: 'progress',
          state: 'pending',
          data: {
            ...(useProject.getState().doc.rail.find((entry) => entry.id === card.id)?.card
              ?.data || {}),
            title: `Screens ${i + 1} of ${targets.length}`,
            parts: useAgent.getState().progress?.parts || [],
            assets:
              useAgent.getState().assetDocumentEpoch === useProject.getState().documentEpoch
                ? useAgent.getState().assetJobs
                : [],
            startedAt,
          },
        },
      });
      const section = sections[i] || blueprint;
      const fillText = fillPrompt({
        screenName: target.name,
        section,
        globalContext,
        lookLine: `pad ${parsed.look.pad}, gap ${parsed.look.gap}, card radius ${parsed.look.cardRadius}, title ${parsed.look.title}px, body ${parsed.look.body}px`,
        tokenSheet: buildTokenSheet(useProject.getState().doc.tokens),
        indexRules:
          '^[a-z][a-z0-9_]{2,30}$; semantic prefixes (btn_, txt_, card_, input_); unique per project',
        existingIndex: buildProjectIndex(useProject.getState().doc).slice(0, 1400),
      });
      try {
        const buildMessages = contextMessages(
          useProject.getState().doc,
          fillText,
          protectDesignTokens
            ? [
                'The user explicitly selected this complete design system. Preserve its tokens; do not call set_design_tokens or setTokens while filling.',
              ]
            : [],
        );
        if (draftGuard) {
          buildMessages.push({
            role: 'system',
            content: `The user selected this exact visual draft. Finish the FIRST screen by adding missing planned content and only explicitly approved interactions. Preserve every existing node, its content, parent, order, styling, typography, and the project design tokens. Do not remove or redesign it. Only append needed content within this screen; do not touch other screens. No generated image replacements or guessed image URLs. Interactions must be supported by explicit user instructions${referenceBuild ? ' (not merely inferred from the screenshot)' : ' or approved WIRING'}. If a behavior cannot be established, leave it inert and tell the user.
CHOSEN SCREEN:
${canvasOutline(useProject.getState().doc, [target.id])}`,
          });
        }
        if (reference) {
          buildMessages.push({
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'This is the approved screenshot reference. Match its visible layout, colour, hierarchy, typography and spacing as closely as supported. Do not use the screenshot itself as an asset. Leave unavailable image assets as empty image placeholders, do not generate replacements, and do not invent working interactions. Explain uncertain or unsupported details.',
              },
              { type: 'image_url', image_url: { url: reference } },
            ] as unknown as string,
          });
        }
        const buildResult = await executeToolLoop({
          messages: buildMessages,
          maxCalls: 14,
          role: 'builder',
          protectDesignTokens: protectDesignTokens || Boolean(options.preserveScreenId),
          imageContext: `${globalContext}\n${section}`,
          suppressAutoImages: referenceBuild || Boolean(draftGuard),
          documentEpoch,
          draftGuard,
          protectedScreen: protectedScreen ? structuredClone(protectedScreen) : undefined,
          effort: options.mode === 'fast' ? 'low' : 'medium',
          imageBudget,
        });
        if (buildResult.stopped || controller.signal.aborted) {
          useAgent.getState().patchPart(target.id, {
            state: 'stopped',
            note: 'Stopped before the screen finished.',
          });
          break;
        }
        const actualScreen = useProject
          .getState()
          .doc.screens.find((screen) => screen.id === target.id);
        if (!buildResult.finished && draftGuard) {
          useAgent.getState().patchPart(target.id, {
            state: 'failed',
            note: 'The selected screen was kept, but the finishing pass did not complete.',
          });
          addSystem(
            'The selected design is still editable, but the finishing pass did not complete. Review and complete the screen before relying on it.',
          );
          continue;
        }
        if (!buildResult.finished) {
          // Inspect the actual document, even if the model omitted finish().
          const builtContent = actualScreen && actualScreen.root.children.length > 0;
          if (!builtContent) {
            useAgent.getState().patchPart(target.id, {
              state: 'failed',
              note: 'The builder stopped without finishing or producing screen content.',
            });
            continue;
          }
          completed.add(target.id);
          useAgent.getState().patchPart(target.id, {
            state: 'done',
            note: 'Builder did not call finish(); screen has content and will be reviewed.',
          });
          addSystem(
            `Screen ${target.name} has content, but the builder did not call finish(); checking the result.`,
          );
          continue;
        }
        if (!actualScreen || actualScreen.root.children.length === 0) {
          useAgent.getState().patchPart(target.id, {
            state: 'failed',
            note: 'The builder finished without producing screen content.',
          });
          continue;
        }
        completed.add(target.id);
        finishedScreens.add(target.id);
        useAgent.getState().patchPart(target.id, { state: 'done' });
      } catch (err) {
        if (useProject.getState().documentEpoch !== documentEpoch) break;
        const message = err instanceof Error ? err.message : String(err);
        if (referenceBuild)
          addSystem(
            `Screenshot build failed; the reference could not be used for this screen. ${message.slice(0, 250)}`,
          );
        useAgent
          .getState()
          .patchPart(target.id, { state: 'failed', note: message.slice(0, 300) });
      }
    }

    if (useProject.getState().documentEpoch !== documentEpoch) return;
    // The model may have removed a screen after its fill round. Never review or
    // report a non-existent screen as completed.
    const builtIds = new Set(useProject.getState().doc.screens.map((screen) => screen.id));
    for (const id of completed)
      if (!builtIds.has(id)) {
        completed.delete(id);
        useAgent
          .getState()
          .patchPart(id, { state: 'failed', note: 'Screen no longer exists.' });
      }
    // Existing screens were not created from the parsed provisional root. Apply
    // the same screen-scoped LOOK only to screens that actually completed.
    for (const id of completed) {
      if (id === options.preserveScreenId) continue;
      const screen = useProject.getState().doc.screens.find((item) => item.id === id);
      const planned = parsed.screens.find((item) => item.id === id);
      if (screen && planned && beforeScreens.has(id)) {
        const { lookTitle, lookBody, lookPad, lookGap } = planned.root.props;
        const result = useProject.getState().applyBatch(
          [
            {
              op: 'setProps',
              id: screen.root.id,
              props: { lookTitle, lookBody, lookPad, lookGap },
            },
          ],
          { source: 'agent' },
        );
        if (result.errors.length)
          addSystem(
            `Could not apply screen typography: ${result.errors.map((error) => error.message).join(', ')}`,
          );
      }
    }
    const stopped = controller.signal.aborted;
    useProject.getState().patchRail(card.id, {
      card: {
        kind: 'progress',
        state: stopped ? 'cancelled' : 'answered',
        data: {
          ...(useProject.getState().doc.rail.find((entry) => entry.id === card.id)?.card
            ?.data || {}),
          title: stopped
            ? 'Stopped'
            : completed.size === targets.length
              ? 'Screens built'
              : 'Build finished with incomplete screens',
          parts: useAgent.getState().progress?.parts || [],
          assets:
            useAgent.getState().assetDocumentEpoch === useProject.getState().documentEpoch
              ? useAgent.getState().assetJobs
              : [],
          startedAt,
        },
      },
    });

    if (!stopped) {
      if (!referenceBuild)
        await autoIllustrate(
          [...completed].filter((id) => id !== options.preserveScreenId),
          blueprint,
          imageBudget.remaining,
          controller.signal,
          undefined,
          card.id,
          () => reserveImageAttempt(imageBudget),
        );
      publishImageBudget(imageBudget);
      if (controller.signal.aborted) {
        addSystem(
          'Stopped during illustration — finished screens stay, without verification.',
        );
      } else if ([...completed].some((id) => id !== options.preserveScreenId)) {
        await verifyGate(
          blueprint.length > 14000
            ? `${blueprint.slice(0, 14000)}\n[Plan truncated for review.]`
            : blueprint,
          useProject.getState().doc,
          [...completed].filter((id) => id !== options.preserveScreenId),
          imageBudget,
          undefined,
          referenceBuild,
        );
        if (useProject.getState().documentEpoch !== documentEpoch) return;
        if (options.preserveScreenId) {
          if (useAgent.getState().verification === 'pass')
            useAgent
              .getState()
              .setVerification(
                'unverified',
                'Other screens passed text-only review, but the selected screen and its finishing changes were not reviewed.',
              );
          addSystem(
            'The selected visual layout was preserved; its finishing changes were not included in the text-only review.',
          );
        }
      } else if (completed.size && options.preserveScreenId) {
        useAgent
          .getState()
          .setVerification(
            'unverified',
            'The selected visual layout was preserved, but finishing changes have not been reviewed.',
          );
        addSystem(
          'The selected visual layout was preserved, but finishing changes have not been reviewed.',
        );
      } else {
        useAgent.getState().setVerification('problems', 'No screens completed the build.');
        addSystem('Not verified — no screens completed the build.');
      }
      if (useProject.getState().documentEpoch !== documentEpoch) return;
      for (const id of completed)
        if (id !== options.preserveScreenId)
          useProject
            .getState()
            .rememberScreenBuild(card.id, id, beforeScreens.get(id) ?? null);
      const count = completed.size;
      const entry = useProject.getState().doc.screens.find((screen) => screen.entry);
      if (
        !controller.signal.aborted &&
        entry &&
        completed.has(entry.id) &&
        finishedScreens.has(entry.id) &&
        !beforeScreens.get(entry.id)?.root.children.length
      )
        nameProjectAfterBuild();
      if (referenceBuild && !controller.signal.aborted)
        addSystem(
          'The reviewer checks a text outline, not the rendered result against the screenshot. Visual fidelity has not been verified; empty image slots are placeholders.',
        );
      if (count && !controller.signal.aborted) useProject.getState().snapshotProjectTheme();
      if (!controller.signal.aborted)
        addAgent(
          useAgent.getState().verification === 'pass' && count === targets.length
            ? 'Your tokens and components are ready to explore.'
            : 'Check the quality notes before relying on the result.',
        );
    } else {
      for (const id of completed)
        useProject
          .getState()
          .rememberScreenBuild(card.id, id, beforeScreens.get(id) ?? null);
      addSystem('Stopped — finished screens stay, the queue clears.');
    }
  } catch (err) {
    queueFailure = err instanceof Error ? err.message : String(err);
    useAgent.getState().setError(queueFailure);
  } finally {
    unsubscribeProject();
    const stopped = controller?.signal.aborted;
    const switched = useProject.getState().documentEpoch !== documentEpoch;
    if (!switched) {
      if (stopped) {
        endTurnJournal(queueJournal);
        useAgent.getState().setInterruptionCard({
          kind: 'interrupted',
          journal: queueJournal,
          reason: 'stopped',
          cardId: card.id,
        });
      }
      finishBuildPresenter(
        stopped ? 'interrupted' : queueFailure || !completed.size ? 'failed' : 'receipt',
        {
          screens: completed.size,
          total: targets.length,
          message:
            queueFailure || (!completed.size ? 'No screens completed the build.' : ''),
          retryText: 'Continue the build.',
        },
      );
    }
    stopBuildPresenter();
    queueJournal.unsubscribe?.();
    stopHeartbeat();
    useAgent.getState().endTurn();
    useAgent.getState().setProgress(null);
    running = false;
    controller = null;
  }
}

export async function approveBlueprint(
  mode: 'blueprint' | 'steady' | 'fast',
  preserveScreenId?: string,
): Promise<void> {
  const doc = useProject.getState().doc;
  if (!doc.blueprint?.text) return;
  useProject.getState().setBlueprint(doc.blueprint.text, true);
  nameProjectFromBlueprint(doc.blueprint.text);
  addSystem('✓ Blueprint approved');
  if (mode === 'blueprint') {
    addSystem('Blueprint stored — build it whenever you are ready.');
    return;
  }
  await runFillQueue({ mode, preserveScreenId });
}

export async function adjustBlueprint(wish: string, adjustCount = 1): Promise<boolean> {
  if (running) return false;
  const doc = useProject.getState().doc;
  const base = doc.blueprint?.text || '';
  const epoch = useProject.getState().documentEpoch;
  const referencePlan = isReferenceBlueprint(doc, base);
  useProject.getState().addRail({ role: 'user', text: wish });
  running = true;
  controller = new AbortController();
  const unsubscribeProject = useProject.subscribe((state) => {
    if (state.documentEpoch !== epoch) controller?.abort();
  });
  useAgent.getState().startTurn();
  startHeartbeat(Date.now());
  try {
    const models = useAgent.getState().models;
    const wonder = useAgent.getState().wonder;
    const result = await chatStream({
      model: (wonder ? models?.architect.id : models?.builder.id) || 'muse-spark-1.3',
      effort: wonder ? 'max' : 'high',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'system', content: `CURRENT BLUEPRINT:\n${base}` },
        { role: 'system', content: `TOKEN SHEET:\n${buildTokenSheet(doc.tokens)}` },
        { role: 'user', content: adjustBlueprintPrompt(wish) },
      ],
      signal: controller.signal,
      maxTokens: 1800,
      onText: (t) => useAgent.getState().appendText(t),
    });
    if (useProject.getState().documentEpoch !== epoch || controller.signal.aborted)
      return false;
    recordReceipt(result, wonder ? 'architect' : 'builder', base.length, []);
    const text = result.text || base;
    updateReference(epoch, base, text);
    useProject.getState().setBlueprint(text, false);
    if (referencePlan) addSystem(screenshotReferenceNotice);
    const parsed = parseBlueprint(text, doc.tokens);
    addCard(
      'blueprint',
      {
        blueprint: text,
        adjustCount,
        screens: parsed.screens.map((s) => ({ id: s.id, name: s.name })),
        look: parsed.look,
        stateKeys: parsed.stateKeys,
        wiring: parsed.wiring,
      },
      'Revised blueprint',
    );
    addAgent('Revised. Approve it, or adjust again.');
    return true;
  } catch (err) {
    if (useProject.getState().documentEpoch === epoch) wrapError(err, wish);
    return false;
  } finally {
    unsubscribeProject();
    stopHeartbeat();
    useAgent.getState().endTurn();
    running = false;
    controller = null;
  }
}

export function registerChoiceAnswer(cardId: string, label: string) {
  const rail = useProject.getState().doc.rail;
  const card = rail.find((r) => r.id === cardId);
  if (!card?.card) return;
  useProject.getState().patchRail(cardId, {
    card: { ...card.card, state: 'answered', data: { ...card.card.data, picked: label } },
  });
}

export function firstScreenId(doc: ProjectDoc): string {
  return entryScreen(doc)?.id || doc.screens[0]?.id || '';
}

export type { Action };
