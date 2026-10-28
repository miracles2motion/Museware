/**
 * The local muse — a deterministic stand-in that exercises the REAL pipeline
 * (cards, blueprint, ops, progress, verify) when no API key is present, so the
 * whole product is demonstrable offline. Every rail line is labelled "local".
 */
import type {
  ComponentNode,
  MockRow,
  ProjectDoc,
  RailEntry,
  ScreenDoc,
} from '../../types/tree';
import type { DesignTokens } from '../../types/tokens';
import { useProject } from '../../store/useProject';
import { useAgent } from '../../store/useAgent';
import { useUi } from '../../store/useUi';
import { MuseError } from '../client';
import { buildTokenSheet } from '../tokenSheet';
import { parseBlueprint } from '../blueprintParse';
import { canvasOutline } from '../canvasOutline';
import { wordColor } from '../typedOptions';
import { DIRECTION_PALETTES } from '../../design/palettes';
import { placeholderImage } from '../../canvas/placeholder';
import { TEMPLATES, buildScreensFor, pickTemplate, type DemoTemplate } from './build';

interface DemoOpts {
  stopSignal: AbortSignal;
  turnScreenAdds: number;
}

function addRail(entry: Omit<RailEntry, 'id' | 'at'>) {
  return useProject.getState().addRail(entry);
}

function system(text: string) {
  addRail({ role: 'system', text });
}

function agent(text: string) {
  addRail({ role: 'agent', text });
}

function card(
  kind: 'build_choice' | 'blueprint' | 'choice' | 'color' | 'progress' | 'error',
  data: Record<string, unknown>,
  text: string,
) {
  return useProject.getState().addRail({
    role: 'card',
    text,
    card: { kind, state: 'pending', data },
  });
}

function receipt(role: string, tools: string[], promptChars: number) {
  useAgent.getState().addReceipt({
    role,
    model: 'museware-local',
    promptChars,
    toolNames: tools,
    latencyMs: 220 + Math.round(Math.random() * 260),
    inputTokens: Math.round(promptChars / 4),
    outputTokens: 420,
    cents: 0,
  });
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new MuseError('aborted', 'Stopped'));
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new MuseError('aborted', 'Stopped'));
      },
      { once: true },
    );
  });
}

async function streamProse(text: string, signal: AbortSignal) {
  const chunks = text.match(/.{1,26}/g) || [text];
  for (const chunk of chunks) {
    useAgent.getState().appendText(chunk);
    await sleep(22, signal);
  }
  useAgent.getState().resetText();
  agent(text);
}

function applyOps(ops: unknown[], summary?: string) {
  const res = useProject.getState().applyBatch(ops, { source: 'agent' });
  if (res.errors.length) {
    system(`Local build hiccup: ${res.errors.map((e) => e.code).join(', ')}`);
    return res;
  }
  if (summary) system(`✦ ${summary}`);
  return res;
}

function setTokens(patch: Record<string, unknown>) {
  return applyOps([{ op: 'setTokens', patch }], 'Design tokens updated');
}

function blueprintCard(template: DemoTemplate, text: string, title: string) {
  const doc = useProject.getState().doc;
  const parsed = parseBlueprint(text, doc.tokens);
  card(
    'blueprint',
    {
      blueprint: text,
      templateId: template.id,
      screens: parsed.screens.map((s) => ({ id: s.id, name: s.name })),
      look: parsed.look,
      stateKeys: parsed.stateKeys,
      wiring: parsed.wiring,
      title,
    },
    title,
  );
}

const PALETTES = DIRECTION_PALETTES;

function directionOptions(tokens: DesignTokens) {
  void buildTokenSheet(tokens);
  return PALETTES.slice(0, 3).map((p) => ({
    label: p.label,
    hexes: [...p.hexes],
    note: p.note,
  }));
}

interface LastChoice {
  purpose: string;
  templateId?: string;
  label?: string;
}

