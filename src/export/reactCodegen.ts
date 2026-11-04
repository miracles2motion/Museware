// Exported local paths must be relative, never absolute /paths: subpath hosting is supported.
import motionSource from '../canvas/motion.js?raw';
import revealSource from '../canvas/reveal.js?raw';
import { auditCodegen } from './auditCodegen';
import type { ComponentNode, ProjectDoc, ScreenDoc, Action } from '../types/tree';
import { materializeCss, screenLookVariables } from '../design/materialize';
import { projectAppearance } from '../design/projectAppearance';
import { generateFullCss, nodeClass } from '../canvas/cssGen';
import { ICON_NAMES, defaultPropsFor } from '../types/library';
import { accordionItems, marqueeItems } from '../types/editorial';

const pascal = (id: string) =>
  id
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('') || 'Screen';

const jsxText = (value: unknown): string => {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\{/g, '&#123;')
    .replace(/\}/g, '&#125;');
};

const str = (value: unknown) => JSON.stringify(value === undefined ? '' : value);

// Match the editor/Run list vocabulary for both legacy comma text and arrays.
const asList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map(String)
    : typeof value === 'string'
      ? value
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      : [];

function actionsCode(actions: Action[] | undefined): string {
  if (!actions || !actions.length) return '';
  return `run(${JSON.stringify(actions)})`;
}

function bindValue(key: string): string {
  return `String(state[${str(key)}] ?? '')`;
}

function iconName(node: ComponentNode): string {
  const name = String(node.props.icon ?? node.props.name ?? 'star');
  return (ICON_NAMES as readonly string[]).includes(name) ? name : 'star';
}

function attrEvents(node: ComponentNode, event: 'tap' | 'change' | 'submit'): string {
  const code = actionsCode(node.events?.[event]);
  return code ? code : '';
}

function renderChildren(
  node: ComponentNode,
  indent: number,
  screens: ScreenDoc[],
  screen?: ScreenDoc,
): string {
  return node.children
    .map((child) => renderNode(child, indent, screens, screen))
    .join('\n');
}

