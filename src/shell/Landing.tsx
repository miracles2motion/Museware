import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useProject, createProject } from '../store/useProject';
import { useUi } from '../store/useUi';
import { useAgent } from '../store/useAgent';
import { CanvasStyle, NodeView } from '../canvas/NodeView';
import { nodeIdFromElement } from '../canvas/drag';
import type { RuntimeApi } from '../preview/runtime';
import { n } from '../muse/demo/build';
import { PRESETS } from '../design/presets';
import { MUSEWARE_DEFAULT_THEME } from '../design/starter';
import { Button } from '../components/ui';
import { applyOps } from '../ops/apply';
import { runAgentTurn } from '../muse/loop';
import { createSavedProject, listProjects, openProject } from '../persist/save';
import type { ComponentNode, ProjectDoc, ScreenDoc } from '../types/tree';
import type { DesignTokens } from '../types/tokens';

/* ---------------------------------------------------------------------------
 * The hero screen is real. It is built from the same nodes, styles and tokens
 * the editor writes, rendered by the same engine — not a picture of an app.
 * ------------------------------------------------------------------------ */

function miniScreens(): ScreenDoc[] {
  const root = n('screen', 'mini_root', {
    props: { title: 'Muse', layout: 'flex-col', scroll: true },
    styles: { padding: '20px', gap: '16px', background: 'var(--openui-bg)' },
    children: [
      n('heading', 'mini_title', {
        props: { text: 'This week at the roastery', level: 1 },
      }),
      n('text', 'mini_lead', {
        props: { text: 'Four deliveries left, two invoices paid, one batch on the drum.' },
      }),
      n('row', 'mini_row', {
        styles: { gap: '8px', align: 'center' },
        children: [
          n('button', 'mini_cta', {
            props: { text: 'Start free', variant: 'primary' },
            events: { tap: [{ type: 'toast', text: 'The mini preview is running!' }] },
            styles: { width: 'auto' },
          }),
          n('button', 'mini_alt', {
            props: { text: 'See it run', variant: 'secondary' },
            styles: { width: 'auto' },
          }),
        ],
      }),
    ],
  });
  return [{ id: 'muse', name: 'Muse', root, entry: true }];
}

/* ---------------------------------------------------------------------------
 * The batch section shows a screen the engine really built from an op batch,
 * and the batch itself. Nothing on this page is a drawing of a product.
 * ------------------------------------------------------------------------ */

const SCREEN_OP = {
  op: 'addScreen',
  screen: {
    id: 'week',
    name: 'This week',
    entry: true,
    root: {
      type: 'screen',
      props: { title: 'This week', layout: 'flex-col', scroll: true },
      styles: { padding: '20px', gap: '14px', background: 'var(--openui-bg)' },
    },
  },
};

function batchFor(rootId: string) {
  const person = (
    id: string,
    initials: string,
    name: string,
    when: string,
    body: string,
  ) => ({
    op: 'add',
    parentId: rootId,
    node: {
      type: 'card',
      id,
      children: [
        {
          type: 'row',
          styles: { gap: '10px', align: 'center', wrap: false },
          children: [
            { type: 'avatar', props: { initials, size: 32 } },
            { type: 'heading', props: { text: name, level: 3 } },
          ],
        },
        { type: 'label', props: { text: when } },
        { type: 'text', props: { text: body } },
      ],
    },
  });

  return [
    {
      op: 'add',
      parentId: rootId,
      node: { type: 'heading', props: { text: 'This week', level: 1 } },
    },
    {
      op: 'add',
      parentId: rootId,
      node: {
        type: 'row',
        styles: { gap: '8px', align: 'center' },
        children: [
          { type: 'badge', props: { text: 'On track' } },
          { type: 'badge', props: { text: '2 late' } },
        ],
      },
    },
    person(
      'batch_b1',
      'AR',
      'Ana Ruiz',
      'Monday, 09:20',
      'Pallet of 12 bags, invoiced and paid.',
    ),
    person(
      'batch_b2',
      'TK',
      'Tomás Kern',
      'Tuesday, 14:05',
      'Second delivery with the courier.',
    ),
    {
      op: 'add',
      parentId: rootId,
      node: {
        type: 'button',
        props: { text: 'Add a delivery', variant: 'primary' },
        styles: { width: '100%' },
      },
    },
  ];
}

