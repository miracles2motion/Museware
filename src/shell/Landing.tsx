import { useMemo, useState } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useProject, createProject } from '../store/useProject';
import { useUi } from '../store/useUi';
import { useAgent } from '../store/useAgent';
import { CanvasStyle, NodeView } from '../canvas/NodeView';
import { n } from '../muse/demo/build';
import { PRESETS } from '../design/presets';
import { MUSEWARE_DEFAULT_THEME } from '../design/starter';
import { Button } from '../components/ui';
import type { ScreenDoc } from '../types/tree';

function miniScreens(): ScreenDoc[] {
  const root = n('screen', 'mini_root', {
    props: { title: 'Muse', layout: 'flex-col', scroll: true },
    styles: {
      padding: 'var(--pad-card)',
      gap: 'var(--gap-section)',
      background: 'var(--openui-bg)',
    },
    children: [
      n('heading', 'mini_title', {
        props: { text: 'Plan less. Ship the thing.', level: 1 },
      }),
      n('text', 'mini_lead', {
        props: {
          text: 'The agent writes real ops into this tree — and you can undo every one of them.',
        },
      }),
      n('row', 'mini_row', {
        props: { gap: '8px', align: 'center' },
        children: [
          n('button', 'mini_cta', {
            props: { text: 'Start free', variant: 'primary' },
            styles: { width: 'auto' },
          }),
          n('button', 'mini_alt', {
            props: { text: 'See it run', variant: 'secondary' },
            styles: { width: 'auto' },
          }),
        ],
      }),
      n('grid', 'mini_grid', {
        props: { columns: 3, gap: '8px' },
        styles: { gap: '8px' },
        children: [
          n('card', 'mini_c1', {
            children: [
              n('label', 'mini_c1_l', { props: { text: 'Screens' } }),
              n('stat', 'mini_c1_v', { props: { label: 'Screens', value: '4' } }),
            ],
          }),
          n('card', 'mini_c2', {
            children: [n('stat', 'mini_c2_v', { props: { label: 'Ops', value: '38' } })],
          }),
          n('card', 'mini_c3', {
            children: [
              n('stat', 'mini_c3_v', { props: { label: 'Verified', value: 'PASS' } }),
            ],
          }),
        ],
      }),
    ],
  });
  return [{ id: 'muse', name: 'Muse', root, entry: true }];
}

