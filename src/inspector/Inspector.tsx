import { useState } from 'react';
import {
  Copy,
  Layers as LayersIcon,
  Paintbrush,
  Save,
  Sparkles,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { useProject } from '../store/useProject';
import { useUi, type Breakpoint } from '../store/useUi';
import type { Action, ComponentNode, StyleSet } from '../types/tree';
import { ICON_NAMES, spec } from '../types/library';
import { findNode, findParent } from '../ops/treeUtils';
import { duplicateNodeBatch } from '../ops/screenOps';
import { PRESETS } from '../design/presets';
import { Icon } from '../canvas/Icon';
import { Segmented } from '../components/ui';
import { ActionEditor } from './ActionEditor';
import {
  ClearOverride,
  ColorField,
  NumberField,
  SelectField,
  SpacingField,
  TextField,
  ToggleField,
} from './Fields';

const SPACING_TOKENS = [
  'var(--pad-screen)',
  'var(--pad-card)',
  'var(--pad-control-x)',
  'var(--gap-section)',
  'var(--gap-item)',
  '0',
];
const RADIUS_TOKENS = [
  'var(--radius-card)',
  'var(--radius-button)',
  'var(--radius-input)',
  'var(--radius-chip)',
  'var(--radius-tag)',
  '0',
];
const TYPE_TOKENS = [
  'var(--type-display)',
  'var(--type-title)',
  'var(--type-heading)',
  'var(--type-body)',
  'var(--type-label)',
];
const SHADOWS = ['', 'var(--shadow-card)', 'var(--shadow-raised)', 'none'];

type Tab = 'props' | 'style' | 'events';

const BP_LABEL: Record<Breakpoint, string> = {
  compact: 'compact (base)',
  medium: 'medium ≥600',
  expanded: 'expanded ≥1024',
};

export function Inspector() {
  const doc = useProject((s) => s.doc);
  const applyBatch = useProject((s) => s.applyBatch);
  const selectedId = useUi((s) => s.selectedId);
  const select = useUi((s) => s.select);
  const breakpoint = useUi((s) => s.breakpoint);
  const startPrompt = useUi((s) => s.startPrompt);
  const toast = useUi((s) => s.toast);
  const propertiesOpen = useUi((s) => s.propertiesOpen);
  const [tab, setTab] = useState<Tab>('props');
  const [saving, setSaving] = useState(false);
  const [compName, setCompName] = useState('');
  const [compNote, setCompNote] = useState('');

  const activeScreenId = useUi((s) => s.activeScreenId);
  const screen = doc.screens.find((s) => s.id === activeScreenId) || doc.screens[0];
  const node = screen && selectedId ? findNode(screen.root, selectedId) : null;

  const run = (ops: unknown[], ok?: string) => {
    const res = applyBatch(ops, { source: 'user' });
    if (res.errors.length) {
      toast(res.errors[0].message, 'warn');
      return false;
    }
    if (ok) toast(ok);
    return true;
  };

  if (!screen) {
    return (
      <aside className="inspector" data-open={propertiesOpen}>
        <div className="panel-body">
          <p className="field-hint">
            Nothing to inspect yet. Create a screen, then pick a node.
          </p>
        </div>
      </aside>
    );
  }

  if (!node) {
    return <ScreenInspector screenId={screen.id} open={propertiesOpen} />;
  }

  const info = spec(node.type);
  const parent = findParent(screen.root, node.id);
  const overrides = node.styles.responsive?.[breakpoint as 'medium' | 'expanded'] || {};
  const atBreakpoint = breakpoint !== 'compact';
  const isOverridden = (key: string) =>
    atBreakpoint && Object.prototype.hasOwnProperty.call(overrides, key);
  const valueOf = (key: string): string => {
    if (atBreakpoint) {
      const own = overrides[key];
      if (own !== undefined) return String(own);
      const medium =
        breakpoint === 'expanded' ? node.styles.responsive?.medium?.[key] : undefined;
      if (medium !== undefined) return String(medium);
    }
    const base = node.styles[key];
    return base === undefined ? '' : String(base);
  };

  const writeStyle = (key: string, value: string) => {
    const styles: StyleSet =
      breakpoint === 'compact'
        ? { [key]: value }
        : { responsive: { [breakpoint as 'medium' | 'expanded']: { [key]: value } } };
    run([{ op: 'setStyles', id: node.id, styles }]);
  };

  const clearStyle = (key: string) => {
    if (breakpoint === 'compact') {
      run([{ op: 'setStyles', id: node.id, styles: { [key]: '' } }]);
      return;
    }
    writeStyle(key, '');
  };

  const writeProps = (patch: Record<string, unknown>) =>
    run([{ op: 'setProps', id: node.id, props: patch }]);

  const eventValue = (name: 'tap' | 'change' | 'submit'): Action[] =>
    node.events?.[name] || [];

  const writeEvents = (name: 'tap' | 'change' | 'submit', actions: Action[]) =>
    run([{ op: 'setProps', id: node.id, props: { events: { [name]: actions } } }]);

  return (
    <aside className="inspector" data-open={propertiesOpen}>
      <div className="inspector-head">
        <div className="node-title">
          <Icon name={info?.icon || 'grid'} size={14} />
          <div>
            <strong>{info?.label || node.type}</strong>
            <span className="mono">{node.id}</span>
          </div>
        </div>
        <button
          type="button"
          className="icon-btn icon-btn-sm"
          aria-label="Copy id"
          title="Copy id"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(node.id);
              toast(`Copied ${node.id}`, 'ok');
            } catch {
              toast(node.id);
            }
          }}
        >
          <Copy size={12} />
        </button>
        <button
          type="button"
          className="icon-btn icon-btn-sm inspector-close"
          aria-label="Close inspector"
          onClick={() => useUi.getState().setPropertiesOpen(false)}
        >
          <X size={13} />
        </button>
      </div>

      <div className="inspector-tabs">
        <Segmented<Tab>
          label="Inspector sections"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'props', label: 'Props' },
            { value: 'style', label: 'Style' },
            {
              value: 'events',
              label: (eventValue('tap').length +
              eventValue('change').length +
              eventValue('submit').length
                ? 'Events •'
                : 'Events') as string,
            },
          ]}
        />
      </div>

      <div className="inspector-body">
        {tab === 'props' && (
          <>
            <div className="insp-section">
              <div className="insp-section-head">
                <span className="eyebrow">Layer</span>
                {parent ? (
                  <button
                    type="button"
                    className="chip"
                    style={{ height: 22, fontSize: 10 }}
                    onClick={() => select(parent.parent.id)}
                  >
                    <LayersIcon size={10} /> {parent.parent.id}
                  </button>
                ) : (
                  <span className="faint" style={{ fontSize: 10 }}>
                    root
                  </span>
                )}
              </div>
              <TextField
                label="Name"
                value={node.name || ''}
                placeholder={info?.label || node.type}
                onCommit={(name) => {
                  if (!name.trim()) return;
                  run([{ op: 'rename', id: node.id, name: name.trim() }]);
                }}
              />
              <p className="field-hint">{info?.hint}</p>
            </div>

            <div className="insp-section">
              <div className="insp-section-head">
                <span className="eyebrow">Content</span>
              </div>
              {(info?.props || []).map((def) => {
                const raw = node.props[def.key];
                const value = raw === undefined || raw === null ? '' : raw;
                if (def.kind === 'actions') {
                  return (
                    <p className="field-hint" key={def.key}>
                      {def.label} — wired in the Events tab.
                    </p>
                  );
                }
                if (def.kind === 'toggle') {
                  return (
                    <ToggleField
                      key={def.key}
                      label={def.label}
                      checked={Boolean(value)}
                      onChange={(checked) => writeProps({ [def.key]: checked })}
                    />
                  );
                }
                if (def.kind === 'number') {
                  return (
                    <NumberField
                      key={def.key}
                      label={def.label}
                      value={Number(value) || 0}
                      min={def.min}
                      max={def.max}
                      onCommit={(n) => writeProps({ [def.key]: n })}
                    />
                  );
                }
                if (def.kind === 'select' || def.kind === 'tone') {
                  const options = (
                    def.options || ['neutral', 'accent', 'success', 'danger']
                  ).map((o) => ({
                    value: o,
                    label: o,
                  }));
                  const current = String(value || options[0]?.value || '');
                  if (!options.some((o) => o.value === current)) {
                    options.unshift({ value: current, label: `${current} (custom)` });
                  }
                  return (
                    <SelectField
                      key={def.key}
                      label={def.label}
                      value={current}
                      options={options}
                      onChange={(next) => writeProps({ [def.key]: next })}
                    />
                  );
                }
                if (def.kind === 'icon') {
                  const options = ICON_NAMES.map((name) => ({ value: name, label: name }));
                  return (
                    <SelectField
                      key={def.key}
                      label={def.label}
                      value={String(value || 'star')}
                      options={options}
                      onChange={(next) => writeProps({ [def.key]: next })}
                    />
                  );
                }
                if (def.kind === 'screen') {
                  const options = doc.screens.map((s2) => ({
                    value: s2.id,
                    label: `${s2.name} · ${s2.id}`,
                  }));
                  return (
                    <SelectField
                      key={def.key}
                      label={def.label}
                      value={String(value || options[0]?.value || '')}
                      options={options}
                      onChange={(next) => writeProps({ [def.key]: next })}
                    />
                  );
                }
                if (def.kind === 'bind') {
                  return (
                    <TextField
                      key={def.key}
                      label={def.label}
                      mono
                      value={String(value)}
                      placeholder="lower_snake_case"
                      hint="Bindings read + write the run-mode store. No code."
                      onCommit={(next) => writeProps({ [def.key]: next.trim() || null })}
                    />
                  );
                }
                if (def.kind === 'data') {
                  const keys = Object.keys(screen.mockData || {});
                  return (
                    <div key={def.key}>
                      <TextField
                        label={def.label}
                        value={String(value)}
                        hint={def.hint}
                        onCommit={(next) => writeProps({ [def.key]: next })}
                      />
                      {keys.length > 0 && (
                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 4,
                            marginTop: -4,
                          }}
                        >
                          {keys.map((key) => (
                            <button
                              type="button"
                              key={key}
                              className="chip"
                              data-selected={String(value) === key}
                              style={{ height: 22, fontSize: 10 }}
                              onClick={() => writeProps({ [def.key]: key })}
                            >
                              {key}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }
                return (
                  <TextField
                    key={def.key}
                    label={def.label}
                    multiline={def.kind === 'longtext'}
                    value={String(value)}
                    hint={def.hint}
                    onCommit={(next) => writeProps({ [def.key]: next })}
                  />
                );
              })}
              {(info?.props || []).length === 0 && (
                <p className="field-hint">This block has no props.</p>
              )}
            </div>

            <div className="insp-section">
              <div className="insp-section-head">
                <span className="eyebrow">Visibility rule</span>
              </div>
              <div className="insp-row">
                <TextField
                  label="Show when key"
                  mono
                  value={node.visibleWhen?.key || ''}
                  placeholder="empty = always shown"
                  onCommit={(key) => {
                    const next = key.trim();
                    writeProps({
                      visibleWhen: next
                        ? { key: next, equals: node.visibleWhen?.equals }
                        : null,
                    });
                  }}
                />
              </div>
              {node.visibleWhen && (
                <TextField
                  label="Equals"
                  value={
                    node.visibleWhen.equals === undefined
                      ? ''
                      : String(node.visibleWhen.equals)
                  }
                  hint="Blank means “is truthy”."
                  onCommit={(equals) => {
                    writeProps({
                      visibleWhen: {
                        key: node.visibleWhen?.key,
                        equals: equals === '' ? undefined : equals,
                      },
                    });
                  }}
                />
              )}
            </div>
          </>
        )}

        {tab === 'style' && (
          <>
            <div className="bp-hint">
              Editing <strong>{BP_LABEL[breakpoint]}</strong>
              {atBreakpoint
                ? ' — changes write an override at this width; the base stays intact.'
                : ' — changes are the base all wider widths inherit.'}
            </div>

            <div className="insp-section">
              <div className="insp-section-head">
                <span className="eyebrow">Colour</span>
                {Object.keys(overrides).length > 0 && (
                  <ClearOverride
                    label="all colour+spacing overrides"
                    onClear={() => {
                      for (const key of Object.keys(overrides)) clearStyle(key);
                    }}
                  />
                )}
              </div>
              <ColorField
                label="Background"
                value={valueOf('background')}
                tokens={doc.tokens}
                allowTransparent
                overridden={isOverridden('background')}
                onClearOverride={
                  isOverridden('background') ? () => clearStyle('background') : undefined
                }
                onCommit={(v) => writeStyle('background', v)}
              />
              <ColorField
                label="Text"
                value={valueOf('color')}
                tokens={doc.tokens}
                overridden={isOverridden('color')}
                onClearOverride={
                  isOverridden('color') ? () => clearStyle('color') : undefined
                }
                onCommit={(v) => writeStyle('color', v)}
              />
              <SpacingField
                label="Border"
                value={valueOf('border')}
                suggestions={[
                  '1px solid var(--openui-border-default)',
                  'none',
                  '1px solid var(--openui-border-accent)',
                ]}
                overridden={isOverridden('border')}
                onCommit={(v) => writeStyle('border', v)}
              />
            </div>

            <div className="insp-section">
              <div className="insp-section-head">
                <span className="eyebrow">Space</span>
              </div>
              <SpacingField
                label="Padding"
                value={valueOf('padding')}
                suggestions={SPACING_TOKENS}
                overridden={isOverridden('padding')}
                onCommit={(v) => writeStyle('padding', v)}
              />
              <SpacingField
                label="Margin"
                value={valueOf('margin')}
                suggestions={['0', 'auto', ...SPACING_TOKENS.filter((t) => t !== '0')]}
                overridden={isOverridden('margin')}
                onCommit={(v) => writeStyle('margin', v)}
              />
              <SpacingField
                label="Gap"
                value={valueOf('gap')}
                suggestions={SPACING_TOKENS}
                overridden={isOverridden('gap')}
                onCommit={(v) => writeStyle('gap', v)}
              />
              <SpacingField
                label="Radius"
                value={valueOf('borderRadius')}
                suggestions={RADIUS_TOKENS}
                overridden={isOverridden('borderRadius')}
                onCommit={(v) => writeStyle('borderRadius', v)}
              />
            </div>

            <div className="insp-section">
              <div className="insp-section-head">
                <span className="eyebrow">Type</span>
              </div>
              <SpacingField
                label="Size"
                value={valueOf('fontSize')}
                suggestions={TYPE_TOKENS}
                overridden={isOverridden('fontSize')}
                onCommit={(v) => writeStyle('fontSize', v)}
              />
              <SelectField
                label="Weight"
                value={valueOf('fontWeight') || '400'}
                options={['300', '400', '500', '600', '700', '800'].map((w) => ({
                  value: w,
                  label: w,
                }))}
                onChange={(v) => writeStyle('fontWeight', v)}
              />
              <SelectField
                label="Align"
                value={valueOf('textAlign') || 'start'}
                options={['start', 'center', 'end'].map((v) => ({ value: v, label: v }))}
                onChange={(v) => writeStyle('textAlign', v)}
              />
            </div>

            <div className="insp-section">
              <div className="insp-section-head">
                <span className="eyebrow">Layout & size</span>
              </div>
              <div className="insp-row">
                <SelectField
                  label="Align"
                  value={valueOf('align') || 'stretch'}
                  options={['start', 'center', 'end', 'stretch'].map((v) => ({
                    value: v,
                    label: v,
                  }))}
                  onChange={(v) => writeStyle('align', v)}
                />
                <SelectField
                  label="Justify"
                  value={valueOf('justify') || 'start'}
                  options={['start', 'center', 'end', 'stretch'].map((v) => ({
                    value: v,
                    label: v,
                  }))}
                  onChange={(v) => writeStyle('justify', v)}
                />
              </div>
              <div className="insp-row">
                <SpacingField
                  label="Width"
                  value={valueOf('width')}
                  suggestions={['100%', 'auto', 'fit-content']}
                  overridden={isOverridden('width')}
                  onCommit={(v) => writeStyle('width', v)}
                />
                <SpacingField
                  label="Max width"
                  value={valueOf('maxWidth')}
                  suggestions={['100%', 'none', '720px', '1120px']}
                  overridden={isOverridden('maxWidth')}
                  onCommit={(v) => writeStyle('maxWidth', v)}
                />
              </div>
              {node.type === 'grid' && (
                <NumberField
                  label="Columns"
                  value={Number(valueOf('columns')) || 2}
                  min={1}
                  max={6}
                  onCommit={(n) => writeStyle('columns', String(n))}
                />
              )}
              <SpacingField
                label="Shadow"
                value={valueOf('boxShadow')}
                suggestions={SHADOWS}
                overridden={isOverridden('boxShadow')}
                onCommit={(v) => writeStyle('boxShadow', v)}
              />
              <SpacingField
                label="Opacity"
                value={valueOf('opacity')}
                suggestions={['1', '0.8', '0.6']}
                overridden={isOverridden('opacity')}
                onCommit={(v) => writeStyle('opacity', v)}
              />
            </div>

            <p className="field-hint">
              Tokens first — the swatches are the theme, so one edit restyles everything
              that uses it. A filled dot marks a value overridden at this breakpoint; click
              it to inherit.
            </p>
          </>
        )}

        {tab === 'events' && (
          <>
            {(
              [
                {
                  name: 'tap',
                  label: 'When tapped',
                  hint: 'Buttons, cards, links — every block accepts it.',
                },
                {
                  name: 'change',
                  label: 'When changed',
                  hint: 'Inputs, switches, sliders, selects.',
                },
                {
                  name: 'submit',
                  label: 'When submitted',
                  hint: 'Forms and their inputs.',
                },
              ] as const
            ).map((ev) => (
              <div className="insp-section" key={ev.name}>
                <div className="insp-section-head">
                  <span className="eyebrow">
                    {ev.label}{' '}
                    {eventValue(ev.name).length ? `· ${eventValue(ev.name).length}` : ''}
                  </span>
                </div>
                <p className="field-hint">{ev.hint}</p>
                <ActionEditor
                  actions={eventValue(ev.name)}
                  screens={doc.screens}
                  onChange={(next) => writeEvents(ev.name, next)}
                />
              </div>
            ))}
          </>
        )}
      </div>

      <div className="inspector-foot">
        <button
          type="button"
          className="btn btn-sm btn-secondary btn-block"
          onClick={() => {
            const label = node.name || info?.label || node.type;
            startPrompt(
              `Restyle ${node.id} (${label}) — keep its structure and text, change only styling.`,
            );
            toast('Ask queued in the rail', 'ok');
          }}
        >
          <Sparkles size={13} /> Ask muse to restyle this
        </button>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            style={{ flex: 1 }}
            onClick={() => setSaving(true)}
          >
            <Save size={12} /> Save as component
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Duplicate node"
            title="Duplicate (one op)"
            onClick={() => {
              const batch = duplicateNodeBatch(doc, node.id);
              if ('error' in batch) {
                toast(batch.error, 'warn');
                return;
              }
              run(batch.ops, 'Duplicated');
            }}
          >
            <Copy size={13} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Delete node"
            title="Delete"
            onClick={() => {
              if (screen.root.id === node.id) return;
              if (run([{ op: 'remove', id: node.id }], 'Removed — ⌘Z undoes it'))
                select(null);
            }}
          >
            <Trash2 size={13} />
          </button>
        </div>
        <button
          type="button"
          className="btn btn-sm btn-ghost btn-block"
          onClick={() => select(null)}
        >
          <Zap size={12} /> Screen settings
        </button>
      </div>

      {saving && (
        <div
          className="scrim"
          onMouseDown={(e) => e.target === e.currentTarget && setSaving(false)}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Save as component"
          >
            <div className="modal-head">
              <h2>Save “{node.id}” as a component</h2>
            </div>
            <div className="modal-body">
              <TextField
                label="Component name"
                mono
                value={compName}
                placeholder="habit_row"
                hint="lower_snake_case, 3–31 chars. Places as a copy."
                onCommit={setCompName}
              />
              <TextField
                label="Description"
                value={compNote}
                placeholder="What this block is for"
                onCommit={setCompNote}
              />
            </div>
            <div className="modal-foot">
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => setSaving(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => {
                  const name = (compName || node.name || '').trim();
                  if (!name) {
                    toast('Give it a name first.', 'warn');
                    return;
                  }
                  const ok = run(
                    [
                      {
                        op: 'saveComponent',
                        name,
                        description: compNote || `${info?.label || node.type} block`,
                        root: JSON.parse(JSON.stringify(node)),
                      },
                    ],
                    `${name} saved — it is in the palette now`,
                  );
                  if (ok) {
                    setSaving(false);
                    setCompName('');
                    setCompNote('');
                  }
                }}
              >
                <Paintbrush size={12} /> Save component
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

/** Nothing selected: the screen itself is the subject. */
function ScreenInspector({ screenId, open }: { screenId: string; open: boolean }) {
  const doc = useProject((s) => s.doc);
  const applyBatch = useProject((s) => s.applyBatch);
  const toast = useUi((s) => s.toast);
  const startPrompt = useUi((s) => s.startPrompt);
  const setActivePreset = useUi((s) => s.setActivePreset);
  const activePreset = useUi((s) => s.activePreset);
  const screen = doc.screens.find((s) => s.id === screenId);

  if (!screen) return null;

  const run = (ops: unknown[], ok?: string) => {
    const res = applyBatch(ops, { source: 'user' });
    if (res.errors.length) {
      toast(res.errors[0].message, 'warn');
      return false;
    }
    if (ok) toast(ok);
    return true;
  };

  const binds = new Set<string>();
  const walk = (n: ComponentNode) => {
    if (n.props.bindKey) binds.add(String(n.props.bindKey));
    if (n.visibleWhen?.key) binds.add(n.visibleWhen.key);
    for (const ev of Object.values(n.events || {})) {
      for (const a of ev || []) {
        if (a.type === 'setState' || a.type === 'toggle' || a.type === 'when')
          binds.add(a.key);
      }
    }
    n.children.forEach(walk);
  };
  walk(screen.root);

  return (
    <aside className="inspector" data-open={open}>
      <div className="inspector-head">
        <div className="node-title">
          <Icon name="grid" size={14} />
          <div>
            <strong>{screen.name}</strong>
            <span className="mono">{screen.id}</span>
          </div>
        </div>
        {screen.entry && <span className="chip chip-static">entry</span>}
        <button
          type="button"
          className="icon-btn icon-btn-sm inspector-close"
          aria-label="Close inspector"
          onClick={() => useUi.getState().setPropertiesOpen(false)}
        >
          <X size={13} />
        </button>
      </div>
      <div className="inspector-body">
        <div className="insp-section">
          <div className="insp-section-head">
            <span className="eyebrow">Screen</span>
          </div>
          <TextField
            label="Name"
            value={screen.name}
            onCommit={(name) =>
              name.trim() && run([{ op: 'renameScreen', id: screen.id, name: name.trim() }])
            }
          />
          <ToggleField
            label="This is the entry screen"
            checked={Boolean(screen.entry)}
            onChange={(on) => {
              if (!on) {
                toast('The app always needs one entry screen.', 'warn');
                return;
              }
              run([{ op: 'setEntry', id: screen.id }], 'Entry screen updated');
            }}
          />
          <p className="field-hint">
            Run mode, the export router and a fresh reload all open this screen first.
          </p>
        </div>

        <div className="insp-section">
          <div className="insp-section-head">
            <span className="eyebrow">Bindings on this screen</span>
            <span className="faint" style={{ fontSize: 10 }}>
              {binds.size}
            </span>
          </div>
          {binds.size === 0 ? (
            <p className="field-hint">
              No state yet. Add a <span className="mono">bindKey</span> to an input to make
              the screen stateful.
            </p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {[...binds].map((key) => (
                <span className="chip chip-static mono" key={key} style={{ fontSize: 10 }}>
                  {key}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="insp-section">
          <div className="insp-section-head">
            <span className="eyebrow">Design system</span>
            <span className="faint" style={{ fontSize: 10 }}>
              {doc.tokens.title}
            </span>
          </div>
          <div className="swatch-grid">
            {PRESETS.map((preset) => (
              <button
                type="button"
                key={preset.id}
                className="preset-card-mini"
                data-selected={activePreset === preset.id}
                title={preset.blurb}
                onClick={() => {
                  const ok = run(
                    [
                      {
                        op: 'setTokens',
                        patch: { ...preset.tokens.openuiTheme, title: preset.tokens.title },
                      },
                    ],
                    `${preset.name} applied — every screen follows`,
                  );
                  if (ok) setActivePreset(preset.id);
                }}
              >
                <span className="preset-swatches">
                  <i style={{ background: preset.tokens.openuiTheme.brand_color }} />
                  <i style={{ background: preset.tokens.openuiTheme.secondary_color }} />
                  <i
                    style={{ background: preset.tokens.openuiTheme.light_colors.openui_bg }}
                  />
                </span>
                <span>{preset.name}</span>
              </button>
            ))}
          </div>
          <div className="token-row">
            <span className="field-label" style={{ flex: 1 }}>
              Accent
            </span>
            <input
              type="color"
              aria-label="Brand accent"
              value={doc.tokens.openuiTheme.brand_color}
              onChange={(e) =>
                run([{ op: 'setTokens', patch: { brand_color: e.target.value } }])
              }
              style={{
                width: 36,
                height: 'var(--mw-input-h)',
                border: '1px solid var(--mw-border)',
                borderRadius: 8,
                background: 'var(--mw-surface)',
                padding: 2,
              }}
            />
          </div>
          <p className="field-hint">
            Brand colours rewrite accent, pressed, text-on-brand and border-accent in both
            modes.
          </p>
        </div>

        <div className="insp-section">
          <div className="insp-section-head">
            <span className="eyebrow">Ask</span>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-secondary btn-block"
            onClick={() =>
              startPrompt(
                `Restyle the ${screen.name} screen — same content, better hierarchy.`,
              )
            }
          >
            <Sparkles size={13} /> Restyle this screen
          </button>
        </div>
      </div>
    </aside>
  );
}
