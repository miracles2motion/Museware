import {
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { Action, ComponentNode, ProjectDoc } from '../types/tree';
import { isVisible, runActions, screenSlugForLabel, useRuntime } from '../preview/runtime';
import { nodeClass } from './cssGen';
import { avatarPlaceholder, placeholderImage } from './placeholder';
import { Icon } from './Icon';
import { defaultPropsFor } from '../types/library';

type Mode = 'edit' | 'run';

interface Props {
  node: ComponentNode;
  doc: ProjectDoc;
  mode: Mode;
  screenId?: string;
  row?: Record<string, unknown>;
}

function subst(value: unknown, row?: Record<string, unknown>): string {
  const text =
    typeof value === 'string'
      ? value
      : value === undefined || value === null
        ? ''
        : String(value);
  if (!row) return text;
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, path: string) => {
    const key = path.replace(/^row\./, '');
    const v = row[key];
    return v === undefined || v === null ? '' : String(v);
  });
}

const asText = (v: unknown, fallback = ''): string =>
  typeof v === 'string' ? v : typeof v === 'number' ? String(v) : fallback;

function asList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x));
  if (typeof v === 'string')
    return v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  return [];
}

function dataRows(
  node: ComponentNode,
  doc: ProjectDoc,
  screenId: string,
): Record<string, unknown>[] {
  const screen = doc.screens.find((s) => s.id === screenId);
  const key = asText(node.props.dataKey) || asText(node.props.bindKey);
  const stored = key && screen?.mockData ? screen.mockData[key] : undefined;
  if (stored && stored.length) return stored as Record<string, unknown>[];
  return [];
}

function fallbackRows(node: ComponentNode, count = 4): Record<string, unknown>[] {
  const seeds: Array<[string, string, string]> =
    node.type === 'table'
      ? [
          ['Beacon launch', 'Ready', 'Oct 12'],
          ['Signal audit', 'In review', 'Oct 14'],
          ['Warm intro', 'Draft', 'Oct 18'],
        ]
      : [
          ['Morning walk', '6,204 steps', '+12%'],
          ['Deep work', '2h 40m', '+8%'],
          ['Reading', '24 pages', '—'],
          ['Water', '1.8 L', '+5%'],
        ];
  return seeds
    .slice(0, count)
    .map(([a, b, c]) => ({ title: a, name: a, value: b, detail: b, meta: c }));
}

function chartPoints(
  node: ComponentNode,
  doc: ProjectDoc,
  screenId: string,
): Array<{ label: string; value: number }> {
  const rows = dataRows(node, doc, screenId);
  if (rows.length) {
    const first = rows[0];
    const valueKey = Object.keys(first).find((k) => typeof first[k] === 'number');
    const labelKey = Object.keys(first).find((k) => typeof first[k] === 'string');
    return rows.slice(0, 12).map((r) => ({
      label: labelKey ? String(r[labelKey]) : '',
      value: valueKey ? Number(r[valueKey]) : 0,
    }));
  }
  return [42, 58, 36, 71, 64, 88, 54].map((v, i) => ({ label: `P${i + 1}`, value: v }));
}

