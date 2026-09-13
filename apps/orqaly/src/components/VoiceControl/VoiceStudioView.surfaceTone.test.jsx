import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material';

import { getEnterpriseTheme } from '../../theme/enterpriseTheme';
import VoiceStudioView from './VoiceStudioView.jsx';

vi.mock('./ModelSwitcher.jsx', () => ({
  default: ({ surfaceTone }) => <div data-testid="studio-model" data-surface-tone={surfaceTone} />,
}));

vi.mock('./AttachButton.jsx', () => ({
  default: ({ surfaceTone }) => <div data-testid="studio-attach" data-surface-tone={surfaceTone} />,
}));

vi.mock('./chat-blocks/index.jsx', () => ({
  default: ({ surfaceTone }) => <div data-testid="studio-block" data-surface-tone={surfaceTone} />,
}));

const light = getEnterpriseTheme('light', null);

describe('VoiceStudioView surface boundary', () => {
  let originalScrollIntoView;

  beforeEach(() => {
    originalScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    Element.prototype.scrollIntoView = originalScrollIntoView;
  });

  it('forces shared controls and structured replies to dark inside a light app', () => {
    render(
      <ThemeProvider theme={light}>
        <VoiceStudioView
          userName="Mr.V"
          chatHistory={[
            {
              id: 'assistant-1',
              role: 'assistant',
              message: 'Progress',
              blocks: [{ id: 'chart-1', type: 'chart', compact: { data: [] } }],
            },
          ]}
          onToggleMic={() => {}}
          onSubmitText={() => {}}
          onCopilotModelChange={() => {}}
          copilotProvider="google"
          copilotModel="gemini-3.8-flash"
          formatMessageTime={() => 'now'}
        />
      </ThemeProvider>
    );

    expect(screen.getByTestId('studio-model')).toHaveAttribute('data-surface-tone', 'dark');
    expect(screen.getByTestId('studio-attach')).toHaveAttribute('data-surface-tone', 'dark');
    expect(screen.getByTestId('studio-block')).toHaveAttribute('data-surface-tone', 'dark');
  });
});
