import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

const state = { row: null };
function builder() {
  const b = {
    select: () => b,
    eq: () => b,
    order: () => b,
    limit: () => b,
    maybeSingle: async () => ({ data: state.row, error: null }),
  };
  return b;
}
vi.mock('../../lib/supabase', () => ({
  hasSupabase: () => true,
  supabase: { from: () => builder() },
}));

import AxwiseCallDetail from './AxwiseCallDetail';

const theme = createTheme();
const renderDetail = (event) =>
  render(
    <ThemeProvider theme={theme}>
      <AxwiseCallDetail event={event} />
    </ThemeProvider>
  );

beforeEach(() => {
  state.row = null;
});

describe('AxwiseCallDetail', () => {
  it('renders full sections from the durable axwise_calls row', async () => {
    state.row = {
      trace_id: 'tr-1',
      integration_point: 'copilot.chat',
      destination_url: 'https://api.axwise.de/v1/conditions/evaluate',
      model: 'gpt-4o',
      ax_decision: 'allowed',
      local_decision: 'allow',
      applied_outcome: 'shadow-logged',
      duration_ms: 120,
      cost_usd: 0.01,
      degraded: false,
      request_payload: { message: 'summarize my goals', history_len: 4 },
      processed_outputs: {
        systemPromptFragment: 'be concise',
        classification: { intent: 'question', sentiment: 'neutral' },
      },
      applicable_conditions: [{ category: 'tone', decision: 'applied', reason: 'ok' }],
    };
    const { container } = renderDetail({ traceId: 'tr-1', kind: 'axwise' });
    await waitFor(() => expect(container.textContent).toMatch(/summarize my goals/));
    const text = container.textContent;
    expect(text).toMatch(/Endpoint/);
    expect(text).toMatch(/tone/); // applicable condition rendered
    expect(text).toMatch(/shadow-logged/); // applied outcome
    expect(text).toMatch(/be concise/); // systemPromptFragment
    expect(text).toMatch(/gpt-4o/); // model (Endpoint)
  });

  it('falls back to the thin event fields when there is no durable row', async () => {
    state.row = null;
    const { container } = renderDetail({
      traceId: 'tr-x',
      kind: 'axwise',
      axDecision: 'allowed',
      localDecision: 'allow',
      durationMs: 5,
      cost: 0,
      where: 'copilot.chat',
      status: 'ok',
    });
    await waitFor(() => expect(container.textContent).toMatch(/payload not stored/));
    expect(container.textContent).toMatch(/Endpoint/);
    expect(container.textContent).toMatch(/shadow-logged/); // derived fallback
  });
});
