// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { emptyScreen } from '../ops/screenOps';
import { createProject } from '../store/useProject';
import type { ComponentNode } from '../types/tree';
import { assetCensus } from './assets';
import { buildSingleHtml, buildHtmlFolder } from './singleFile';
import { buildExportFiles } from './zip';
import { auditFlattenedDom } from './auditCodegen';

function node(
  id: string,
  type: ComponentNode['type'],
  props: Record<string, unknown> = {},
  children: ComponentNode[] = [],
): ComponentNode {
  return { id, type, props, styles: {}, children };
}
function teaDoc() {
  const a = emptyScreen('Tea', { id: 'tea', entry: true });
  const b = emptyScreen('Shop', { id: 'shop' });
  const toggle = node('switch_a', 'switch', { bindKey: 'finder', label: 'Finder' });
  const result = node('result_a', 'text', { text: 'Found tea' });
  result.visibleWhen = { key: 'finder', equals: true };
  const tap = node('button_a', 'button', { text: 'Open finder' });
  tap.events = { tap: [{ type: 'toggle', key: 'finder' }] };
  a.root.children = [
    node('nav_a', 'navbar', { items: ['Tea', 'Shop'], brand: 'Tea' }),
    toggle,
    tap,
    result,
    node('faq_a', 'accordion', { items: 'Why tea? | It tastes good.' }),
    node('tabs_a', 'tabs', { items: ['One', 'Two'] }, [
      node('tab_a', 'text', { text: 'First panel' }),
      node('tab_b', 'text', { text: 'Second panel' }),
    ]),
  ];
  b.root.children = [node('other_a', 'text', { text: 'Shop content' })];
  return { ...createProject('Tea'), screens: [a, b] };
}
describe('single file export', () => {
  it('renders all screens with canvas CSS and runs navigation, tabs and state without a server', () => {
    const html = buildSingleHtml(teaDoc());
    expect(html).toContain('--openui-accent');
    expect(html).toContain('mw-accordion');
    expect(html).toContain('<details>');
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/<link[^>]+href=/i);
    expect(html).not.toMatch(/\b(?:src|href)=["']\/(?!\/)/i);
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    document.body.innerHTML = parsed.body.innerHTML;
    window.eval(parsed.querySelector('script')!.textContent!);
    const d = document;
    expect(d.querySelectorAll('[data-screen]')).toHaveLength(2);
    const result = d.querySelector<HTMLElement>('.n-result_a')!;
    expect(result.hidden).toBe(true);
    d.querySelector<HTMLElement>('.n-switch_a')!.click();
    expect(result.hidden).toBe(false);
    d.querySelector<HTMLElement>('.n-button_a')!.click();
    expect(result.hidden).toBe(true);
    const tabs = d.querySelectorAll<HTMLElement>('[data-site-tab]');
    tabs[1].click();
    expect(d.querySelector<HTMLElement>('[data-site-panel="1"]')!.hidden).toBe(false);
    const nav = Array.from(d.querySelectorAll<HTMLElement>('.n-nav_a .mw-nav-item')).find(
      (el) => el.textContent === 'Shop',
    )!;
    nav.click();
    expect(d.querySelector<HTMLElement>('[data-screen="shop"]')!.hidden).toBe(false);
    expect(d.querySelector<HTMLElement>('[data-screen="tea"]')!.hidden).toBe(true);
    document.body.innerHTML = '';
  });
  it(
    'extracts every embedded image, small and large, for both folder and React exports',
    async () => {
    const doc = teaDoc();
    const small = `data:image/png;base64,${btoa('i'.repeat(3 * 1024))}`;
    const large = `data:image/png;base64,${btoa('x'.repeat(2 * 1024 * 1024))}`;
    doc.screens[0].root.children.push(
      node('small_image', 'image', { src: small }),
      node('big_image', 'image', { src: large }),
      node('remote_vid', 'video', { src: 'https://example.com/movie.mp4' }),
      node('empty_image', 'image'),
    );
    expect(assetCensus(doc)).toMatchObject({
      inline: 2,
      remote: 1,
      missing: 1,
      remoteVideo: true,
    });
    const folder = buildHtmlFolder(doc);
    expect(folder['assets/1.png']).toHaveLength(3 * 1024);
    expect(folder['assets/2.png']).toHaveLength(2 * 1024 * 1024);
    expect(folder['index.html']).toContain('./assets/1.png');
    expect(folder['index.html']).toContain('./assets/2.png');
    expect(folder['index.html']).not.toContain('data:image');
    expect(buildSingleHtml(doc)).toContain(small);
    expect(buildSingleHtml(doc)).toContain(large);
    expect(folder['index.html']).not.toContain(large);
    expect(String(folder['README.md'])).toContain('Settings → Pages');
    expect(String(folder['README.md'])).toContain('/ (root)');
    expect(String(folder['index.html'])).not.toMatch(/\b(?:src|href)=["']\/(?!\/)/i);
    const react = await buildExportFiles(doc);
    expect(react['src/assets/1.png']).toHaveLength(3 * 1024);
    expect(react['src/assets/2.png']).toHaveLength(2 * 1024 * 1024);
    const source = String(react['src/screens/Tea.tsx']);
    expect(source).toContain("import img1 from '../assets/1.png'");
    expect(source).toContain("import img2 from '../assets/2.png'");
    expect(source).toContain('src={img1}');
    expect(source).toContain('src={img2}');
    expect(source).not.toContain('data:image');
    expect(source).not.toContain(large);
    expect(String(react['vite.config.ts'])).toContain("base: './'");
    expect(String(react['index.html'])).toContain('src="./src/main.tsx"');
    const yaml = createRequire(import.meta.url)('js-yaml') as {
      load: (text: string) => {
        on: { push: { branches: string[] } };
        jobs: {
          build: { steps: Array<Record<string, unknown>> };
          deploy: { needs: string; steps: Array<Record<string, unknown>> };
        };
        permissions: Record<string, string>;
      };
    };
    const workflow = yaml.load(String(react['.github/workflows/deploy.yml']));
    expect(workflow.on.push.branches).toContain('main');
    expect(workflow.permissions.pages).toBe('write');
    expect(workflow.permissions['id-token']).toBe('write');
    expect(workflow.jobs.deploy.needs).toBe('build');
    expect(workflow.jobs.build.steps.some((step) => step.run === 'npm run build')).toBe(
      true,
    );
    expect(
      workflow.jobs.deploy.steps.some((step) => step.uses === 'actions/deploy-pages@v4'),
    ).toBe(true);
    expect(String(react['README.md'])).toContain('GitHub Actions');
    expect(react['public/icon.svg']).toBeTruthy();
    expect(react['public/sw.js']).toBeTruthy();
  }, 15000);
  it('escapes user content and bans executable flattened markup', () => {
    const doc = teaDoc();
    doc.name = '</title><script>bad()</script>';
    doc.screens[0].root.children.push(
      node('evil_text', 'text', { text: '<script>alert(1)</script>' }),
    );
    const html = buildSingleHtml(doc);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(() => auditFlattenedDom('<img src="javascript:bad()">')).toThrow();
    expect(() => auditFlattenedDom('<div onclick="bad()">')).toThrow();
  });
});