function lastAnsweredPurpose(): LastChoice {
  const rail = useProject.getState().doc.rail;
  for (let i = rail.length - 1; i >= 0; i -= 1) {
    const entry = rail[i];
    if (
      entry.role === 'card' &&
      entry.card?.kind === 'choice' &&
      entry.card.state === 'answered'
    ) {
      const data = entry.card.data as {
        purpose?: string;
        templateId?: string;
        picked?: string;
      };
      return {
        purpose: data.purpose || 'generic',
        templateId: data.templateId,
        label: data.picked,
      };
    }
    if (entry.role === 'card' && entry.card?.kind === 'blueprint') break;
  }
  return { purpose: 'none' };
}

function templateById(id?: string): DemoTemplate {
  return TEMPLATES.find((t) => t.id === id) || TEMPLATES[0];
}

function docHasScreens(): boolean {
  return useProject.getState().doc.screens.length > 0;
}

function screensForTemplate(template: DemoTemplate): ScreenDoc[] {
  return buildScreensFor(template, useProject.getState().doc.tokens);
}

function projectNameFor(template: DemoTemplate): string {
  return template.projectName;
}

async function proposeBlueprintFor(
  template: DemoTemplate,
  opts: DemoOpts,
  reason = 'Here is the plan before I touch the canvas.',
) {
  await sleep(520, opts.stopSignal);
  const tokens = useProject.getState().doc.tokens;
  const text = template.blueprint(tokens);
  useProject.getState().setBlueprint(text, false);
  blueprintCard(template, text, `${template.label} — blueprint`);
  receipt('architect', ['propose_blueprint'], 900);
  await streamProse(
    `${reason} ${template.kind === 'web' ? 'Desktop-first, compact CSS,' : 'Phone-first, thumb-reach,'} and every LOOK number comes from your token sheet. Approve it and I'll fill the screens.`,
    opts.stopSignal,
  );
}

async function askDirection(template: DemoTemplate, opts: DemoOpts) {
  const tokens = useProject.getState().doc.tokens;
  const options = directionOptions(tokens);
  card(
    'choice',
    {
      purpose: 'direction',
      templateId: template.id,
      question: 'Which direction feels right?',
      options,
    },
    'Pick a direction',
  );
  await streamProse(
    `Before I commit to a palette — three directions that suit ${template.label.toLowerCase()}. Tap one; the canvas repaints everywhere, instantly.`,
    opts.stopSignal,
  );
}

async function buildFromScreens(screens: ScreenDoc[], parts: string[], opts: DemoOpts) {
  const startedAt = Date.now();
  const progressCard = card(
    'progress',
    {
      title: 'Building screens',
      parts: parts.map((label, i) => ({ id: `p${i}`, label, state: 'queued' })),
      startedAt,
    },
    'Building screens',
  );
  useAgent.getState().setProgress({
    title: 'Building screens',
    startedAt,
    live: '',
    parts: parts.map((label, i) => ({ id: `p${i}`, label, state: 'queued' as const })),
  });

  for (let i = 0; i < screens.length; i += 1) {
    if (opts.stopSignal.aborted) throw new MuseError('aborted', 'Stopped');
    const partId = `p${i}`;
    useAgent.getState().patchPart(partId, { state: 'active' });
    useAgent
      .getState()
      .setLive(`Screens ${i + 1} of ${screens.length} — ${screens[i].name}…`);
    useProject.getState().patchRail(progressCard.id, {
      card: {
        kind: 'progress',
        state: 'pending',
        data: {
          title: `Screens ${i + 1} of ${screens.length}`,
          parts: useAgent.getState().progress?.parts || [],
          startedAt,
        },
      },
    });
    await sleep(820, opts.stopSignal);
    const exists = useProject.getState().doc.screens.some((s) => s.id === screens[i].id);
    if (!exists) {
      const res = applyOps(
        [
          {
            op: 'addScreen',
            screen: {
              ...screens[i],
              ...(useProject.getState().doc.screens.length === 0 ? { entry: true } : {}),
            },
          },
        ],
        `${screens[i].name}: ${screens[i].root.children.length} blocks, mock data wired`,
      );
      if (res.errors.length) {
        useAgent
          .getState()
          .patchPart(partId, { state: 'failed', note: res.errors[0].message });
        continue;
      }
    }
    receipt('builder', ['edit_canvas'], 2600);
    useAgent.getState().patchPart(partId, { state: 'done' });
    await sleep(260, opts.stopSignal);
  }

  useProject.getState().patchRail(progressCard.id, {
    card: {
      kind: 'progress',
      state: 'answered',
      data: {
        title: 'Screens built',
        parts: useAgent.getState().progress?.parts || [],
        startedAt,
      },
    },
  });
  useProject.getState().patchRail(progressCard.id, { text: 'Screens built' });
}

