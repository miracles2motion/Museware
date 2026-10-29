import type { ComponentNode, ProjectDoc } from '../types/tree';
import { isContainerType } from '../types/library';
import { walk } from '../ops/treeUtils';
import { styleDeclarations, styleDeclarationsFor } from '../types/styleDict';

/**
 * Every declaration a node's own styles produce. The dictionary owns the
 * meaning of each key (align → align-items, selfAlign → align-self,
 * grow → flex-grow, match/hug → 100%/fit-content); anything it does not
 * name falls through as plain CSS.
 */
function userDeclarations(styles: ComponentNode['styles']): string[] {
  return styleDeclarations(styles);
}

function toneVars(tone: string): { bg: string; fg: string } {
  switch (tone) {
    case 'success':
      return { bg: 'var(--openui-success-bg)', fg: 'var(--openui-success-text)' };
    case 'danger':
      return { bg: 'var(--openui-danger-bg)', fg: 'var(--openui-danger-text)' };
    case 'neutral':
      return { bg: 'var(--openui-sunk)', fg: 'var(--openui-text-secondary)' };
    default:
      return { bg: 'var(--openui-accent-subtle)', fg: 'var(--openui-text-brand)' };
  }
}

/** Structural + visual defaults per kind, then the node's own styles on top. */
function baseDeclarations(node: ComponentNode): string[] {
  const p = node.props as Record<string, unknown>;
  const d: string[] = ['box-sizing:border-box', 'min-width:0'];
  switch (node.type) {
    case 'screen':
      d.push(
        'display:flex',
        `flex-direction:${p.layout === 'flex-row' ? 'row' : 'column'}`,
        'width:100%',
      );
      /*
       * A scrolling screen OWNS its height: exactly the frame, content
       * scrolls inside it. min-height alone is INDEFINITE, and a percentage
       * height against an indefinite parent falls back to auto — that is why
       * height:'match' on a child silently did nothing while width:'match'
       * worked (widths chain off definite widths).
       *
       * Undefined counts as scrolling, which is the documented default, so a
       * project saved before the toggle existed keeps the phone model. Scrolls
       * off is the web-page model: the screen grows and the page scrolls
       * instead — and its children cannot height:match, by design.
       */
      if (p.scroll !== false && p.scroll !== 'false') {
        d.push('height:100%', 'overflow-y:auto');
      } else {
        d.push('min-height:100%');
      }
      break;
    case 'row':
      d.push('display:flex', 'flex-direction:row', 'align-items:stretch');
      d.push('flex-wrap:wrap');
      break;
    case 'col':
    case 'card':
    case 'section':
    case 'form':
    case 'tabs':
      d.push('display:flex', 'flex-direction:column');
      if (node.type !== 'card') d.push('align-items:stretch');
      if (node.type === 'tabs') d.push('gap:var(--gap-item)');
      break;
    case 'grid': {
      const cols = Math.max(
        2,
        Math.min(6, Number(p.columns) || Number(node.styles.columns) || 2),
      );
      d.push('display:grid', `grid-template-columns:repeat(${cols}, minmax(0, 1fr))`);
      d.push('gap:var(--gap-item)');
      break;
    }
    case 'hero':
      d.push(
        'display:flex',
        'flex-direction:column',
        'gap:var(--gap-item)',
        'position:relative',
      );
      break;
    case 'heading': {
      const level = Number(p.level) || 2;
      const sizes: Record<number, string> = {
        1: 'var(--type-display)',
        2: 'var(--type-title)',
        3: 'var(--type-heading)',
        4: 'var(--type-label)',
      };
      d.push(
        `font-family:var(--font-heading)`,
        `font-size:${sizes[level] || sizes[2]}`,
        'font-weight:700',
        'line-height:1.22',
        'letter-spacing:-0.015em',
        'color:var(--openui-text-primary)',
        'margin:0',
      );
      break;
    }
    case 'text':
      d.push(
        'font-size:var(--type-body)',
        'line-height:1.58',
        'color:var(--openui-text-secondary)',
        'white-space:pre-wrap',
      );
      break;
    case 'label':
      d.push(
        'font-size:var(--type-label)',
        'font-weight:600',
        'letter-spacing:0.02em',
        'color:var(--openui-text-secondary)',
      );
      break;
    case 'badge': {
      const tone = toneVars(String(p.tone || 'accent'));
      d.push(
        'display:inline-flex',
        'align-items:center',
        'gap:6px',
        'height:24px',
        'padding:0 10px',
        'border-radius:var(--radius-chip)',
        `background:${tone.bg}`,
        `color:${tone.fg}`,
        'font-size:12px',
        'font-weight:600',
        'align-self:flex-start',
      );
      break;
    }
    case 'divider':
      d.push(
        'height:1px',
        'width:100%',
        'background:var(--openui-border-default)',
        'flex:0 0 auto',
      );
      break;
    case 'icon':
      d.push(
        'display:inline-flex',
        'align-items:center',
        'justify-content:center',
        'color:var(--openui-text-primary)',
        'flex:0 0 auto',
      );
      break;
    case 'image':
      d.push(
        'display:block',
        'width:100%',
        'aspect-ratio:16 / 10',
        'background:var(--openui-sunk)',
        'overflow:hidden',
      );
      break;
    case 'avatar':
      d.push(
        'display:inline-flex',
        'align-items:center',
        'justify-content:center',
        'overflow:hidden',
        'border-radius:999px',
        'background:var(--openui-accent-subtle)',
        'color:var(--openui-text-brand)',
        'font-weight:700',
        'flex:0 0 auto',
      );
      break;
    case 'progress':
      d.push('display:flex', 'flex-direction:column', 'gap:6px', 'width:100%');
      break;
    case 'spinner':
      d.push('display:inline-flex', 'align-items:center', 'justify-content:center');
      break;
    case 'button': {
      const variant = String(p.variant || 'primary');
      const map: Record<string, string[]> = {
        primary: [
          'background:var(--openui-accent)',
          'color:var(--openui-text-on-accent)',
          'border:1px solid transparent',
        ],
        secondary: [
          'background:var(--openui-sunk)',
          'color:var(--openui-text-primary)',
          'border:1px solid var(--openui-border-default)',
        ],
        ghost: [
          'background:transparent',
          'color:var(--openui-text-secondary)',
          'border:1px solid transparent',
        ],
        danger: [
          'background:var(--openui-danger-text)',
          'color:var(--openui-text-on-accent)',
          'border:1px solid transparent',
        ],
      };
      d.push(
        'display:inline-flex',
        'align-items:center',
        'justify-content:center',
        'gap:8px',
        'cursor:pointer',
        'font-family:inherit',
        'height:var(--h-button)',
        'padding:0 var(--pad-control-x)',
        'border-radius:var(--radius-button)',
        'font-size:15px',
        'font-weight:600',
        'width:100%',
        'align-self:stretch',
        ...(map[variant] || map.primary),
      );
      break;
    }
    case 'iconbutton':
      d.push(
        'display:inline-flex',
        'align-items:center',
        'justify-content:center',
        'width:var(--h-button)',
        'height:var(--h-button)',
        'border-radius:var(--radius-button)',
        'border:1px solid var(--openui-border-default)',
        'background:var(--openui-sunk)',
        'color:var(--openui-text-primary)',
        'cursor:pointer',
        'align-self:flex-start',
      );
      break;
    case 'input':
    case 'select':
    case 'datepicker':
      d.push(
        'width:100%',
        'height:var(--h-input)',
        'padding:0 var(--pad-control-x)',
        'border-radius:var(--radius-input)',
        'border:1px solid var(--openui-border-default)',
        'background:var(--openui-fg)',
        'color:var(--openui-text-primary)',
        'font-family:inherit',
        'font-size:15px',
        'outline:none',
      );
      break;
    case 'textarea':
      d.push(
        'width:100%',
        'padding:12px var(--pad-control-x)',
        'border-radius:var(--radius-input)',
        'border:1px solid var(--openui-border-default)',
        'background:var(--openui-fg)',
        'color:var(--openui-text-primary)',
        'font-family:inherit',
        'font-size:15px',
        'line-height:1.5',
        'resize:vertical',
        'outline:none',
      );
      break;
    case 'checkbox':
    case 'switch':
      d.push(
        'display:inline-flex',
        'align-items:center',
        'gap:10px',
        'font-size:14px',
        'color:var(--openui-text-primary)',
        'cursor:pointer',
        'align-self:flex-start',
      );
      break;
    case 'slider':
      d.push('width:100%', 'accent-color:var(--openui-accent)', 'align-self:stretch');
      break;
    case 'navbar':
      d.push(
        'display:flex',
        'align-items:center',
        'justify-content:space-between',
        'gap:12px',
        'width:100%',
        'height:var(--h-nav)',
        'padding:0 var(--pad-card)',
        'background:var(--openui-fg)',
        'border-bottom:1px solid var(--openui-border-default)',
      );
      break;
    case 'bottomnav':
      d.push(
        'display:flex',
        'align-items:center',
        'justify-content:space-around',
        'gap:8px',
        'width:100%',
        'height:var(--h-nav)',
        'padding:0 var(--pad-card)',
        'background:var(--openui-fg)',
        'border-top:1px solid var(--openui-border-default)',
      );
      break;
    case 'link':
      d.push(
        'display:inline-flex',
        'align-items:center',
        'gap:4px',
        'color:var(--openui-text-brand)',
        'font-size:14px',
        'font-weight:600',
        'cursor:pointer',
        'align-self:flex-start',
      );
      break;
    case 'fab':
      d.push(
        'display:inline-flex',
        'align-items:center',
        'justify-content:center',
        'width:56px',
        'height:56px',
        'border-radius:999px',
        'background:var(--openui-accent)',
        'color:var(--openui-text-on-accent)',
        'box-shadow:0 10px 24px rgba(0,0,0,0.22)',
        'align-self:flex-end',
        'cursor:pointer',
        'border:none',
      );
      break;
    case 'list':
      d.push('display:flex', 'flex-direction:column', 'gap:8px', 'width:100%');
      break;
    case 'table':
      d.push('display:flex', 'flex-direction:column', 'width:100%', 'font-size:13px');
      break;
    case 'stat':
      d.push(
        'display:flex',
        'flex-direction:column',
        'gap:4px',
        'padding:var(--pad-card)',
        'border-radius:var(--radius-card)',
        'background:var(--openui-elevated)',
        'border:1px solid var(--openui-border-default)',
      );
      break;
    case 'chart':
      d.push('display:block', 'width:100%', 'min-height:72px');
      break;
    default:
      d.push('display:block');
  }
  return d;
}

