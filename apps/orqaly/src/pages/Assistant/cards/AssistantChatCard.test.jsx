import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';

vi.mock('../../../components/Assistant/AssistantChat.jsx', () => ({
  default: ({ variant, orgId, provider, model, personality, pageContext }) => (
    <div
      data-testid="shared-assistant-chat"
      data-variant={variant}
      data-org-id={orgId || ''}
      data-provider={provider}
      data-model={model}
      data-personality={personality}
      data-surface={pageContext?.surface || ''}
    >
      Agentic assistant
    </div>
  ),
}));

import AssistantChatCard from './AssistantChatCard';

function renderCard(config = {}) {
  return render(
    <ThemeProvider theme={createTheme()}>
      <AssistantChatCard config={config} />
    </ThemeProvider>
  );
}

describe('AssistantChatCard', () => {
  it('keeps the Assistant Console entry point collapsed until requested', () => {
    renderCard();

    const trigger = screen.getByRole('button', { name: 'Open assistant chat' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('shared-assistant-chat')).toBeTruthy();
  });

  it('uses the shared agentic chat and forwards the configured tenant and brain', () => {
    renderCard({
      orgId: 'org-42',
      provider: 'openai',
      model: 'gpt-5',
      tone: 'direct',
    });

    fireEvent.keyDown(screen.getByRole('button', { name: 'Open assistant chat' }), {
      key: 'Enter',
    });

    const chat = screen.getByTestId('shared-assistant-chat');
    expect(chat.getAttribute('data-variant')).toBe('compact');
    expect(chat.getAttribute('data-org-id')).toBe('org-42');
    expect(chat.getAttribute('data-provider')).toBe('openai');
    expect(chat.getAttribute('data-model')).toBe('gpt-5');
    expect(chat.getAttribute('data-personality')).toBe('direct');
    expect(chat.getAttribute('data-surface')).toBe('assistant-console');
  });
});
