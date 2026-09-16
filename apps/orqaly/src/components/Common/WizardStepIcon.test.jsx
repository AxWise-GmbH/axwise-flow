import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import WizardStepIcon from './WizardStepIcon';

const theme = createTheme();
const wrap = (ui) => render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

describe('WizardStepIcon', () => {
  it('shows the number when not completed', () => {
    wrap(<WizardStepIcon number={3} />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows a check (not the number) when completed', () => {
    const { container } = wrap(<WizardStepIcon number={2} completed />);
    expect(screen.queryByText('2')).toBeNull();
    expect(container.querySelector('svg')).toBeTruthy();
  });
});