/**
 * MIGRATION WINDOW. Before the dictionary, a Row or Column kept its gap, align
 * and wrap in PROPS. Saved projects and the demo engine still do, so those
 * values are honoured — but only where styles do not already speak, and only
 * for containers. Delete this once migrateLayoutV2 has run on every doc.
 */
function legacyLayoutDeclarations(node: ComponentNode): string[] {
  if (!isContainerType(node.type)) return [];
  const p = node.props as Record<string, unknown>;
  const out: string[] = [];
  if (node.styles.gap === undefined && typeof p.gap === 'string' && p.gap) {
    out.push(`gap:${p.gap}`);
  }
  if (node.styles.align === undefined && typeof p.align === 'string' && p.align) {
    out.push(...styleDeclarationsFor('align', p.align));
  }
  if (
    node.styles.wrap === undefined &&
    node.type === 'row' &&
    typeof p.wrap === 'boolean'
  ) {
    out.push(`flex-wrap:${p.wrap ? 'wrap' : 'nowrap'}`);
  }
  return out;
}

function renderRule(selector: string, decls: string[]): string {
  if (!decls.length) return '';
  return `${selector}{${decls.join(';')}}`;
}

export function nodeClass(id: string): string {
  return `n-${id}`;
}

function hoverExtra(node: ComponentNode): string {
  const sel = `.${nodeClass(node.id)}`;
  switch (node.type) {
    case 'button':
      return `${sel}:hover{filter:brightness(0.96)}${sel}:active{transform:translateY(1px)}${sel}:focus-visible{outline:2px solid var(--openui-border-accent);outline-offset:2px}${sel}[data-disabled='true']{opacity:.5;cursor:not-allowed}${sel}[data-disabled='true']:hover{filter:none}`;
    case 'link':
      return `${sel}:hover{text-decoration:underline}`;
    case 'fab':
      return `${sel}:hover{filter:brightness(1.05)}${sel}:active{transform:scale(0.97)}`;
    case 'input':
    case 'textarea':
    case 'select':
      return `${sel}:focus{border-color:var(--openui-border-accent);box-shadow:0 0 0 3px var(--openui-accent-subtle)}`;
    default:
      return '';
  }
}