export function NodeBody({ node, doc, mode, screenId, row }: Props) {
  const runtime = useRuntime();
  const [tab, setTab] = useState(0);
  const cls = nodeClass(node.id);
  const state = mode === 'run' && runtime ? runtime.state : null;
  if (!isVisible(node, state)) return null;

  const p = { ...defaultPropsFor(node.type), ...node.props } as Record<string, unknown>;
  const fire = (event: 'tap' | 'change' | 'submit', extra?: Action[]) => {
    if (mode !== 'run' || !runtime) return;
    runActions(extra, runtime);
    runActions(node.events?.[event], runtime);
  };
  /*
   * Edit mode: a field stays the click target (so it selects) but its native
   * behaviour — focus, pickers, range drags — is suppressed by cancelling the
   * pointer's default action. The click itself still fires and bubbles to the
   * canvas's selection handler. Hiding the field with pointer-events: none
   * instead made inputs, textareas, selects, sliders and date pickers
   * unselectable: the click fell through to the parent.
   */
  const editGuard = (e: ReactPointerEvent) => {
    if (mode !== 'run') e.preventDefault();
  };
  /*
   * A tap belongs to the block it landed on, not to every ancestor that also
   * has a tap wired: clicking a Heading inside a tappable Card must not fire
   * the card's action as well. The nearest `n-<id>` element is the answer, and
   * it costs one walk up the tree.
   */
  const tapProps = {
    onClick: (e: ReactMouseEvent) => {
      if (mode !== 'run') return;
      let cur = e.target as Element | null;
      while (cur) {
        const classes = cur.getAttribute?.('class') || '';
        if (/(^|\s)n-[a-z][a-z0-9_]{2,30}(\s|$)/.test(classes)) break;
        cur = cur.parentElement;
      }
      if (cur !== e.currentTarget) return;
      fire('tap');
    },
  };
  const bind = asText(p.bindKey);
  const value = bind && runtime ? runtime.state[bind] : undefined;
  const sizeIcon = Number(p.size) || 20;
  const imageSrc = asText(p.src || p.image);
  const textAlign =
    typeof node.styles.textAlign === 'string'
      ? (node.styles.textAlign as CSSProperties['textAlign'])
      : undefined;
  const activeScreen = screenId || runtime?.screenId || doc.screens[0]?.id || '';

  const renderChildren = () =>
    (node.children || []).map((child) => (
      <NodeBody key={child.id} node={child} doc={doc} mode={mode} screenId={activeScreen} />
    ));

  switch (node.type) {
    case 'row':
    case 'col':
    case 'grid':
    case 'screen':
      break;
    case 'tabs': {
      const items = asList(p.items);
      const panels = node.children || [];
      return (
        <div className={cls}>
          <div className="mw-tab-strip">
            {items.map((item, i) => (
              <button
                key={`${item}-${i}`}
                type="button"
                className="mw-tab"
                data-active={i === tab}
                onClick={(e) => {
                  // Run mode keeps the tap to itself; edit mode lets the click
                  // bubble so the canvas selects the tabs node (and the panel
                  // still switches, which is how its children become
                  // clickable at all).
                  if (mode === 'run') e.stopPropagation();
                  setTab(i);
                  fire('change');
                }}
              >
                {item}
              </button>
            ))}
          </div>
          {items.length === panels.length
            ? panels[tab] && (
                <NodeBody
                  node={panels[tab]}
                  doc={doc}
                  mode={mode}
                  screenId={activeScreen}
                />
              )
            : renderChildren()}
        </div>
      );
    }
    case 'heading':
      return (
        <div className={cls} style={textAlign ? { textAlign } : undefined} {...tapProps}>
          {subst(p.text, row)}
        </div>
      );
    case 'text':
      return (
        <div className={cls} style={textAlign ? { textAlign } : undefined} {...tapProps}>
          {subst(p.text, row)}
        </div>
      );
    case 'label':
      return (
        <div className={cls} {...tapProps}>
          {subst(p.text, row)}
        </div>
      );
    case 'badge':
      return <span className={cls}>{subst(p.text, row)}</span>;
    case 'divider':
      return <div className={cls} role="separator" />;
    case 'icon':
      return (
        <span className={cls}>
          <Icon name={p.name} size={sizeIcon} />
        </span>
      );
    case 'image': {
      const src = imageSrc || placeholderImage(doc.tokens, { seed: node.id, height: 420 });
      return (
        <div className={cls} style={{ aspectRatio: '16 / 10' }} {...tapProps}>
          <img
            className="mw-fill-img"
            src={src}
            alt={asText(p.alt, 'Image')}
            style={{
              objectFit: asText(p.fit, 'cover') === 'contain' ? 'contain' : 'cover',
            }}
            draggable={false}
          />
        </div>
      );
    }
    case 'avatar': {
      const initials = asText(p.initials, 'MA');
      const src = imageSrc || avatarPlaceholder(doc.tokens, initials);
      return (
        <span
          className={cls}
          style={{ width: sizeIcon * 2.2, height: sizeIcon * 2.2 }}
          {...tapProps}
        >
          <img className="mw-fill-img" src={src} alt={initials} draggable={false} />
        </span>
      );
    }
    case 'progress': {
      const val = Math.max(0, Math.min(100, Number(value ?? p.value) || 0));
      return (
        <div className={cls}>
          {(p.label || bind) && (
            <div className="mw-progress-label">
              <span>{subst(p.label, row) || 'Progress'}</span>
              <span>{val}%</span>
            </div>
          )}
          <div className="mw-progress-track">
            <div className="mw-progress-fill" style={{ width: `${val}%` }} />
          </div>
        </div>
      );
    }
    case 'spinner':
      return (
        <span className={cls}>
          <span className="mw-spinner" />
        </span>
      );
    case 'button':
      return (
        <button
          type="button"
          className={cls}
          // Disabled only exists in Run mode: on the canvas it must stay
          // selectable, and pointer-events:none would make it invisible to the
          // click that selects it.
          disabled={mode === 'run' ? Boolean(p.disabled) : undefined}
          data-disabled={p.disabled ? 'true' : undefined}
          onClick={(e) => {
            // In edit mode the click must bubble: the canvas selects through
            // it. Stopping here made every button unselectable.
            if (mode === 'run') e.stopPropagation();
            if (p.disabled) return;
            fire('tap');
          }}
        >
          {p.icon ? <Icon name={p.icon} size={16} /> : null}
          {subst(p.text, row)}
        </button>
      );
    case 'iconbutton':
      return (
        <button
          type="button"
          className={cls}
          onClick={(e) => {
            if (mode === 'run') e.stopPropagation();
            fire('tap');
          }}
          aria-label={asText(p.icon, 'button')}
        >
          <Icon name={p.icon} size={20} />
        </button>
      );
    case 'input':
      return (
        <input
          className={cls}
          type={
            p.inputType === 'password'
              ? 'password'
              : p.inputType === 'number'
                ? 'number'
                : p.inputType === 'phone'
                  ? 'tel'
                  : 'text'
          }
          placeholder={asText(p.placeholder, 'Type here')}
          value={typeof value === 'string' ? value : ''}
          readOnly={mode !== 'run'}
          onChange={(e) => runtime?.setKey(bind, e.target.value)}
          onBlur={() => fire('change')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') fire('change');
          }}
          onPointerDown={editGuard}
        />
      );
    case 'textarea':
      return (
        <textarea
          className={cls}
          placeholder={asText(p.placeholder, 'Say more')}
          rows={Number(p.rows) || 4}
          value={typeof value === 'string' ? value : ''}
          readOnly={mode !== 'run'}
          onChange={(e) => runtime?.setKey(bind, e.target.value)}
          onBlur={() => fire('change')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') fire('change');
          }}
          onPointerDown={editGuard}
        />
      );
    case 'select': {
      const options = asList(p.options);
      return (
        <select
          className={cls}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => {
            runtime?.setKey(bind, e.target.value);
            fire('change');
          }}
          onPointerDown={editGuard}
        >
          <option value="">{asText(p.placeholder, 'Choose…')}</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    }
    case 'checkbox': {
      const on = Boolean(value);
      return (
        <span
          className={cls}
          onClick={(e) => {
            if (mode === 'run') {
              e.stopPropagation();
              runtime?.setKey(bind, !on);
              fire('change');
            }
          }}
        >
          <span className="mw-check" data-on={on}>
            {on && <Icon name="check" size={12} strokeWidth={3} />}
          </span>
          <span>{subst(p.label, row)}</span>
        </span>
      );
    }
    case 'switch': {
      const on = Boolean(value);
      return (
        <span
          className={cls}
          onClick={(e) => {
            if (mode === 'run') {
              e.stopPropagation();
              runtime?.setKey(bind, !on);
              fire('change');
            }
          }}
        >
          <span className="mw-switch" data-on={on}>
            <span className="mw-switch-track">
              <span className="mw-switch-thumb" />
            </span>
          </span>
          <span>{subst(p.label, row)}</span>
        </span>
      );
    }
    case 'slider': {
      const min = Number(p.min) || 0;
      const max = Number(p.max) || 100;
      const val = typeof value === 'number' ? value : min;
      const caption = subst(p.label, row);
      const control = (
        <input
          className={caption ? 'mw-slider' : cls}
          type="range"
          min={min}
          max={max}
          step={Number(p.step) || 1}
          value={val}
          onChange={(e) => {
            runtime?.setKey(bind, Number(e.target.value));
            fire('change');
          }}
          onPointerDown={editGuard}
        />
      );
      if (!caption) return control;
      return (
        <div className={`${cls} mw-slider-field`}>
          <div className="mw-progress-label">
            <span>{caption}</span>
            {mode === 'run' ? <span>{val}</span> : null}
          </div>
          {control}
        </div>
      );
    }
    case 'datepicker':
      return (
        <input
          className={cls}
          type="date"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => {
            runtime?.setKey(bind, e.target.value);
            fire('change');
          }}
          onPointerDown={editGuard}
        />
      );
    case 'navbar': {
      const items = asList(p.items);
      return (
        <nav className={cls}>
          <span className="mw-nav-brand">{asText(p.brand, doc.name)}</span>
          <span className="mw-nav-items">
            {items.map((item) => (
              <button
                key={item}
                type="button"
                className="mw-nav-item"
                onClick={() => {
                  if (mode !== 'run' || !runtime) return;
                  const target = screenSlugForLabel(runtime.screens, item);
                  if (target) runtime.navigate(target);
                  fire('tap');
                }}
              >
                {item}
              </button>
            ))}
          </span>
          <Icon name="menu" size={18} />
        </nav>
      );
    }
    case 'bottomnav': {
      const items = asList(p.items);
      return (
        <nav className={cls}>
          {items.map((item, i) => (
            <button
              key={item}
              type="button"
              className="mw-nav-item"
              style={{
                display: 'inline-flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 3,
                fontSize: 11,
                color:
                  i === 0 ? 'var(--openui-text-brand)' : 'var(--openui-text-secondary)',
              }}
              onClick={() => {
                if (mode !== 'run' || !runtime) return;
                const target = screenSlugForLabel(runtime.screens, item);
                if (target) runtime.navigate(target);
                fire('tap');
              }}
            >
              <Icon name={['home', 'grid', 'settings'][i % 3]} size={20} />
              <span>{item}</span>
            </button>
          ))}
        </nav>
      );
    }
    case 'link':
      return (
        <span
          className={cls}
          onClick={(e) => {
            if (mode === 'run') {
              e.stopPropagation();
              if (runtime) {
                const to = asText(p.to);
                if (to) runtime.navigate(to);
                runActions(node.events?.tap, runtime);
              }
            }
          }}
        >
          {subst(p.text, row)}
          <Icon name="chevron-right" size={14} />
        </span>
      );
    case 'fab':
      return (
        <button
          type="button"
          className={cls}
          onClick={(e) => {
            if (mode === 'run') e.stopPropagation();
            fire('tap');
          }}
          aria-label="Action"
        >
          <Icon name={p.icon} size={24} />
        </button>
      );
    case 'list': {
      const rows = dataRows(node, doc, activeScreen);
      const items = (rows.length ? rows : fallbackRows(node)).slice(0, 5);
      return (
        <div className={`${cls}${p.divider ? ' mw-list-divided' : ''}`} {...tapProps}>
          {items.map((r, i) => {
            const keys = Object.keys(r);
            const title = String(r.title ?? r.name ?? r[keys[0]] ?? 'Item');
            const sub = String(r.detail ?? r.subtitle ?? r[keys[1]] ?? '');
            const tail = String(r.meta ?? r.value ?? r[keys[2]] ?? '');
            if (node.props.itemTemplate) {
              return (
                <div
                  className="mw-row-item"
                  key={i}
                  onClick={(e) => {
                    if (mode === 'run' && runtime) {
                      e.stopPropagation();
                      runtime.setKey('selected_row', title);
                      runActions(node.events?.tap, runtime);
                    }
                  }}
                >
                  <div className="mw-row-main">
                    <div className="mw-row-title">{subst(title, r)}</div>
                    {sub && <div className="mw-row-sub">{subst(sub, r)}</div>}
                  </div>
                  {tail && <span className="mw-row-value">{subst(tail, r)}</span>}
                  <Icon name="chevron-right" size={16} />
                </div>
              );
            }
            return (
              <div
                className="mw-row-item"
                key={i}
                onClick={(e) => {
                  if (mode === 'run' && runtime) {
                    // The row *is* the tap target here; do not let the list
                    // above it fire the same action a second time.
                    e.stopPropagation();
                    runtime.setKey('selected_row', title);
                    runActions(node.events?.tap, runtime);
                  }
                }}
              >
                <div className="mw-row-main">
                  <div className="mw-row-title">{title}</div>
                  {sub && <div className="mw-row-sub">{sub}</div>}
                </div>
                {tail && <span className="mw-row-value">{tail}</span>}
                <Icon name="chevron-right" size={16} />
              </div>
            );
          })}
          {!items.length && <div className="mw-empty">No rows yet.</div>}
        </div>
      );
    }
    case 'table': {
      const columns = asList(p.columns);
      const rows = dataRows(node, doc, activeScreen);
      const items = (rows.length ? rows : fallbackRows(node, 3)).slice(0, 10);
      const cols = columns.length ? columns : ['Name', 'Value', 'Status'];
      return (
        <div className={cls} {...tapProps}>
          <div className="mw-table-head">
            {cols.map((c) => (
              <span className="mw-table-cell" key={c}>
                {c}
              </span>
            ))}
          </div>
          {items.map((r, i) => (
            <div className="mw-table-row" key={i}>
              {cols.map((c, ci) => {
                const key = c.toLowerCase().replace(/\s+/g, '_');
                const val = r[key] ?? r[c] ?? r[Object.keys(r)[ci] ?? ''] ?? '';
                return (
                  <span className="mw-table-cell" key={c}>
                    {String(val)}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      );
    }
    case 'stat':
      return (
        <div className={cls} {...tapProps}>
          <span style={{ fontSize: 12, color: 'var(--openui-text-secondary)' }}>
            {subst(p.label, row)}
          </span>
          <span
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: 'var(--openui-text-primary)',
              letterSpacing: '-0.02em',
            }}
          >
            {subst(p.value, row)}
          </span>
          {Boolean(p.delta) && (
            <span
              style={{ fontSize: 12, fontWeight: 600, color: 'var(--openui-success-text)' }}
            >
              {subst(p.delta, row)}
            </span>
          )}
        </div>
      );
    case 'chart': {
      const points = chartPoints(node, doc, activeScreen);
      const max = Math.max(...points.map((pt) => pt.value), 1);
      if (asText(p.kind) === 'line' || asText(p.kind) === 'spark') {
        const w = 240;
        const h = 72;
        const step = points.length > 1 ? w / (points.length - 1) : w;
        const line = points
          .map(
            (pt, i) =>
              `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(h - (pt.value / max) * (h - 8) - 4).toFixed(1)}`,
          )
          .join(' ');
        return (
          <svg
            className={cls}
            viewBox={`0 0 ${w} ${h}`}
            preserveAspectRatio="none"
            style={{ height: 96 }}
            {...tapProps}
          >
            <path
              d={line}
              fill="none"
              stroke="var(--openui-accent)"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            {asText(p.kind) === 'spark' && (
              <path
                d={`${line} L${w},${h} L0,${h} Z`}
                fill="var(--openui-accent)"
                opacity="0.14"
              />
            )}
          </svg>
        );
      }
      return (
        <div className={cls} {...tapProps}>
          <div className="mw-chart">
            {points.map((pt, i) => (
              <div
                className="mw-chart-bar"
                key={`${pt.label}-${i}`}
                style={{ height: `${Math.max(6, (pt.value / max) * 100)}%` }}
                title={`${pt.label}: ${pt.value}`}
              />
            ))}
          </div>
        </div>
      );
    }
    case 'hero':
      return (
        <div className={cls} {...tapProps}>
          {imageSrc && (
            <img
              className="mw-hero-img"
              src={imageSrc}
              alt={asText(p.title, 'Hero')}
              draggable={false}
            />
          )}
          {Boolean(p.title) && (
            <div
              style={{
                fontFamily: 'var(--font-heading)',
                fontSize: 'clamp(24px, 3.4cqw + 12px, 40px)',
                fontWeight: 700,
                lineHeight: 1.12,
                letterSpacing: '-0.025em',
                color: 'inherit',
              }}
            >
              {subst(p.title, row)}
            </div>
          )}
          {Boolean(p.subtitle) && (
            <div style={{ fontSize: 15, lineHeight: 1.55, opacity: 0.88, maxWidth: 560 }}>
              {subst(p.subtitle, row)}
            </div>
          )}
          {renderChildren()}
        </div>
      );
    case 'section':
      return (
        <section className={cls} {...tapProps}>
          {Boolean(p.title) && (
            <div
              style={{ fontSize: 16, fontWeight: 700, color: 'var(--openui-text-primary)' }}
            >
              {subst(p.title, row)}
            </div>
          )}
          {renderChildren()}
        </section>
      );
    case 'card':
      return (
        <div className={cls} {...tapProps}>
          {imageSrc && (
            <img
              className="mw-hero-img"
              src={imageSrc}
              alt={asText(p.title, 'Card image')}
              draggable={false}
            />
          )}
          {Boolean(p.title) && (
            <div
              style={{ fontSize: 15, fontWeight: 700, color: 'var(--openui-text-primary)' }}
            >
              {subst(p.title, row)}
            </div>
          )}
          {renderChildren()}
        </div>
      );
    case 'form':
      return (
        <form
          className={cls}
          onSubmit={(e) => {
            e.preventDefault();
            if (mode !== 'run' || !runtime) return;
            runActions(node.events?.submit, runtime);
            runtime.toast('Submitted');
          }}
        >
          {renderChildren()}
          {mode === 'run' && (
            <button
              type="submit"
              className="mw-tab"
              style={{
                minHeight: 44,
                background: 'var(--openui-accent)',
                color: 'var(--openui-text-on-accent)',
                fontSize: 15,
                borderRadius: 'var(--radius-button)',
              }}
            >
              {asText(p.submitLabel, 'Submit')}
            </button>
          )}
        </form>
      );
    default:
      break;
  }

  return <div className={cls}>{renderChildren()}</div>;
}
