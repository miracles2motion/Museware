import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyScreen } from '../ops/screenOps';
import { createProject, useProject } from '../store/useProject';
import { useAgent } from '../store/useAgent';
import type { ComponentNode } from '../types/tree';
import { toolSchemas } from '../types/tools';
import { generateImage, chatStream, type ChatResult } from './client';
import {
  autoIllustrate,
  illustrateTarget,
  imageSizeFor,
  queueAssetTargets,
} from './imagery';
import { runAgentTurn, runFillQueue } from './loop';

vi.mock('./client', async (original) => ({
  ...(await original<typeof import('./client')>()),
  generateImage: vi.fn(),
  chatStream: vi.fn(),
}));
const reply = (name: string, args: unknown): ChatResult => ({
  text: '',
  toolCalls: [{ id: name, name, arguments: JSON.stringify(args) }],
  finishReason: 'tool_calls',
  model: 'test',
  latencyMs: 1,
  usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, totalTokens: 0 },
});
beforeEach(() => {
  vi.mocked(generateImage).mockReset().mockResolvedValue('https://example.com/image.png');
  vi.mocked(chatStream).mockReset();
  const screen = emptyScreen('Tea', { id: 'tea', entry: true });
  screen.root.children = Array.from(
    { length: 5 },
    (_, i): ComponentNode => ({
      id: `image_${i}`,
      type: 'image',
      props: { src: '', alt: 'Tea' },
      styles: {},
      children: [],
    }),
  );
  useProject
    .getState()
    .replaceDoc({ ...createProject(), name: 'Tea Shop', screens: [screen] });
  useAgent.setState({
    demoMode: false,
    keySource: 'session',
    houseKey: 'ok',
    budget: null,
    models: null,
    receipts: [],
  });
});
describe('build imagery', () => {
  it('schema validates at most six targets', () => {
    expect(
      toolSchemas.illustrate_images.parse({ targets: [{ id: 'image_0', prompt: 'tea' }] })
        .targets,
    ).toHaveLength(1);
    expect(
      toolSchemas.illustrate_images.safeParse({
        targets: Array.from({ length: 7 }, () => ({ id: 'image_0' })),
      }).success,
    ).toBe(false);
  });
  it('auto pass caps images, uses palette, and makes image src undoable', async () => {
    const outcomes = await autoIllustrate(['tea'], 'modern tea shop', 3);
    expect(outcomes).toHaveLength(3);
    expect(generateImage).toHaveBeenCalledTimes(3);
    expect(vi.mocked(generateImage).mock.calls[0][0]).toContain(
      useProject.getState().doc.tokens.openuiTheme.brand_color,
    );
    expect(useProject.getState().doc.screens[0].root.children[2].props.src).toBe(
      'https://example.com/image.png',
    );
    useProject.getState().undo();
    expect(useProject.getState().doc.screens[0].root.children[2].props.src).toBe('');
  });
  it('records failures with the cause and preserves the image', async () => {
    vi.mocked(generateImage).mockRejectedValueOnce(new Error('Provider timed out'));
    await illustrateTarget({ id: 'image_0' });
    const lines = useProject.getState().doc.rail.map((entry) => entry.text);
    expect(lines.some((line) => line.includes('Illustrating image_0'))).toBe(true);
    expect(
      lines.some((line) => line.includes('image_0') && line.includes('Provider timed out')),
    ).toBe(true);
    expect(useProject.getState().doc.screens[0].root.children[0].props.src).toBe('');
  });
  it('uses nearby product copy without imposing a photographic style', async () => {
    const doc = structuredClone(useProject.getState().doc);
    const image = doc.screens[0].root.children[0];
    image.props.alt = 'Image';
    doc.screens[0].root.children = [
      {
        id: 'card_tea',
        type: 'card',
        props: {},
        styles: {},
        children: [
          image,
          {
            id: 'tea_name',
            type: 'heading',
            props: { text: 'Jasmine Green Tea' },
            styles: {},
            children: [],
          },
        ],
      },
    ];
    useProject.getState().replaceDoc(doc);
    await illustrateTarget({ id: 'image_0' });
    const prompt = vi.mocked(generateImage).mock.calls[0][0];
    expect(prompt).not.toMatch(/photograph|warm natural light|shallow depth/i);
    expect(prompt).toContain('Jasmine Green Tea');
    expect(prompt).not.toMatch(/flat vector|abstract background|no text/i);
  });
  it('preserves explicit vector, no-text and abstract direction in a manual request', async () => {
    const request =
      'Flat vector-style illustration of tea leaves, abstract waves, no text in the image';
    await illustrateTarget({ id: 'image_0', prompt: request });
    const prompt = vi.mocked(generateImage).mock.calls[0][0];
    expect(prompt).toContain(request);
    expect(prompt).not.toMatch(
      /professional subject-driven photograph|warm natural light|shallow depth/i,
    );
    expect(prompt.length).toBeLessThanOrEqual(1200);
  });
  it('keeps moody photography and lighting instead of replacing it with a warm default', async () => {
    const request =
      'Moody photography of tea leaves in cool moonlight, deep shadows, no text';
    await illustrateTarget({ id: 'image_0', prompt: request });
    const prompt = vi.mocked(generateImage).mock.calls[0][0];
    expect(prompt).toContain(request);
    expect(prompt).not.toMatch(/warm natural light|shallow depth/i);
  });
  it('retains a full 700-character target request before context within the proxy cap', async () => {
    const request = `${'x'.repeat(675)} flat vector no text end`;
    await illustrateTarget(
      { id: 'image_0', prompt: request },
      { context: 'A brief with muted colours.' },
    );
    const prompt = vi.mocked(generateImage).mock.calls[0][0];
    expect(prompt).toContain(request);
    expect(prompt.length).toBeLessThanOrEqual(1200);
  });
  it('carries shared plan art direction and the relevant image line, not another screen', async () => {
    const plan =
      'RULES: All imagery uses flat vector illustration, no text.\nSCREEN: Tea\n- image_0 (image) tea leaves in cool blue.\nSCREEN: Other\n- image_other (image) unrelated orange photograph.';
    await autoIllustrate(['tea'], plan, 1);
    const prompt = vi.mocked(generateImage).mock.calls[0][0];
    expect(prompt).toContain('flat vector illustration, no text');
    expect(prompt).toContain('tea leaves in cool blue');
    expect(prompt).not.toContain('unrelated orange photograph');
  });
  it('does not auto-generate for a clearly image-free brief, but permits an explicit manual image', async () => {
    const original = structuredClone(useProject.getState().doc.screens[0]);
    let reservations = 0;
    await autoIllustrate(
      ['tea'],
      'An image-free utility, no images.',
      3,
      undefined,
      undefined,
      undefined,
      () => {
        reservations++;
        return true;
      },
    );
    expect(generateImage).not.toHaveBeenCalled();
    expect(reservations).toBe(0);
    expect(useProject.getState().doc.screens[0]).toEqual(original);
    await queueAssetTargets(
      [{ id: 'image_0', prompt: 'a picture' }],
      'RULES: no images.\nSCREEN: Tea\n- image_0 (image) tea',
      3,
      undefined,
      undefined,
      true,
      () => {
        reservations++;
        return true;
      },
    );
    expect(generateImage).not.toHaveBeenCalled();
    expect(reservations).toBe(0);
    expect(useAgent.getState().assetJobs[0]).toMatchObject({
      state: 'skipped',
      reason: expect.stringContaining('image-free'),
    });
    await illustrateTarget({ id: 'image_0', prompt: 'Actually make a flat illustration' });
    expect(generateImage).toHaveBeenCalledTimes(1);
  });
  it('does not add unrequested images to a gradient hero; an explicitly planned hero image remains eligible', async () => {
    const doc = structuredClone(useProject.getState().doc);
    doc.screens[0].root.children = [
      {
        id: 'hero_tea',
        type: 'hero',
        props: { title: 'Tea', subtitle: 'A quiet moment', surface: 'gradient' },
        styles: {},
        children: [],
      },
    ];
    useProject.getState().replaceDoc(doc);
    await autoIllustrate(
      ['tea'],
      'SCREEN: Tea\n- hero_tea (hero) gradient with text, no image.',
      2,
    );
    expect(generateImage).not.toHaveBeenCalled();
    await autoIllustrate(
      ['tea'],
      'SCREEN: Tea\n- hero_tea (hero) moody photograph of tea leaves, no text.',
      2,
    );
    expect(generateImage).toHaveBeenCalledTimes(1);
    expect(vi.mocked(generateImage).mock.calls[0][0]).toContain('moody photograph');
  });
  it('leaves existing user images untouched in the automatic pass', async () => {
    const screen = useProject.getState().doc.screens[0];
    screen.root.children[0].props.src = 'https://example.com/user.png';
    await autoIllustrate(['tea'], 'vector images', 1);
    expect(screen.root.children[0].props.src).toBe('https://example.com/user.png');
    expect(vi.mocked(generateImage)).toHaveBeenCalledTimes(1);
    expect(useProject.getState().doc.screens[0].root.children[0].props.src).toBe(
      'https://example.com/user.png',
    );
  });
  it('passes an explicit manual chat instruction to the image provider even if the tool prompt is missing', async () => {
    vi.mocked(chatStream)
      .mockResolvedValueOnce(reply('illustrate_images', { targets: [{ id: 'image_0' }] }))
      .mockResolvedValueOnce(reply('finish', { summary: 'Done' }));
    await runAgentTurn('Generate image as a flat vector, no text', { skipVerify: true });
    expect(vi.mocked(generateImage).mock.calls[0][0]).toContain('flat vector, no text');
  });
  it('blocks a builder image tool call on an approved image-free build without spending the cap', async () => {
    useAgent.setState({ buildImages: 2 });
    useProject
      .getState()
      .setBlueprint(
        'RULES: This is image-free.\nSCREEN: Tea\n- image_0 (image) keep empty',
        true,
      );
    const before = useProject.getState().doc.automatedImageBudget?.used;
    vi.mocked(chatStream)
      .mockResolvedValueOnce(
        reply('illustrate_images', {
          targets: [{ id: 'image_0', prompt: 'draw a photo' }],
        }),
      )
      .mockResolvedValueOnce(reply('finish', { summary: 'Done' }))
      .mockResolvedValueOnce({
        ...reply('finish', {}),
        toolCalls: [],
        text: 'PASS',
        finishReason: 'stop',
      });
    await runFillQueue({ mode: 'steady' });
    expect(generateImage).not.toHaveBeenCalled();
    expect(useProject.getState().doc.automatedImageBudget?.used).toBe(before);
    expect(useProject.getState().doc.screens[0].root.children[0].props.src).toBe('');
  });
  it('identifies targets skipped by the automated cap', async () => {
    await autoIllustrate(['tea'], 'tea', 3);
    expect(
      useProject
        .getState()
        .doc.rail.some(
          (entry) =>
            entry.text.includes('skipped') &&
            entry.text.includes('image_3') &&
            entry.text.includes('image_4'),
        ),
    ).toBe(true);
  });
  it('reports successful images and budget skips without mistaking failures for successes', async () => {
    await autoIllustrate(['tea'], 'tea', 2);
    const lines = useProject.getState().doc.rail.map((r) => r.text);
    expect(lines).toContain('Images: 2 of 2 generated (this pass).');
    expect(lines).toContain('image budget spent — 3 skipped');
  });
  it('does not blame the image cap when the shared key is unavailable', async () => {
    useAgent.setState({ keySource: 'env', houseKey: 'exhausted' });
    await autoIllustrate(['tea'], 'tea', 2);
    const lines = useProject.getState().doc.rail.map((r) => r.text);
    expect(lines).not.toContain('Images: 0 of 2 generated (this pass).');
    expect(lines.some((line) => line.includes('image budget spent'))).toBe(false);
  });
  it('generates strictly one at a time and updates pending states', async () => {
    const resolvers: Array<(src: string) => void> = [];
    vi.mocked(generateImage).mockImplementation(
      () => new Promise((resolve) => resolvers.push(resolve)),
    );
    const pending = autoIllustrate(['tea'], 'tea', 2);
    await vi.waitFor(() => expect(generateImage).toHaveBeenCalledTimes(1));
    expect([...useAgent.getState().assetsPending]).toEqual(['image_0']);
    expect(useAgent.getState().assetJobs.map((j) => j.state)).toEqual([
      'running',
      'queued',
      'queued',
      'queued',
      'queued',
    ]);
    resolvers[0]('https://example.com/one.png');
    await vi.waitFor(() => expect(generateImage).toHaveBeenCalledTimes(2));
    expect([...useAgent.getState().assetsPending]).toEqual(['image_1']);
    resolvers[1]('https://example.com/two.png');
    await pending;
    expect(useAgent.getState().assetsPending.size).toBe(0);
    expect(useAgent.getState().assetJobs.map((j) => j.state)).toEqual([
      'done',
      'done',
      'skipped',
      'skipped',
      'skipped',
    ]);
  });
  it('retries once after a three-second backoff within the call cap', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(generateImage)
        .mockRejectedValueOnce(new Error('temporary'))
        .mockResolvedValueOnce('https://example.com/retry.png');
      const pending = autoIllustrate(['tea'], 'tea', 2);
      await vi.advanceTimersByTimeAsync(2999);
      expect(generateImage).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await pending;
      expect(generateImage).toHaveBeenCalledTimes(2);
      expect(useAgent.getState().assetJobs[0].state).toBe('done');
      expect(useAgent.getState().assetJobs[1].state).toBe('skipped');
    } finally {
      vi.useRealTimers();
    }
  });
  it('chooses wide sizes for hero or story and square for cards', () => {
    const s = useProject.getState().doc.screens[0];
    const hero: ComponentNode = {
      id: 'hero_img',
      type: 'image',
      props: {},
      styles: {},
      children: [],
    };
    expect(imageSizeFor(s, hero)).toBe('1200x640');
    expect(imageSizeFor(s, s.root.children[0])).toBe('768x768');
  });
  it('reports an exhausted shared key without making requests', async () => {
    useAgent.setState({ keySource: 'env', houseKey: 'exhausted' });
    await autoIllustrate(['tea'], 'tea', 3);
    expect(generateImage).not.toHaveBeenCalled();
    expect(
      useProject.getState().doc.rail.some((r) => r.text.includes('budget exhausted')),
    ).toBe(true);
  });
  it('exposes the tool to the live loop and writes src', async () => {
    vi.mocked(chatStream)
      .mockResolvedValueOnce(
        reply('illustrate_images', { targets: [{ id: 'image_0', prompt: 'tea' }] }),
      )
      .mockResolvedValueOnce(reply('finish', { summary: 'Image done' }));
    await runAgentTurn('Illustrate this image', { skipVerify: true });
    expect(useProject.getState().doc.screens[0].root.children[0].props.src).toBe(
      'https://example.com/image.png',
    );
  });
  it('does not apply an image to a different project opened during generation', async () => {
    let resolve!: (src: string) => void;
    vi.mocked(generateImage).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const pending = illustrateTarget({ id: 'image_0' });
    useProject.getState().replaceDoc(structuredClone(useProject.getState().doc));
    resolve('https://example.com/agent.png');
    expect((await pending).ok).toBe(false);
    expect(useProject.getState().doc.screens[0].root.children[0].props.src).toBe('');
  });

  it('does not overwrite a user edit made while generation is in flight', async () => {
    let resolve!: (src: string) => void;
    vi.mocked(generateImage).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const pending = illustrateTarget({ id: 'image_0' });
    useProject
      .getState()
      .applyBatch(
        [{ op: 'setProps', id: 'image_0', props: { src: 'https://example.com/user.png' } }],
        { source: 'user' },
      );
    resolve('https://example.com/agent.png');
    expect((await pending).ok).toBe(false);
    expect(useProject.getState().doc.screens[0].root.children[0].props.src).toBe(
      'https://example.com/user.png',
    );
  });

  it('prevents marketing copy, headlines, and button labels from leaking into image prompts', async () => {
    const doc = structuredClone(useProject.getState().doc);
    const heroImage: ComponentNode = {
      id: 'image_hero',
      type: 'image',
      props: {
        alt: 'Pour-over coffee brewing beside a bag of freshly roasted beans in warm morning light',
      },
      styles: {},
      children: [],
    };
    const roasteryImage: ComponentNode = {
      id: 'image_roastery',
      type: 'image',
      props: {
        alt: 'Roaster tending a small drum roaster with burlap coffee sacks nearby',
      },
      styles: {},
      children: [],
    };
    doc.screens[0].root.children = [
      {
        id: 'hero_main',
        type: 'hero',
        props: {
          title: 'Coffee roasted in small batches, shipped at peak flavour',
          subtitle: 'Single-origin lots from 14 partner farms, roasted in 12kg batches and shipped within 48 hours.',
        },
        styles: {},
        children: [
          heroImage,
          {
            id: 'btn_shop',
            type: 'button',
            props: { text: "Shop This Week's Roast" },
            styles: {},
            children: [],
          },
        ],
      },
      {
        id: 'section_story',
        type: 'section',
        props: { title: 'From cherry to cup, handled by hand' },
        styles: {},
        children: [
          {
            id: 'row_story',
            type: 'row',
            props: {},
            styles: {},
            children: [
              roasteryImage,
              {
                id: 'text_story',
                type: 'text',
                props: {
                  text: 'We buy from fourteen smallholder farms we can name — paying above fair-trade rates.',
                },
                styles: {},
                children: [],
              },
            ],
          },
        ],
      },
    ];
    doc.blueprint = {
      text: 'SCREEN: Tea\n- hero-main (hero) Split layout, badge "Small-batch", headline "Coffee roasted in small batches, shipped at peak flavour", primary CTA "Shop Now", warm roastery image right\n- section-story (section) Eyebrow "Our Craft", editorial story with roastery image\n- image_roastery (image) warm documentary photography of coffee roaster',
      decided: true,
      updatedAt: Date.now(),
    };
    useProject.getState().replaceDoc(doc);

    // Illustrate hero image
    await illustrateTarget({ id: 'image_hero' });
    const heroPrompt = vi.mocked(generateImage).mock.calls[0][0];
    // Must contain the pure visual alt description
    expect(heroPrompt).toContain('Pour-over coffee brewing beside a bag of freshly roasted beans');
    // Must NOT contain marketing headline, subtitle, or button text
    expect(heroPrompt).not.toContain('Coffee roasted in small batches, shipped at peak flavour');
    expect(heroPrompt).not.toContain('Single-origin lots from 14 partner farms');
    expect(heroPrompt).not.toContain("Shop This Week's Roast");
    expect(heroPrompt).not.toContain('primary CTA');
    expect(heroPrompt).not.toContain('Split layout');
    // Must contain text-free guarantee
    expect(heroPrompt).toContain('Text-free guarantee');

    // Illustrate roastery image
    await illustrateTarget({ id: 'image_roastery' });
    const roasteryPrompt = vi.mocked(generateImage).mock.calls[1][0];
    expect(roasteryPrompt).toContain('Roaster tending a small drum roaster');
    expect(roasteryPrompt).not.toContain('Coffee roasted in small batches, shipped at peak flavour');
    expect(roasteryPrompt).not.toContain('We buy from fourteen smallholder farms');
    expect(roasteryPrompt).not.toContain('hero-main');
    expect(roasteryPrompt).toContain('Text-free guarantee');
  });
});