function responsiveBlocks(node: ComponentNode): string[] {
  const out: string[] = [];
  const sel = `.${nodeClass(node.id)}`;
  const medium = node.styles.responsive?.medium;
  const expanded = node.styles.responsive?.expanded;
  if (medium && Object.keys(medium).length) {
    const decls = [...userDeclarations(medium)];
    if (node.type === 'grid' && medium.columns) {
      decls.push(`grid-template-columns:repeat(${Number(medium.columns)}, minmax(0, 1fr))`);
    }
    if (node.type === 'hero' && medium.flexDirection) {
      decls.push(`flex-direction:${medium.flexDirection}`);
    }
    out.push(`@container mw (min-width:600px){${renderRule(sel, decls)}}`);
  }
  if (expanded && Object.keys(expanded).length) {
    const decls = [...userDeclarations(expanded)];
    if (node.type === 'grid' && expanded.columns) {
      decls.push(
        `grid-template-columns:repeat(${Number(expanded.columns)}, minmax(0, 1fr))`,
      );
    }
    if (node.type === 'hero' && expanded.flexDirection) {
      decls.push(`flex-direction:${expanded.flexDirection}`);
    }
    out.push(`@container mw (min-width:1024px){${renderRule(sel, decls)}}`);
  }
  return out;
}