function renderLeaf(
  node: ComponentNode,
  indent: number,
  screens: ScreenDoc[],
  screen: ScreenDoc,
): string {
  const pad = '  '.repeat(indent);
  const cls = nodeClass(node.id);
  const p = [
    'button',
    'progress',
    'slider',
    'bottomnav',
    'checkbox',
    'switch',
    'list',
    'chart',
  ].includes(node.type)
    ? ({ ...defaultPropsFor(node.type), ...node.props } as Record<string, unknown>)
    : (node.props as Record<string, unknown>);
  const tap = attrEvents(node, 'tap');
  const change = attrEvents(node, 'change');
  const bind =
    typeof p.dataKey === 'string' && p.dataKey
      ? p.dataKey
      : typeof p.bindKey === 'string'
        ? p.bindKey
        : '';
  const data =
    bind && screen.mockData && Object.hasOwn(screen.mockData, bind)
      ? screen.mockData[bind]
      : undefined;
  switch (node.type) {
    case 'heading':
      return `${pad}<h${Math.min(6, Math.max(1, Number(p.level) || 2))} className={${str(cls)}}>${jsxText(p.text)}</h${Math.min(
        6,
        Math.max(1, Number(p.level) || 2),
      )}>`;
    case 'text':
      return `${pad}<p className={${str(cls)}}>${jsxText(p.text)}</p>`;
    case 'label':
      return `${pad}<span className={${str(cls)}}>${jsxText(p.text)}</span>`;
    case 'badge':
      return `${pad}<span className={${str(cls)}}>${jsxText(p.text)}</span>`;
    case 'divider':
      return `${pad}<div className={${str(cls)}} />`;
    case 'icon':
      return `${pad}<span className={${str(cls)}}><Icon name=${str(iconName(node))} size={${Number(p.size) || 20}} /></span>`;
    case 'image':
      return p.src || p.image
        ? `${pad}<img className={${str(cls)}} src=${str(p.src || p.image)} alt=${str(p.alt || '')} style={{ width: '100%', objectFit: ${str(p.fit || 'cover')} }} />`
        : `${pad}<div className={${str(cls)}} />`;
    case 'avatar':
      return `${pad}<span className={${str(cls)}} style={{ width: ${Number(p.size) || 44}, height: ${Number(p.size) || 44}, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>${jsxText(p.initials)}</span>`;
    case 'progress': {
      const value = Math.max(0, Math.min(100, Number(p.value) || 0));
      const current = `Math.max(0, Math.min(100, Number(state[${str(typeof p.bindKey === 'string' ? p.bindKey : '')}] ?? ${value}) || 0))`;
      const label =
        p.label || p.bindKey
          ? `<div className="mw-progress-label"><span>${jsxText(p.label || 'Progress')}</span><span>{${current}}%</span></div>`
          : '';
      return `${pad}<div className={${str(cls)}}>${label}<div className="mw-progress-track"><div className="mw-progress-fill" style={{ width: String(${current}) + '%' }} /></div></div>`;
    }
    case 'spinner':
      return `${pad}<span className="mw-spinner" />`;
    case 'button':
      return `${pad}<button type="button" className={${str(cls)}} disabled={${Boolean(p.disabled)}}${p.disabled ? ' data-disabled="true"' : ''} onClick={() => ${tap || 'undefined'}}>${p.icon ? `<Icon name=${str(iconName(node))} size={16} />` : ''}${jsxText(p.text)}</button>`;
    case 'iconbutton':
      return `${pad}<button type="button" className={${str(cls)}} onClick={() => ${tap || 'undefined'}} aria-label=${str(iconName(node))}><Icon name=${str(iconName(node))} size={20} /></button>`;
    case 'input':
      return `${pad}<input className={${str(cls)}} type=${str(p.inputType === 'phone' ? 'tel' : p.inputType === 'number' || p.inputType === 'password' ? p.inputType : 'text')} placeholder=${str(p.placeholder || '')} value={${bindValue(bind)}} onChange={(e) => setKey(${str(bind)}, e.target.value)}${change ? ` onBlur={() => ${change}} onKeyDown={(e) => { if (e.key === 'Enter') ${change}; }}` : ''} />`;
    case 'textarea':
      return `${pad}<textarea className={${str(cls)}} rows={${Number(p.rows) || 4}} placeholder=${str(p.placeholder || '')} value={${bindValue(bind)}} onChange={(e) => setKey(${str(bind)}, e.target.value)}${change ? ` onBlur={() => ${change}} onKeyDown={(e) => { if (e.key === 'Enter') ${change}; }}` : ''} />`;
    case 'select': {
      const options = asList(p.options);
      return `${pad}<select className={${str(cls)}} value={${bindValue(bind)}} onChange={(e) => { setKey(${str(bind)}, e.target.value); ${change || ''} }}><option value="">${jsxText(p.placeholder || 'Choose…')}</option>${options
        .map((o) => `<option value=${str(o)}>${jsxText(o)}</option>`)
        .join('')}</select>`;
    }
    case 'checkbox':
    case 'switch': {
      const stateKey = typeof p.bindKey === 'string' ? p.bindKey : '';
      const on = `Boolean(state[${str(stateKey)}])`;
      const visual =
        node.type === 'switch'
          ? `<span className="mw-switch" data-on={${on}} aria-hidden="true"><span className="mw-switch-track"><span className="mw-switch-thumb" /></span></span>`
          : `<span className="mw-check" data-on={${on}} aria-hidden="true">{${on} && <Icon name="check" size={12} strokeWidth={3} />}</span>`;
      return `${pad}<label className={${str(cls)}}><input className="mw-accessible-toggle" type="checkbox"${node.type === 'switch' ? ' role="switch"' : ''} checked={${on}} onChange={(e) => { setKey(${str(stateKey)}, e.target.checked); ${change || ''} }} />${visual}<span>${jsxText(p.label)}</span></label>`;
    }
    case 'slider': {
      const min = Number(p.min) || 0;
      const max = Number(p.max) || 100;
      const current = `typeof state[${str(bind)}] === 'number' ? Number(state[${str(bind)}]) : ${min}`;
      const caption = typeof p.label === 'string' ? p.label : '';
      const control = `<input className={${str(caption ? 'mw-slider' : cls)}} type="range" min={${min}} max={${max}} step={${Number(p.step) || 1}} value={${current}}${caption ? ` aria-label={${str(caption)}}` : ''} onChange={(e) => { setKey(${str(bind)}, Number(e.target.value)); ${change || ''} }} />`;
      return caption
        ? `${pad}<div className={${str(`${cls} mw-slider-field`)}}><div className="mw-progress-label"><span>${jsxText(caption)}</span><span>{${current}}</span></div>${control}</div>`
        : `${pad}${control}`;
    }
    case 'datepicker':
      return `${pad}<input className={${str(cls)}} type="date" value={${bindValue(bind)}} onChange={(e) => { setKey(${str(bind)}, e.target.value); ${change || ''} }} />`;
    case 'navbar': {
      const items = asList(p.items);
      const links = items
        .map(
          (item) =>
            `<button type="button" className="mw-nav-item" onClick={() => { go(${str(item)}); ${tap || ''} }}>${jsxText(item)}</button>`,
        )
        .join('');
      const cta = p.cta
        ? `<button type="button" className="mw-nav-cta" onClick={() => go(${str(p.ctaTo || '')})}>${jsxText(p.cta)}</button>`
        : '';
      return `${pad}<nav className={${str(`${cls} mw-nav`)}} data-variant=${str(p.variant || 'glass')}>
${pad}  <span className="mw-nav-brand">${jsxText(p.brand)}</span>
${pad}  <span className="mw-nav-items">${links}${cta}</span>
${pad}  <details className="mw-nav-menu"><summary aria-label="Toggle navigation menu">Menu</summary><div className="mw-nav-dropdown">${links}${cta}</div></details>
${pad}</nav>`;
    }
    case 'scene3d':
      return `${pad}<div className={${str(`${cls} mw-motion`)}}><MotionCanvas preset=${str(p.preset || 'globe')} speed={${Number(p.speed) || 1}} interactive={${Boolean(p.interactive)}} /><div className="mw-motion-overlay">${p.title ? `<h2>${jsxText(p.title)}</h2>` : ''}${p.subtitle ? `<p>${jsxText(p.subtitle)}</p>` : ''}</div></div>`;
    case 'video':
      return `${pad}<div className={${str(cls)}}><div className="mw-motion"><VideoContent src={${str(p.src || '')}} poster={${str(p.poster || '')}} autoplayMuted={${Boolean(p.autoplayMuted)}} /></div>${p.caption ? `<p>${jsxText(p.caption)}</p>` : ''}</div>`;
    case 'marquee': {
      const items = marqueeItems(p.items);
      const itemMarkup = items
        .map((item) => `<span className="mw-marquee-item">${jsxText(item)}</span>`)
        .join('');
      const speed = Math.min(120, Math.max(5, Number(p.speed) || 30));
      return `${pad}<div className={${str(`${cls} mw-marquee`)}} data-variant=${str(p.variant || 'wordmarks')} style={{ '--marquee-speed': '${speed}s' } as CSSProperties}>${p.label ? `<div>${jsxText(p.label)}</div>` : ''}<div className="mw-marquee-track"><div className="mw-marquee-group">${itemMarkup}</div><div className="mw-marquee-group" aria-hidden="true">${itemMarkup}</div></div></div>`;
    }
    case 'accordion': {
      const items = accordionItems(
        p.items,
        (data as Array<Record<string, unknown>> | undefined) || [],
      );
      return `${pad}<div className={${str(`${cls} mw-accordion`)}}>${items.map((item) => `<details><summary>${jsxText(item.question)}</summary><div className="mw-accordion-answer">${jsxText(item.answer)}</div></details>`).join('')}</div>`;
    }
    case 'bottomnav': {
      const items = asList(p.items);
      return `${pad}<nav className={${str(cls)}}>${items
        .map(
          (item, i) =>
            `<button type="button" className="mw-nav-item" style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 3, fontSize: 11, color: ${str(i === 0 ? 'var(--openui-text-brand)' : 'var(--openui-text-secondary)')} }} onClick={() => { go(${str(item)}); ${tap || ''} }}><Icon name=${str(['home', 'grid', 'settings'][i % 3])} size={20} /><span>${jsxText(item)}</span></button>`,
        )
        .join('')}</nav>`;
    }
    case 'link':
      return `${pad}<button type="button" className={${str(cls)}} onClick={() => { ${p.to ? `go(${str(p.to)});` : ''} ${tap || ''} }}>${jsxText(p.text)} <Icon name="chevron-right" size={14} /></button>`;
    case 'fab':
      return `${pad}<button type="button" className={${str(cls)}} onClick={() => ${tap || 'undefined'}}><Icon name=${str(iconName(node))} size={24} /></button>`;
    case 'list': {
      const rows = (data as Array<Record<string, unknown>> | undefined) || [];
      const items = rows.slice(0, 5);
      return `${pad}<div className={${str(`${cls}${p.divider ? ' mw-list-divided' : ''}`)}}>
${items
  .map((row, i) => {
    const keys = Object.keys(row);
    const title = row.title ?? row.name ?? row[keys[0]] ?? 'Item';
    const sub = row.detail ?? row.subtitle ?? row[keys[1]] ?? '';
    const tail = row.meta ?? row.value ?? row[keys[2]] ?? '';
    return `${pad}  <div className="mw-row-item" key={${i}} onClick={() => { setKey("selected_row", ${str(String(title))}); ${tap || ''} }}>
${pad}    <div className="mw-row-main"><div className="mw-row-title">${jsxText(title)}</div>${
      sub ? `<div className="mw-row-sub">${jsxText(sub)}</div>` : ''
    }</div>${tail ? `<span className="mw-row-value">${jsxText(tail)}</span>` : ''}<Icon name="chevron-right" size={16} />
${pad}  </div>`;
  })
  .join('\n')}
${!items.length ? `${pad}  <div className="mw-empty">No data yet</div>` : ''}
${pad}</div>`;
    }
    case 'table': {
      const configured = Array.isArray(p.columns)
        ? (p.columns as unknown[]).map(String)
        : typeof p.columns === 'string'
          ? p.columns
              .split(',')
              .map((v) => v.trim())
              .filter(Boolean)
          : ['Name', 'Value'];
      const columns = configured.length ? configured : ['Name', 'Value', 'Status'];
      const rows = ((data as Array<Record<string, unknown>> | undefined) || []).slice(
        0,
        10,
      );
      const liveUrl = typeof p.dataSourceUrl === 'string' ? p.dataSourceUrl.trim() : '';
      if (liveUrl) {
        return `${pad}<LiveCollection dataSourceUrl={${str(liveUrl)}} initialRows={${JSON.stringify(rows)}}>
${pad}  {(liveRows) => (
${pad}    <div className={${str(cls)}}>
${pad}      <div className="mw-table-head">${columns.map((c) => `<span className="mw-table-cell" data-col=${str(c.toLowerCase().trim())}>${jsxText(c)}</span>`).join('')}</div>
${pad}      {liveRows.map((row, i) => (
${pad}        <div className="mw-table-row" key={i}>
${columns.map((c, ci) => {
  const key = c.toLowerCase().replace(/\s+/g, '_');
  return `${pad}          <span className="mw-table-cell" data-col=${str(c.toLowerCase().trim())}>{String(row[${str(key)}] ?? row[${str(c)}] ?? row[Object.keys(row)[${ci}] ?? ''] ?? '')}</span>`;
}).join('\n')}
${pad}        </div>
${pad}      ))}
${pad}      {!liveRows.length && <div className="mw-empty">No data yet</div>}
${pad}    </div>
${pad}  )}
${pad}</LiveCollection>`;
      }
      return `${pad}<div className={${str(cls)}}>
${pad}  <div className="mw-table-head">${columns.map((c) => `<span className="mw-table-cell" data-col=${str(c.toLowerCase().trim())}>${jsxText(c)}</span>`).join('')}</div>
${rows
  .map(
    (row) =>
      `${pad}  <div className="mw-table-row">${columns
        .map((c, ci) => {
          const key = c.toLowerCase().replace(/\s+/g, '_');
          const value = row[key] ?? row[c] ?? row[Object.keys(row)[ci] ?? ''] ?? '';
          return `<span className="mw-table-cell" data-col=${str(c.toLowerCase().trim())}>${jsxText(String(value))}</span>`;
        })
        .join('')}</div>`,
  )
  .join('\n')}
${!rows.length ? `${pad}  <div className="mw-empty">No data yet</div>` : ''}
${pad}</div>`;
    }
    case 'stat':
      return `${pad}<div className={${str(cls)}}><span style={{ fontSize: 12, opacity: 0.75 }}>${jsxText(p.label)}</span><span style={{ fontSize: 24, fontWeight: 700 }}>${jsxText(
        p.value,
      )}</span><span style={{ fontSize: 12, color: 'var(--openui-success-text)' }}>${jsxText(p.delta)}</span></div>`;
    case 'chart': {
      const rows = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
      if (!rows.length)
        return `${pad}<div className={${str(cls)}}><div className="mw-empty">No data yet</div></div>`;
      const valueKey = Object.keys(rows[0]).find((key) => typeof rows[0][key] === 'number');
      const labelKey = Object.keys(rows[0]).find((key) => typeof rows[0][key] === 'string');
      const points = rows.slice(0, 12).map((row) => ({
        value: valueKey ? Number(row[valueKey]) : 0,
        label: labelKey ? String(row[labelKey]) : '',
      }));
      const max = Math.max(...points.map((point) => point.value), 1);
      const onClick = tap ? ` onClick={() => ${tap}}` : '';
      if (p.kind === 'line' || p.kind === 'spark') {
        const w = 240,
          h = 72,
          step = points.length > 1 ? w / (points.length - 1) : w;
        const line = points
          .map(
            (point, i) =>
              `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(h - (point.value / max) * (h - 8) - 4).toFixed(1)}`,
          )
          .join(' ');
        const area =
          p.kind === 'spark'
            ? `<path d=${str(`${line} L${w},${h} L0,${h} Z`)} fill="var(--openui-accent)" opacity="0.14" />`
            : '';
        return `${pad}<svg className={${str(cls)}} viewBox="0 0 240 72" preserveAspectRatio="none" style={{ height: 96 }}${onClick}><path d=${str(line)} fill="none" stroke="var(--openui-accent)" strokeWidth="2.5" strokeLinecap="round" />${area}</svg>`;
      }
      return `${pad}<div className={${str(cls)}}${onClick}><div className="mw-chart">${points.map((point) => `<div className="mw-chart-bar" style={{ height: ${str(`${Math.max(6, (point.value / max) * 100)}%`)} }} title={${str(`${point.label}: ${point.value}`)}} />`).join('')}</div></div>`;
    }
    case 'hero': {
      const media = node.children.filter(
        (child) => child.type === 'image' || child.type === 'card',
      );
      const copy = node.children.filter(
        (child) => child.type !== 'image' && child.type !== 'card',
      );
      const hasMedia = Boolean(p.image || p.src || media.length);
      const browser = p.frame === 'browser';
      return `${pad}<div className={${str(`${cls} mw-hero`)}} data-layout=${str(p.layout || 'split')} data-surface=${str(p.surface || 'gradient')} data-frame=${str(p.frame || 'none')} data-has-media={${str(hasMedia)}}>
${pad}  <div className="mw-hero-copy">
${p.badge ? `${pad}    <span className="mw-hero-badge">${jsxText(p.badge)}</span>` : ''}
${pad}    <h1 className="mw-hero-title">${jsxText(p.title)}</h1>
${pad}    <p className="mw-hero-sub">${jsxText(p.subtitle)}</p>
${copy.map((child) => renderNode(child, indent + 2, screens, screen)).join('\n')}
${pad}  </div>
${
  hasMedia
    ? `${pad}  <div className="mw-hero-media"><div${browser ? ' className="mw-browser-frame"' : ''}>
${browser ? `${pad}    <div className="mw-browser-bar" aria-hidden="true"><span className="mw-browser-dot"/><span className="mw-browser-dot"/><span className="mw-browser-dot"/><span className="mw-browser-url"/></div>` : ''}
${p.image || p.src ? `${pad}    <img className="mw-hero-img" src=${str(p.image || p.src)} alt=${str(p.title || '')} />` : ''}
${media.map((child) => renderNode(child, indent + 2, screens, screen)).join('\n')}
${pad}  </div></div>`
    : ''
}
${pad}</div>`;
    }
    default:
      return `${pad}<div className={${str(cls)}}>${jsxText(p.text)}</div>`;
  }
}

