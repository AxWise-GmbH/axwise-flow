import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

const svc = vi.hoisted(() => ({ saveUserKey: vi.fn(), testUserKey: vi.fn() }));
vi.mock('../../../services/userKeysService', () => ({
  saveUserKey: svc.saveUserKey,
  testUserKey: svc.testUserKey,
}));

import KeysStep from './KeysStep';

const theme = createTheme();
const refresh = vi.fn();
const progress = { keys: { keys: [], done: false, refresh } };
const wrap = (value = progress) =>
  render(
    <ThemeProvider theme={theme}>
      <KeysStep progress={value} />
    </ThemeProvider>
  );

beforeEach(() => {
  svc.saveUserKey.mockReset().mockResolvedValue({});
  refresh.mockClear();
});

describe('KeysStep', () => {
  it('shows only Gemini as a goal Core credential', () => {
    wrap({
      keys: {
        keys: [
          { id: 'tool-1', provider: 'tool:unsplash', label: 'Unsplash' },
          { id: 'openai-1', provider: 'llm:openai', label: 'OpenAI' },
          { id: 'router-1', provider: 'llm:openrouter', label: 'OpenRouter' },
          { id: 'llm-1', provider: 'llm:gemini', label: 'Gemini' },
        ],
        done: true,
        refresh,
      },
    });

    expect(screen.getByText('Gemini')).toBeTruthy();
    expect(screen.queryByText('Unsplash')).toBeNull();
    expect(screen.queryByText('OpenAI')).toBeNull();
    expect(screen.queryByText('OpenRouter')).toBeNull();
  });

  it('saves a BYO key, normalizing a bare provider to llm:*', async () => {
    wrap();
    fireEvent.change(screen.getByLabelText('Provider ID'), { target: { value: 'openai' } });
    fireEvent.change(screen.getByLabelText('Provider key'), { target: { value: 'sk-12345678' } });
    fireEvent.click(screen.getByRole('button', { name: /save key/i }));
    await waitFor(() => {
      expect(svc.saveUserKey).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'llm:openai' })
      );
      expect(refresh).toHaveBeenCalled();
    });
  });

  it('saves the AI Core selection via the shared LlmCoreChooser', async () => {
    wrap();
    fireEvent.change(screen.getByPlaceholderText('Paste your Gemini key'), {
      target: { value: 'test-gemini-key-123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save ai core/i }));
    await waitFor(() => {
      expect(svc.saveUserKey).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'llm:gemini', apiKey: 'test-gemini-key-123456' })
      );
      expect(refresh).toHaveBeenCalled();
    });
  });
});
