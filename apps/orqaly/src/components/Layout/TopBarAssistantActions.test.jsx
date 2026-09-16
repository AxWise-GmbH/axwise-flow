import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import TopBarAssistantActions from './TopBarAssistantActions';
import {
  AssistantConversationProvider,
  usePublishAssistantConversation,
} from '../../context/AssistantConversationContext';

const theme = createTheme();

/** Stands in for the page that owns the conversation. */
function Page({ active, onNewChat }) {
  usePublishAssistantConversation(active, onNewChat);
  return null;
}

function setup({ active = true, onNewChat = vi.fn(), withPage = true } = {}) {
  const utils = render(
    <ThemeProvider theme={theme}>
      <AssistantConversationProvider>
        <TopBarAssistantActions />
        {withPage && <Page active={active} onNewChat={onNewChat} />}
      </AssistantConversationProvider>
    </ThemeProvider>
  );
  return { onNewChat, ...utils };
}

const button = () => screen.queryByRole('button', { name: '+ New' });

describe('TopBarAssistantActions', () => {
  it('offers a way out once a page publishes a conversation', () => {
    setup({ active: true });
    expect(button()).toBeInTheDocument();
  });

  // Most routes never publish a conversation, and the slot has to stay empty.
  it('renders nothing when no conversation is published', () => {
    setup({ withPage: false });
    expect(button()).toBeNull();
  });

  it('renders nothing while the published conversation is empty', () => {
    setup({ active: false });
    expect(button()).toBeNull();
  });

  it('hands the click back to the page that published it', () => {
    const { onNewChat } = setup({ active: true });
    fireEvent.click(button());
    expect(onNewChat).toHaveBeenCalledTimes(1);
  });

  // Or the shell would go on offering to restart a conversation nobody is
  // looking at any more.
  it('goes away when the page does', () => {
    const { rerender } = render(
      <ThemeProvider theme={theme}>
        <AssistantConversationProvider>
          <TopBarAssistantActions />
          <Page active onNewChat={vi.fn()} />
        </AssistantConversationProvider>
      </ThemeProvider>
    );
    expect(button()).toBeInTheDocument();

    rerender(
      <ThemeProvider theme={theme}>
        <AssistantConversationProvider>
          <TopBarAssistantActions />
        </AssistantConversationProvider>
      </ThemeProvider>
    );
    expect(button()).toBeNull();
  });

  // The page re-renders constantly; a fresh callback identity each time must
  // not cost a shell re-render, and the click must still reach the newest one.
  it('calls the latest handler even after the page re-renders', () => {
    const first = vi.fn();
    const second = vi.fn();
    const tree = (fn) => (
      <ThemeProvider theme={theme}>
        <AssistantConversationProvider>
          <TopBarAssistantActions />
          <Page active onNewChat={fn} />
        </AssistantConversationProvider>
      </ThemeProvider>
    );
    const { rerender } = render(tree(first));
    rerender(tree(second));
    fireEvent.click(button());
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