function renderNode(
  node: ComponentNode,
  indent: number,
  screens: ScreenDoc[],
  screen?: ScreenDoc,
): string {
  const pad = '  '.repeat(indent);
  const cls = nodeClass(node.id);
  const children = renderChildren(node, indent + 1, screens, screen);
  const visible = node.visibleWhen
    ? `{${node.visibleWhen.equals === undefined ? `Boolean(state[${str(node.visibleWhen.key)}])` : `matchesValue(state[${str(node.visibleWhen.key)}], ${JSON.stringify(node.visibleWhen.equals)})`} && (`
    : '';
  const visibleClose = node.visibleWhen ? ')}' : '';
  const wrap = (inner: string) => `${pad}${visible}${inner}${visibleClose}`;
  const p = node.props as Record<string, unknown>;
  switch (node.type) {
    case 'screen':
      return wrap(`<div className={${str(cls)}}>\n${children}\n${pad}</div>`);
    case 'row':
    case 'col':
    case 'grid':
    case 'form':
      return wrap(
        `<${node.type === 'form' ? 'form' : 'section'} className={${str(cls)}}${node.type === 'col' && (p.role === 'footer' || p.role === 'nav') ? ` role=${str(p.role === 'footer' ? 'contentinfo' : 'navigation')}` : ''}${
          node.type === 'form'
            ? ` onSubmit={(e) => { e.preventDefault(); ${attrEvents(node, 'submit') || `run([{ type: 'toast', text: 'This form has no submit action yet.' }])`} }}`
            : ''
        }>\n${children}${node.type === 'form' ? `\n${pad}  <button type="submit" className="mw-tab" style={{ minHeight: 44, background: 'var(--openui-accent)', color: 'var(--openui-text-on-accent)', fontSize: 15, borderRadius: 'var(--radius-button)' }}>${jsxText(p.submitLabel || 'Submit')}</button>` : ''}\n${pad}</${node.type === 'form' ? 'form' : 'section'}>`,
      );
    case 'section': {
      const head =
        p.eyebrow || p.title || p.subtitle
          ? `<div className="mw-sec-head">${p.eyebrow ? `<span className="mw-sec-eyebrow">${jsxText(p.eyebrow)}</span>` : ''}${p.title ? `<h2 className="mw-sec-title">${jsxText(p.title)}</h2>` : ''}${p.subtitle ? `<p className="mw-sec-sub">${jsxText(p.subtitle)}</p>` : ''}</div>`
          : '';
      return wrap(
        `<section className={${str(`${cls} mw-section`)}}${p.role === 'footer' || p.role === 'nav' ? ` role=${str(p.role === 'footer' ? 'contentinfo' : 'navigation')}` : ''} ${['rise', 'fade', 'slide', 'scale'].includes(String(p.motion)) ? 'data-motion-reveal="" ' : ''}data-surface=${str(p.surface || 'plain')} data-align=${str(p.align || 'start')} data-bleed={${str(Boolean(p.bleed))}}>${head}\n${children}\n${pad}</section>`,
      );
    }
    case 'card': {
      const tag = node.type === 'card' ? 'div' : 'section';
      const tap = attrEvents(node, 'tap');
      const title = p.title
        ? `<div style={{ fontSize: ${node.type === 'card' ? 15 : 16}, fontWeight: 700, color: 'var(--openui-text-primary)' }}>${jsxText(p.title)}</div>`
        : '';
      const eyebrow = p.eyebrow
        ? `<span className="mw-sec-eyebrow">${jsxText(p.eyebrow)}</span>`
        : '';
      const image =
        node.type === 'card' && (p.image || p.src)
          ? `<img className="mw-hero-img" src=${str(p.image || p.src)} alt=${str(p.title || 'Card image')} />`
          : '';
      const cardAttrs =
        node.type === 'card'
          ? ` data-variant=${str(p.variant || 'elevated')} data-clickable={${str(Boolean(node.events?.tap?.length))}}`
          : '';
      const icon =
        node.type === 'card' && p.icon
          ? `<span className="mw-card-icon"><Icon name=${str(iconName(node))} size={20} /></span>`
          : '';
      return wrap(
        `<${tag} className={${str(node.type === 'card' ? `${cls} mw-card` : cls)}}${cardAttrs}${tap ? ` onClick={() => ${tap}}` : ''}>\n${icon}\n${image}\n${eyebrow}\n${title}\n${children}\n${pad}</${tag}>`,
      );
    }
    case 'tabs': {
      const items = asList(p.items);
      return wrap(
        `<TabsBlock>\n${pad}  ${children}\n${pad}</TabsBlock>`.replace(
          '<TabsBlock>',
          `<TabsBlock items={${JSON.stringify(items)}}${attrEvents(node, 'change') ? ` onChange={() => ${attrEvents(node, 'change')}}` : ''}>`,
        ),
      );
    }
    case 'hero':
    case 'list':
    case 'table':
    case 'chart':
      return wrap(renderLeaf(node, indent, screens, screen || screens[0]));
    default:
      return wrap(renderLeaf(node, indent, screens, screen || screens[0]));
  }
}

