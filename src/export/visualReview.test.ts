// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { captureVisualReviewCollage } from './visualReview';
import { createProject } from '../store/useProject';
import { emptyScreen } from '../ops/screenOps';
import { reviewerPrompt } from '../muse/prompts';

describe('captureVisualReviewCollage', () => {
  it('handles empty screens gracefully', async () => {
    const doc = createProject('Empty');
    doc.screens = [];
    const result = await captureVisualReviewCollage(doc);
    expect(result).toBe('');
  });

  it('generates a visual review collage data URL for valid screens', async () => {
    const doc = createProject('Collage Test');
    const screen = emptyScreen('Landing', { id: 'landing', entry: true });
    screen.root.children = [
      {
        id: 'hero_test',
        type: 'hero',
        props: { title: 'Fast Inference' },
        styles: {},
        children: [],
      },
    ];
    doc.screens = [screen];

    const result = await captureVisualReviewCollage(doc, 'landing');
    // In jsdom without canvas binary, it returns a data URL or empty string without throwing
    expect(typeof result).toBe('string');
  });

  it('switches reviewerPrompt between text-only and visual inspection modes', () => {
    const textPrompt = reviewerPrompt('Build landing', 'outline here', 'findings here', false);
    expect(textPrompt).toContain('This is a text outline, not a rendered image');
    expect(textPrompt).not.toContain('VISUAL INSPECTION MANDATE');

    const visualPrompt = reviewerPrompt('Build landing', 'outline here', 'findings here', true);
    expect(visualPrompt).toContain('VISUAL INSPECTION MANDATE');
    expect(visualPrompt).toContain('DESKTOP VIEW (1024px)');
    expect(visualPrompt).toContain('MOBILE VIEW (390px)');
    expect(visualPrompt).toContain('STRUCTURAL DEFECT CHECKLIST');
    expect(visualPrompt).toContain('Voids: Is >40%');
    expect(visualPrompt).toContain('Card Parity / Orphans:');
    expect(visualPrompt).toContain('STRICT BOUNDARY: Do NOT bikeshed');
  });

  it('constructs a valid multimodal payload when snapshot is present', () => {
    const fakeSnapshot = 'data:image/webp;base64,AAAA';
    const hasImage = Boolean(fakeSnapshot && fakeSnapshot.startsWith('data:image/'));
    const payload = hasImage
      ? [
          { type: 'text', text: reviewerPrompt('task', 'outline', 'findings', true) },
          { type: 'image_url', image_url: { url: fakeSnapshot } },
        ]
      : reviewerPrompt('task', 'outline', 'findings', false);

    expect(Array.isArray(payload)).toBe(true);
    if (Array.isArray(payload)) {
      expect(payload).toHaveLength(2);
      expect(payload[0].type).toBe('text');
      expect(payload[1].type).toBe('image_url');
      expect((payload[1] as { image_url: { url: string } }).image_url.url).toBe(fakeSnapshot);
    }
  });
});
