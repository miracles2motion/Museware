import type { ComponentNode, ProjectDoc, ScreenDoc, Action } from '../types/tree';
import { materializeCss } from '../design/materialize';
import { generateFullCss, nodeClass } from '../canvas/cssGen';
import { ICON_NAMES } from '../types/library';

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

function renderChildren(node: ComponentNode, indent: number, screens: ScreenDoc[]): string {
  return node.children.map((child) => renderNode(child, indent, screens)).join('\n');
}

function renderLeaf(
  node: ComponentNode,
  indent: number,
  screens: ScreenDoc[],
  screen: ScreenDoc,
): string {
  const pad = '  '.repeat(indent);
  const cls = nodeClass(node.id);
  const p = node.props as Record<string, unknown>;
  const tap = attrEvents(node, 'tap');
  const change = attrEvents(node, 'change');
  const bind = typeof p.bindKey === 'string' ? p.bindKey : '';
  const data = bind && screen.mockData ? screen.mockData[bind] : undefined;
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
      return p.src
        ? `${pad}<img className={${str(cls)}} src=${str(p.src)} alt=${str(p.alt || '')} style={{ width: '100%', objectFit: ${str(p.fit || 'cover')} }} />`
        : `${pad}<div className={${str(cls)}} />`;
    case 'avatar':
      return `${pad}<span className={${str(cls)}} style={{ width: ${Number(p.size) || 44}, height: ${Number(p.size) || 44}, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>${jsxText(p.initials)}</span>`;
    case 'progress': {
      const value = Number(p.value) || 0;
      return `${pad}<div className={${str(cls)}}><div className="mw-progress-track"><div className="mw-progress-fill" style={{ width: String(state[${str(bind || 'progress')}] ?? ${value}) + '%' }} /></div></div>`;
    }
    case 'spinner':
      return `${pad}<span className="mw-spinner" />`;
    case 'button':
      return `${pad}<button className={${str(cls)}} onClick={() => ${tap || 'undefined'}}>${jsxText(p.text)}</button>`;
    case 'iconbutton':
      return `${pad}<button className={${str(cls)}} onClick={() => ${tap || 'undefined'}} aria-label=${str(iconName(node))}><Icon name=${str(iconName(node))} size={20} /></button>`;
    case 'input':
      return `${pad}<input className={${str(cls)}} placeholder=${str(p.placeholder || '')} value={${bindValue(bind)}} onChange={(e) => setKey(${str(bind)}, e.target.value)} />`;
    case 'textarea':
      return `${pad}<textarea className={${str(cls)}} rows={${Number(p.rows) || 4}} placeholder=${str(p.placeholder || '')} value={${bindValue(bind)}} onChange={(e) => setKey(${str(bind)}, e.target.value)} />`;
    case 'select': {
      const options = Array.isArray(p.options) ? (p.options as unknown[]).map(String) : [];
      return `${pad}<select className={${str(cls)}} value={${bindValue(bind)}} onChange={(e) => setKey(${str(bind)}, e.target.value)}>${options
        .map((o) => `<option value=${str(o)}>${jsxText(o)}</option>`)
        .join('')}</select>`;
    }
    case 'checkbox':
      return `${pad}<label className={${str(cls)}}><input type="checkbox" checked={Boolean(state[${str(bind)}])} onChange={(e) => { setKey(${str(bind)}, e.target.checked); ${
        change || ''
      } }} /> ${jsxText(p.label)}</label>`;
    case 'switch':
      return `${pad}<label className={${str(cls)}}><input type="checkbox" checked={Boolean(state[${str(bind)}])} onChange={(e) => { setKey(${str(bind)}, e.target.checked); ${
        change || ''
      } }} /> ${jsxText(p.label)}</label>`;
    case 'slider':
      return `${pad}<input className={${str(cls)}} type="range" min={${Number(p.min) || 0}} max={${Number(p.max) || 100}} step={${Number(p.step) || 1}} value={Number(state[${str(bind)}] ?? ${
        Number(p.min) || 0
      })} onChange={(e) => { setKey(${str(bind)}, Number(e.target.value)); ${change || ''} }} />`;
    case 'datepicker':
      return `${pad}<input className={${str(cls)}} type="date" value={${bindValue(bind)}} onChange={(e) => setKey(${str(bind)}, e.target.value)} />`;
    case 'navbar': {
      const items = Array.isArray(p.items) ? (p.items as unknown[]).map(String) : [];
      return `${pad}<nav className={${str(cls)}}>
${pad}  <span className="mw-nav-brand">${jsxText(p.brand)}</span>
${pad}  <span className="mw-nav-items">${items
        .map(
          (item) =>
            `<button className="mw-nav-item" onClick={() => go(${str(item)})}>${jsxText(item)}</button>`,
        )
        .join('')}</span>
${pad}</nav>`;
    }
    case 'bottomnav': {
      const items = Array.isArray(p.items) ? (p.items as unknown[]).map(String) : [];
      return `${pad}<nav className={${str(cls)}}>${items
        .map(
          (item) =>
            `<button className="mw-nav-item" onClick={() => go(${str(item)})}>${jsxText(item)}</button>`,
        )
        .join('')}</nav>`;
    }
    case 'link':
      return `${pad}<button className={${str(cls)}} onClick={() => ${tap || `go(${str(p.to || '')})`}}>${jsxText(p.text)} <Icon name="chevron-right" size={14} /></button>`;
    case 'fab':
      return `${pad}<button className={${str(cls)}} onClick={() => ${tap || 'undefined'}}><Icon name=${str(iconName(node))} size={24} /></button>`;
    case 'list': {
      const rows = (data as Array<Record<string, unknown>> | undefined) || [];
      const items = rows.slice(0, 5);
      return `${pad}<div className={${str(cls)}}>
${items
  .map((row, i) => {
    const keys = Object.keys(row);
    const title = row.title ?? row.name ?? row[keys[0]] ?? 'Item';
    const sub = row.detail ?? row.subtitle ?? row[keys[1]] ?? '';
    const tail = row.meta ?? row.value ?? row[keys[2]] ?? '';
    return `${pad}  <div className="mw-row-item" key={${i}}>
${pad}    <div className="mw-row-main"><div className="mw-row-title">${jsxText(title)}</div>${
      sub ? `<div className="mw-row-sub">${jsxText(sub)}</div>` : ''
    }</div>${tail ? `<span className="mw-row-value">${jsxText(tail)}</span>` : ''}<Icon name="chevron-right" size={16} />
${pad}  </div>`;
  })
  .join('\n')}
${pad}</div>`;
    }
    case 'table': {
      const columns = Array.isArray(p.columns)
        ? (p.columns as unknown[]).map(String)
        : ['Name', 'Value'];
      const rows = ((data as Array<Record<string, unknown>> | undefined) || []).slice(
        0,
        10,
      );
      return `${pad}<div className={${str(cls)}}>
${pad}  <div className="mw-table-head">${columns.map((c) => `<span className="mw-table-cell">${jsxText(c)}</span>`).join('')}</div>
${rows
  .map(
    (row) =>
      `${pad}  <div className="mw-table-row">${columns
        .map(
          (c) =>
            `<span className="mw-table-cell">{String(${JSON.stringify(row)}[${str(
              c.toLowerCase().replace(/\s+/g, '_'),
            )}] ?? '')}</span>`,
        )
        .join('')}</div>`,
  )
  .join('\n')}
${pad}</div>`;
    }
    case 'stat':
      return `${pad}<div className={${str(cls)}}><span style={{ fontSize: 12, opacity: 0.75 }}>${jsxText(p.label)}</span><span style={{ fontSize: 24, fontWeight: 700 }}>${jsxText(
        p.value,
      )}</span><span style={{ fontSize: 12, color: 'var(--openui-success-text)' }}>${jsxText(p.delta)}</span></div>`;
    case 'chart': {
      const rows = (data as Array<Record<string, unknown>> | undefined) || [];
      const values = rows.length
        ? rows
            .slice(0, 12)
            .map((r) => Number(Object.values(r).find((v) => typeof v === 'number') ?? 0))
        : [42, 58, 36, 71, 64, 88, 54];
      const max = Math.max(...values, 1);
      return `${pad}<div className={${str(cls)}}><div className="mw-chart">${values
        .map(
          (v) =>
            `<div className="mw-chart-bar" style={{ height: '${Math.max(6, Math.round((v / max) * 100))}%' }} />`,
        )
        .join('')}</div></div>`;
    }
    case 'hero':
      return `${pad}<div className={${str(cls)}}>
${p.image ? `${pad}  <img className="mw-hero-img" src=${str(p.image)} alt=${str(p.title || '')} />` : ''}
${pad}  <h1 className="hero-title">${jsxText(p.title)}</h1>
${pad}  <p className="hero-sub">${jsxText(p.subtitle)}</p>
${pad}  ${renderChildren(node, indent + 1, screens)}
${pad}</div>`;
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
  const children = renderChildren(node, indent + 1, screens);
  const visible = node.visibleWhen
    ? `{${node.visibleWhen.equals === undefined ? `Boolean(state[${str(node.visibleWhen.key)}])` : `matchesValue(state[${str(node.visibleWhen.key)}], ${JSON.stringify(node.visibleWhen.equals)})`} && (`
    : '';
  const visibleClose = node.visibleWhen ? ')}' : '';
  const wrap = (inner: string) => `${pad}${visible}${inner}${visibleClose}`;
  const p = node.props as Record<string, unknown>;
  switch (node.type) {
    case 'screen':
      return renderChildren(node, indent, screens);
    case 'row':
    case 'col':
    case 'grid':
    case 'form':
      return wrap(
        `<${node.type === 'form' ? 'form' : 'section'} className={${str(cls)}}${
          node.type === 'form'
            ? ` onSubmit={(e) => { e.preventDefault(); ${attrEvents(node, 'submit') || ''} }}`
            : ''
        }>\n${children}\n${pad}</${node.type === 'form' ? 'form' : 'section'}>`,
      );
    case 'card':
    case 'section': {
      const tag = node.type === 'card' ? 'div' : 'section';
      const tap = attrEvents(node, 'tap');
      const title = p.title
        ? `<div style={{ fontSize: ${node.type === 'card' ? 15 : 16}, fontWeight: 700, color: 'var(--openui-text-primary)' }}>${jsxText(p.title)}</div>`
        : '';
      return wrap(
        `<${tag} className={${str(cls)}}${tap ? ` onClick={() => ${tap}}` : ''}>\n${title}\n${children}\n${pad}</${tag}>`,
      );
    }
    case 'tabs': {
      const items = Array.isArray(p.items) ? (p.items as unknown[]).map(String) : [];
      return wrap(
        `<TabsBlock>\n${pad}  ${children}\n${pad}</TabsBlock>`.replace(
          '<TabsBlock>',
          `<TabsBlock items={${JSON.stringify(items)}}>`,
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
  const body = renderNode(screen.root, 2, doc.screens, screen);
  return `import { useApp, TabsBlock, matchesValue } from '../runtime';
import { Icon } from '../icons';

export function ${name}Screen() {
  const { state, setKey, run, go } = useApp();
  void go;
  return (
    <div className="mw-app">
${body}
    </div>
  );
}
`;
}

export function generateProjectFiles(doc: ProjectDoc): Record<string, string> {
  const files: Record<string, string> = {};
  const entry = doc.screens.find((s) => s.entry) || doc.screens[0];
  const usedIcons = new Set<string>(['star']);
  for (const screen of doc.screens) {
    const walk = (node: ComponentNode) => {
      if (node.type === 'icon' || node.type === 'iconbutton' || node.type === 'fab')
        usedIcons.add(iconName(node));
      if (node.type === 'list') usedIcons.add('chevron-right');
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

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const Cmp = MAP[name] || L.Star;
  return <Cmp size={size} strokeWidth={1.9} aria-hidden />;
}
`;

  files['src/runtime.tsx'] =
    `import { Children, createContext, useContext, useState, type ReactNode } from 'react';
import type { Action } from './types';

export function matchesValue(actual: unknown, expected: unknown): boolean {
  if (expected === true || expected === 'true') return Boolean(actual);
  if (expected === false || expected === 'false') return !actual;
  const numeric = (v: unknown) => (typeof v === 'number' && Number.isFinite(v)) ||
    (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)));
  if (numeric(actual) && numeric(expected)) return Number(actual) === Number(expected);
  return String(actual ?? '') === String(expected ?? '');
}

export interface AppApi {
  screen: string;
  state: Record<string, unknown>;
  setKey: (key: string, value: unknown) => void;
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

export function TabsBlock({ items, children }: { items: string[]; children: ReactNode }) {
  const [active, setActive] = useState(0);
  return (
    <div>
      <div className="mw-tab-strip">
        {items.map((item, i) => (
          <button key={item} className="mw-tab" data-active={i === active} onClick={() => setActive(i)}>{item}</button>
        ))}
      </div>
      {Children.toArray(children)[active] ?? children}
    </div>
  );
}
`;

  files['src/App.tsx'] = `import { useEffect, useMemo, useState } from 'react';
import { AppContext, SCREENS, slug, matchesValue } from './runtime';
import type { Action } from './types';
${doc.screens.map((s) => `import { ${pascal(s.id)}Screen } from './screens/${pascal(s.id)}';`).join('\n')}

const SCREEN_COMPONENTS = {
${doc.screens.map((s) => `  ${str(s.id)}: ${pascal(s.id)}Screen,`).join('\n')}
};

const START = ${str(entry?.id || '')};

export default function App() {
  const [screen, setScreen] = useState(START);
  const [state, setState] = useState<Record<string, unknown>>({});
  const [toastText, setToastText] = useState<string | null>(null);

  const api = useMemo(() => {
    const api = {
      screen,
      state,
      setKey: (key: string, value: unknown) => setState((s) => ({ ...s, [key]: value })),
      navigate: (to: string) => {
        if (SCREEN_COMPONENTS[to as keyof typeof SCREEN_COMPONENTS]) setScreen(to);
      },
      go: (target: string) => {
        const match = SCREENS.find((s) => s.id === target || s.id === slug(target) || s.name === target);
        if (match) setScreen(match.id);
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
          else if (a.type === 'toast') api.toast(a.text);
          else if (a.type === 'openUrl' && window.confirm('Open ' + a.url + '?')) window.open(a.url, '_blank');
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

  useEffect(() => {
    document.documentElement.dataset.theme = 'light';
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
  | { type: 'openUrl'; url: string }
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
    `/* Generated from the Museware tree — do not hand-edit. */\n.mw-app{${doc.kind === 'web' ? 'min-height:100vh' : 'height:100vh;overflow-y:auto'};margin:0 auto;width:100%;max-width:${doc.kind === 'web' ? '1280px' : '480px'};background:var(--openui-bg);color:var(--openui-text-primary);container-type:inline-size;container-name:mw;font-family:var(--font-body)}\n${generateFullCss(doc)}\n`;
  files['src/app.css'] =
    `.hero-title{font-family:var(--font-heading);font-size:clamp(24px,4cqw + 14px,40px);font-weight:700;line-height:1.12;letter-spacing:-0.02em;margin:0;color:inherit}\n.hero-sub{font-size:15px;line-height:1.55;margin:0;opacity:.9;max-width:560px}\n.toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:var(--openui-elevated);color:var(--openui-text-primary);border:1px solid var(--openui-border-default);border-radius:12px;padding:10px 16px;font-size:13px;box-shadow:0 12px 32px rgba(0,0,0,.22);z-index:50}\nbody{margin:0}\n`;

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
    <script type="module" src="/src/main.tsx"></script>
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

export default defineConfig({ plugins: [react()], build: { target: 'es2022' } });
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

  files['icon.svg'] =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="22" fill="${doc.tokens.openuiTheme.brand_color}"/><path d="M26 66V30h9l13 22 13-22h9v36h-8V44L50 66h-4L34 44v22z" fill="#fff"/></svg>`;

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
  return files;
}
