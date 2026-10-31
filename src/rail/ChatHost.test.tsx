// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ChatHost } from './ChatHost';
import { useUi } from '../store/useUi';
import { useProject, createProject } from '../store/useProject';
import { useAgent } from '../store/useAgent';

beforeEach(() => {
  useProject.getState().replaceDoc(createProject());
  useProject.setState({ ready: true });
  useUi.setState({
    chatExpanded: false,
    railCollapsed: false,
    mobileRailOpen: false,
    activeScreenId: null,
  });
  useAgent.setState({ receipts: [], busy: false });
  localStorage.removeItem('museware/chatExpanded');
});
afterEach(cleanup);
describe('muse focus', () => {
  it('expands, minimizes, marks unread, and reopens without mounting two rails', () => {
    render(<ChatHost />);
    expect(document.querySelectorAll('aside.rail')).toHaveLength(1);
    expect(document.querySelector('.chat-card--seed.chat-chip')).toBeTruthy();
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
  it('waits for project restoration before opening an empty screen', () => {
    useProject.setState({ ready: false });
    render(<ChatHost />);
    expect(screen.getByRole('button', { name: 'Open muse chat' })).toBeTruthy();
    act(() =>
      useProject
        .getState()
        .hydrate({
          ...createProject(),
          screens: [
            {
              id: 'blank',
              name: 'Blank',
              root: { id: 'root', type: 'screen', props: {}, styles: {}, children: [] },
            },
          ],
        }),
    );
    expect(screen.getByRole('dialog', { name: 'Muse focus' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Minimize chat' }));
    act(() => useProject.getState().addRail({ role: 'agent', text: 'Still minimized' }));
    expect(screen.queryByRole('dialog', { name: 'Muse focus' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Open muse chat' })).toBeTruthy();
  });
  it('shows only the launcher for a populated project and reopens for a new empty project', () => {
    const child = {
      id: 'text',
      type: 'text' as const,
      props: {},
      styles: {},
      children: [],
    };
    useProject
      .getState()
      .replaceDoc({
        ...createProject(),
        screens: [
          {
            id: 'filled',
            name: 'Filled',
            root: { id: 'root', type: 'screen', props: {}, styles: {}, children: [child] },
          },
        ],
      });
    render(<ChatHost />);
    expect(screen.getByRole('button', { name: 'Open muse chat' })).toBeTruthy();
    expect(document.querySelector('aside.rail')).toBeNull();
    act(() => useProject.getState().replaceDoc(createProject()));
    expect(screen.getByRole('dialog', { name: 'Muse focus' })).toBeTruthy();
  });
  it('opens the fullscreen chat when a prompt or existing chat action is invoked', () => {
    render(<ChatHost />);
    fireEvent.click(screen.getByRole('button', { name: 'Minimize chat' }));
    act(() => useUi.getState().startPrompt('Please help'));
    expect(screen.getByRole('dialog', { name: 'Muse focus' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Message muse' })).toHaveProperty(
      'value',
      'Please help',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Minimize chat' }));
    act(() => useUi.getState().setMobileRail(true));
    expect(screen.getByRole('dialog', { name: 'Muse focus' })).toBeTruthy();
  });
  it('Escape minimizes and receipt arrivals mark the bubble unread', () => {
    render(<ChatHost />);
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

it('places the rendered chat below a popover in the shared token ladder', async () => {
  const { readFileSync } = await import('node:fs');
  const appCss = readFileSync('src/design/app.css', 'utf8');
  const tokens = readFileSync('src/design/mw.css', 'utf8');
  render(
    <>
      <ChatHost />
      <div className="menu" data-testid="popover" />
    </>,
  );
  const chat = screen.getByRole('dialog', { name: 'Muse focus' });
  const popover = screen.getByTestId('popover');
  expect(chat.classList.contains('chat-focus')).toBe(true);
  expect(popover.classList.contains('menu')).toBe(true);
  expect(appCss.match(/\.chat-focus\s*\{[^}]*z-index:\s*var\(--mw-z-chat\)/s)).toBeTruthy();
  expect(appCss.match(/\.menu\s*\{[^}]*z-index:\s*var\(--mw-z-popover\)/s)).toBeTruthy();
  const chatZ = Number(tokens.match(/--mw-z-chat:\s*(\d+)\s*;/)?.[1]);
  const popoverZ = Number(tokens.match(/--mw-z-popover:\s*(\d+)\s*;/)?.[1]);
  expect(chatZ).toBeGreaterThan(0);
  expect(popoverZ).toBeGreaterThan(chatZ);
});
