import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

const svc = vi.hoisted(() => ({ saveUserKey: vi.fn() }));
vi.mock('../../../services/userKeysService', () => ({ saveUserKey: svc.saveUserKey }));
vi.mock('../../../components/Setup/LocalLlmInstructionsDialog', () => ({ default: () => null }));

import LocalLlmStep from './LocalLlmStep';

const theme = createTheme();
const refresh = vi.fn();
const progress = { localLlm: { done: false, refresh } };
const wrap = () =>
  render(
    <ThemeProvider theme={theme}>
      <LocalLlmStep progress={progress} />
    </ThemeProvider>
  );

beforeEach(() => {
  svc.saveUserKey.mockResolvedValue({});
  refresh.mockClear();
});

describe('LocalLlmStep', () => {
  it('saves the default Ollama engine + base URL', async () => {
    wrap();
    fireEvent.click(screen.getByRole('button', { name: /save & use/i }));
    await waitFor(() => {
      expect(svc.saveUserKey).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'llm:ollama', apiKey: 'http://localhost:11434' })
      );
      expect(refresh).toHaveBeenCalled();
    });
  });
});
