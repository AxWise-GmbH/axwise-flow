import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import HowItWorksCard from './HowItWorksCard';

const theme = createTheme();
const wrap = (ui) => render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

describe('HowItWorksCard', () => {
  it('shows only the topic + a Read More button when collapsed', () => {
    wrap(<HowItWorksCard />);
    expect(screen.getByText('Setup')).toBeInTheDocument();
    expect(screen.getByText('Learn what you need to add')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /read more/i })).toBeInTheDocument();
    // Details are hidden by default.
    expect(screen.queryByText('Add LLM keys')).toBeNull();
  });

  it('reveals the details on Read more and collapses again on Show less', async () => {
    wrap(<HowItWorksCard />);
    fireEvent.click(screen.getByRole('button', { name: /read more/i }));
    expect(await screen.findByText('Add LLM keys')).toBeInTheDocument();
    expect(screen.getByText('Connect Database')).toBeInTheDocument();
    expect(screen.getByText('Connect Storage')).toBeInTheDocument();
    expect(screen.getByText('Use local LLMs')).toBeInTheDocument();
    // Privacy reassurance callout is part of the revealed content.
    expect(screen.getByText(/we don't require your data or credentials/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /show less/i }));
    expect(screen.getByRole('button', { name: /read more/i })).toBeInTheDocument();
  });
});
