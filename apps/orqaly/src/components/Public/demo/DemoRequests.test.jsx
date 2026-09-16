import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import DemoRequests from './DemoRequests';

const SUBJECTS = [
  'Strategy for Estonian market to implement agents',
  'Create a landing page for AaaS',
  'Generate banner for SMM',
  'Brainstorm a price range for our new product',
];

function renderDemo() {
  return render(
    <ThemeProvider theme={createTheme()}>
      <DemoRequests />
    </ThemeProvider>,
  );
}

describe('DemoRequests', () => {
  it('renders inbox header', () => {
    renderDemo();
    expect(screen.getByText(/Inbox · all routes/i)).toBeInTheDocument();
    expect(screen.getByText(/each becomes a goal in Job Pool/i)).toBeInTheDocument();
  });

  it('renders real-world goal examples in the inbox', () => {
    renderDemo();
    SUBJECTS.forEach((subject) => {
      expect(screen.getByText(subject)).toBeInTheDocument();
    });
  });
});