function screenModule(doc: ProjectDoc, screen: ScreenDoc): string {
  const name = pascal(screen.id);
  const body = renderNode(screen.root, 3, doc.screens, screen);
  const vars = screenLookVariables(screen.root.props);
  return `import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { armReveals } from '../reveal';
import { useApp, TabsBlock, matchesValue, LiveCollection } from '../runtime';
import { Icon } from '../icons';
import { MotionCanvas, VideoContent } from '../MotionCanvas';

export function ${name}Screen() {
  const { state, setKey, run, go } = useApp();
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => armReveals(root.current), []);
  void go;
  return (
    <div className="mw-site-frame">
      <div className="mw-app" ref={root} style={${JSON.stringify(vars)} as CSSProperties}>
${body}
      </div>
    </div>
  );
}
`;
}

export function generateProjectFiles(doc: ProjectDoc): Record<string, string> {
  const files: Record<string, string> = {};
  files['src/motion.js'] = motionSource;
  files['src/reveal.js'] = revealSource;
  files['src/reveal.d.ts'] =
    'export function armReveals(root: HTMLElement | null, options?: { noArm?: boolean }): () => void;\nexport function enterPanel(element: HTMLElement | null): void;';
  files['src/motion.d.ts'] =
    'export function mountMotion(canvas: HTMLCanvasElement, options?: { preset?: string; speed?: number; interactive?: boolean }): () => void;';
  files['src/MotionCanvas.tsx'] = `import { useEffect, useRef, useState } from 'react';
import { mountMotion } from './motion';
export function MotionCanvas({preset,speed,interactive}:{preset:string;speed?:number;interactive?:boolean}) { const ref=useRef<HTMLCanvasElement>(null); useEffect(()=>ref.current ? mountMotion(ref.current,{preset,speed,interactive}) : undefined,[preset,speed,interactive]); return <canvas ref={ref} aria-hidden="true"/>; }
export function VideoContent({src,poster,autoplayMuted}:{src:string;poster?:string;autoplayMuted?:boolean}) { const [failed,setFailed]=useState(false); if(src && !failed) return <video controls src={src} poster={poster || undefined} autoPlay={autoplayMuted} muted={autoplayMuted} playsInline onError={()=>setFailed(true)}/>; return <><MotionCanvas preset="reel"/><div className="mw-reel-controls"><button type="button" data-reel-toggle>Pause</button><input type="range" min="0" max="100" defaultValue="0" aria-label="Reel position" data-reel-scrub/></div>{failed && <span role="status">Video unavailable; showing a procedural reel.</span>}</>; }`;

  const entry = doc.screens.find((s) => s.entry) || doc.screens[0];
  const usedIcons = new Set<string>(['star']);
  for (const screen of doc.screens) {
    const walk = (node: ComponentNode) => {
      if (node.type === 'icon' || node.type === 'iconbutton' || node.type === 'fab')
        usedIcons.add(iconName(node));
      if (node.type === 'list') usedIcons.add('chevron-right');
      if (node.type === 'card' && node.props.icon) usedIcons.add(iconName(node));
      node.children.forEach(walk);
    };
    walk(screen.root);
  }
  files['src/icons.tsx'] = `import * as L from 'lucide-react';

const MAP: Record<string, L.LucideIcon> = {
${Array.from(usedIcons)
  .map((name) => {
    const cmp = name
      .split('-')
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join('')
      .replace('CheckCircle', 'CheckCircle2')
      .replace('Grid3x3', 'Grid3x3')
      .replace('Share2', 'Share2');
    return `  ${str(name)}: L.${cmp},`;
  })
  .join('\n')}
};

export function Icon({ name, size = 20, strokeWidth = 1.9 }: { name: string; size?: number; strokeWidth?: number }) {
  const Cmp = MAP[name] || L.Star;
  return <Cmp size={size} strokeWidth={strokeWidth} aria-hidden />;
}
`;

  files['src/runtime.tsx'] =
    `import { Children, createContext, useContext, useState, useRef, useLayoutEffect, type ReactNode } from 'react';
import { enterPanel } from './reveal';
import type { Action } from './types';

export function matchesValue(actual: unknown, expected: unknown): boolean {
  if (expected === true || expected === 'true') return Boolean(actual);
  if (expected === false || expected === 'false') return !actual;
  const numeric = (v: unknown) => (typeof v === 'number' && Number.isFinite(v)) ||
    (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)));
  if (numeric(actual) && numeric(expected)) return Number(actual) === Number(expected);
  return String(actual ?? '') === String(expected ?? '');
}

export function interpolateTokens(template: string, state: Record<string, unknown>): string {
  if (!template || typeof template !== 'string') return '';
  return template.replace(/\\{([a-zA-Z0-9_.-]+)\\}/g, (_, key) => {
    const val = state[key];
    if (val === undefined || val === null) return '';
    return encodeURIComponent(String(val));
  });
}

export interface AppApi {
  screen: string;
  state: Record<string, unknown>;
  setKey: (key: string, value: unknown) => void;
  clearKeys?: (keys: string[]) => void;
  navigate: (to: string) => void;
  go: (labelOrId: string) => void;
  toast: (text: string) => void;
  run: (actions?: Action[]) => void;
}

export const SCREENS = ${JSON.stringify(doc.screens.map((s) => ({ id: s.id, name: s.name })))};

export function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

export const AppContext = createContext<{
  api: AppApi;
  setScreen: (id: string) => void;
  toastText: string | null;
} | null>(null);

export function useApp(): AppApi {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('AppContext missing');
  return ctx.api;
}

export function useToastText(): string | null {
  return useContext(AppContext)?.toastText ?? null;
}

export function useSetScreen(): (id: string) => void {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('AppContext missing');
  return ctx.setScreen;
}

export function LiveCollection({
  dataSourceUrl,
  initialRows,
  children,
}: {
  dataSourceUrl?: string;
  initialRows: Record<string, unknown>[];
  children: (rows: Record<string, unknown>[]) => ReactNode;
}) {
  const [rows, setRows] = useState(initialRows);
  useLayoutEffect(() => {
    if (!dataSourceUrl) return;
    let active = true;
    fetch(dataSourceUrl)
      .then((r) => r.json())
      .then((data) => {
        if (active && Array.isArray(data) && data.length) setRows(data);
      })
      .catch((err) => console.warn('Live data sync skipped:', err));
    return () => {
      active = false;
    };
  }, [dataSourceUrl]);
  return <>{children(rows)}</>;
}

export function TabsBlock({ items, children, onChange }: { items: string[]; children: ReactNode; onChange?: () => void }) {
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const previous = useRef(active);
  useLayoutEffect(() => {
    if (previous.current !== active) enterPanel(root.current?.lastElementChild as HTMLElement | null);
    previous.current = active;
  }, [active]);
  return (
    <div ref={root}>
      <div className="mw-tab-strip">
        {items.map((item, i) => (
          <button key={item} className="mw-tab" data-active={i === active} onClick={() => { setActive(i); onChange?.(); }}>{item}</button>
        ))}
      </div>
      {Children.toArray(children)[active] ?? children}
    </div>
  );
}
`;

  files['src/App.tsx'] =
    `import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { enterPanel } from './reveal';
import { AppContext, SCREENS, slug, matchesValue, interpolateTokens } from './runtime';
import type { Action } from './types';
${doc.screens.map((s) => `import { ${pascal(s.id)}Screen } from './screens/${pascal(s.id)}';`).join('\n')}

const SCREEN_COMPONENTS = {
${doc.screens.map((s) => `  ${str(s.id)}: ${pascal(s.id)}Screen,`).join('\n')}
};

const START = ${str(entry?.id || '')};

export default function App() {
  const [screen, setScreen] = useState(START);
  const previousScreen = useRef(screen);
  useLayoutEffect(() => {
    if (previousScreen.current !== screen) enterPanel(document.querySelector<HTMLElement>('.mw-app'));
    previousScreen.current = screen;
  }, [screen]);
  const [state, setState] = useState<Record<string, unknown>>({});
  const [toastText, setToastText] = useState<string | null>(null);

  const api = useMemo(() => {
    const api = {
      screen,
      state,
      setKey: (key: string, value: unknown) => setState((s) => ({ ...s, [key]: value })),
      clearKeys: (keys: string[]) => setState((s) => {
        const next = { ...s };
        for (const k of keys) delete next[k];
        return next;
      }),
      navigate: (to: string) => {
        api.go(to);
      },
      go: (target: string) => {
        const normalized = slug(target);
        const match = SCREENS.find((s) => s.id === target) || (normalized && SCREENS.find((s) => s.id === normalized || s.id.includes(normalized) || s.name.toLowerCase() === target.toLowerCase()));
        if (match) setScreen(match.id);
        else if (target) api.toast('No screen called “' + target + '” yet.');
      },
      toast: (text: string) => {
        setToastText(text);
        window.setTimeout(() => setToastText(null), 3200);
      },
      run: (actions?: Action[]) => {
        if (!actions) return;
        for (const a of actions) {
          if (a.type === 'navigate') api.navigate(a.to);
          else if (a.type === 'setState') api.setKey(a.key, a.value);
          else if (a.type === 'toggle') api.setKey(a.key, !api.state[a.key]);
          else if (a.type === 'toast') api.toast(interpolateTokens(a.text, api.state));
          else if (a.type === 'openUrl') {
            const url = interpolateTokens(a.url, api.state);
            window.open(url, a.target || '_blank', 'noopener,noreferrer');
          }
          else if (a.type === 'submitWebhook') {
            const method = a.method || 'POST';
            const url = interpolateTokens(a.url, api.state);
            const isGoogle = /script\\.google\\.com/i.test(url);
            const mode = a.mode || (isGoogle ? 'no-cors' : 'cors');
            const headers: Record<string, string> = { ...(a.headers || {}) };
            let body: BodyInit | undefined = undefined;
            if (method === 'POST') {
              if (mode === 'no-cors' || isGoogle) {
                const params = new URLSearchParams();
                for (const [k, v] of Object.entries(api.state)) {
                  if (v !== undefined && v !== null) params.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
                }
                body = params.toString();
                headers['Content-Type'] = 'application/x-www-form-urlencoded';
              } else {
                body = JSON.stringify(api.state);
                if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
              }
            }
            try {
              fetch(url, { method, mode, headers: Object.keys(headers).length ? headers : undefined, body })
                .then((res) => {
                  if (mode === 'no-cors' || res.ok || res.type === 'opaque') {
                    api.toast(interpolateTokens(a.successToast || 'Submitted successfully!', api.state));
                    if (a.clearOnSuccess !== false && api.clearKeys) api.clearKeys(Object.keys(api.state));
                    if (a.navigateOnSuccess) api.navigate(a.navigateOnSuccess);
                  } else {
                    api.toast(interpolateTokens(a.errorToast || ('Submission failed (' + res.status + ')'), api.state));
                  }
                })
                .catch((err) => {
                  console.warn('Webhook dispatch failed:', err);
                  api.toast(interpolateTokens(a.errorToast || 'Submission failed. Check network connection.', api.state));
                });
            } catch (err) {
              console.warn('Webhook dispatch exception:', err);
              api.toast(interpolateTokens(a.errorToast || 'Submission failed.', api.state));
            }
          }
          else if (a.type === 'when') {
            const current = api.state[a.key];
            const matches = a.equals === undefined ? Boolean(current) : matchesValue(current, a.equals);
            if (matches) api.run(a.then);
          }
        }
      },
    };
    return api;
  }, [screen, state]);

  useLayoutEffect(() => {
    const appearance = ${str(projectAppearance(doc.tokens.openuiTheme.theme_mode))};
    const systemLight = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: light)') : null;
    const syncTheme = () => { document.documentElement.dataset.theme = appearance === 'auto' ? (systemLight?.matches ? 'light' : 'dark') : appearance; };
    syncTheme();
    if (appearance !== 'auto' || !systemLight) return;
    if (systemLight.addEventListener) {
      systemLight.addEventListener('change', syncTheme);
      return () => systemLight.removeEventListener('change', syncTheme);
    }
    systemLight.addListener(syncTheme);
    return () => systemLight.removeListener(syncTheme);
  }, []);

  const Screen = SCREEN_COMPONENTS[screen as keyof typeof SCREEN_COMPONENTS] || SCREEN_COMPONENTS[START as keyof typeof SCREEN_COMPONENTS];
  return (
    <AppContext.Provider value={{ api, setScreen, toastText }}>
      <Screen />
      {toastText && <div className="toast">{toastText}</div>}
    </AppContext.Provider>
  );
}
`;

  files['src/types.ts'] = `export type Action =
  | { type: 'navigate'; to: string }
  | { type: 'setState'; key: string; value: unknown }
  | { type: 'toggle'; key: string }
  | { type: 'toast'; text: string }
  | { type: 'openUrl'; url: string; target?: '_blank' | '_self' }
  | {
      type: 'submitWebhook';
      url: string;
      method?: 'POST' | 'GET';
      mode?: 'cors' | 'no-cors';
      headers?: Record<string, string>;
      successToast?: string;
      errorToast?: string;
      navigateOnSuccess?: string;
      clearOnSuccess?: boolean;
    }
  | { type: 'when'; key: string; equals?: unknown; then: Action[] };
`;

  for (const screen of doc.screens) {
    files[`src/screens/${pascal(screen.id)}.tsx`] = screenModule(doc, screen);
  }
  files['src/screens/index.ts'] = doc.screens
    .map((s) => `export { ${pascal(s.id)}Screen } from './${pascal(s.id)}';`)
    .join('\n');

  files['src/main.tsx'] = `import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './tokens.css';
import './nodes.css';
import './app.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}
`;

  files['src/tokens.css'] =
    `${materializeCss(doc.tokens)}\n:root{color-scheme:light dark}\n[data-theme="dark"],html.dark{color-scheme:dark}\n`;
  files['src/nodes.css'] =
    `/* Generated from the Museware tree — do not hand-edit. */\n.mw-site-frame{width:100%;max-width:${doc.kind === 'web' ? '1280px' : '480px'};margin:0 auto;container-type:inline-size;container-name:mw}.mw-app{${doc.kind === 'web' ? 'min-height:100vh' : 'height:100vh;overflow-y:auto'};margin:0 auto;width:100%;max-width:${doc.kind === 'web' ? '1280px' : '480px'};background:var(--openui-bg);color:var(--openui-text-primary);container-type:inline-size;container-name:mw;font-family:var(--font-body)}\n${generateFullCss(doc, { scrollModel: 'web' })}\n`;
  files['src/app.css'] =
    `.hero-title{font-family:var(--font-heading);font-size:clamp(24px,4cqw + 14px,40px);font-weight:700;line-height:1.12;letter-spacing:-0.02em;margin:0;color:inherit}\n.hero-sub{font-size:15px;line-height:1.55;margin:0;opacity:.9;max-width:560px}\n.toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:var(--openui-elevated);color:var(--openui-text-primary);border:1px solid var(--openui-border-default);border-radius:12px;padding:10px 16px;font-size:13px;box-shadow:0 12px 32px rgba(0,0,0,.22);z-index:50}\nbody{margin:0}\n.mw-accessible-toggle{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}.mw-accessible-toggle:focus-visible + :is(.mw-check,.mw-switch){outline:2px solid var(--openui-border-accent);outline-offset:3px}\n`;

  files['index.html'] = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${jsxText(doc.name)}</title>
    <link rel="icon" href="./icon.svg" />
    <meta name="theme-color" content="${doc.tokens.openuiTheme.brand_color}" />
    <link rel="manifest" href="./manifest.webmanifest" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./src/main.tsx"></script>
  </body>
</html>
`;

  files['package.json'] = `${JSON.stringify(
    {
      name: doc.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'museware-app',
      private: true,
      version: '1.0.0',
      type: 'module',
      scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
      dependencies: { react: '18.3.1', 'react-dom': '18.3.1', 'lucide-react': '0.462.0' },
      devDependencies: {
        '@types/react': '18.3.12',
        '@types/react-dom': '18.3.1',
        '@vitejs/plugin-react': '4.3.4',
        typescript: '5.5.4',
        vite: '5.4.21',
      },
    },
    null,
    2,
  )}\n`;

  files['vite.config.ts'] = `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({ base: './', plugins: [react()], build: { target: 'es2022' } });
`;
  files['tsconfig.json'] = `${JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        lib: ['ES2022', 'DOM', 'DOM.Iterable'],
        module: 'ESNext',
        moduleResolution: 'bundler',
        jsx: 'react-jsx',
        strict: true,
        noEmit: true,
        skipLibCheck: true,
      },
      include: ['src'],
    },
    null,
    2,
  )}\n`;

  files['README.md'] = `# ${doc.name}

