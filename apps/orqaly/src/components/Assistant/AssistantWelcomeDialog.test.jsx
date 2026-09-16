import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

const orgMocks = vi.hoisted(() => ({ listOrganizations: vi.fn(async () => []) }));
vi.mock('../../services/organizationService', () => ({
  listOrganizations: orgMocks.listOrganizations,
}));

import AssistantWelcomeDialog from './AssistantWelcomeDialog.jsx';

const theme = createTheme();
const ASSISTANT = {
  id: 'a2',
  name: 'Sales Bot',
  activated: true,
  organizationId: 'org-1',
  config: { provider: 'anthropic', model: 'claude-sonnet-5' },
};

function renderDialog(props = {}) {
  return render(
    <ThemeProvider theme={theme}>
      <AssistantWelcomeDialog open assistant={ASSISTANT} onClose={() => {}} {...props} />
    </ThemeProvider>
  );
}

describe('AssistantWelcomeDialog', () => {
  beforeEach(() => {
    orgMocks.listOrganizations.mockClear();
    orgMocks.listOrganizations.mockResolvedValue([]);
  });

  it('introduces the assistant by name and says what it runs on', () => {
    renderDialog();
    expect(screen.getByText("Hi, I'm Sales Bot.")).toBeInTheDocument();
    expect(screen.getByText(/I'll do my best for you/)).toBeInTheDocument();
    expect(screen.getByText('Anthropic · Claude Sonnet 5')).toBeInTheDocument();
  });

  it('offers exactly one way out', () => {
    const onClose = vi.fn();
    renderDialog({ onClose });
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /let's go/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on Escape as well', () => {
    const onClose = vi.fn();
    renderDialog({ onClose });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('names the organization once it resolves', async () => {
    orgMocks.listOrganizations.mockResolvedValue([{ id: 'org-1', name: 'Acme Trading' }]);
    renderDialog();
    expect(await screen.findByText("I'm the assistant for Acme Trading.")).toBeInTheDocument();
  });

  it('accepts the wrapped list shape the endpoint also returns', async () => {
    orgMocks.listOrganizations.mockResolvedValue({
      organizations: [{ id: 'org-1', name: 'Acme Trading' }],
    });
    renderDialog();
    expect(await screen.findByText("I'm the assistant for Acme Trading.")).toBeInTheDocument();
  });

  it('still introduces itself when the organization lookup fails', async () => {
    orgMocks.listOrganizations.mockRejectedValue(new Error('offline'));
    renderDialog();
    expect(screen.getByText("Hi, I'm Sales Bot.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("I'm your assistant here.")).toBeInTheDocument());
  });

  it('does not look up an organization the assistant does not have', () => {
    renderDialog({ assistant: { ...ASSISTANT, organizationId: null } });
    expect(orgMocks.listOrganizations).not.toHaveBeenCalled();
    expect(screen.getByText("I'm your assistant here.")).toBeInTheDocument();
  });

  it('asks for its Core when it is not set up yet', () => {
    renderDialog({ assistant: { id: 'a3', name: 'New One', activated: false } });
    expect(screen.getByText(/I still need my Core/)).toBeInTheDocument();
  });

  it('renders nothing without an assistant', () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <AssistantWelcomeDialog open assistant={null} onClose={() => {}} />
      </ThemeProvider>
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('stays closed until it is opened', () => {
    renderDialog({ open: false });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
