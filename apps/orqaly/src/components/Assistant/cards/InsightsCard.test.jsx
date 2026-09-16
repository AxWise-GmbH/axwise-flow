import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

const svc = vi.hoisted(() => ({ firstSteps: vi.fn() }));
vi.mock('../../../services/assistantIngestService', () => ({ firstSteps: svc.firstSteps }));

import InsightsCard from './InsightsCard';

const theme = createTheme();
const wrap = (ui) => render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

describe('InsightsCard', () => {
  it('generates and renders the first-steps narrative', async () => {
    svc.firstSteps.mockResolvedValue({ narrative: 'First steps:\n- connect a channel' });
    wrap(<InsightsCard onComplete={vi.fn()} onSkip={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /generate my first-steps plan/i }));
    expect(await screen.findByText(/connect a channel/i)).toBeTruthy();
    expect(svc.firstSteps).toHaveBeenCalled();
  });

  it('completes after a plan is generated', async () => {
    const onComplete = vi.fn();
    svc.firstSteps.mockResolvedValue({ narrative: 'A plan' });
    wrap(<InsightsCard onComplete={onComplete} onSkip={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /generate my first-steps plan/i }));
    await screen.findByText('A plan');
    fireEvent.click(screen.getByRole('button', { name: /finish setup/i }));
    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({ insights: { generated: true } }),
        })
      )
    );
  });
});