Built with **Museware** — every change on this canvas is an undoable op.

## Run it

\`\`\`bash
npm install
npm run dev
\`\`\`

## Publish on GitHub Pages

1. Create a repository at https://github.com/new and upload the extracted React zip contents, including the hidden .github folder.
2. In the repository, open Settings → Pages and set Source to **GitHub Actions**.
3. The included workflow builds and publishes the site on every push to main. GitHub shows the site URL under Pages when deployment finishes.

## Install as an app

The bundle ships a manifest and a one-file service worker. Deploy the build
(\`npm run build\`) over https, open it on a phone, and use **Add to home screen**.
Optional native wrap: \`npx cap add android && npx cap open android\` (Capacitor),
out of demo scope but the tree is portable.

## What is inside

- \`src/tokens.css\` — the design system as CSS custom properties (light + dark).
- \`src/nodes.css\` — generated per-node classes with container queries.
- \`src/screens/\` — one component per screen, rendered from the same tree.
- \`src/runtime.tsx\` — the 40-line action runtime (navigate / state / toast / when).
`;

  files['.github/workflows/deploy.yml'] = [
    'name: Deploy to GitHub Pages',
    'on:',
    '  push:',
    '    branches: [main]',
    '  workflow_dispatch:',
    'permissions:',
    '  contents: read',
    '  pages: write',
    '  id-token: write',
    'concurrency:',
    '  group: pages',
    '  cancel-in-progress: false',
    'jobs:',
    '  build:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - uses: actions/checkout@v4',
    '      - uses: actions/setup-node@v4',
    '        with:',
    '          node-version: 20',
    '      - run: npm install',
    '      - run: npm run build',
    '      - uses: actions/configure-pages@v5',
    '      - uses: actions/upload-pages-artifact@v3',
    '        with:',
    '          path: ./dist',
    '  deploy:',
    '    needs: build',
    '    runs-on: ubuntu-latest',
    '    environment:',
    '      name: github-pages',
    '      url: ${{ steps.deployment.outputs.page_url }}',
    '    steps:',
    '      - id: deployment',
    '        uses: actions/deploy-pages@v4',
    '',
  ].join('\n');

  files['icon.svg'] =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="22" fill="${doc.tokens.openuiTheme.brand_color}"/><path d="M22.5 73.5V28.5C22.5 23.52 26.52 19.5 31.5 19.5H33.6C37.5 19.5 40.8 21.6 42.6 24.9L48 33.6L53.4 24.9C55.2 21.6 58.5 19.5 62.4 19.5H64.5C69.48 19.5 73.5 23.52 73.5 28.5V73.5C73.5 75.99 71.49 78 69 78C66.51 78 64.5 75.99 64.5 73.5V36.6L53.7 58.5C51.3 63 44.7 63 42.3 58.5L31.5 36.6V73.5C31.5 75.99 29.49 78 27 78C24.51 78 22.5 75.99 22.5 73.5Z" fill="#fff"/></svg>`;

  files['sw.js'] = `const CACHE = 'museware-shell-v1';
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html'])));
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((hit) =>
      hit || fetch(event.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(event.request, copy)).catch(() => undefined);
        return res;
      }).catch(() => caches.match('./index.html')),
    ),
  );
});
`;
  for (const [path, source] of Object.entries(files))
    if (path.startsWith('src/screens/') && path.endsWith('.tsx')) auditCodegen(source);
  return files;
}
