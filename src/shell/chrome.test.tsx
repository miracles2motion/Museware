// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Topbar } from './Topbar';
import { OnboardingModal } from './modals/OnboardingModal';
import { SettingsModal } from './modals/SettingsModal';
import { ExportModal } from './modals/ExportModal';
import { ReceiptsModal } from './modals/ReceiptsModal';
import { ShortcutsModal } from './modals/ShortcutsModal';
afterEach(cleanup);
describe('shared shell chrome', () => {
  it.each([OnboardingModal, SettingsModal, ExportModal, ReceiptsModal, ShortcutsModal])(
    'uses the same modal shell',
    (Component) => {
      render(<Component onClose={vi.fn()} />);
      expect(screen.getByRole('dialog').closest('.modal-shell')).not.toBeNull();
      expect(
        screen.getByRole('dialog').querySelector('.modal-head button[aria-label=Close]'),
      ).toBeTruthy();
    },
  );
  it('renders the breakpoint switcher as a segmented group', () => {
    render(<Topbar />);
    const group = screen.getByRole('group', { name: 'Breakpoint' });
    expect(group.classList.contains('breakpoint-segmented')).toBe(true);
    expect(group.querySelectorAll('button')).toHaveLength(3);
    expect(group.querySelectorAll('[aria-pressed="true"]')).toHaveLength(1);
  });
  it('keeps numeric inline heights out of touched shell files', () => {
    for (const file of [
      'src/inspector/ActionEditor.tsx',
      'src/shell/Topbar.tsx',
      'src/shell/Statusbar.tsx',
      ...['Settings', 'Export', 'Receipts', 'Shortcuts', 'Onboarding'].map(
        (name) => `src/shell/modals/${name}Modal.tsx`,
      ),
    ]) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/style=\{\{\s*height\s*:\s*\d/);
    }
  });
});
