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
function baseDeclarations(
  node: ComponentNode,
  scrollModel: 'phone' | 'web' = 'phone',
): string[] {
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
       * project saved before the toggle existed keeps the phone model unless
       * the caller chooses the web surface. Scrolls off or web surface uses
       * the web-page model: the screen grows and the page scrolls
       * instead — and its children cannot height:match, by design.
       */
      if (scrollModel === 'phone' && p.scroll !== false && p.scroll !== 'false') {
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
      // A declared column count describes the expanded layout, never the phone.
      d.push('display:grid', 'grid-template-columns:repeat(1, minmax(0, 1fr))');
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
        'text-wrap:balance',
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
        'max-width:65ch',
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
        ...(Number(p.assetWidth) > 0
          ? [`max-width:${Math.min(4096, Number(p.assetWidth))}px`]
          : []),
        'position:relative',
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
        'position:sticky',
        'top:0',
        'z-index:20',
        'backdrop-filter:blur(14px)',
        'padding:0 var(--pad-card)',
        'background:color-mix(in srgb, var(--openui-fg) 82%, transparent)',
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
        'position:sticky',
        'bottom:0',
        'margin-top:auto',
        'z-index:20',
        'backdrop-filter:blur(14px)',
        'padding:0 var(--pad-card)',
        'background:color-mix(in srgb, var(--openui-fg) 82%, transparent)',
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
      d.push(
        'display:flex',
        'flex-direction:column',
        'width:100%',
        'font-size:13px',
        'overflow-x:auto',
        '-webkit-overflow-scrolling:touch',
      );
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
    const decls = [
      ...userDeclarations(medium),
      ...(['image', 'hero', 'card', 'video'].includes(node.type) && medium.aspectRatio
        ? [`aspect-ratio:${String(medium.aspectRatio)}`]
        : []),
    ];
    if (node.type === 'grid' && medium.columns) {
      decls.push(`grid-template-columns:repeat(${Number(medium.columns)}, minmax(0, 1fr))`);
    }
    if (node.type === 'hero' && medium.flexDirection) {
      decls.push(`flex-direction:${medium.flexDirection}`);
    }
    out.push(`@container mw (min-width:600px){${renderRule(sel, decls)}}`);
  }
  if (expanded && Object.keys(expanded).length) {
    const decls = [
      ...userDeclarations(expanded),
      ...(['image', 'hero', 'card', 'video'].includes(node.type) && expanded.aspectRatio
        ? [`aspect-ratio:${String(expanded.aspectRatio)}`]
        : []),
    ];
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
export function generateCss(
  doc: ProjectDoc,
  options: { editScope?: boolean; scrollModel?: 'phone' | 'web' } = {},
): string {
  const rules: string[] = [
    '.mw-css-root,.mw-app{container-type:inline-size;container-name:mw;font-family:var(--font-body);color:var(--openui-text-primary);background:var(--openui-bg);-webkit-font-smoothing:antialiased}',
    '.mw-app{--type-display:var(--type-display-base);--type-title:var(--type-title-base);--pad-screen:var(--pad-screen-base);--gap-section:var(--gap-section-base)}',
    '.mw-app{--mw-motion-fast:160ms;--mw-motion-med:280ms;--mw-motion-slow:700ms;--mw-ease-out:cubic-bezier(.22,1,.36,1)}',
    '.mw-app *{box-sizing:border-box}',
    '.mw-app button{font-family:inherit}',
    '.mw-app img{max-width:100%}',
  ];
  for (const screen of doc.screens) {
    const rowButtons = new Set<string>();
    walk(screen.root, (node) => {
      if (
        node.type === 'row' ||
        (node.type === 'screen' && node.props.layout === 'flex-row')
      ) {
        node.children
          .filter((child) => child.type === 'button')
          .forEach((child) => rowButtons.add(child.id));
      }
    });
    if (doc.kind === 'web')
      rules.push(
        `@container mw (min-width:1024px){:where(.mw-app > .${nodeClass(screen.root.id)} > *){max-width:1120px;margin-inline:auto}}`,
      );
    walk(screen.root, (node) => {
      if (node.type === 'image') {
        const ratio =
          Number(node.props.assetAspectWidth) > 0 &&
          Number(node.props.assetAspectHeight) > 0
            ? `${Number(node.props.assetAspectWidth)} / ${Number(node.props.assetAspectHeight)}`
            : '16 / 10';
        rules.push(`:where(.${nodeClass(node.id)}){aspect-ratio:${ratio}}`);
        rules.push(`:where(.mw-card .${nodeClass(node.id)}){aspect-ratio:1 / 1}`);
        rules.push(
          `@container mw (min-width:600px){:where(.mw-card .${nodeClass(node.id)}){aspect-ratio:4 / 3}}`,
        );
      }
      // Variant defaults live in zero-specificity utility rules. Avoid a
      // conflicting node-base declaration so the variant can supply its look;
      // explicit node styles are always emitted afterwards at class specificity.
      if (
        ['list', 'table', 'accordion'].includes(node.type) ||
        (node.type === 'section' && /finder/i.test(`${node.id} ${node.name || ''}`))
      )
        rules.push(
          `@container mw (min-width:1024px){:where(.mw-section .${nodeClass(node.id)}){max-width:min(100%, 720px);margin-inline:auto}}`,
        );
      if (node.type === 'form')
        rules.push(
          `@container mw (min-width:1024px){:where(.mw-section .${nodeClass(node.id)}){max-width:min(100%, 540px);margin-inline:auto}}`,
        );
      const navVariant =
        node.type === 'navbar' || node.type === 'bottomnav'
          ? String(node.props.variant || 'glass')
          : '';
      const base = baseDeclarations(node, options.scrollModel).filter((decl) => {
        if (
          navVariant === 'minimal' &&
          /^(background|backdrop-filter|border-bottom|border-top):/.test(decl)
        )
          return false;
        if (navVariant === 'solid' && /^backdrop-filter:/.test(decl))
          return false;
        if (navVariant === 'floating' && /^(width|border-bottom|border-top):/.test(decl))
          return false;
        if (
          node.type === 'bottomnav' &&
          (node.props.sticky === false || node.props.sticky === 'false') &&
          /^(position:sticky|bottom:0|margin-top:auto)/.test(decl)
        )
          return false;
        return true;
      });
      const decls = [
        ...base,
        ...(rowButtons.has(node.id) && node.props.widthMode !== 'full'
          ? ['width:auto', 'align-self:auto']
          : []),
        ...legacyLayoutDeclarations(node),
        ...(['image', 'hero', 'card', 'video'].includes(node.type) &&
        node.styles.aspectRatio
          ? [`aspect-ratio:${String(node.styles.aspectRatio)}`]
          : []),
        ...userDeclarations(node.styles).filter(
          (decl) => node.type !== 'grid' || !/^grid-template-columns\s*:/i.test(decl),
        ),
      ];
      // Marquee clipping comes from its shared utility, rather than its node rule.
      const clipped =
        node.type === 'marquee' ||
        decls.some((decl) => /^overflow(?:-y)?\s*:\s*(?:hidden|clip)\s*$/i.test(decl));
      rules.push(renderRule(`.${nodeClass(node.id)}`, decls));
      const preset = String(node.props.motion || 'none');
      if (['rise', 'fade', 'slide', 'scale'].includes(preset)) {
        const sel = `:where(.${nodeClass(node.id)})`;
        const customDuration =
          typeof node.props.motionDuration === 'string' &&
          /^\d+(?:\.\d+)?(?:s|ms)$/.test(node.props.motionDuration.trim())
            ? node.props.motionDuration.trim()
            : null;
        const duration = customDuration || 'var(--mw-motion-slow)';
        rules.push(
          `${sel}{animation:mw-${preset} ${duration} var(--mw-ease-out) both}`,
        );
        rules.push(
          `@media (prefers-reduced-motion:reduce){${sel}{animation:none;opacity:1;transform:none}}`,
        );
        if (node.type === 'section') {
          rules.push(
            `:where([data-motion-armed] .${nodeClass(node.id)}:not(.is-in)){animation:none;opacity:0}`,
          );
          rules.push(
            `:where([data-motion-armed] .${nodeClass(node.id)}:not(.is-in) > *){animation-play-state:paused}`,
          );
          rules.push(
            `@media (prefers-reduced-motion:reduce){:where([data-motion-armed] .${nodeClass(node.id)}:not(.is-in)){animation:none;opacity:1;transform:none}}`,
          );
          for (let i = 1; i <= 8; i++) {
            const nth = i === 8 ? 'n+8' : String(i);
            rules.push(
              `:where(.${nodeClass(node.id)} > :nth-child(${nth})){animation-delay:${(i - 1) * 70}ms}`,
            );
          }
        }
      }
      if (options.editScope && node.type !== 'divider' && clipped)
        rules.push(
          renderRule(`.frame-viewport .${nodeClass(node.id)}`, [
            'min-height:var(--mw-hug-min)',
          ]),
        );
      if (
        node.type === 'button' &&
        !rowButtons.has(node.id) &&
        node.styles.width === undefined &&
        node.props.widthMode !== 'full'
      ) {
        rules.push(
          `@container mw (min-width:600px){.${nodeClass(node.id)}{width:auto${node.styles.selfAlign === undefined ? ';align-self:flex-start' : ''}}}`,
        );
      }
      if (node.type === 'form') {
        rules.push(`.${nodeClass(node.id)}{max-width:100%}`);
      }
      const hover = hoverExtra(node);
      if (hover) rules.push(hover);
      if (node.type === 'hero' && Number(node.props.assetWidth) > 0) {
        rules.push(
          `:where(.${nodeClass(node.id)} .mw-hero-img){max-width:${Math.min(4096, Number(node.props.assetWidth))}px}`,
        );
      }
      if (
        node.type === 'hero' &&
        (!node.props.layout || node.props.layout === 'split') &&
        (node.props.image ||
          node.props.src ||
          node.children.some((child) => ['image', 'card'].includes(child.type)))
      ) {
        const sel = `.${nodeClass(node.id)}`;
        const defaults = [
          ...(node.styles.display === undefined ? ['display:grid'] : []),
          ...(node.styles.columns === undefined ? ['grid-template-columns:1fr 1fr'] : []),
          ...(node.styles.align === undefined ? ['align-items:center'] : []),
        ];
        if (defaults.length)
          rules.push(`@container mw (min-width:600px){${sel}{${defaults.join(';')}}}`);
      }
      if (node.type === 'row' && /stat/i.test(`${node.id} ${node.name || ''}`)) {
        const sel = `.${nodeClass(node.id)}`;
        const childCount = node.children.length;
        if (childCount === 3) {
          rules.push(`${sel}>*{flex:1 1 100%}`);
          rules.push(
            `@container mw (min-width:600px){${sel}{flex-wrap:nowrap}${sel}>*{flex:1 1 0;min-width:0;flex-basis:0}}`,
          );
        } else {
          rules.push(`${sel}>*{flex:1 1 calc(50% - var(--gap-item))}`);
          rules.push(
            `@container mw (min-width:600px){${sel}{flex-wrap:nowrap}${sel}>*{flex:1 1 0;min-width:0;flex-basis:0}}`,
          );
        }
      }
      if (node.type === 'table') {
        const sel = `.${nodeClass(node.id)}`;
        rules.push(
          `${sel} .mw-table-head,${sel} .mw-table-row{min-width:min-content}`,
          `${sel} .mw-table-cell[data-col="year"],${sel} .mw-table-cell[data-col="status"],${sel} .mw-table-cell[data-col="date"],${sel} .mw-table-cell[data-col="id"],${sel} .mw-table-cell[data-col="qty"]{flex:0 0 68px;text-align:center}`,
          `${sel} .mw-table-cell[data-col="project"],${sel} .mw-table-cell[data-col="title"],${sel} .mw-table-cell[data-col="name"],${sel} .mw-table-cell[data-col="stack"]{flex:2}`,
        );
      }
      if (node.type === 'grid') {
        const declaredCols = Number(node.props.columns ?? node.styles.columns);
        const defaultCols = node.children.length === 3 ? 3 : 2;
        const cols = Math.max(
          1,
          Math.min(6, declaredCols || defaultCols),
        );
        const sel = `.${nodeClass(node.id)}`;
        rules.push(
          `@container mw (min-width:600px){${sel}{grid-template-columns:repeat(${Math.min(2, cols)}, minmax(0, 1fr))}}`,
        );
        rules.push(
          `@container mw (min-width:1024px){${sel}{grid-template-columns:repeat(${cols}, minmax(0, 1fr))}}`,
        );
        const mediumCols = Math.max(
          1,
          Math.min(6, Number(node.styles.responsive?.medium?.columns) || Math.min(2, cols)),
        );
        const expandedCols = Math.max(
          1,
          Math.min(
            6,
            Number(node.styles.responsive?.expanded?.columns) ||
              Number(node.styles.responsive?.medium?.columns) ||
              cols,
          ),
        );
        // A zero-specificity last-cell default closes incomplete rows without
        // taking precedence over an explicitly placed child.
        const closeRow = (columns: number) =>
          [
            `:where(${sel} > *:last-child){grid-column:auto}`,
            ...Array.from({ length: Math.max(0, columns - 1) }, (_, i) => {
              const remainder = i + 1;
              return `:where(${sel} > *:last-child:nth-child(${columns}n + ${remainder})){grid-column:span ${columns - remainder + 1}}`;
            }),
          ].join('');
        rules.push(`@container mw (min-width:600px){${closeRow(mediumCols)}}`);
        rules.push(`@container mw (min-width:1024px){${closeRow(expandedCols)}}`);
        for (const child of node.children) {
          const childSel = `.${nodeClass(child.id)}`;
          const mdSpan = child.styles.responsive?.medium?.colSpan ?? child.styles.colSpan;
          const lgSpan = child.styles.responsive?.expanded?.colSpan ?? mdSpan;
          if (mdSpan === 'full' || Number(mdSpan) >= 1) {
            const span =
              mdSpan === 'full' ? mediumCols : Math.min(mediumCols, 2, Number(mdSpan));
            rules.push(
              `@container mw (min-width:600px){${childSel}{grid-column:span ${span}}}`,
            );
          }
          if (lgSpan === 'full' || Number(lgSpan) >= 1) {
            const span =
              lgSpan === 'full' ? expandedCols : Math.min(expandedCols, Number(lgSpan));
            rules.push(
              `@container mw (min-width:1024px){${childSel}{grid-column:span ${span}}}`,
            );
          }
          const rowSpan =
            child.styles.responsive?.expanded?.rowSpan ??
            child.styles.responsive?.medium?.rowSpan ??
            child.styles.rowSpan;
          if (Number(rowSpan) >= 1)
            rules.push(
              `@container mw (min-width:1024px){${childSel}{grid-row:span ${Number(rowSpan)}}}`,
            );
        }
      }
      rules.push(...responsiveBlocks(node));
    });
  }
  return rules.filter(Boolean).join('\n');
}

export function screenCssClass(screenId: string): string {
  return `scr-${screenId}`;
}

/** Utility classes shared by canvas, Run mode and exported code. */
export const MOTION_DICTIONARY = `@keyframes mw-rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
@keyframes mw-fade{from{opacity:0}to{opacity:1}}
@keyframes mw-slide{from{opacity:0;transform:translateX(-18px)}to{opacity:1;transform:none}}
@keyframes mw-scale{from{opacity:0;transform:scale(.97)}to{opacity:1;transform:none}}`;

export const SWITCH_MOTION_CSS = `:where(.mw-enter){animation:mw-rise var(--mw-motion-med) var(--mw-ease-out) both}`;

export const UTILITY_CSS = `@container mw (min-width:600px){.mw-app{--type-display:var(--type-display-md);--type-title:var(--type-title-md);--gap-section:var(--gap-section-md);--pad-screen:var(--pad-screen-md)}}
@container mw (min-width:1024px){.mw-app{--type-display:var(--type-display-lg);--type-title:var(--type-title-lg);--gap-section:var(--gap-section-lg);--pad-screen:var(--pad-screen-lg)}}
:where(.mw-sec-head){display:flex;flex-direction:column;align-items:flex-start;gap:10px}:where(.mw-section[data-align="center"] .mw-sec-head){align-items:center;text-align:center}.mw-sec-eyebrow{display:inline-flex;align-self:flex-start;width:fit-content;padding:5px 10px;border:1px solid currentColor;border-radius:var(--radius-chip,999px);font-size:12px}.mw-sec-title{margin:0;font-family:var(--font-heading);font-size:var(--type-title);line-height:1.15;text-wrap:balance}.mw-sec-sub{margin:0;max-width:60ch;font-size:var(--type-body);line-height:1.6}:where(.mw-section[data-surface="sunk"]){background:var(--openui-sunk)}:where(.mw-section[data-surface="elevated"]){background:var(--openui-elevated)}:where(.mw-section[data-surface="accent"]){background:var(--openui-accent);color:var(--openui-text-on-accent)}:where(.mw-section[data-surface="glow"]){background:radial-gradient(circle at 80% 10%,var(--openui-accent-subtle),transparent 60%),var(--openui-elevated)}:where(.mw-section[data-surface]:not([data-surface="plain"])){padding:var(--pad-card);border-radius:var(--radius-card)}:where(.mw-section[data-bleed="true"]){margin-inline:calc(-1 * var(--pad-screen));width:calc(100% + 2 * var(--pad-screen));max-width:none}
:where(.mw-nav[data-variant="minimal"]){background:transparent;backdrop-filter:none;-webkit-backdrop-filter:none;border:0}:where(.mw-nav[data-variant="floating"]){width:calc(100% - 24px);margin-inline:12px;border:1px solid var(--openui-border-default);border-radius:8px;-webkit-backdrop-filter:blur(14px)}@container mw (min-width:600px){:where(.mw-nav[data-variant="floating"]){width:calc(100% - 24px);max-width:960px;margin-inline:auto;border-radius:999px}}
:where(.mw-marquee){overflow:hidden}:where(.mw-marquee-track){display:flex;width:max-content;animation:mw-marquee-scroll var(--marquee-speed,30s) linear infinite}.mw-marquee:hover .mw-marquee-track{animation-play-state:paused}:where(.mw-marquee-group){display:flex;align-items:center;gap:32px;padding-right:32px}:where(.mw-marquee-item){white-space:nowrap;font-weight:700}:where(.mw-marquee[data-static="true"] .mw-marquee-track){animation:none}:where(.mw-marquee[data-static="true"] .mw-marquee-group[aria-hidden="true"]){display:none}:where(.mw-marquee[data-variant="pills"] .mw-marquee-item){padding:8px 14px;border:1px solid var(--openui-border-default);border-radius:999px}:where(.mw-marquee[data-variant="metrics"] .mw-marquee-item){font-size:var(--type-heading)}@keyframes mw-marquee-scroll{to{transform:translateX(-50%)}}@media (prefers-reduced-motion:reduce){:where(.mw-marquee){mask-image:none;-webkit-mask-image:none}.mw-marquee-track{animation:none;width:auto}.mw-marquee-group{flex-wrap:wrap}.mw-marquee-group[aria-hidden="true"]{display:none}}
.mw-accordion details{border-bottom:1px solid var(--openui-border-default);padding:14px 0}.mw-accordion summary{cursor:pointer;font-weight:700}.mw-accordion-answer{max-width:65ch;line-height:1.6;padding-top:10px}
:where(.mw-motion){position:relative;overflow:hidden;min-height:240px;border-radius:var(--radius-card);background:var(--openui-sunk)}.mw-motion canvas,.mw-motion video{display:block;width:100%;height:100%;min-height:240px;object-fit:cover;border-radius:inherit}.mw-motion-overlay{position:absolute;inset:20px;pointer-events:none}.mw-reel-controls{display:flex;gap:10px;align-items:center;padding:8px}.mw-reel-controls input{flex:1;min-width:0}
.mw-row-item{display:flex;align-items:center;gap:12px;padding:12px var(--pad-card);background:var(--openui-elevated);border:1px solid var(--openui-border-default);border-radius:var(--radius-card)}
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
.mw-nav-menu{position:relative;display:block}.mw-nav-menu summary{cursor:pointer;list-style:none;border:1px solid var(--openui-border-default);border-radius:999px;padding:6px 10px}.mw-nav-menu summary::-webkit-details-marker{display:none}.mw-nav-dropdown{position:absolute;right:0;top:calc(100% + 8px);z-index:30;display:flex;flex-direction:column;gap:12px;min-width:150px;padding:14px;background:var(--openui-fg);border:1px solid var(--openui-border-default);border-radius:var(--radius-card);box-shadow:0 8px 24px #0002}.mw-nav-items{display:none}@container mw (min-width:600px){.mw-nav-items{display:flex}.mw-nav-menu{display:none}}
:where(.mw-hero-img){width:100%;height:auto;aspect-ratio:4 / 5;object-fit:cover;border-radius:calc(var(--radius-card) - 4px);display:block}
:where(.mw-hero-copy){display:flex;flex-direction:column;gap:var(--gap-item);min-width:0}:where(.mw-hero[data-layout="split"] .mw-hero-copy){max-width:60ch}:where(.mw-hero[data-layout="split"][data-has-media="false"] .mw-hero-copy){max-width:none}@container mw (min-width:600px){:where(.mw-hero[data-layout="split"]){align-items:center}:where(.mw-hero[data-layout="split"] .mw-hero-copy){justify-content:center;min-height:min(26.67cqw, 480px)}:where(.mw-hero[data-layout="split"][data-has-media="false"] .mw-hero-copy){max-width:min(100%,75ch);margin-inline:auto;text-align:center;align-items:center}:where(.mw-hero[data-layout="split"][data-has-media="false"] .mw-hero-badge){align-self:center}}:where(.mw-hero-media){min-width:0}:where(.mw-hero[data-layout="centered"] .mw-hero-copy){text-align:center;align-items:center}:where(.mw-hero[data-layout="immersive"][data-has-media="true"]){overflow:hidden;isolation:isolate}:where(.mw-hero[data-layout="immersive"][data-has-media="false"]){isolation:isolate;overflow:hidden;background:linear-gradient(color-mix(in srgb,var(--openui-bg) 48%,transparent),color-mix(in srgb,var(--openui-bg) 48%,transparent)),radial-gradient(circle at 20% 25%,var(--openui-accent-subtle),transparent 60%),radial-gradient(circle at 80% 75%,var(--openui-secondary),transparent 58%),conic-gradient(from 35deg,var(--openui-accent),var(--openui-elevated),var(--openui-secondary),var(--openui-accent));color:var(--openui-text-primary)}:where(.mw-hero[data-layout="immersive"][data-has-media="true"] .mw-hero-media){position:absolute;inset:0;z-index:-1}:where(.mw-hero[data-layout="immersive"] .mw-hero-img){height:100%;border-radius:0;filter:brightness(.55)}:where(.mw-card .mw-hero-img){aspect-ratio:1 / 1}@container mw (min-width:600px){:where(.mw-hero .mw-hero-img){aspect-ratio:15 / 8}:where(.mw-card .mw-hero-img){aspect-ratio:4 / 3}}@container mw (min-width:1024px){:where(.mw-hero[data-layout="immersive"] .mw-hero-img){aspect-ratio:2 / 1}}
.mw-nav-item{font-size:13px;font-weight:500;color:var(--openui-text-secondary);cursor:pointer;background:none;border:none;padding:0}
.mw-nav-item:hover{color:var(--openui-text-primary)}
.mw-nav-cta{border:0;border-radius:999px;padding:9px 16px;background:var(--openui-accent);color:var(--openui-text-on-accent);font-weight:600;cursor:pointer}
:where(.mw-hero){padding:var(--pad-card);color:var(--openui-text-on-accent)}
.mw-hero-badge{display:inline-flex;align-self:flex-start;border:1px solid currentColor;border-radius:var(--radius-chip,999px);padding:5px 10px;font-size:12px;font-weight:600;letter-spacing:.04em}
.mw-hero-sub{font-size:var(--type-body);line-height:1.55;opacity:.88;max-width:65ch}
.mw-hero-title{font-family:var(--font-heading);font-size:clamp(var(--type-title),4cqw + 12px,var(--type-display));font-weight:700;line-height:1.12;letter-spacing:-.025em;text-wrap:balance}
:where(.mw-hero[data-surface="gradient"]){background:linear-gradient(135deg,var(--openui-accent),var(--openui-secondary))}
:where(.mw-hero[data-surface="glow"]){background:radial-gradient(circle at 80% 20%,var(--openui-accent-subtle),transparent 60%),var(--openui-elevated);color:var(--openui-text-primary)}
:where(.mw-hero[data-surface="mesh"]){background:radial-gradient(circle at 20% 20%,var(--openui-accent-subtle),transparent 50%),radial-gradient(circle at 80% 80%,var(--openui-secondary),transparent 55%),var(--openui-elevated);color:var(--openui-text-primary)}
:where(.mw-hero[data-surface="sunk"]){background:var(--openui-sunk);color:var(--openui-text-primary)}
@container mw (min-width:600px){:where(.mw-hero){padding:calc(var(--pad-card) * 1.5)}}
@container mw (min-width:1024px){:where(.mw-hero){padding:calc(var(--pad-card) * 2)}}
:where(.mw-card[data-variant="elevated"]){background:var(--openui-elevated);box-shadow:var(--shadow-card)}
:where(.mw-card[data-variant="sunk"]){background:var(--openui-sunk)}
:where(.mw-card[data-variant="glass"]){background:color-mix(in srgb,var(--openui-elevated) 72%,transparent);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
:where(.mw-card[data-variant="outline"]){background:transparent;border:1px solid var(--openui-border-default)}
:where(.mw-card[data-variant="spotlight"]){background:var(--openui-accent-subtle);box-shadow:var(--shadow-glow)}
:where(.mw-card[data-variant="accent"]){background:var(--openui-accent);color:var(--openui-text-on-accent)}
.mw-card-icon{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:12px;background:var(--openui-accent-subtle);color:var(--openui-text-brand)}
:where(.mw-card[data-clickable="true"]){transition:transform .2s ease,box-shadow .2s ease;cursor:pointer}:where(.mw-card[data-clickable="true"]:hover){transform:translateY(-3px);box-shadow:var(--shadow-raised)}
.mw-browser-frame{border:1px solid var(--openui-border-default);border-radius:var(--radius-card);overflow:hidden;box-shadow:var(--shadow-raised);background:var(--openui-elevated)}
.mw-browser-bar{display:flex;gap:5px;align-items:center;padding:9px 12px;background:var(--openui-sunk)}.mw-browser-dot{width:7px;height:7px;border-radius:50%;background:var(--openui-text-tertiary)}.mw-browser-url{margin-left:8px;flex:1;border-radius:999px;background:var(--openui-elevated);height:13px}

.mw-chart{display:flex;align-items:flex-end;gap:6px;height:96px;width:100%}
.mw-chart-bar{flex:1;background:var(--openui-accent);border-radius:6px 6px 2px 2px;min-height:4px;opacity:.92}
.mw-fill-img{width:100%;height:100%;object-fit:cover;display:block}
.mw-empty{font-size:12px;color:var(--openui-text-tertiary);padding:10px 0}
.mw-slider{width:100%;accent-color:var(--openui-accent)}
.mw-slider-field{display:flex;flex-direction:column;gap:6px;width:100%}
.mw-list-divided .mw-row-item{border:none;border-radius:0;border-bottom:1px solid var(--openui-border-default);background:transparent;padding-inline:0}
.mw-list-divided .mw-row-item:last-child{border-bottom:none}`;

export function generateFullCss(
  doc: ProjectDoc,
  options: { editScope?: boolean; scrollModel?: 'phone' | 'web' } = {},
): string {
  return `${generateCss(doc, options)}\n${MOTION_DICTIONARY}\n${SWITCH_MOTION_CSS}\n${UTILITY_CSS}`;
}