function buildBatch(): { doc: ProjectDoc; ops: unknown[] } {
  const empty = createProject('Landing');
  const first = applyOps([SCREEN_OP], empty, { source: 'agent' });
  const rootId = first.doc.screens[0]?.root.id;
  if (first.errors.length || !rootId) return { doc: empty, ops: [] };
  const ops = batchFor(rootId);
  const second = applyOps(ops, first.doc, { source: 'agent' });
  return { doc: second.errors.length ? first.doc : second.doc, ops };
}

/* The same five nodes under both design systems: the difference a preset makes
   is only tokens, so the comparison is honest. */
function presetScreen(id: string, name: string): ScreenDoc {
  const root = n('screen', `${id}_root`, {
    props: { title: name, layout: 'flex-col', scroll: true },
    styles: { padding: '16px', gap: '12px', background: 'var(--openui-bg)' },
    children: [
      n('heading', `${id}_h`, { props: { text: 'Roast of the week', level: 2 } }),
      n('text', `${id}_t`, {
        props: { text: 'Kenya Nyeri, washed, 250g. Roasted Tuesday.' },
      }),
      n('row', `${id}_row`, {
        styles: { gap: '8px', align: 'center' },
        children: [
          n('button', `${id}_b1`, {
            props: { text: 'Order', variant: 'primary' },
            styles: { width: 'auto' },
          }),
          n('button', `${id}_b2`, {
            props: { text: 'Details', variant: 'secondary' },
            styles: { width: 'auto' },
          }),
        ],
      }),
      n('card', `${id}_card`, {
        children: [
          n('label', `${id}_l`, { props: { text: 'In stock' } }),
          n('stat', `${id}_s`, { props: { label: 'In stock', value: '48 bags' } }),
        ],
      }),
    ],
  });
  return { id, name, root, entry: true };
}

/** Scale a 390-wide render to whatever column it lands in. */
function useFit(designWidth = 390) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const width = el.clientWidth;
      if (width > 0) setScale(width / designWidth);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [designWidth]);
  return { ref, scale };
}