/** One CSS bundle for canvas, Run mode AND export — the single source of truth. */
export function generateCss(doc: ProjectDoc): string {
  const rules: string[] = [
    '.mw-css-root,.mw-app{container-type:inline-size;container-name:mw;font-family:var(--font-body);color:var(--openui-text-primary);background:var(--openui-bg);-webkit-font-smoothing:antialiased}',
    '.mw-app *{box-sizing:border-box}',
    '.mw-app button{font-family:inherit}',
    '.mw-app img{max-width:100%}',
  ];
  for (const screen of doc.screens) {
    walk(screen.root, (node) => {
      const decls = [
        ...baseDeclarations(node),
        ...legacyLayoutDeclarations(node),
        ...userDeclarations(node.styles),
      ];
      const columns = node.styles.columns;
      if (node.type === 'grid' && typeof columns === 'number' && !node.props.columns) {
        decls.push(`grid-template-columns:repeat(${columns}, minmax(0, 1fr))`);
      }
      rules.push(renderRule(`.${nodeClass(node.id)}`, decls));
      const hover = hoverExtra(node);
      if (hover) rules.push(hover);
      rules.push(...responsiveBlocks(node));
    });
  }
  return rules.filter(Boolean).join('\n');
}

export function screenCssClass(screenId: string): string {
  return `scr-${screenId}`;
}

