import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

vi.mock('../../services/companyBriefService', () => ({ getCompanyBrief: vi.fn() }));
import { getCompanyBrief } from '../../services/companyBriefService';
import BriefReviewDialog from './BriefReviewDialog';

const theme = createTheme();
function renderDialog(props) {
  return render(
    <ThemeProvider theme={theme}>
      <BriefReviewDialog open onClose={vi.fn()} onChange={vi.fn()} {...props} />
    </ThemeProvider>
  );
}

beforeEach(() => vi.clearAllMocks());

describe('BriefReviewDialog (read-only)', () => {
  it('loads and renders the brief summary + Q&A answers', async () => {
    getCompanyBrief.mockResolvedValue({
      brief: { status: 'complete', summary: 'A logistics SaaS company.' },
      answers: [{ question: 'What do you sell?', answer: 'Logistics software' }],
    });
    renderDialog({ fallbackBrief: { status: 'complete', summary: '', questionCount: 1 } });

    expect(await screen.findByText('A logistics SaaS company.')).toBeInTheDocument();
    expect(screen.getByText('What do you sell?')).toBeInTheDocument();
    expect(screen.getByText('Logistics software')).toBeInTheDocument();
    expect(screen.getByText('Complete')).toBeInTheDocument();
  });

  it('falls back to the provided brief when the fetch fails', async () => {
    getCompanyBrief.mockRejectedValue(new Error('offline'));
    renderDialog({
      fallbackBrief: { status: 'in_progress', summary: 'Fallback summary.', questionCount: 0 },
    });
    expect(await screen.findByText('Fallback summary.')).toBeInTheDocument();
  });

  it('fires onChange from the "Change answers" action', async () => {
    getCompanyBrief.mockResolvedValue({ brief: { status: 'complete', summary: 'x' }, answers: [] });
    const onChange = vi.fn();
    renderDialog({
      onChange,
      fallbackBrief: { status: 'complete', summary: 'x', questionCount: 0 },
    });
    await waitFor(() => expect(getCompanyBrief).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /change answers/i }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
