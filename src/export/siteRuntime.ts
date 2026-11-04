/** Standalone, dependency-free runtime. Its function body is serialized into HTML. */
type SiteAction = {
  type: string;
  key?: string;
  value?: unknown;
  equals?: unknown;
  to?: string;
  url?: string;
  target?: '_blank' | '_self';
  method?: string;
  mode?: 'cors' | 'no-cors';
  headers?: Record<string, string>;
  successToast?: string;
  errorToast?: string;
  navigateOnSuccess?: string;
  clearOnSuccess?: boolean;
  text?: string;
  then?: SiteAction[];
};
type SiteNode = {
  id: string;
  type: string;
  props: Record<string, unknown>;
  visibleWhen?: { key: string; equals?: string | number | boolean };
  events?: { tap?: SiteAction[]; change?: SiteAction[]; submit?: SiteAction[] };
};
type SiteData = {
  nodes: SiteNode[];
  screens: Array<{ id: string; name: string }>;
  entry: string;
};
type Motion = (
  canvas: HTMLCanvasElement,
  options?: { preset?: string; speed?: number; interactive?: boolean },
) => void;

export function startSite(
  data: SiteData,
  mountMotion: Motion,
  armReveals?: (root: HTMLElement) => void,
  enterPanel?: (element: HTMLElement | null) => void,
): void {
  document.querySelectorAll<HTMLElement>('.mw-app').forEach((root) => armReveals?.(root));
  if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
    document
      .querySelectorAll<HTMLElement>('.mw-marquee[data-static="true"]')
      .forEach((el) => {
        delete el.dataset.static;
      });
  const state: Record<string, unknown> = {};
  const byId = new Map(data.nodes.map((node) => [node.id, node]));
  const elements = (id: string) =>
    Array.from(document.getElementsByClassName(`n-${id}`)) as HTMLElement[];
  const matches = (actual: unknown, expected: unknown) => {
    if (expected === true || expected === 'true') return Boolean(actual);
    if (expected === false || expected === 'false') return !actual;
    const numeric = (v: unknown) =>
      (typeof v === 'number' && Number.isFinite(v)) ||
      (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)));
    return numeric(actual) && numeric(expected)
      ? Number(actual) === Number(expected)
      : String(actual ?? '') === String(expected ?? '');
  };
  const refresh = () => {
    for (const node of data.nodes)
      for (const element of elements(node.id)) {
        const condition = node.visibleWhen;
        if (condition)
          element.hidden =
            condition.equals === undefined
              ? !state[condition.key]
              : !matches(state[condition.key], condition.equals);
        const key = typeof node.props.bindKey === 'string' ? node.props.bindKey : '';
        if (!key) continue;
        if (node.type === 'switch' || node.type === 'checkbox') {
          const control = element.querySelector<HTMLElement>('.mw-switch,.mw-check');
          if (control) control.dataset.on = String(Boolean(state[key]));
          element.setAttribute('role', node.type === 'switch' ? 'switch' : 'checkbox');
          element.setAttribute('aria-checked', String(Boolean(state[key])));
          element.tabIndex = 0;
        } else if (
          element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement ||
          element instanceof HTMLSelectElement
        ) {
          if (state[key] !== undefined) element.value = String(state[key]);
        } else if (node.type === 'progress') {
          const fill = element.querySelector<HTMLElement>('.mw-progress-fill');
          const value = Math.max(
            0,
            Math.min(100, Number(state[key] ?? node.props.value) || 0),
          );
          if (fill) fill.style.width = `${value}%`;
        }
      }
  };
  const go = (target: string) => {
    const slug = target
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    const screen = data.screens.find(
      (s) =>
        s.id === target ||
        s.id === slug ||
        (slug && s.id.includes(slug)) ||
        s.name.toLowerCase() === target.toLowerCase(),
    );
    if (!screen) {
      const rawId = target.replace(/^#/, '');
      const el =
        document.getElementById(rawId) ||
        document.getElementById(slug) ||
        document.getElementById(`section_${slug}`) ||
        document.querySelector<HTMLElement>(`[data-node-id="${rawId}"], [data-node-id="${slug}"], [data-node-id="section_${slug}"]`) ||
        document.querySelector<HTMLElement>(`.n-${slug}, .n-section_${slug}, .n-${rawId}`) ||
        document.querySelector<HTMLElement>(`section[id*="${slug}"], [class*="section_"][class*="${slug}"]`);
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }
    const changed = typeof state.__screen === 'string' && state.__screen !== screen.id;
    document.querySelectorAll<HTMLElement>('[data-screen]').forEach((el) => {
      el.hidden = el.dataset.screen !== screen.id;
      if (changed && !el.hidden)
        enterPanel?.(el.querySelector<HTMLElement>('.mw-app') || el);
    });
    state.__screen = screen.id;
    refresh();
  };
  const interpolate = (template: string | undefined): string => {
    if (!template || typeof template !== 'string') return '';
    return template.replace(/\{([a-zA-Z0-9_.-]+)\}/g, (_, key) => {
      const val = state[key];
      if (val === undefined || val === null) return '';
      return encodeURIComponent(String(val));
    });
  };
  const run = (actions: SiteAction[] | undefined, depth = 1) => {
    if (depth > 3) return;
    for (const action of actions || []) {
      if (action.type === 'navigate' && action.to) go(action.to);
      else if (action.type === 'setState' && action.key) state[action.key] = action.value;
      else if (action.type === 'toggle' && action.key)
        state[action.key] = !state[action.key];
      else if (
        action.type === 'when' &&
        action.key &&
        (action.equals === undefined
          ? Boolean(state[action.key])
          : matches(state[action.key], action.equals))
      )
        run(action.then, depth + 1);
      else if (action.type === 'openUrl' && action.url) {
        const url = interpolate(action.url);
        window.open(url, action.target || '_blank', 'noopener,noreferrer');
      } else if (action.type === 'submitWebhook' && action.url) {
        const method = action.method || 'POST';
        const url = interpolate(action.url);
        const isGoogle = /script\.google\.com/i.test(url);
        const mode = action.mode || (isGoogle ? 'no-cors' : 'cors');
        const headers: Record<string, string> = { ...(action.headers || {}) };
        let body: BodyInit | undefined = undefined;
        if (method === 'POST') {
          if (mode === 'no-cors' || isGoogle) {
            const params = new URLSearchParams();
            for (const [k, v] of Object.entries(state)) {
              if (v !== undefined && v !== null && !k.startsWith('__')) {
                params.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
              }
            }
            body = params.toString();
            headers['Content-Type'] = 'application/x-www-form-urlencoded';
          } else {
            const payload: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(state)) {
              if (!k.startsWith('__')) payload[k] = v;
            }
            body = JSON.stringify(payload);
            if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
          }
        }
        try {
          fetch(url, {
            method,
            mode,
            headers: Object.keys(headers).length ? headers : undefined,
            body,
          })
            .then((res) => {
              if (mode === 'no-cors' || res.ok || res.type === 'opaque') {
                run([{ type: 'toast', text: interpolate(action.successToast) || 'Submitted successfully!' }]);
                if (action.clearOnSuccess !== false) {
                  for (const k of Object.keys(state)) {
                    if (!k.startsWith('__')) delete state[k];
                  }
                  refresh();
                }
                if (action.navigateOnSuccess) go(action.navigateOnSuccess);
              } else {
                run([{ type: 'toast', text: interpolate(action.errorToast) || `Submission failed (${res.status})` }]);
              }
            })
            .catch((err) => {
              console.warn('Webhook dispatch failed:', err);
              run([{ type: 'toast', text: interpolate(action.errorToast) || 'Submission failed. Check network connection.' }]);
            });
        } catch (err) {
          console.warn('Webhook dispatch exception:', err);
          run([{ type: 'toast', text: interpolate(action.errorToast) || 'Submission failed.' }]);
        }
      } else if (action.type === 'toast' && action.text) {
        const toast = document.getElementById('site-toast');
        if (toast) {
          toast.textContent = interpolate(action.text);
          toast.hidden = false;
          window.setTimeout(() => {
            toast.hidden = true;
          }, 3200);
        }
      }
    }
    refresh();
  };
  const hit = (
    target: EventTarget | null,
  ): { node: SiteNode; element: HTMLElement } | null => {
    let el = target instanceof Element ? target : null;
    while (el) {
      for (const name of Array.from(el.classList)) {
        const node = name.startsWith('n-') ? byId.get(name.slice(2)) : undefined;
        if (node) return { node, element: el as HTMLElement };
      }
      el = el.parentElement;
    }
    return null;
  };
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const found = hit(target);
    if (!target || !found) return;
    const { node, element } = found;
    const tab = target.closest<HTMLElement>('[data-site-tab]');
    if (tab && node.type === 'tabs') {
      const index = tab.dataset.siteTab;
      element.querySelectorAll<HTMLElement>('[data-site-tab]').forEach((button) => {
        if (hit(button)?.element === element)
          button.dataset.active = String(button.dataset.siteTab === index);
      });
      element.querySelectorAll<HTMLElement>('[data-site-panel]').forEach((panel) => {
        if (panel.parentElement === element) {
          const wasHidden = panel.hidden;
          panel.hidden = panel.dataset.sitePanel !== index;
          if (wasHidden && !panel.hidden) enterPanel?.(panel);
        }
      });
      run(node.events?.change);
      return;
    }
    if (node.type === 'navbar' || node.type === 'bottomnav') {
      const button = target.closest('button');
      if (button) {
        const cta =
          button.classList.contains('mw-nav-cta') ||
          (node.props.cta && button.textContent === node.props.cta);
        go(String(cta ? node.props.ctaTo || '' : button.textContent || ''));
        run(node.events?.tap);
      }
      return;
    }
    if (
      (node.type === 'switch' || node.type === 'checkbox') &&
      typeof node.props.bindKey === 'string'
    ) {
      const key = node.props.bindKey;
      state[key] = !state[key];
      run(node.events?.change);
      return;
    }
    if (node.type === 'link' && typeof node.props.to === 'string' && node.props.to)
      go(node.props.to);
    run(node.events?.tap);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const found = hit(event.target);
    if (found && ['switch', 'checkbox'].includes(found.node.type)) {
      event.preventDefault();
      found.element.click();
    }
  });
  const update = (event: Event) => {
    const found = hit(event.target);
    if (!found) return;
    const input = event.target;
    const key = found.node.props.bindKey;
    if (
      typeof key === 'string' &&
      (input instanceof HTMLInputElement ||
        input instanceof HTMLTextAreaElement ||
        input instanceof HTMLSelectElement)
    )
      state[key] = input.type === 'range' ? Number(input.value) : input.value;
    if (event.type === 'change') run(found.node.events?.change);
    else refresh();
  };
  document.addEventListener('input', update);
  document.addEventListener('change', update);
  document.addEventListener('submit', (event) => {
    const found = hit(event.target);
    if (found) {
      event.preventDefault();
      if (found.node.events?.submit?.length) run(found.node.events.submit);
      else run([{ type: 'toast', text: 'This form has no submit action yet.' }]);
    }
  });
  for (const node of data.nodes) {
    if (node.type !== 'scene3d' && node.type !== 'video') continue;
    for (const element of elements(node.id)) {
      const canvas = element.querySelector('canvas');
      if (canvas)
        mountMotion(canvas, {
          preset: node.type === 'video' ? 'reel' : String(node.props.preset || 'globe'),
          speed: Number(node.props.speed) || 1,
          interactive: Boolean(node.props.interactive),
        });
    }
  }
  for (const node of data.nodes) {
    const liveUrl = typeof node.props.dataSourceUrl === 'string' ? node.props.dataSourceUrl.trim() : '';
    if (!liveUrl) continue;
    for (const element of elements(node.id)) {
      fetch(liveUrl)
        .then((res) => res.json())
        .then((items) => {
          if (!Array.isArray(items) || !items.length) return;
          if (node.type === 'table') {
            const cols = Array.from(element.querySelectorAll('.mw-table-head .mw-table-cell')).map((c) => c.textContent?.trim() || '');
            const existingRows = Array.from(element.querySelectorAll('.mw-table-row'));
            existingRows.forEach((r) => r.remove());
            items.slice(0, 30).forEach((r) => {
              const row = document.createElement('div');
              row.className = 'mw-table-row';
              cols.forEach((c, ci) => {
                const key = c.toLowerCase().replace(/\s+/g, '_');
                const val = r[key] ?? r[c] ?? r[Object.keys(r)[ci] ?? ''] ?? '';
                const cell = document.createElement('span');
                cell.className = 'mw-table-cell';
                cell.setAttribute('data-col', c.toLowerCase().trim());
                cell.textContent = String(val);
                row.appendChild(cell);
              });
              element.appendChild(row);
            });
          }
        })
        .catch((err) => {
          console.warn('Live data sync skipped:', err);
        });
    }
  }
  go(data.entry);
  refresh();
}