async function verify(opts: DemoOpts, task: string) {
  useAgent.getState().setVerification('running');
  useAgent.getState().setLive('Reviewing the render — padding, palette, LOOK numbers…');
  await sleep(900, opts.stopSignal);
  const doc = useProject.getState().doc;
  const outline = canvasOutline(
    doc,
    doc.screens.map((s) => s.id),
  );
  const cramped = /padding=0px/.test(outline);
  if (cramped) {
    useAgent
      .getState()
      .setVerification('problems', 'Cramped hero: padding=0px against the LOOK line.');
    system('Reviewer saw PROBLEMS — one rebuild round.');
    await sleep(700, opts.stopSignal);
    applyOps(
      doc.screens.flatMap((s) =>
        s.root.children
          .filter((c) => c.type === 'hero')
          .map((c) => ({
            op: 'setStyles',
            id: c.id,
            styles: { padding: 'var(--pad-card)' },
          })),
      ),
      'Rebuilt hero padding from the LOOK line',
    );
  }
  useAgent.getState().setVerification('pass');
  system('✓ Verified — reviewer said PASS (padding, palette, LOOK numbers)');
  receipt('reviewer', [], outline.length);
  void task;
}

function describeResult(screens: ScreenDoc[]): string {
  const nodes = screens.reduce((count, s) => count + countNodes(s.root), 0);
  const first = screens[0];
  return `${first?.name || 'The screen'} is built — ${nodes} components, your tokens, mock data wired. It runs now: hit ▶ Run.`;
}

function countNodes(node: ComponentNode): number {
  return 1 + (node.children || []).reduce((n, c) => n + countNodes(c), 0);
}

