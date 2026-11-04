// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MusewareLogo } from './MusewareLogo';

describe('MusewareLogo', () => {
  it('renders default brand mark with gradient fill', () => {
    const { container } = render(<MusewareLogo size={24} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute('width')).toBe('24');
    expect(svg?.getAttribute('height')).toBe('24');
    const path = container.querySelector('path');
    expect(path?.getAttribute('fill')).toContain('url(#mw-brand-mark-');
    expect(container.querySelector('linearGradient')).toBeTruthy();
  });

  it('renders monochrome variant without gradient defs', () => {
    const { container } = render(<MusewareLogo size={18} variant="monochrome" />);
    const path = container.querySelector('path');
    expect(path?.getAttribute('fill')).toBe('currentColor');
    expect(container.querySelector('linearGradient')).toBeNull();
  });

  it('sets accessible label when title is provided', () => {
    const { container } = render(<MusewareLogo title="Museware Home" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-label')).toBe('Museware Home');
    expect(svg?.getAttribute('role')).toBe('img');
  });

  it('marks as aria-hidden when title is empty', () => {
    const { container } = render(<MusewareLogo title="" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });
});
