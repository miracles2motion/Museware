// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { Landing } from './Landing';

afterEach(cleanup);
it('shows three decorative product step mockups, one per card', () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  const { container } = render(<Landing />);
  const section = container.querySelector('#how-it-works')!;
  expect(section.querySelectorAll('.lp-mock')).toHaveLength(3);
  for (const variant of ['blueprint', 'choice', 'run']) {
    const mock = section.querySelector(`.lp-mock--${variant}`)!;
    expect(mock.getAttribute('aria-hidden')).toBe('true');
    expect(mock.closest('article')?.querySelectorAll('.lp-mock')).toHaveLength(1);
  }
  expect(section.querySelectorAll('.lp-mock-option')).toHaveLength(2);
  expect(section.querySelectorAll('.lp-mock-swatches i')).toHaveLength(8);
});
