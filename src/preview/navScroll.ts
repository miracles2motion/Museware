/**
 * Finds a scroll target element in the document or container for a given navigation label or slug.
 * Supports exact ID, data-node-id, nodeClass, keyword/stem matching, heading text matching,
 * and CTA button matching.
 */
export function findScrollTarget(
  label: string | undefined | null,
  root: Document | Element = typeof document !== 'undefined' ? document : (null as unknown as Document),
): HTMLElement | null {
  if (!label || typeof label !== 'string' || !root) return null;
  const clean = label.trim().toLowerCase();
  if (!clean) return null;

  const rawId = clean.replace(/^#/, '');
  const slug = clean.replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');

  // 1. Direct ID match
  if (rawId) {
    const el =
      (root instanceof Document ? root.getElementById(rawId) : root.querySelector<HTMLElement>(`#${rawId}`)) ||
      (root instanceof Document ? root.getElementById(slug) : root.querySelector<HTMLElement>(`#${slug}`)) ||
      (root instanceof Document ? root.getElementById(`section_${slug}`) : root.querySelector<HTMLElement>(`#section_${slug}`));
    if (el) return el;
  }

  // 2. data-node-id attribute match
  if (slug) {
    const byNodeId = root.querySelector<HTMLElement>(
      `[data-node-id="${rawId}"], [data-node-id="${slug}"], [data-node-id="section_${slug}"]`,
    );
    if (byNodeId) return byNodeId;
  }

  // 3. Class match for generated nodeClass (e.g. .n-section_coffees)
  if (slug) {
    const byClass = root.querySelector<HTMLElement>(`.n-${slug}, .n-section_${slug}, .n-${rawId}`);
    if (byClass) return byClass;
  }

  // 4. Keyword, prefix and stem matching across container IDs / classes
  const words = clean.split(/[\s_-]+/).filter((w) => w.length >= 3);
  for (const word of words) {
    // English stem & common roots: e.g. subscription -> subscr, coffees -> coffee
    const stem = word.replace(/(ies|s|es|ing|tion|tions|ers|er)$/, '');
    const prefix = word.length >= 6 ? word.slice(0, 5) : stem;
    const roots = Array.from(new Set([stem, prefix, word])).filter((r) => r.length >= 3);

    for (const r of roots) {
      const partialMatch = root.querySelector<HTMLElement>(
        `section[id*="${r}"], [data-node-id*="${r}"], [class*="n-section_"][class*="${r}"], [class*="section_"][class*="${r}"], [id*="${r}"]`,
      );
      if (partialMatch) return partialMatch;
    }
  }

  // 5. Section headings, subtitles, eyebrows, or title text match
  const textContainers = root.querySelectorAll<HTMLElement>(
    'h1, h2, h3, h4, .mw-sec-title, .mw-sec-sub, .mw-sec-eyebrow, .mw-card-title, .mw-hero-title, [data-title]',
  );
  for (const el of textContainers) {
    const text = (el.textContent || '').toLowerCase();
    if (text.includes(clean)) {
      return (el.closest('section, .mw-section, .mw-card') as HTMLElement) || el;
    }
  }
  for (const word of words) {
    const stem = word.replace(/(ies|s|es|ing|tion|tions|ers|er)$/, '');
    const prefix = word.length >= 6 ? word.slice(0, 5) : stem;
    const roots = Array.from(new Set([stem, prefix, word])).filter((r) => r.length >= 3);
    for (const r of roots) {
      for (const el of textContainers) {
        const text = (el.textContent || '').toLowerCase();
        if (text.includes(r)) {
          return (el.closest('section, .mw-section, .mw-card') as HTMLElement) || el;
        }
      }
    }
  }

  // 6. Button or CTA match
  const ctas = root.querySelectorAll<HTMLElement>('.mw-cta, .mw-button, button, a');
  for (const cta of ctas) {
    const text = (cta.textContent || '').trim().toLowerCase();
    if (text && (text === clean || text.includes(clean) || clean.includes(text))) {
      return (cta.closest('section, .mw-section, .mw-card') as HTMLElement) || cta;
    }
  }

  return null;
}

/**
 * Smoothly scrolls to the element matching the label, if found.
 * Returns true if an element was found and scrolled to.
 */
export function scrollToLabel(
  label: string | undefined | null,
  root: Document | Element = typeof document !== 'undefined' ? document : (null as unknown as Document),
): boolean {
  const target = findScrollTarget(label, root);
  if (!target) return false;
  if (typeof target.scrollIntoView === 'function') {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  return true;
}
