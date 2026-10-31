import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { CanvasStyle, NodeView } from '../canvas/NodeView';
import type { ProjectDoc, ScreenDoc } from '../types/tree';
import type { RuntimeApi } from '../preview/runtime';

export const CAPTURE_WIDTHS = [
  { width: 390, name: 'mobile' },
  { width: 768, name: 'tablet' },
  { width: 1280, name: 'desktop' },
] as const;

async function inlineImages(root: HTMLElement): Promise<void> {
  for (const img of Array.from(root.querySelectorAll('img'))) {
    const src = img.getAttribute('src') || '';
    if (!src || src.startsWith('data:')) continue;
    const response = await fetch(src, { mode: 'cors' });
    if (!response.ok) throw new Error('An image could not be loaded for the screenshots.');
    const blob = await response.blob();
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () =>
        reject(new Error('An image could not be included in the screenshots.'));
      reader.readAsDataURL(blob);
    });
    img.setAttribute('src', data);
  }
}

export async function captureScreen(
  doc: ProjectDoc,
  screen: ScreenDoc,
  width: number,
): Promise<Blob> {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  Object.assign(iframe.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: `${width}px`,
    height: '1000px',
    border: '0',
    visibility: 'hidden',
  });
  document.body.appendChild(iframe);
  let root: ReturnType<typeof createRoot> | undefined;
  try {
    const frame = iframe.contentDocument;
    if (!frame) throw new Error('Could not create the screenshot frame.');
    frame.open();
    frame.write(
      '<!doctype html><html><head></head><body><div id="capture"></div></body></html>',
    );
    frame.close();
    const host = frame.getElementById('capture');
    if (!host) throw new Error('Could not create the screenshot canvas.');
    const reset = frame.createElement('style');
    reset.textContent = `html,body{margin:0;padding:0;width:100%;height:auto}*{box-sizing:border-box} .capture-container{container:mw / inline-size;width:100%} .mw-css-root,.mw-app{height:auto!important;min-height:0!important;width:100%}.mw-app>.n-${screen.root.id}{height:auto!important;min-height:0!important;overflow:visible!important}*{animation:none!important;transition:none!important}`;
    frame.head.appendChild(reset);
    const runtime: RuntimeApi = {
      screenId: screen.id,
      screens: doc.screens,
      state: {},
      setKey: () => {},
      toast: () => {},
      navigate: () => {},
      openUrl: () => {},
    };
    root = createRoot(host);
    flushSync(() =>
      root!.render(
        <>
          <CanvasStyle doc={doc} />
          <div className="capture-container">
            <NodeView doc={doc} screen={screen} mode="run" runtime={runtime} />
          </div>
        </>,
      ),
    );
    await frame.fonts?.ready;
    await Promise.all(
      Array.from(host.querySelectorAll('img')).map(
        (img) => img.decode?.().catch(() => {}) ?? Promise.resolve(),
      ),
    );
    await inlineImages(host);
    const content = host.querySelector('.capture-container') as HTMLElement | null;
    if (!content) throw new Error('Could not render the screen.');
    const height = Math.max(
      1,
      Math.ceil(content.scrollHeight),
      Math.ceil(content.getBoundingClientRect().height),
    );
    if (height > 32767)
      throw new Error('This screen is too tall to capture in this browser.');
    const css = Array.from(frame.querySelectorAll('style'))
      .map((style) => style.textContent || '')
      .join('\n');
    const serialized = new XMLSerializer().serializeToString(content);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml"><style>${css.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</style>${serialized}</div></foreignObject></svg>`;
    const imageUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(new Error('The browser could not render the screenshot.'));
      image.src = imageUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser cannot create screenshots.');
    context.drawImage(image, 0, 0);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error('Could not encode the screenshot.')),
        'image/png',
      ),
    );
  } finally {
    if (root) root.unmount();
    iframe.remove();
  }
}

export async function downloadScreenshots(
  doc: ProjectDoc,
  screenId?: string | null,
  capture = captureScreen,
  download = downloadBlob,
): Promise<void> {
  const screen =
    doc.screens.find((s) => s.id === screenId) ||
    doc.screens.find((s) => s.entry) ||
    doc.screens[0];
  if (!screen) throw new Error('Add a screen before downloading screenshots.');
  const name =
    doc.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'project';
  // Render all first: a failed image never leaves an apparently complete partial set.
  const blobs: Blob[] = [];
  for (const size of CAPTURE_WIDTHS) blobs.push(await capture(doc, screen, size.width));
  CAPTURE_WIDTHS.forEach((size, i) => download(blobs[i], `${name}-${size.name}.png`));
}
function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2500);
}
