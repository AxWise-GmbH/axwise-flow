import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import BriefStatusCard from './BriefStatusCard';

const theme = createTheme();
function renderCard(props) {
  return render(
    <ThemeProvider theme={theme}>
      <BriefStatusCard {...props} />
    </ThemeProvider>
  );
}

const brief = { status: 'complete', summary: 'We sell B2B logistics SaaS.', questionCount: 18 };

describe('BriefStatusCard (slim strip)', () => {
  it('renders status, Q&A count and summary', () => {
    renderCard({ brief, onReview: vi.fn(), onChange: vi.fn() });
    expect(screen.getByText('Company Brief')).toBeInTheDocument();
    expect(screen.getByText('Complete')).toBeInTheDocument();
    expect(screen.getByText('18 Q&A')).toBeInTheDocument();
    expect(screen.getByText(/B2B logistics SaaS/)).toBeInTheDocument();
  });

  it('fires onReview and onChange from the action buttons', () => {
    const onReview = vi.fn();
    const onChange = vi.fn();
    renderCard({ brief, onReview, onChange });
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(onReview).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('handles an empty brief without crashing', () => {
    renderCard({
      brief: { status: 'empty', summary: '', questionCount: 0 },
      onReview: vi.fn(),
      onChange: vi.fn(),
    });
    expect(screen.getByText('Not started')).toBeInTheDocument();
    expect(screen.getByText('0 Q&A')).toBeInTheDocument();
  });
});
