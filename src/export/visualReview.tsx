import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { CanvasStyle, NodeView } from '../canvas/NodeView';
import type { ProjectDoc } from '../types/tree';
import type { RuntimeApi } from '../preview/runtime';

export interface VisualReviewOptions {
  scale?: number;
  quality?: number;
  format?: 'image/webp' | 'image/jpeg';
  maxHeight?: number;
}

const DEFAULT_OPTIONS: Required<VisualReviewOptions> = {
  scale: 0.65,
  quality: 0.72,
  format: 'image/webp',
  maxHeight: 2400,
};

async function inlineImagesSafe(root: HTMLElement): Promise<void> {
  const images = Array.from(root.querySelectorAll('img'));
  await Promise.all(
    images.map(async (img) => {
      try {
        const src = img.getAttribute('src') || '';
        if (!src || src.startsWith('data:')) return;
        const response = await fetch(src, { mode: 'cors' });
        if (!response.ok) return;
        const blob = await response.blob();
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        img.setAttribute('src', data);
      } catch {
        // Non-fatal for visual review: leave image placeholder or src intact
      }
    }),
  );
}

/**
 * Captures a lightweight dual-viewport collage (Desktop 1024px + Mobile 390px)
 * for multimodal LLM visual inspection.
 * Produces a bounded WebP/JPEG data URL (~60KB–100KB, ~250 vision tokens).
 */
export async function captureVisualReviewCollage(
  doc: ProjectDoc,
  screenId?: string | null,
  options?: VisualReviewOptions,
): Promise<string> {
  const screen =
    doc.screens.find((s) => s.id === screenId) ||
    doc.screens.find((s) => s.entry) ||
    doc.screens[0];
  if (!screen) return '';

  if (
    typeof document === 'undefined' ||
    typeof window === 'undefined' ||
    (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent))
  ) {
    return '';
  }

  const opts = { ...DEFAULT_OPTIONS, ...options };
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  Object.assign(iframe.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: '1550px',
    height: '2400px',
    border: '0',
    visibility: 'hidden',
  });
  document.body.appendChild(iframe);

  let root: ReturnType<typeof createRoot> | undefined;
  try {
    const frame = iframe.contentDocument;
    if (!frame) return '';

    frame.open();
    frame.write(
      '<!doctype html><html><head></head><body style="margin:0;padding:0;background:var(--mw-bg);"><div id="capture"></div></body></html>',
    );
    frame.close();

    const host = frame.getElementById('capture');
    if (!host) return '';

    const reset = frame.createElement('style');
    reset.textContent = `
      html, body { margin: 0; padding: 0; width: 100%; height: auto; box-sizing: border-box; }
      * { box-sizing: border-box; }
      .capture-container { container: mw / inline-size; width: 100%; }
      .mw-css-root, .mw-app { height: auto !important; min-height: 0 !important; width: 100%; }
      .mw-app > .n-${screen.root.id} { height: auto !important; min-height: 0 !important; overflow: visible !important; }
      * { animation: none !important; transition: none !important; }
    `;
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
          <div
            className="review-collage"
            style={{
              display: 'flex',
              flexDirection: 'row',
              gap: 28,
              alignItems: 'flex-start',
              background: 'var(--openui-bg, var(--mw-bg))',
              padding: 24,
              width: 1516,
            }}
          >
            {/* Desktop Viewport (1024px) */}
            <div
              style={{
                flex: '0 0 1024px',
                width: 1024,
                border: '1px solid var(--openui-border-default, var(--mw-border))',
                borderRadius: 12,
                overflow: 'hidden',
                background: 'var(--openui-bg, var(--mw-bg))',
              }}
            >
              <div
                style={{
                  background: 'var(--openui-elevated, var(--mw-surface))',
                  padding: '8px 14px',
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  color: 'var(--openui-text-secondary, var(--mw-ink-2))',
                  borderBottom: '1px solid var(--openui-border-default, var(--mw-border))',
                  fontFamily: 'sans-serif',
                }}
              >
                DESKTOP VIEW (1024px)
              </div>
              <div className="capture-container" style={{ width: '100%' }}>
                <NodeView doc={doc} screen={screen} mode="run" runtime={runtime} noMotionArm />
              </div>
            </div>

            {/* Mobile Viewport (390px) */}
            <div
              style={{
                flex: '0 0 390px',
                width: 390,
                border: '1px solid var(--openui-border-default, var(--mw-border))',
                borderRadius: 12,
                overflow: 'hidden',
                background: 'var(--openui-bg, var(--mw-bg))',
              }}
            >
              <div
                style={{
                  background: 'var(--openui-elevated, var(--mw-surface))',
                  padding: '8px 14px',
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  color: 'var(--openui-text-secondary, var(--mw-ink-2))',
                  borderBottom: '1px solid var(--openui-border-default, var(--mw-border))',
                  fontFamily: 'sans-serif',
                }}
              >
                MOBILE VIEW (390px)
              </div>
              <div className="capture-container" style={{ width: '100%' }}>
                <NodeView doc={doc} screen={screen} mode="run" runtime={runtime} noMotionArm />
              </div>
            </div>
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
    await inlineImagesSafe(host);

    const collage = host.querySelector('.review-collage') as HTMLElement | null;
    if (!collage) return '';

    const rawWidth = Math.ceil(collage.getBoundingClientRect().width) || 1516;
    const rawHeight = Math.min(
      opts.maxHeight,
      Math.max(1, Math.ceil(collage.scrollHeight), Math.ceil(collage.getBoundingClientRect().height)),
    );

    const css = Array.from(frame.querySelectorAll('style'))
      .map((style) => style.textContent || '')
      .join('\n');

    const serialized = new XMLSerializer().serializeToString(collage);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${rawWidth}" height="${rawHeight}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml"><style>${css.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</style>${serialized}</div></foreignObject></svg>`;
    const imageUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Collage render timed out')), 500);
      image.onload = () => {
        clearTimeout(timer);
        resolve();
      };
      image.onerror = () => {
        clearTimeout(timer);
        reject(new Error('The browser could not render the collage.'));
      };
      image.src = imageUrl;
    });

    const targetWidth = Math.round(rawWidth * opts.scale);
    const targetHeight = Math.round(rawHeight * opts.scale);

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext('2d');
    if (!context) return '';

    context.drawImage(image, 0, 0, targetWidth, targetHeight);

    // Prefer WebP for dramatic compression, fallback to JPEG
    let dataUrl = '';
    try {
      dataUrl = canvas.toDataURL(opts.format, opts.quality);
      if (!dataUrl.startsWith(`data:${opts.format}`)) {
        dataUrl = canvas.toDataURL('image/jpeg', opts.quality);
      }
    } catch {
      dataUrl = canvas.toDataURL('image/jpeg', opts.quality);
    }
    return dataUrl;
  } catch {
    return '';
  } finally {
    if (root) root.unmount();
    iframe.remove();
  }
}