export function Landing() {
  const setRoute = useUi((s) => s.setRoute);
  const startPrompt = useUi((s) => s.startPrompt);
  const doc = useProject((s) => s.doc);
  const demoMode = useAgent((s) => s.demoMode);
  const [prompt, setPrompt] = useState(
    'Design me a landing page website for a small coffee roaster.',
  );
  const screens = useMemo(miniScreens, []);
  const miniDoc = useMemo(
    () => ({
      ...createProject('Preview'),
      tokens: doc.tokens || MUSEWARE_DEFAULT_THEME,
      screens,
      kind: 'app' as const,
    }),
    [doc.tokens, screens],
  );

  const go = (want?: string) => {
    if (want) startPrompt(want);
    setRoute('editor');
  };

  return (
    <div className="landing">
      <nav className="landing-nav">
        <span className="brand" style={{ cursor: 'default' }}>
          <span className="brand-mark">
            <Sparkles size={14} />
          </span>
          <span className="brand-word">
            museware<em>.</em>
          </span>
        </span>
        <span className="spacer" />
        <a
          href="#/gallery"
          onClick={(e) => {
            e.preventDefault();
            setRoute('gallery');
          }}
        >
          Gallery
        </a>
        <a
          href="#/app"
          onClick={(e) => {
            e.preventDefault();
            setRoute('editor');
          }}
        >
          Editor
        </a>
        <Button variant="primary" size="sm" onClick={() => go()}>
          Start building
        </Button>
      </nav>

      <section className="hero-section">
        <div className="hero-copy">
          <p className="eyebrow">The agentic app builder</p>
          <h1>
            Describe it. Watch it build.
            <br />
            <em>Then change anything.</em>
          </h1>
          <p className="lead">
            Museware is a real editor with a real agent inside it. The model plans a
            blueprint, writes batched ops into the same tree you drag, and a verify gate has
            to pass before it shows you anything. Nothing is a screenshot of an app.
          </p>
          <div className="hero-actions">
            <Button variant="primary" size="lg" onClick={() => go()}>
              Start building <ArrowRight size={15} />
            </Button>
            <Button variant="secondary" size="lg" onClick={() => setRoute('gallery')}>
              See what it builds
            </Button>
          </div>
          <p className="hero-note">
            No signup, no email wall.{' '}
            {demoMode
              ? 'The local engine runs offline — judge the pipeline before you spend a cent.'
              : 'Your muse key is your account.'}
          </p>
          <div className="family-strip">
            <span className="fam">spark · builds</span>
            <span className="fam">wonder · plans</span>
            <span className="fam">SAM · sees structure</span>
            <span className="fam">image · illustrates</span>
            <span className="fam">voice · listens</span>
          </div>
        </div>

        <div className="mini-canvas">
          <div className="mini-canvas-bar">
            <span className="live-dot" /> live canvas · 390px · editable
          </div>
          <div className="mini-stage">
            <div className="mini-prompt">
              <Sparkles size={12} />
              <input
                value={prompt}
                aria-label="Prompt muse"
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') go(prompt);
                }}
              />
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => go(prompt)}
              >
                Build
              </button>
            </div>
            <div className="mini-frame" style={{ height: 470 }}>
              <CanvasStyle doc={miniDoc} />
              <div
                data-theme="dark"
                style={{
                  transform: 'scale(0.62)',
                  transformOrigin: 'top left',
                  width: 390,
                }}
              >
                <NodeView doc={miniDoc} screen={screens[0]} mode="edit" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section">
        <h2>The same card, three ways</h2>
        <p className="sub">
          By hand, with logic chips, or built by the agent — one tree, one undo.
        </p>
        <div className="how-grid">
          <div className="how-card">
            <span className="step">1</span>
            <div>
              <strong>Styled by hand</strong>
              <p className="field-hint">
                Token swatches, spacing steppers, breakpoint overrides. No hex soup.
              </p>
            </div>
          </div>
          <div className="how-card">
            <span className="step">2</span>
            <div>
              <strong>Given logic chips</strong>
              <p className="field-hint">
                WHEN tapped → go to screen, set a value, toast. Zero code, real behaviour.
              </p>
            </div>
          </div>
          <div className="how-card">
            <span className="step">3</span>
            <div>
              <strong>Built by the agent</strong>
              <p className="field-hint">
                Blueprint → approve → batched ops → verify. Receipts for every call.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section">
        <h2>Presets, not templates</h2>
        <p className="sub">
          Two real design systems ship with Museware. One tap retunes every screen.
        </p>
        <div className="preset-grid">
          {PRESETS.map((preset) => (
            <button
              type="button"
              key={preset.id}
              className="preset-card"
              onClick={() => go(`Use the ${preset.name} design system for this project.`)}
            >
              <span className="preset-swatches">
                <i style={{ background: preset.tokens.openuiTheme.brand_color }} />
                <i style={{ background: preset.tokens.openuiTheme.secondary_color }} />
                <i
                  style={{ background: preset.tokens.openuiTheme.light_colors.openui_bg }}
                />
              </span>
              <strong>{preset.name}</strong>
              <span className="field-hint">{preset.blurb}</span>
            </button>
          ))}
        </div>
      </section>

      <footer className="landing-footer">
        <span>Museware · the canvas writes itself, and it runs.</span>
        <span className="spacer" />
        <span className="mono">blueprint → approve → verified build</span>
      </footer>
    </div>
  );
}