/** Build the approved blueprint: one batched op per screen, then verify. */
export async function startDemoBuild(mode: 'blueprint' | 'steady' | 'fast'): Promise<void> {
  if (mode === 'blueprint') {
    system('Blueprint stored — say "build it" when ready.');
    return;
  }
  const agentState = useAgent.getState();
  if (agentState.busy) return;
  agentState.startTurn();
  const controller = new AbortController();
  const opts: DemoOpts = { stopSignal: controller.signal, turnScreenAdds: 0 };
  const doc = useProject.getState().doc;
  const text = doc.blueprint?.text || '';
  const parsed = parseBlueprint(text, doc.tokens);
  void parsed;
  const templateId = (
    doc.rail
      .slice()
      .reverse()
      .find((r) => r.card?.kind === 'blueprint')?.card?.data as
      | { templateId?: string }
      | undefined
  )?.templateId;
  const template = templateById(templateId);
  const built = screensForTemplate(template);
  const screens = built.map((s, i) => ({
    ...s,
    entry: i === 0 && doc.screens.length === 0,
  }));

  try {
    await sleep(360, controller.signal);
    system('✓ Blueprint approved');
    await buildFromScreens(
      screens,
      screens.map((s) => s.name),
      opts,
    );
    await verify(opts, text.slice(0, 200));
    const built = useProject
      .getState()
      .doc.screens.filter((s) => screens.some((x) => x.id === s.id));
    await streamProse(describeResult(built), controller.signal);
    useProject.getState().setName(projectNameFor(template));
    if (
      useUi.getState().activeScreenId === null ||
      !built.some((s) => s.id === useUi.getState().activeScreenId)
    ) {
      useUi.getState().setActiveScreen(built[0]?.id || '');
    }
    useUi.getState().toast('Built and verified — try ▶ Run.', 'ok');
    if (mode === 'fast')
      system('Fast mode: per-screen review skipped, the final gate still ran.');
  } catch (err) {
    if (err instanceof MuseError && err.code === 'aborted') {
      system('Stopped — finished screens stay.');
    } else {
      system(`Build failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  } finally {
    useAgent.getState().endTurn();
    useAgent.getState().setProgress(null);
  }
}

/** The main local turn. Mirrors the real loop's surface and laws. */
export async function runDemoTurn(text: string, opts: DemoOpts): Promise<void> {
  const doc = useProject.getState().doc;
  const signal = opts.stopSignal;
  const prompt = text.trim();
  const lower = prompt.toLowerCase();

  await sleep(380, signal);
  receipt('builder', [], 1800 + prompt.length);

  // 1 — explicit palette change
  const wanted = wordColor(lower);
  const colorAsk =
    /colou?r|palette|theme|repaint|brand/.test(lower) ||
    (wanted && /make|turn|feel|look|go/.test(lower));
  if (colorAsk && !/image|picture/.test(lower)) {
    if (wanted) {
      setTokens({ brand_color: wanted, secondary_color: wanted });
      system(`🎨 ${wanted} — applied everywhere`);
      await streamProse(
        `Done — ${wanted} now runs through every surface: buttons, links, focus rings, chart fills. Because it is a token, nothing was hand-painted.`,
        signal,
      );
      return;
    }
    const template = pickTemplate(lower);
    await askDirection(template, opts);
    return;
  }

  // 2 — image generation
  if (/image|picture|illustration|photo|hero art/.test(lower)) {
    const target = findHero(doc);
    if (!target) {
      await streamProse(
        'Add a hero (or any image component) first and I will fill it — the palette-matched placeholder is the fallback when no image model is connected.',
        signal,
      );
      return;
    }
    useAgent.getState().setLive('Illustrating a hero from your palette…');
    await sleep(700, signal);
    const src = placeholderImage(doc.tokens, {
      seed: `hero-${Date.now() % 9999}`,
      height: 640,
      width: 1200,
      variant: 'hero',
    });
    applyOps([{ op: 'setProps', id: target.id, props: { image: src } }], 'Hero art placed');
    receipt('image', [], 300);
    await streamProse(
      'Placed a hero illustration built from your palette — no invented URL, so it can never 404 on stage. With a muse key, muse-image swaps in a real render here.',
      signal,
    );
    return;
  }

  // 3 — add a screen
  const addMatch = lower.match(/add (?:a |an |the )?([a-z ]{3,24}) screen/);
  if (addMatch) {
    const name = addMatch[1].trim().replace(/\b\w/g, (c) => c.toUpperCase());
    await addExtraScreen(name, opts);
    return;
  }

  if (/^build it|^build$|build it now/.test(lower) && useProject.getState().doc.blueprint) {
    const bp = useProject.getState().doc.blueprint!;
    if (!bp.decided) useProject.getState().setBlueprint(bp.text, true);
    await startDemoBuild('steady');
    return;
  }

  // 4 — build / design intent
  const buildIntent =
    /build|design|make|create|start|generate|landing|website|web page|app|tracker|dashboard|store|shop/.test(
      lower,
    );
  if (buildIntent) {
    const template = pickTemplate(lower);
    const explicitKind = /website|web page|web site|landing page|site/.test(lower)
      ? 'web'
      : /phone app|mobile app|app for|ios|android|\bapp\b/.test(lower)
        ? 'app'
        : null;

    if (!docHasScreens()) {
      const kind = explicitKind || template.kind;
      useProject.getState().setKind(kind);
      useProject.getState().setName(projectNameFor(template));
      system(
        kind === 'web'
          ? 'Layout: desktop-first (1280) — navbar + footer pattern'
          : 'Layout: phone-first (390) — bottom nav + thumb-reach',
      );
      await streamProse(
        kind === 'web'
          ? `Desktop it is — a ${template.label.toLowerCase()} at 1280 wide, with a navbar and footer, reflowing to one column on a phone.`
          : `Phone-first it is — a ${template.label.toLowerCase()} at 390 wide with a bottom nav, reflowing upward for tablet.`,
        signal,
      );

      const chosenDirection = lastAnsweredPurpose();
      if (explicitKind || wanted) {
        if (wanted) setTokens({ brand_color: wanted, secondary_color: wanted });
        await proposeBlueprintFor(template, opts);
      } else if (chosenDirection.purpose !== 'direction') {
        await askDirection(template, opts);
      } else {
        await proposeBlueprintFor(template, opts);
      }
      return;
    }

    if (!doc.blueprint?.text) {
      const chosenDirection = lastAnsweredPurpose();
      if (chosenDirection.purpose !== 'direction' && !wanted) {
        await askDirection(template, opts);
        return;
      }
      if (wanted) setTokens({ brand_color: wanted, secondary_color: wanted });
      await proposeBlueprintFor(
        template,
        opts,
        'Extending the plan first — no code gets written until you approve.',
      );
      return;
    }

    if (doc.blueprint && !doc.blueprint.decided) {
      await streamProse(
        'The blueprint above is still waiting. Approve it and I fill the screens — or tap Adjust it and tell me what to change.',
        signal,
      );
      return;
    }

    await streamProse(
      'The blueprint is approved. Tap "Build it" on the card, or say "build it" and I will fill every screen.',
      signal,
    );
    return;
  }

  if (/run|preview|try it/.test(lower)) {
    await streamProse(
      'Hit ▶ Run in the topbar. Navigation, state and toasts all execute — that is the same tree the export ships.',
      signal,
    );
    return;
  }

  if (/hi|hello|hey|what can you/.test(lower) && prompt.length < 40) {
    await streamProse(
      'I build on this canvas through tools — try "design a landing page for a coffee shop", "make a habit tracker for my daughter", or "add a settings screen". Everything I do is an undoable op.',
      signal,
    );
    return;
  }

  await streamProse(
    'I can plan a blueprint, restyle by token, add screens, or illustrate a hero. Tell me the product in one line and I will decide the whole look before writing a single component.',
    signal,
  );
}

function findHero(doc: ProjectDoc): ComponentNode | null {
  for (const screen of doc.screens) {
    const stack = [screen.root];
    while (stack.length) {
      const node = stack.pop()!;
      if (node.type === 'hero') return node;
      stack.push(...node.children);
    }
  }
  return null;
}

function genericSettingsScreen(): ScreenDoc {
  const mk = (
    type: ComponentNode['type'],
    id: string,
    props: Record<string, unknown>,
    children: ComponentNode[] = [],
  ): ComponentNode => {
    return {
      id,
      type,
      props,
      styles: {},
      children,
    } as ComponentNode;
  };
  return {
    id: 'settings',
    name: 'Settings',
    root: {
      id: 'settings_root',
      type: 'screen',
      props: { title: 'Settings', layout: 'flex-col', scroll: true },
      styles: {
        padding: 'var(--pad-screen)',
        gap: 'var(--gap-section)',
        background: 'var(--openui-bg)',
      },
      children: [
        mk('heading', 'txt_set_title', { text: 'Settings', level: 1 }),
        mk('text', 'txt_set_sub', { text: 'Preferences for this app.' }),
        mk('card', 'card_prefs', { title: 'Notifications' }, [
          mk('switch', 'sw_push', { label: 'Push notifications', bindKey: 'push_on' }),
          mk('switch', 'sw_email', { label: 'Weekly email', bindKey: 'email_on' }),
        ]),
        mk('button', 'btn_save', {
          text: 'Save changes',
          variant: 'primary',
          events: { tap: [{ type: 'toast', text: 'Settings saved.' }] },
        }),
      ],
    },
  };
}

async function addExtraScreen(name: string, opts: DemoOpts) {
  const doc = useProject.getState().doc;
  const template = pickTemplate(doc.name || 'app');
  const existing = new Set(doc.screens.map((s) => s.id));
  const candidate = screensForTemplate(template).find(
    (s) => !existing.has(s.id) && s.name.toLowerCase().includes(name.toLowerCase()),
  );
  const screen = candidate || {
    ...genericSettingsScreen(),
    name,
    id:
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .slice(0, 30) || 'settings',
  };
  useAgent.getState().setLive(`Adding ${screen.name}…`);
  await sleep(650, opts.stopSignal);
  const res = applyOps(
    [
      {
        op: 'addScreen',
        screen: { ...screen, root: { ...screen.root, id: `${screen.id}_root` } },
      },
    ],
    `${screen.name} added — ${screen.root.children.length} blocks`,
  );
  if (res.errors.length) {
    await streamProse(`I could not add it: ${res.errors[0].message}.`, opts.stopSignal);
    return;
  }
  useUi.getState().setActiveScreen(screen.id);
  await streamProse(
    `${screen.name} is on the canvas and connected to the same tree. Drag anything on it, or ask me to wire a navigation chip to it.`,
    opts.stopSignal,
  );
  receipt('builder', ['edit_canvas'], 900);
}

export interface DemoChoiceOption {
  label: string;
  hexes?: string[];
  note?: string;
}

/** A tap on a choice card: mark it, keep the receipt pill, then act. */
export async function demoAnswerChoice(
  cardId: string,
  entry: RailEntry,
  option: DemoChoiceOption,
): Promise<void> {
  const data = (entry.card?.data || {}) as {
    purpose?: string;
    templateId?: string;
    question?: string;
  };
  useProject.getState().patchRail(cardId, {
    card: {
      kind: 'choice',
      state: 'answered',
      data: { ...data, picked: option.label },
    },
    text: entry.text,
  });
  system(`✓ Picked: ${option.label}`);
  useProject.getState().addRail({ role: 'user', text: option.label });
  const opts: DemoOpts = { stopSignal: new AbortController().signal, turnScreenAdds: 0 };
  const template = templateById(data.templateId);
  useAgent.getState().startTurn();
  try {
    if (data.purpose === 'direction') {
      const brand = option.hexes?.[0];
      if (brand) {
        setTokens({
          brand_color: brand,
          secondary_color: option.hexes?.[1] || brand,
        });
        system(`🎨 ${brand} — applied everywhere`);
      }
      await sleep(320, opts.stopSignal);
      await streamProse(
        `${option.label} it is. ${brand ? 'The canvas repainted from the token sheet — buttons, links, chart fills.' : ''} Now the plan.`,
        opts.stopSignal,
      );
      await proposeBlueprintFor(template, opts);
      return;
    }
    if (data.purpose === 'kind') {
      const kind = /website|web/i.test(option.label) ? 'web' : 'app';
      useProject.getState().setKind(kind);
      system(kind === 'web' ? 'Layout: desktop-first (1280)' : 'Layout: phone-first (390)');
      await askDirection(template, opts);
      return;
    }
    await streamProse(
      `Noted — ${option.label}. Tell me what to build next, or say "build it" if the blueprint is ready.`,
      opts.stopSignal,
    );
  } finally {
    useAgent.getState().endTurn();
  }
}

export async function demoAddImageToHero(seed: string): Promise<void> {
  const doc = useProject.getState().doc;
  const hero = findHero(doc);
  if (!hero) {
    system('No hero on this screen — add one from the palette first.');
    return;
  }
  const src = placeholderImage(doc.tokens, {
    seed,
    height: 640,
    width: 1200,
    variant: 'hero',
  });
  applyOps(
    [{ op: 'setProps', id: hero.id, props: { image: src } }],
    'Hero illustration placed',
  );
}

export type { MockRow };
