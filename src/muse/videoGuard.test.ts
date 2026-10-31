import { describe, expect, it } from 'vitest';
import { createProject } from '../store/useProject';
import { fieldIssues } from '../ops/validate';
import { videoSourceViolation } from './videoGuard';
import { emptyScreen } from '../ops/screenOps';
import { lintScreen } from './qualityLint';
import { generateProjectFiles } from '../export/reactCodegen';
import type { ComponentNode } from '../types/tree';
const video = (src: string): ComponentNode => ({
  id: 'video_one',
  type: 'video',
  props: { src },
  styles: {},
  children: [],
});
describe('motion safety', () => {
  it('rejects insecure sources and posters', () => {
    const doc = createProject();
    for (const url of ['http://example.com/a.mp4', 'javascript:alert(1)'])
      expect(fieldIssues(video(url), doc).length).toBeGreaterThan(0);
    expect(fieldIssues(video('https://example.com/a.mp4'), doc)).toEqual([]);
    const v = video('');
    v.props.poster = 'javascript:alert(1)';
    expect(fieldIssues(v, doc).length).toBeGreaterThan(0);
  });
  it('blocks video URLs not in the actual user prompt', () => {
    const doc = createProject();
    const op = { op: 'add', parentId: 'root', node: video('https://example.com/a.mp4') };
    expect(videoSourceViolation([op], doc, 'make a video')).toBeTruthy();
    expect(videoSourceViolation([op], doc, 'Use https://example.com/a.mp4')).toBeNull();
  });
  it('blocks multiple scenes and exports self-contained runtime', () => {
    const screen = emptyScreen('Home', { id: 'home', entry: true });
    screen.root.children = [
      { ...video(''), id: 'scene_one', type: 'scene3d' },
      { ...video(''), id: 'scene_two', type: 'scene3d' },
      video(''),
    ];
    const doc = { ...createProject(), screens: [screen] };
    expect(
      lintScreen(screen).some(
        (f) => f.severity === 'block' && f.message.includes('scene3d'),
      ),
    ).toBe(true);
    const files = generateProjectFiles(doc);
    expect(files['src/motion.js']).toContain('IntersectionObserver');
    expect(files['src/motion.js']).toContain('prefers-reduced-motion');
    expect(Object.values(files).some((f) => f.includes('data-reel-scrub'))).toBe(true);
  });
});
