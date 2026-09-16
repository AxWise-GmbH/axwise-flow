import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import ApiKeysSection from './ApiKeysSection';
import * as apiKeyService from '../../../services/apiKeyService';

// Isolate the section from BentoCard internals (tour/confetti) and the icon resolver.
vi.mock('../../../components/Common/BentoCard', () => ({
  default: ({ title, children }) => <section aria-label={title}>{children}</section>,
}));
vi.mock('../../../components/icons/AppIcon', () => ({ default: () => null }));

vi.mock('../../../services/apiKeyService', () => ({
  createApiKey: vi.fn(() => ({ plainKey: 'orch_test_key_1234' })),
  listApiKeys: vi.fn(() => []),
  revokeApiKey: vi.fn(),
  activateApiKey: vi.fn(),
  deleteApiKey: vi.fn(),
  updateApiKey: vi.fn(),
}));

describe('ApiKeysSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiKeyService.listApiKeys.mockReturnValue([]);
  });

  it('loads keys for the user and shows the empty state', () => {
    const { getByText } = render(<ApiKeysSection userId="u1" />);
    expect(apiKeyService.listApiKeys).toHaveBeenCalledWith('u1');
    expect(getByText('No API keys yet. Generate one above.')).toBeInTheDocument();
  });

  it('creates a key and reveals the plain key once', () => {
    const { getByText, getByLabelText, queryByText } = render(<ApiKeysSection userId="u1" />);

    fireEvent.click(getByText('New API Key'));
    fireEvent.change(getByLabelText('Key label'), { target: { value: 'CI pipeline' } });
    fireEvent.click(getByText('Generate Key'));

    expect(apiKeyService.createApiKey).toHaveBeenCalledWith('u1', 'CI pipeline', []);
    expect(queryByText(/orch_test_key_1234/)).toBeInTheDocument();
  });

  it('renders an existing key with its label and status', () => {
    apiKeyService.listApiKeys.mockReturnValue([
      {
        id: 'k1',
        label: 'Prod backend',
        keyMasked: 'orch_ab••••••••cdef',
        status: 'active',
        permissions: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        lastUsedAt: null,
      },
    ]);
    const { getByText } = render(<ApiKeysSection userId="u1" />);
    expect(getByText('Prod backend')).toBeInTheDocument();
    expect(getByText('Active')).toBeInTheDocument();
  });
});