/** A 390-wide render, scaled to whatever column it lands in. */
function Fit({ children, max = 1.6 }: { children: ReactNode; max?: number }) {
  const { ref, scale } = useFit();
  const fit = Math.min(scale, max);
  return (
    <div className="lp-fit" ref={ref}>
      <div
        style={{
          width: 'var(--mw-landing-preview-w)',
          transform: `scale(${fit})`,
          transformOrigin: 'top left',
        }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Content is in place on the first paint; the reveal only moves what is
 * already there, once, and not at all when the visitor asked for less motion.
 */
function useReveal() {
  useEffect(() => {
    const root = document.documentElement;
    const targets = Array.from(document.querySelectorAll<HTMLElement>('.lp-reveal'));
    if (!('IntersectionObserver' in window) || !targets.length) return;
    root.dataset.reveal = 'on';
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.setAttribute('data-in', '');
            io.unobserve(entry.target);
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
    targets.forEach((el) => io.observe(el));
    return () => {
      io.disconnect();
      delete root.dataset.reveal;
    };
  }, []);
}

export function Landing() {
  const setRoute = useUi((s) => s.setRoute);
  const startPrompt = useUi((s) => s.startPrompt);
  const doc = useProject((s) => s.doc);
  const demoMode = useAgent((s) => s.demoMode);
  const [menuOpen, setMenuOpen] = useState(false);
  const [prompt, setPrompt] = useState(
    'Design me a landing page website for a small coffee roaster.',
  );
  const [added, setAdded] = useState<ComponentNode[]>([]);
  const [miniRun, setMiniRun] = useState(false);
  const [miniSelected, setMiniSelected] = useState<string | null>(null);
  const [miniState, setMiniState] = useState<Record<string, unknown>>({});
  const [miniMessage, setMiniMessage] = useState('');
  const screens = useMemo(miniScreens, []);
  useReveal();

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  // The hero is a real canvas, not a picture of one: these are real nodes
  // rendered by the same engine, so a visitor can put something on it.
  const liveScreens = useMemo<ScreenDoc[]>(() => {
    const base = screens[0];
    if (!added.length) return screens;
    return [
      {
        ...base,
        root: { ...base.root, children: [...base.root.children, ...added] },
      },
    ];
  }, [added, screens]);

  const miniDoc = useMemo(
    () => ({
      ...createProject('Preview'),
      tokens: doc.tokens || MUSEWARE_DEFAULT_THEME,
      screens: liveScreens,
      kind: 'app' as const,
    }),
    [doc.tokens, liveScreens],
  );

  const miniRuntime: RuntimeApi = {
    screenId: liveScreens[0].id,
    state: miniState,
    screens: liveScreens,
    setKey: (key, value) => setMiniState((state) => ({ ...state, [key]: value })),
    toast: setMiniMessage,
    navigate: () => setMiniMessage('This preview has one screen.'),
    openUrl: () => setMiniMessage('External links are disabled in this preview.'),
  };
  const batch = useMemo(buildBatch, []);
  const batchScreen = batch.doc.screens[0];

  const presetDocs = useMemo(() => {
    const map: Record<string, { doc: ProjectDoc; screen: ScreenDoc }> = {};
    for (const preset of PRESETS) {
      const screen = presetScreen(preset.id, preset.name);
      map[preset.id] = {
        screen,
        doc: {
          ...createProject(preset.name),
          tokens: preset.tokens as DesignTokens,
          screens: [screen],
          kind: 'app',
        },
      };
    }
    return map;
  }, []);

  const addToMini = (type: 'button' | 'heading' | 'badge') => {
    setAdded((list) => {
      if (list.length >= 4) return list;
      const index = list.length + 1;
      const extra =
        type === 'button'
          ? n(type, `tmp_live_${index}`, {
              props: { text: 'You added this', variant: 'primary' },
              styles: { width: 'auto' },
            })
          : type === 'heading'
            ? n(type, `tmp_live_${index}`, { props: { text: 'A real heading', level: 2 } })
            : n(type, `tmp_live_${index}`, { props: { text: 'live node' } });
      return [...list, extra];
    });
  };

  const go = async (want?: string, run = false) => {
    setMenuOpen(false);
    try {
      const projects = await listProjects();
      if (want) startPrompt(want);
      if (projects.length) {
        setRoute('projects');
        return;
      }
      const fresh = createProject();
      const id = await createSavedProject(fresh);
      const saved = await openProject(id);
      if (!saved) throw new Error('Could not open project');
      useProject.getState().hydrate(saved, id);
      setRoute('editor', id);
      if (want && run) {
        useUi.getState().setDraft('');
        await runAgentTurn(want);
      }
    } catch {
      useUi.getState().toast('Could not open a project on this device.', 'warn');
    }
  };

  const build = () => {
    const text = prompt.trim();
    if (text) void go(text, true);
  };

  const gallery = () => {
    setMenuOpen(false);
    setRoute('gallery');
  };

  return (
    <div className="landing">
      <header className="lp-nav">
        <a
          className="lp-brand"
          href="#/"
          onClick={(e) => {
            e.preventDefault();
            setRoute('landing');
          }}
        >
          <Sparkles size={16} className="lp-brand-mark" />
          {'museware'}
          <span className="lp-brand-dot">.</span>
        </a>

        <nav className="lp-links" aria-label="Main">
          <a
            href="#/gallery"
            onClick={(e) => {
              e.preventDefault();
              gallery();
            }}
          >
            Gallery
          </a>
          <a
            href="#/projects"
            onClick={(e) => {
              e.preventDefault();
              setRoute('projects');
            }}
          >
            Your projects
          </a>
          <a
            href="#/projects"
            onClick={(e) => {
              e.preventDefault();
              void go();
            }}
          >
            Editor
          </a>
        </nav>

        <div className="lp-nav-actions">
          <Button
            variant="accent"
            onClick={() => {
              void go();
            }}
          >
            Start building
          </Button>
          <button
            type="button"
            className="lp-menu-btn"
            aria-expanded={menuOpen}
            aria-controls="lp-sheet"
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? 'Close' : 'Menu'}
          </button>
        </div>
      </header>

      {menuOpen && (
        <div
          className="lp-sheet-scrim"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setMenuOpen(false);
          }}
        >
          <div className="lp-sheet" id="lp-sheet" role="dialog" aria-label="Menu">
            <button
              type="button"
              className="lp-sheet-link"
              onClick={() => {
                void go();
              }}
            >
              Start building
              <ArrowRight size={18} />
            </button>
            <button type="button" className="lp-sheet-link" onClick={gallery}>
              Gallery
            </button>
            <button
              type="button"
              className="lp-sheet-link"
              onClick={() => {
                setMenuOpen(false);
                void go();
              }}
            >
              Editor
            </button>
            <p className="lp-sheet-note">
              No signup, no email wall. Your muse key is your account, and it stays in this
              tab.
            </p>
          </div>
        </div>
      )}

      <section className="lp-hero">
        <div className="lp-hero-copy lp-reveal">
          <h1>
            Describe it. <br />
            Watch it build.
          </h1>
          <p className="lp-lead">
            A real editor with a real agent inside it. The model plans a blueprint, writes
            batched ops into the same tree you drag, and a verify gate has to pass before it
            shows you anything.
          </p>
          <div className="lp-actions">
            <Button
              variant="accent"
              size="lg"
              onClick={() => {
                void go();
              }}
            >
              Start building <ArrowRight size={16} />
            </Button>
            <Button variant="secondary" size="lg" onClick={gallery}>
              See what it builds
            </Button>
          </div>
          <p className="lp-note">
            {demoMode
              ? 'The local engine runs offline — judge the pipeline before you spend a cent.'
              : 'No signup, no email wall. Your muse key is your account.'}
          </p>
        </div>

        <figure className="lp-stage lp-reveal">
          <figcaption className="lp-stage-bar">
            <span>Live canvas</span>
            <span className="lp-meta">390 × 844 · editable</span>
          </figcaption>
          <div className="lp-device">
            <Fit>
              <CanvasStyle doc={miniDoc} scope='[data-preview="hero"]' />
              <div
                data-theme="dark"
                data-preview="hero"
                onClick={(event) => {
                  if (!miniRun) setMiniSelected(nodeIdFromElement(event.target as Element));
                }}
              >
                <NodeView
                  doc={miniDoc}
                  screen={liveScreens[0]}
                  mode={miniRun ? 'run' : 'edit'}
                  runtime={miniRun ? miniRuntime : undefined}
                />
              </div>
            </Fit>
          </div>
          <div className="lp-mini-controls">
            <button
              type="button"
              className="lp-chip"
              aria-pressed={miniRun}
              onClick={() => {
                setMiniRun(!miniRun);
                setMiniMessage('');
              }}
            >
              {' '}
              {miniRun ? 'Back to edit' : '▶ Run preview'}{' '}
            </button>
            <span className="mono">
              {miniRun
                ? miniMessage || 'Try the Start free button'
                : miniSelected
                  ? `Selected: ${miniSelected}`
                  : 'Click a block to select it'}
            </span>
          </div>
          <div className="lp-prompt">
            <Sparkles size={14} className="lp-prompt-mark" />
            <input
              value={prompt}
              aria-label="Prompt muse"
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') build();
              }}
            />
            <Button variant="primary" size="sm" onClick={build}>
              Build
            </Button>
          </div>
          <div className="lp-try">
            <button type="button" className="lp-chip" onClick={() => addToMini('heading')}>
              + Heading
            </button>
            <button type="button" className="lp-chip" onClick={() => addToMini('button')}>
              + Button
            </button>
            <button type="button" className="lp-chip" onClick={() => addToMini('badge')}>
              + Badge
            </button>
            {added.length > 0 && (
              <button
                type="button"
                className="lp-chip lp-chip-reset"
                title="Reset the live canvas"
                onClick={() => setAdded([])}
              >
                ↺ {added.length}
              </button>
            )}
            <span className="lp-try-note">Real nodes. Your tap, your undo.</span>
          </div>
        </figure>
      </section>

      <p className="lp-family lp-reveal">
        The muse family does the work: spark writes the ops, wonder plans the blueprint, SAM
        reads a screenshot into nodes, image draws, voice listens.
      </p>

      <section className="lp-batch">
        <div className="lp-batch-copy lp-reveal">
          <h2>One batch, one undo.</h2>
          <p className="lp-sub">
            The agent does not type a screen. It posts a batch of ops against the same tree
            the canvas uses, the batch is applied all-or-nothing, and it leaves a receipt.
          </p>
          <ul className="lp-facts">
            <li>
              <strong>{batch.ops.length} ops</strong> built the screen on the right
            </li>
            <li>
              <strong>1 undo</strong> takes all of them back
            </li>
            <li>
              <strong>{batch.doc.opLog.length}</strong> receipts in the log
            </li>
          </ul>
          <pre
            className="lp-code"
            aria-label="the op batch the engine applied"
            tabIndex={0}
          >
            {JSON.stringify(batch.ops[0], null, 2)}
          </pre>
          <p className="lp-caption">
            …and {Math.max(0, batch.ops.length - 1)} more ops in the same batch. Every one
            of them is in the undo stack.
          </p>
        </div>
        <div className="lp-batch-stage lp-reveal">
          {batchScreen && (
            <div className="lp-batch-frame">
              <Fit>
                <CanvasStyle doc={batch.doc} scope='[data-preview="batch"]' />
                <div data-theme="dark" data-preview="batch">
                  <NodeView doc={batch.doc} screen={batchScreen} mode="edit" />
                </div>
              </Fit>
            </div>
          )}
          <p className="lp-caption">
            Rendered by the engine from that batch — the ids, the nesting and the tokens are
            the ones in the JSON.
          </p>
        </div>
      </section>

      <section className="lp-how lp-reveal">
        <h2>How it works</h2>
        <div className="lp-how-grid">
          <article>
            <span>01</span>
            <h3>Blueprint</h3>
            <p>Muse proposes the screens, layout and wiring.</p>
          </article>
          <article>
            <span>02</span>
            <h3>Approve</h3>
            <p>Review and adjust the plan before the build starts.</p>
          </article>
          <article>
            <span>03</span>
            <h3>Verified build</h3>
            <p>Watch the canvas fill, then review and run your app.</p>
          </article>
        </div>
      </section>

      <section className="lp-presets">
        <div className="lp-presets-head lp-reveal">
          <h2>Two design systems, not templates.</h2>
          <p className="lp-sub">
            The same five nodes below, rendered twice. Apply a preset and every screen
            retunes — radii, spacing, colour and type — because the tokens change, not the
            layout.
          </p>
        </div>
        <div className="lp-preset-row">
          {PRESETS.map((preset) => {
            const entry = presetDocs[preset.id];
            return (
              <div
                role="button"
                tabIndex={0}
                key={preset.id}
                className="lp-preset"
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    event.currentTarget.click();
                  }
                }}
                onClick={() => {
                  const result = useProject.getState().applyBatch(
                    [
                      {
                        op: 'setTokens',
                        patch: {
                          ...preset.tokens.openuiTheme,
                          title: preset.tokens.title,
                        },
                      },
                    ],
                    { source: 'user' },
                  );
                  if (result.errors.length) {
                    useUi.getState().toast(result.errors[0].message, 'warn');
                    return;
                  }
                  useUi.getState().setActivePreset(preset.id);
                  void go();
                }}
              >
                <span className="lp-preset-render">
                  <Fit>
                    <CanvasStyle doc={entry.doc} scope={`[data-preview="${preset.id}"]`} />
                    <div data-theme="dark" data-preview={preset.id}>
                      <NodeView doc={entry.doc} screen={entry.screen} mode="edit" />
                    </div>
                  </Fit>
                </span>
                <span className="lp-preset-meta">
                  <span className="lp-swatches" aria-hidden="true">
                    <i style={{ background: preset.tokens.openuiTheme.brand_color }} />
                    <i style={{ background: preset.tokens.openuiTheme.secondary_color }} />
                    <i
                      style={{
                        background: preset.tokens.openuiTheme.light_colors.openui_bg,
                      }}
                    />
                  </span>
                  <strong>{preset.name}</strong>
                  <span className="lp-preset-blurb">{preset.blurb}</span>
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="lp-close lp-reveal">
        <h2 className="lp-wordmark">
          {'museware'}
          <span className="lp-brand-dot">.</span>
        </h2>
        <p className="lp-close-line">
          The canvas writes itself, and it runs. Export the same tree to React, a PWA, or a
          zip.
        </p>
        <div className="lp-actions">
          <Button
            variant="accent"
            size="lg"
            onClick={() => {
              void go();
            }}
          >
            Start building <ArrowRight size={16} />
          </Button>
          <Button variant="ghost" size="lg" onClick={gallery}>
            See four real starting points
          </Button>
        </div>
      </section>

      <footer className="lp-footer">
        <span>museware — built with the muse family</span>
        <span className="lp-footer-right">
          <button type="button" className="lp-footer-link" onClick={gallery}>
            Gallery
          </button>
          <button
            type="button"
            className="lp-footer-link"
            onClick={() => {
              void go();
            }}
          >
            Editor
          </button>
        </span>
      </footer>
    </div>
  );
}
