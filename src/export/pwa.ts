import type { ProjectDoc } from '../types/tree';

export function manifestFor(doc: ProjectDoc): string {
  const brand = doc.tokens.openuiTheme.brand_color;
  const bg = doc.tokens.openuiTheme.light_colors?.openui_bg || '#F8FAFC';
  return `${JSON.stringify(
    {
      name: doc.name,
      short_name: doc.name.slice(0, 14),
      description: `Built with Museware — ${doc.screens.length} screen${doc.screens.length === 1 ? '' : 's'}.`,
      start_url: './',
      scope: './',
      display: 'standalone',
      orientation: doc.kind === 'app' ? 'portrait' : 'any',
      background_color: bg,
      theme_color: brand,
      icons: [
        { src: './icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
      ],
    },
    null,
    2,
  )}\n`;
}

export function serviceWorkerTemplate(): string {
  return `const CACHE = 'museware-shell-v1';
const SHELL = ['./', './index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((hit) => {
      if (hit) return hit;
      return fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => undefined);
          return res;
        })
        .catch(() => caches.match('./index.html'));
    }),
  );
});
`;
}

export function installInstructions(doc: ProjectDoc): string {
  return doc.kind === 'app'
    ? 'Deploy over https, open on a phone, then use “Add to home screen”. The manifest and service worker are already wired.'
    : 'Deploy the dist folder anywhere static. The manifest is optional for sites, but it makes the page installable too.';
}
