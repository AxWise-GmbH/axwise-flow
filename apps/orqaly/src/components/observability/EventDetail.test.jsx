import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

// AxwiseCallSections pulls in ../../lib/supabase transitively via AxwiseCallDetail;
// stub it so the module loads cleanly in the test env.
vi.mock('../../lib/supabase', () => ({ hasSupabase: () => false, supabase: null }));

import EventDetail from './EventDetail';

const theme = createTheme();
const renderDetail = (props) =>
  render(
    <ThemeProvider theme={theme}>
      <EventDetail onClose={() => {}} {...props} />
    </ThemeProvider>
  );

describe('EventDetail', () => {
  it('renders nothing when no row', () => {
    renderDetail({ source: 'llm', row: null });
    expect(screen.queryByText(/detail/i)).toBeNull();
  });

  it('renders curated AxWise sections for source=axwise', () => {
    renderDetail({
      source: 'axwise',
      row: {
        integration_point: 'copilot.chat',
        destination_url: 'https://api.axwise.de/v1/conditions/evaluate',
        ax_decision: 'allowed',
        applied_outcome: 'shadow-logged',
        request_payload: { message: 'hello' },
        processed_outputs: { systemPromptFragment: 'be concise' },
        applicable_conditions: [{ category: 'tone', decision: 'applied', reason: 'ok' }],
      },
    });
    const t = document.body.textContent;
    expect(t).toMatch(/Endpoint/);
    expect(t).toMatch(/hello/);
    expect(t).toMatch(/shadow-logged/);
  });

  it('renders a generic KV list + member votes for source=consilium', () => {
    renderDetail({
      source: 'consilium',
      row: {
        approved: true,
        consensus_type: 'majority',
        member_responses: [
          {
            memberName: 'Alice',
            role: 'evaluator',
            overallScore: 4,
            approved: true,
            feedback: 'lgtm',
          },
        ],
      },
    });
    const t = document.body.textContent;
    expect(t).toMatch(/Consensus Type/); // humanized key
    expect(t).toMatch(/Member votes/);
    expect(t).toMatch(/Alice/);
    expect(t).toMatch(/lgtm/);
  });
});
