import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import GoalDeliverables from './GoalDeliverables';

const theme = createTheme();

const sampleDeliverable = {
  id: 'd1',
  title: 'Research summary',
  category: 'research',
  agent_name: 'Research Agent',
  content: 'Findings',
};

describe('GoalDeliverables', () => {
  it('renders agent chip without SmartToyOutlinedIcon reference error', () => {
    render(
      <ThemeProvider theme={theme}>
        <GoalDeliverables compact goalId="goal-1" deliverables={[sampleDeliverable]} />
      </ThemeProvider>
    );
    expect(screen.getByText('Research summary')).toBeInTheDocument();
    expect(screen.getByText('Research Agent')).toBeInTheDocument();
  });

  it('omits duplicate header when embedded in Report tab accordion', () => {
    render(
      <ThemeProvider theme={theme}>
        <GoalDeliverables compact embedded deliverables={[sampleDeliverable]} />
      </ThemeProvider>
    );
    expect(screen.queryByText(/Deliverables \(1\)/)).not.toBeInTheDocument();
    expect(screen.getByText('Research summary')).toBeInTheDocument();
  });

  it('renders long titles and URLs without breaking layout', () => {
    const longUrl = `https://example.com/${'very-long-path-segment/'.repeat(8)}landing-page`;
    render(
      <ThemeProvider theme={theme}>
        <GoalDeliverables
          compact
          embedded
          deliverables={[
            {
              ...sampleDeliverable,
              id: 'd2',
              title: 'Two Unique Branded Casino Landing Pages — (Opus Sub)',
              quality_score: 95,
              output_preview: `Deployed at ${longUrl} with verification checks.`,
              has_code: true,
              tools_used: 0,
              deliverable_type: 'code',
            },
          ]}
        />
      </ThemeProvider>
    );
    expect(screen.getByText('Structure: 95/100')).toBeInTheDocument();
    expect(screen.getByText(/Deployed at https:\/\/example.com/)).toBeInTheDocument();
  });
});
