// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { findScrollTarget, scrollToLabel } from './navScroll';

describe('findScrollTarget and scrollToLabel', () => {
  it('returns null for empty or non-string inputs', () => {
    expect(findScrollTarget('')).toBeNull();
    expect(findScrollTarget('   ')).toBeNull();
    expect(findScrollTarget(undefined)).toBeNull();
    expect(findScrollTarget(null)).toBeNull();
  });

  it('resolves direct element by ID or data-node-id', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <section id="section_coffees" data-node-id="section_coffees">
        <h2>Three coffees, roasted Thursday</h2>
      </section>
      <section id="section_faq" data-node-id="section_faq">
        <h2>Good questions</h2>
      </section>
    `;
    document.body.appendChild(container);

    const matchCoffees = findScrollTarget('Coffees', container);
    expect(matchCoffees).not.toBeNull();
    expect(matchCoffees?.id).toBe('section_coffees');

    const matchFaq = findScrollTarget('FAQ', container);
    expect(matchFaq).not.toBeNull();
    expect(matchFaq?.id).toBe('section_faq');

    document.body.removeChild(container);
  });

  it('resolves by node class (.n-section_subscribe or .n-coffees)', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <section class="mw-section n-section_subscribe" data-node-id="section_subscribe">
        <h2>Never run out of good coffee</h2>
      </section>
    `;
    document.body.appendChild(container);

    const matchSub = findScrollTarget('Subscription', container);
    expect(matchSub).not.toBeNull();
    expect(matchSub?.getAttribute('data-node-id')).toBe('section_subscribe');

    document.body.removeChild(container);
  });

  it('resolves by heading text and scrolls to enclosing section', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <section class="mw-section story-box" id="story_sec">
        <div class="mw-sec-head">
          <h2 class="mw-sec-title">From cherry to cup, handled by hand</h2>
          <p class="mw-sec-sub">Our Craft story in detail</p>
        </div>
      </section>
    `;
    document.body.appendChild(container);

    const matchCraft = findScrollTarget('Our Craft', container);
    expect(matchCraft).not.toBeNull();
    expect(matchCraft?.id).toBe('story_sec');

    document.body.removeChild(container);
  });

  it('calls scrollIntoView when scrollToLabel finds a target', () => {
    const target = document.createElement('section');
    target.id = 'section_pricing';
    target.scrollIntoView = vi.fn();
    document.body.appendChild(target);

    const didScroll = scrollToLabel('pricing');
    expect(didScroll).toBe(true);
    expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });

    document.body.removeChild(target);
  });
});
