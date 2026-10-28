import { useMemo } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useProject, createProject } from '../store/useProject';
import { useUi } from '../store/useUi';
import { Button } from '../components/ui';
import { TEMPLATES, buildScreensFor, type DemoTemplate } from '../muse/demo/build';
import { CanvasStyle, NodeView } from '../canvas/NodeView';

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
  const previewDoc = useMemo(
    () => ({
      ...createProject(template.projectName),
      tokens: doc.tokens,
      screens,
      kind: template.kind,
    }),
    [doc.tokens, screens, template.kind, template.projectName],
  );
  const frameWidth = template.kind === 'web' ? 1280 : 390;
  const frameHeight = template.kind === 'web' ? 760 : 820;
  const first = screens[0];

  return (
    <div
      className="gallery-cell"
      style={{ display: 'block', padding: 0, overflow: 'hidden' }}
    >
      <CanvasStyle doc={previewDoc} />
      <div
        style={{
          height: 190,
          background: 'var(--mw-surface-2)',
          overflow: 'hidden',
          position: 'relative',
          borderBottom: '1px solid var(--mw-border)',
        }}
      >
        <div
          style={{
            width: frameWidth,
            height: frameHeight,
            transform: `scale(${template.kind === 'web' ? 0.22 : 0.32})`,
            transformOrigin: 'top left',
            position: 'absolute',
            left: template.kind === 'web' ? 0 : '50%',
            marginLeft: template.kind === 'web' ? 0 : -frameWidth * 0.16,
            top: 0,
            pointerEvents: 'none',
          }}
        >
          {first && <NodeView doc={previewDoc} screen={first} mode="edit" />}
        </div>
      </div>
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <strong style={{ fontSize: 14 }}>{template.projectName}</strong>
        <span className="field-hint">
          {template.label} · {template.kind === 'web' ? 'web · 1280' : 'app · 390'} ·{' '}
          {screens.length} screen{screens.length === 1 ? '' : 's'} ·{' '}
          {screens.map((s) => s.name).join(', ')}
        </span>
        <Button size="sm" variant="secondary" onClick={onOpen}>
          Open in the editor <ArrowRight size={12} />
        </Button>
      </div>
    </div>
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
      <div className="gallery-head">
        <span className="brand" style={{ cursor: 'default' }}>
          <span className="brand-mark">
            <Sparkles size={14} />
          </span>
          <span className="brand-word">
            museware<em>.</em>
          </span>
        </span>
        <span className="eyebrow" style={{ marginLeft: 12 }}>
          four real starting points
        </span>
        <span style={{ flex: 1 }} />
        <Button size="sm" variant="ghost" onClick={() => setRoute('landing')}>
          Back
        </Button>
        <Button size="sm" variant="primary" onClick={() => setRoute('editor')}>
          The editor <ArrowRight size={12} />
        </Button>
      </div>
      <section className="gallery-section">
        <h2 className="title">Built from the same vocabulary</h2>
        <p className="field-hint">
          Each of these is 30 components, token styles and action chips — no images of apps.
          Open one and drag anything.
        </p>
        <div className="gallery-row">
          {TEMPLATES.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onOpen={() => open(template)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
