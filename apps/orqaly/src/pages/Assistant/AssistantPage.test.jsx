import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import MOCK from './mockAssistantConsole';

// Stub lottie-react so the Profile & Brain illustration does not run the player.
vi.mock('lottie-react', () => ({ default: () => <div data-testid="lottie-stub" /> }));

let simpleModeValue = false;
vi.mock('../../hooks/useSimpleMode', () => ({
  useSimpleMode: () => ({
    simpleMode: simpleModeValue,
    setSimpleMode: vi.fn(),
    toggleSimpleMode: vi.fn(),
  }),
}));

// The console data hook is mocked so the page renders from the fixture without network.
const hookValue = {
  data: MOCK,
  loading: false,
  error: null,
  refetch: vi.fn(),
  save: vi.fn().mockResolvedValue({}),
  config: {},
};
vi.mock('../../hooks/useAssistantConsole', () => ({ useAssistantConsole: () => hookValue }));

// Stub the heavy setup dialog (pulls network/voice deps).
vi.mock('../../components/Assistant/AssistantSetupChatDialog', () => ({
  default: ({ open, initialStep }) =>
    open ? <div data-testid="setup-dialog" data-step={initialStep} /> : null,
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => vi.fn() };
});

import AssistantPage from './AssistantPage';

const theme = createTheme();
function Wrap({ children }) {
  return (
    <MemoryRouter initialEntries={['/assistant']}>
      <ThemeProvider theme={theme}>{children}</ThemeProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  simpleModeValue = false;
  vi.clearAllMocks();
  localStorage.clear();
});

describe('AssistantPage (Assistant Console)', () => {
  it('renders the toolbar and core cards from the fixture (advanced mode)', () => {
    render(
      <Wrap>
        <AssistantPage />
      </Wrap>
    );
    expect(screen.getByRole('button', { name: /filters & options/i })).toBeInTheDocument();
    expect(screen.getAllByText('gpt-4o').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Conversations')).toBeInTheDocument();
    expect(screen.getByText('Contributions')).toBeInTheDocument();
    expect(screen.getByText('Generate insights')).toBeInTheDocument();
    expect(screen.getAllByText('Connected').length).toBeGreaterThanOrEqual(2);
  }, 15_000);

  it('shows conversations as a searchable person-and-message list', () => {
    render(
      <Wrap>
        <AssistantPage />
      </Wrap>
    );
    expect(screen.getByPlaceholderText('Search person or message')).toBeInTheDocument();
    expect(screen.getByText('Aurum & P. Jackson')).toBeInTheDocument();
    expect(screen.getByText('How does the new pricing work?')).toBeInTheDocument();
  });

  it('shows contacts mail/phone totals and an attitude badge', () => {
    render(
      <Wrap>
        <AssistantPage />
      </Wrap>
    );
    expect(screen.getByText('Unique')).toBeInTheDocument();
    expect(screen.getByText('Mail')).toBeInTheDocument();
    expect(screen.getByText('Phone')).toBeInTheDocument();
    expect(screen.getByText('VIP')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add mail contact/i })).toBeInTheDocument();
  });

  it('exposes the Demo data toggle inside the filters popup', () => {
    render(
      <Wrap>
        <AssistantPage />
      </Wrap>
    );
    fireEvent.click(screen.getByRole('button', { name: /filters & options/i }));
    const sw = screen.getByRole('switch', { name: /demo data/i });
    expect(sw).toBeChecked();
    fireEvent.click(sw);
    expect(sw).not.toBeChecked();
  });

  it('opens the filters popup with block reorder/hide controls', () => {
    render(
      <Wrap>
        <AssistantPage />
      </Wrap>
    );
    fireEvent.click(screen.getByRole('button', { name: /filters & options/i }));
    expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide all' })).toBeInTheDocument();
  });

  it('simple mode renders the same blocks/structure as advanced', () => {
    simpleModeValue = true;
    render(
      <Wrap>
        <AssistantPage />
      </Wrap>
    );
    // Same full block set as advanced mode (no single-column stripped-down view).
    expect(screen.getByText('Conversations')).toBeInTheDocument();
    expect(screen.getByText('Contributions')).toBeInTheDocument();
    expect(screen.getByText('Generate insights')).toBeInTheDocument();
    expect(screen.getByText('Unique')).toBeInTheDocument();
  });

  it('renders the Company Brief strip with Review and Change actions', () => {
    render(
      <Wrap>
        <AssistantPage />
      </Wrap>
    );
    expect(screen.getByText('Company Brief')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument();
  });

  it('exposes the Beginner layout template inside the filters popup', () => {
    render(
      <Wrap>
        <AssistantPage />
      </Wrap>
    );
    fireEvent.click(screen.getByRole('button', { name: /filters & options/i }));
    expect(screen.getByText('Layout template')).toBeInTheDocument();
    expect(screen.getByText('Beginner')).toBeInTheDocument();
  });

  it('changing the Core provider saves in place without refetching or blanking the page', () => {
    render(
      <Wrap>
        <AssistantPage />
      </Wrap>
    );
    // Core renders Provider, Model, and Tone in that order; MUI applies the
    // aria label to its hidden input rather than the visible combobox.
    const [provider] = screen.getAllByRole('combobox');
    fireEvent.mouseDown(provider);
    fireEvent.click(screen.getByRole('option', { name: 'Anthropic' }));

    // Saves the new provider + its first model in one call...
    expect(hookValue.save).toHaveBeenCalledWith({
      config: { provider: 'anthropic', model: 'claude-opus-5' },
    });
    // ...and never triggers the full refetch (which used to flip `loading` true
    // and blank the whole grid to a spinner on every dropdown change).
    expect(hookValue.refetch).not.toHaveBeenCalled();
  });

  it('hiding a block removes its card from the page', () => {
    render(
      <Wrap>
        <AssistantPage />
      </Wrap>
    );
    expect(screen.getByText('gpt-4o-mini')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /filters & options/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Hide Usage' }));
    expect(screen.queryByText('gpt-4o-mini')).not.toBeInTheDocument();
  });
});
