import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useProject, createProject } from '../store/useProject';
import { useUi } from '../store/useUi';
import { Button } from '../components/ui';
import { TEMPLATES, buildScreensFor, type DemoTemplate } from '../muse/demo/build';
import { CanvasStyle, NodeView } from '../canvas/NodeView';
import type { ProjectDoc, ScreenDoc } from '../types/tree';

/** The template's first screen, cropped into whatever the card gives it. */
function Preview({
  doc,
  screen,
  width,
}: {
  doc: ProjectDoc;
  screen: ScreenDoc;
  width: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0.2);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      if (w > 0) setScale(Math.min(w / width, 1));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);
  return (
    <div className="gl-preview" ref={ref}>
      <div style={{ width, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        <CanvasStyle doc={doc} scope={`[data-gl="${screen.id}"]`} />
        <div data-theme="dark" data-gl={screen.id}>
          <NodeView doc={doc} screen={screen} mode="edit" />
        </div>
      </div>
    </div>
  );
}

function TemplateCard({
  template,
  onOpen,
}: {
  template: DemoTemplate;
  onOpen: () => void;
}) {
  const doc = useProject((s) => s.doc);
  const screens = useMemo(
    () => buildScreensFor(template, doc.tokens),
    [template, doc.tokens],
  );
  const previewDoc = useMemo<ProjectDoc>(
    () => ({
      ...createProject(template.projectName),
      tokens: doc.tokens,
      screens,
      kind: template.kind,
    }),
    [doc.tokens, screens, template.kind, template.projectName],
  );
  const width = template.kind === 'web' ? 1280 : 390;
  const first = screens[0];

  return (
    <article className="gl-card">
      <div className="gl-stage">
        {first && <Preview doc={previewDoc} screen={first} width={width} />}
      </div>
      <div className="gl-meta">
        <h3>{template.projectName}</h3>
        <p className="gl-facts">
          {template.label} · {template.kind === 'web' ? 'web, 1280 wide' : 'app, 390 wide'}{' '}
          · {screens.length} screen{screens.length === 1 ? '' : 's'}
        </p>
        <p className="gl-screens">
          {screens
            .map((s) => s.name)
            .slice(0, 4)
            .join(' · ')}
        </p>
        <Button variant="secondary" onClick={onOpen}>
          Open in the editor <ArrowRight size={14} />
        </Button>
      </div>
    </article>
  );
}

export function Gallery() {
  const setRoute = useUi((s) => s.setRoute);
  const replaceDoc = useProject((s) => s.replaceDoc);
  const setActiveScreen = useUi((s) => s.setActiveScreen);
  const toast = useUi((s) => s.toast);
  const doc = useProject((s) => s.doc);

  const open = (template: DemoTemplate) => {
    const fresh = {
      ...createProject(template.projectName),
      kind: template.kind,
      tokens: doc.tokens,
    };
    replaceDoc(fresh);
    const screens = buildScreensFor(template, fresh.tokens);
    let firstId = '';
    for (let i = 0; i < screens.length; i += 1) {
      const screen = screens[i];
      const res = useProject
        .getState()
        .applyBatch(
          [{ op: 'addScreen', screen: { ...screen, ...(i === 0 ? { entry: true } : {}) } }],
          { source: 'user' },
        );
      if (res.errors.length) {
        toast(res.errors[0].message, 'danger');
        return;
      }
      if (!firstId) firstId = screen.id;
    }
    if (firstId) setActiveScreen(firstId);
    setRoute('editor');
    toast(`${template.projectName} loaded — every op is yours to undo.`, 'ok');
  };

  return (
    <div className="gallery-wrap">
      <header className="lp-nav gl-nav">
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
            href="#/"
            onClick={(e) => {
              e.preventDefault();
              setRoute('landing');
            }}
          >
            Back
          </a>
        </nav>
        <div className="lp-nav-actions">
          <Button variant="accent" onClick={() => setRoute('editor')}>
            Open the editor <ArrowRight size={14} />
          </Button>
        </div>
      </header>

      <section className="gl-section">
        <h1 className="gl-title">Four real starting points</h1>
        <p className="lp-sub">
          Each one is built from the same thirty components, token styles and action chips —
          no images of apps. Open one and drag anything; every op is undoable.
        </p>
        <div className="gl-grid">
          {TEMPLATES.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onOpen={() => open(template)}
            />
          ))}
        </div>
      </section>

      <footer className="lp-footer">
        <span>museware — presets, not templates</span>
        <span className="lp-footer-right">
          <button
            type="button"
            className="lp-footer-link"
            onClick={() => setRoute('landing')}
          >
            Back to start
          </button>
          <button
            type="button"
            className="lp-footer-link"
            onClick={() => setRoute('editor')}
          >
            Editor
          </button>
        </span>
      </footer>
    </div>
  );
}
