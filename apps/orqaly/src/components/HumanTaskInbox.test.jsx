import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';

const { mockTaskRows, mockFrom, mockSupabaseAvailable } = vi.hoisted(() => ({
  mockTaskRows: [],
  mockFrom: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn(async () => ({ data: [], error: null })),
  })),
  mockSupabaseAvailable: { value: true },
}));

vi.mock('../lib/supabase.js', () => ({
  hasSupabase: () => mockSupabaseAvailable.value,
  supabase: {
    auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: 'tok' } } })) },
    from: mockFrom,
  },
}));

import HumanTaskInbox, { HumanTaskRow } from './HumanTaskInbox';

const theme = createTheme();

const CREDENTIAL_TASK = {
  id: 'ht-1',
  type: 'provide_credential',
  tool_id: 'tool-github',
  reason: 'Sandris could not finish the signup',
  instructions: '1. Go to the provider\n2. Create a key',
  reason_code: 'phone_required',
  escalation_allowed: true,
  escalate_after_seconds: 120,
  created_at: new Date().toISOString(),
  partial_context: {
    credential_checkpoint: {
      manual_only: false,
      trusted_legacy_browser_failure: true,
    },
  },
};

const MANUAL_CREDENTIAL_TASK = {
  ...CREDENTIAL_TASK,
  id: 'ht-manual',
  reason: 'Add the API key for tool-github in Tool Setup to continue.',
  reason_code: 'manual',
  escalation_allowed: false,
  escalate_after_seconds: null,
};

const KYC_TASK = {
  ...MANUAL_CREDENTIAL_TASK,
  id: 'ht-kyc',
  reason: 'KYC identity verification required',
  reason_code: 'kyc_required',
};

const BRIEF_TASK = {
  id: 'ht-2',
  type: 'integration_brief',
  tool_id: 'custom:monday-com',
  reason: 'Connect Monday.com so Arena can read what your team delivers there',
  instructions: '# Integration brief\n\n' + 'A very long developer brief. '.repeat(30),
  escalation_allowed: false,
  escalate_after_seconds: null,
  created_at: new Date().toISOString(),
  partial_context: { label: 'Monday.com' },
};

function setup(task) {
  const onDone = vi.fn();
  render(
    <ThemeProvider theme={theme}>
      <HumanTaskRow task={task} tick={0} onDone={onDone} />
    </ThemeProvider>
  );
  return { onDone };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockTaskRows.splice(0);
  mockSupabaseAvailable.value = true;
  mockFrom.mockImplementation(() => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn(async () => ({ data: mockTaskRows, error: null })),
  }));
  globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) }));
  Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => {}) } });
});

describe('HumanTaskRow — credential tasks (unchanged behaviour)', () => {
  it('shows the key form and submit button', () => {
    setup(CREDENTIAL_TASK);
    expect(screen.getByLabelText('Paste API key')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit key' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark as done' })).not.toBeInTheDocument();
  });

  it('renders an ordinary manual-key checkpoint without KYC or timer controls', () => {
    setup(MANUAL_CREDENTIAL_TASK);
    expect(screen.getByText('Manual key required')).toBeInTheDocument();
    expect(screen.queryByText('Identity check required')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Claim/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit key' })).toBeInTheDocument();
  });

  it('hides the timer for an old manual row even when its legacy flags are still true', () => {
    setup({
      ...MANUAL_CREDENTIAL_TASK,
      escalation_allowed: true,
      escalate_after_seconds: 120,
      partial_context: {},
    });
    expect(screen.getByText('Manual key required')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Claim/ })).not.toBeInTheDocument();
  });

  it('labels KYC only from the explicit reason code', () => {
    setup(KYC_TASK);
    expect(screen.getByText('Identity check required')).toBeInTheDocument();
    expect(screen.queryByText('Manual key required')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Claim/ })).not.toBeInTheDocument();
  });

  it('keeps trusted legacy browser failures owner-only with no timer controls', () => {
    setup(CREDENTIAL_TASK);
    expect(screen.getByText('Manual key required')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Claim/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Timer/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit key' })).toBeInTheDocument();
  });

  it('keeps an actual legacy dispatch locked without timer or paid-worker copy', () => {
    setup({
      ...CREDENTIAL_TASK,
      escalated_at: '2026-08-22T10:01:00.000Z',
      escalation_result: { status: 'dispatching' },
    });
    expect(screen.getByText('Credential handoff in progress')).toBeInTheDocument();
    expect(screen.getByLabelText('Paste API key')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Submit key' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Claim/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/paid worker/i)).not.toBeInTheDocument();
  });
});

describe('HumanTaskInbox', () => {
  it('uses neutral copy that does not promise paid-worker escalation', () => {
    render(
      <ThemeProvider theme={theme}>
        <HumanTaskInbox open onClose={vi.fn()} userId={null} />
      </ThemeProvider>
    );

    expect(
      screen.getByText('Tasks that need your input before work can continue.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/paid worker/i)).not.toBeInTheDocument();
  });

  it('does not poll the retired Supabase task source in the lean GCP runtime', async () => {
    mockSupabaseAvailable.value = false;
    render(
      <ThemeProvider theme={theme}>
        <HumanTaskInbox open onClose={vi.fn()} userId="clerk-user" />
      </ThemeProvider>
    );

    await waitFor(() => expect(screen.getByText('No tasks waiting.')).toBeInTheDocument());
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('does not poll while the inbox is closed', async () => {
    render(
      <ThemeProvider theme={theme}>
        <HumanTaskInbox open={false} onClose={vi.fn()} userId="clerk-user" />
      </ThemeProvider>
    );

    await waitFor(() => expect(mockFrom).not.toHaveBeenCalled());
  });
});

describe('HumanTaskRow — integration briefs', () => {
  it('reads as a document for the developer, not a credential prompt', () => {
    setup(BRIEF_TASK);
    expect(screen.getByText('For your developer')).toBeInTheDocument();
    expect(screen.queryByLabelText('Paste API key')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit key' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Claim/ })).not.toBeInTheDocument();
  });

  it('collapses a long brief and expands on Show all', () => {
    setup(BRIEF_TASK);
    const toggle = screen.getByRole('button', { name: 'Show all' });
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Show less' })).toBeInTheDocument();
  });

  it('copies the whole brief to the clipboard', async () => {
    setup(BRIEF_TASK);
    fireEvent.click(screen.getByRole('button', { name: 'Copy the brief' }));
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(BRIEF_TASK.instructions)
    );
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('completes with Mark as done and no key', async () => {
    const { onDone } = setup(BRIEF_TASK);
    fireEvent.click(screen.getByRole('button', { name: 'Mark as done' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body).toEqual({ human_task_id: 'ht-2', mark_done: true });
  });
});
