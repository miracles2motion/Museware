// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AboutModal } from './AboutModal';

describe('AboutModal', () => {
  it('renders brand identity, version, team, and close button', () => {
    const onClose = vi.fn();
    render(<AboutModal onClose={onClose} />);

    expect(screen.getByText('About Museware')).toBeTruthy();
    expect(screen.getByText('v1.0')).toBeTruthy();
    expect(screen.getByText(/The Canvas That Builds With You/)).toBeTruthy();
    expect(screen.getByText(/Osasumwen Ngozi Scott/)).toBeTruthy();
    expect(screen.getByText(/Miracle Aigbomian/)).toBeTruthy();

    const doneBtn = screen.getByText('Done');
    fireEvent.click(doneBtn);
    expect(onClose).toHaveBeenCalled();
  });
});
