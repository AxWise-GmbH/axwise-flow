import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

const svc = vi.hoisted(() => ({
  nextBriefQuestion: vi.fn(),
  generateBriefQuestions: vi.fn(),
  answerBriefQuestion: vi.fn(),
}));
vi.mock('../../../services/companyBriefService', () => ({
  nextBriefQuestion: svc.nextBriefQuestion,
  generateBriefQuestions: svc.generateBriefQuestions,
  answerBriefQuestion: svc.answerBriefQuestion,
}));

import CompanyBriefCard from './CompanyBriefCard';

const theme = createTheme();
const wrap = (ui) => render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

beforeEach(() => {
  svc.nextBriefQuestion.mockReset();
  svc.generateBriefQuestions.mockReset();
  svc.answerBriefQuestion.mockReset();
  svc.nextBriefQuestion.mockResolvedValue({
    briefId: 'b1',
    question: { id: 'q1', text: 'What do you do?' },
    index: 1,
    max: 8,
    done: false,
  });
  svc.answerBriefQuestion.mockResolvedValue({ ok: true });
});

describe('CompanyBriefCard', () => {
  it('loads and shows the first question', async () => {
    wrap(<CompanyBriefCard onComplete={vi.fn()} onSkip={vi.fn()} />);
    expect(await screen.findByText('What do you do?')).toBeTruthy();
    expect(svc.nextBriefQuestion).toHaveBeenCalled();
  });

  it('saves the answer, fetches the next question, and completes when done', async () => {
    const onComplete = vi.fn();
    svc.nextBriefQuestion
      .mockResolvedValueOnce({
        briefId: 'b1',
        question: { id: 'q1', text: 'What do you do?' },
        index: 1,
        max: 8,
        done: false,
      })
      .mockResolvedValueOnce({ briefId: 'b1', done: true, index: 1, max: 8 });

    wrap(<CompanyBriefCard onComplete={onComplete} onSkip={vi.fn()} />);
    await screen.findByText('What do you do?');
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    await waitFor(() => {
      expect(svc.answerBriefQuestion).toHaveBeenCalledWith(
        expect.objectContaining({ briefId: 'b1', questionId: 'q1' })
      );
      expect(onComplete).toHaveBeenCalledWith(
        expect.objectContaining({ config: expect.objectContaining({ brief: expect.anything() }) })
      );
    });
  });

  it('advances to the next question when not yet done', async () => {
    svc.nextBriefQuestion
      .mockResolvedValueOnce({
        briefId: 'b1',
        question: { id: 'q1', text: 'What do you do?' },
        index: 1,
        max: 8,
        done: false,
      })
      .mockResolvedValueOnce({
        briefId: 'b1',
        question: { id: 'q2', text: 'Which shoes sell best?' },
        index: 2,
        max: 8,
        done: false,
      });

    wrap(<CompanyBriefCard onComplete={vi.fn()} onSkip={vi.fn()} />);
    await screen.findByText('What do you do?');
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(await screen.findByText('Which shoes sell best?')).toBeTruthy();
  });

  it('falls back to the legacy batch when next-question is unsupported', async () => {
    svc.nextBriefQuestion.mockRejectedValue(new Error('Unknown action'));
    svc.generateBriefQuestions.mockResolvedValue({
      briefId: 'b1',
      questions: [
        { id: 'q1', text: 'Legacy one?' },
        { id: 'q2', text: 'Legacy two?' },
      ],
    });

    wrap(<CompanyBriefCard onComplete={vi.fn()} onSkip={vi.fn()} />);
    expect(await screen.findByText('Legacy one?')).toBeTruthy();
    expect(svc.generateBriefQuestions).toHaveBeenCalled();
    // Subsequent questions are served locally from the batch.
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(await screen.findByText('Legacy two?')).toBeTruthy();
  });

  it('shows a retry when the brief cannot be started at all', async () => {
    svc.nextBriefQuestion.mockRejectedValue(new Error('Unknown action'));
    svc.generateBriefQuestions.mockRejectedValue(new Error('offline'));

    wrap(<CompanyBriefCard onComplete={vi.fn()} onSkip={vi.fn()} />);
    expect(await screen.findByRole('button', { name: /try again/i })).toBeTruthy();
    expect(screen.getByText(/couldn't start the brief/i)).toBeTruthy();
  });
});