/** Utility classes shared by canvas, Run mode and exported code. */
export const UTILITY_CSS = `.mw-row-item{display:flex;align-items:center;gap:12px;padding:12px var(--pad-card);background:var(--openui-elevated);border:1px solid var(--openui-border-default);border-radius:var(--radius-card)}
.mw-row-main{flex:1;min-width:0}
.mw-row-title{font-size:14px;font-weight:600;color:var(--openui-text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mw-row-sub{font-size:12px;color:var(--openui-text-secondary);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mw-row-value{font-size:13px;font-weight:600;color:var(--openui-text-brand);flex:0 0 auto}
.mw-table-head,.mw-table-row{display:flex;gap:12px;padding:10px var(--pad-card);border-bottom:1px solid var(--openui-border-default)}
.mw-table-head{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--openui-text-tertiary);background:var(--openui-sunk);border-radius:var(--radius-tag) var(--radius-tag) 0 0}
.mw-table-row:last-child{border-bottom:none}
.mw-table-cell{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--openui-text-primary)}
.mw-progress-track{height:8px;border-radius:999px;background:var(--openui-sunk);overflow:hidden;width:100%}
.mw-progress-fill{height:100%;background:var(--openui-accent);border-radius:999px;transition:width .25s ease}
.mw-progress-label{display:flex;justify-content:space-between;font-size:12px;color:var(--openui-text-secondary)}
.mw-switch{display:inline-flex;align-items:center;gap:10px;cursor:pointer}
.mw-switch-track{width:42px;height:24px;border-radius:999px;background:var(--openui-sunk);border:1px solid var(--openui-border-default);position:relative;transition:background .15s ease;flex:0 0 auto}
.mw-switch-thumb{position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:999px;background:var(--openui-fg);box-shadow:0 1px 2px rgba(0,0,0,.25);transition:left .15s ease}
.mw-switch[data-on="true"] .mw-switch-track{background:var(--openui-accent);border-color:transparent}
.mw-switch[data-on="true"] .mw-switch-thumb{left:21px;background:var(--openui-text-on-accent)}
.mw-check{width:18px;height:18px;border-radius:4px;border:1.5px solid var(--openui-border-interactive);display:inline-flex;align-items:center;justify-content:center;background:var(--openui-fg);color:var(--openui-text-on-accent);flex:0 0 auto}
.mw-check[data-on="true"]{background:var(--openui-accent);border-color:var(--openui-accent)}
.mw-spinner{width:18px;height:18px;border-radius:999px;border:2px solid var(--openui-sunk);border-top-color:var(--openui-accent);animation:mw-spin 1s linear infinite}
@keyframes mw-spin{to{transform:rotate(360deg)}}
.mw-tab-strip{display:flex;gap:6px;flex-wrap:wrap;width:100%}
.mw-tab{padding:8px 12px;border-radius:var(--radius-chip);font-size:13px;font-weight:600;color:var(--openui-text-secondary);background:var(--openui-sunk);cursor:pointer;border:none}
.mw-tab[data-active="true"]{background:var(--openui-accent);color:var(--openui-text-on-accent)}
.mw-nav-brand{font-family:var(--font-heading);font-weight:700;font-size:16px;color:var(--openui-text-primary)}
.mw-nav-items{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
.mw-nav-item{font-size:13px;font-weight:500;color:var(--openui-text-secondary);cursor:pointer;background:none;border:none;padding:0}
.mw-nav-item:hover{color:var(--openui-text-primary)}
.mw-chart{display:flex;align-items:flex-end;gap:6px;height:96px;width:100%}
.mw-chart-bar{flex:1;background:var(--openui-accent);border-radius:6px 6px 2px 2px;min-height:4px;opacity:.92}
.mw-hero-img{width:100%;height:180px;object-fit:cover;border-radius:calc(var(--radius-card) - 4px);display:block}
.mw-fill-img{width:100%;height:100%;object-fit:cover;display:block}
.mw-empty{font-size:12px;color:var(--openui-text-tertiary);padding:10px 0}
.mw-slider{width:100%;accent-color:var(--openui-accent)}
.mw-slider-field{display:flex;flex-direction:column;gap:6px;width:100%}
.mw-list-divided .mw-row-item{border:none;border-radius:0;border-bottom:1px solid var(--openui-border-default);background:transparent;padding-inline:0}
.mw-list-divided .mw-row-item:last-child{border-bottom:none}`;

export function generateFullCss(doc: ProjectDoc): string {
  return `${generateCss(doc)}\n${UTILITY_CSS}`;
}
