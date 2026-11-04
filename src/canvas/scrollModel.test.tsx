// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { afterEach, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { createProject, useProject } from '../store/useProject';
import { emptyScreen } from '../ops/screenOps';
import { generateFullCss, MOTION_DICTIONARY, SWITCH_MOTION_CSS } from './cssGen';
import { CanvasStyle } from './NodeView';
import { buildSingleHtml } from '../export/singleFile';
import { generateProjectFiles } from '../export/reactCodegen';
import { RunMode } from '../preview/RunMode';
import { useUi } from '../store/useUi';
afterEach(cleanup);
function fixture() {
  const d = createProject('KOYO');
  const s = emptyScreen('Home', { id: 'home', entry: true });
  s.root.children = [
    { id: 'nav', type: 'navbar', props: { brand: 'KOYO' }, styles: {}, children: [] },
    { id: 'hero', type: 'hero', props: { title: 'Tea' }, styles: {}, children: [] },
    { id: 'match', type: 'col', props: {}, styles: { height: 'match' }, children: [] },
  ];
  d.screens = [s];
  return d;
}
function rule(css: string, id: string) {
  const start = css.indexOf(`.n-${id}{`);
  expect(start).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('}', start) + 1);
}
it('keeps the phone generator byte-identical to the published baseline', () => {
  const doc = fixture();
  const baseline = readFileSync(
    'src/canvas/fixtures/scroll-phone-baseline.css',
    'utf8',
  ).replace(
    ':where(.mw-marquee){overflow:hidden;mask-image:linear-gradient(to right,transparent,black 8%,black 92%,transparent);-webkit-mask-image:linear-gradient(to right,transparent,black 8%,black 92%,transparent)}',
    ':where(.mw-marquee){overflow:hidden}',
  );
  const stripInertMotionDictionary = (css: string) =>
    css
      .replace(
        '.mw-app{--mw-motion-fast:160ms;--mw-motion-med:280ms;--mw-motion-slow:700ms;--mw-ease-out:cubic-bezier(.22,1,.36,1)}\n',
        '',
      )
      .replace(`${MOTION_DICTIONARY}\n${SWITCH_MOTION_CSS}\n`, '');
  expect(stripInertMotionDictionary(generateFullCss(doc))).toBe(baseline);
  expect(stripInertMotionDictionary(generateFullCss(doc, { scrollModel: 'phone' }))).toBe(
    baseline,
  );
});
it('web roots grow without capturing scroll, with sticky navigation and the documented match fallback', () => {
  const d = fixture();
  const phone = generateFullCss(d, { scrollModel: 'phone' });
  const web = generateFullCss(d, { scrollModel: 'web' });
  expect(rule(phone, 'home_root')).toContain('height:100%;overflow-y:auto');
  expect(rule(web, 'home_root')).toContain('min-height:100%');
  expect(rule(web, 'home_root')).not.toContain('overflow-y:auto');
  expect(rule(web, 'nav')).toContain('position:sticky;top:0');
  expect(rule(phone, 'nav')).toContain('position:sticky;top:0');
  expect(rule(web, 'match')).toContain('height:100%');
  d.screens[0].root.props.scroll = false;
  expect(generateFullCss(d, { scrollModel: 'phone' })).toBe(
    generateFullCss(d, { scrollModel: 'web' }),
  );
});
it('editor canvas, HTML and React export opt in to the web model', () => {
  const d = fixture();
  const { container } = render(<CanvasStyle doc={d} editScope />);
  const css = container.querySelector('style')!.textContent!;
  expect(rule(css, 'home_root')).toContain('min-height:100%');
  expect(rule(css, 'home_root')).not.toContain('overflow-y:auto');
  const html = buildSingleHtml(d);
  expect(rule(html, 'home_root')).toContain('min-height:100%');
  expect(rule(html, 'home_root')).not.toContain('overflow-y:auto');
  const react = generateProjectFiles(d)['src/nodes.css'];
  expect(rule(react, 'home_root')).toContain('min-height:100%');
  expect(rule(react, 'home_root')).not.toContain('overflow-y:auto');
});
it('Run chooses the web model for the scrolling stage and phone for the bezel', () => {
  const d = fixture();
  useProject.getState().replaceDoc(d);
  useUi.setState({ runScreenId: null, activeScreenId: null });
  const view = render(<RunMode />);
  expect(view.container.querySelector('.run-stage')?.getAttribute('data-scroll')).toBe(
    'true',
  );
  expect(
    rule(
      view.container.querySelector('style[data-museware-css]')!.textContent!,
      'home_root',
    ),
  ).toContain('min-height:100%');
  view.unmount();
  d.screens[0].root.props.scroll = false;
  useProject.getState().replaceDoc(d);
  const locked = render(<RunMode />);
  expect(locked.container.querySelector('.run-stage')?.getAttribute('data-scroll')).toBe(
    'false',
  );
  expect(
    rule(
      locked.container.querySelector('style[data-museware-css]')!.textContent!,
      'home_root',
    ),
  ).toContain('min-height:100%');
});

it('bottomnav compiles sticky bottom positioning and supports non-sticky override', () => {
  const d = fixture();
  d.screens[0].root.children.push({
    id: 'bnav',
    type: 'bottomnav',
    props: { items: ['Home', 'Stats'] },
    styles: {},
    children: [],
  });
  const stickyCss = generateFullCss(d);
  expect(rule(stickyCss, 'bnav')).toContain('position:sticky;bottom:0;margin-top:auto');

  d.screens[0].root.children[d.screens[0].root.children.length - 1].props.sticky = false;
  const unpinnedCss = generateFullCss(d);
  expect(rule(unpinnedCss, 'bnav')).not.toContain('position:sticky');
  expect(rule(unpinnedCss, 'bnav')).not.toContain('bottom:0');
});
