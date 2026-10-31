// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ChatHost } from './ChatHost';
import { useUi } from '../store/useUi';
import { useProject, createProject } from '../store/useProject';
import { useAgent } from '../store/useAgent';

beforeEach(() => {
  useProject.getState().replaceDoc(createProject());
  useUi.setState({ chatExpanded: false, railCollapsed: false, mobileRailOpen: false });
  useAgent.setState({ receipts: [], busy: false });
  localStorage.removeItem('museware/chatExpanded');
});
afterEach(cleanup);
describe('muse focus', () => {
  it('expands, minimizes, marks unread, and reopens without mounting two rails', () => {
    render(<ChatHost />);
    expect(document.querySelectorAll('aside.rail')).toHaveLength(1);
    expect(document.querySelector('.chat-card--seed.chat-chip')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Expand muse chat' }));
    expect(screen.getByRole('dialog', { name: 'Muse focus' })).toBeTruthy();
    expect(localStorage.getItem('museware/chatExpanded')).toBe('1');
    expect(document.querySelectorAll('aside.rail')).toHaveLength(1);
    expect(document.querySelector('.chat-bubble')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Minimize chat' }));
    expect(document.querySelectorAll('aside.rail')).toHaveLength(0);
    expect(localStorage.getItem('museware/chatExpanded')).toBe('0');
    act(() => {
      useProject.getState().addRail({ role: 'agent', text: 'New result' });
    });
    expect(screen.getByLabelText('Unread messages')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open muse chat' }));
    expect(document.querySelectorAll('aside.rail')).toHaveLength(1);
    expect(screen.getByText('New result').className).toContain('chat-bubble');
    expect(screen.queryByRole('button', { name: 'Open muse chat' })).toBeNull();
    expect(screen.queryByLabelText('Unread messages')).toBeNull();
  });
  it('Escape minimizes and receipt arrivals mark the bubble unread', () => {
    render(<ChatHost />);
    fireEvent.click(screen.getByRole('button', { name: 'Expand muse chat' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Open muse chat' })).toBeTruthy();
    act(() =>
      useAgent.getState().addReceipt({
        role: 'image',
        model: 'muse-image',
        promptChars: 0,
        toolNames: [],
        latencyMs: 1,
      }),
    );
    expect(screen.getByLabelText('Unread messages')).toBeTruthy();
  });
});
