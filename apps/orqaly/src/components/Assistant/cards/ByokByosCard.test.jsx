import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const saveKey = vi.fn();
const testKey = vi.fn();
let availableKeys = [];
vi.mock('../../../hooks/useUserApiKeys', () => ({
  useUserApiKeys: () => ({ keys: availableKeys, save: saveKey, test: testKey }),
}));
vi.mock('../../../services/providerCatalogService', () => ({
  fetchProviderCatalog: vi.fn().mockResolvedValue([]),
}));

// Isolate the card logic: the shell just renders children + a primary button.
vi.mock('./SetupCardShell', () => ({
  default: ({ children, onPrimary, primaryLabel, error }) => (
    <div>
      {children}
      <button onClick={onPrimary}>{primaryLabel}</button>
      {error && <div role="alert">{error}</div>}
    </div>
  ),
}));

import ByokByosCard, { initialCore } from './ByokByosCard.jsx';

describe('ByokByosCard — Core chooser', () => {
  beforeEach(() => {
    availableKeys = [];
    vi.clearAllMocks();
  });

  it('uses the exact Gemini default when no assistant Core was saved', () => {
    expect(initialCore({})).toMatchObject({
      provider: 'gemini',
      model: 'gemini-3.8-flash',
    });
  });

  it('defaults to BYOK and shows the API key entry', () => {
    render(<ByokByosCard config={{ provider: 'openai', model: 'gpt-4o' }} onComplete={vi.fn()} />);
    expect(screen.getByLabelText(/Connect Google Gemini/)).toBeTruthy();
    // No stored keys -> the "enter new key" field is shown.
    expect(screen.getByPlaceholderText('Paste your Gemini key')).toBeTruthy();
  });

  it('routes a legacy platform-credits setup to Gemini BYOK', () => {
    expect(initialCore({ usePlatformKey: true, mode: 'platform' })).toEqual({
      mode: 'byok',
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      keyId: '',
      newKey: '',
    });
  });

  it('routes a legacy local-environment setup to Gemini BYOK', () => {
    expect(initialCore({ usePlatformKey: true, mode: 'env-local' })).toEqual({
      mode: 'byok',
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      keyId: '',
      newKey: '',
    });
  });

  it('routes a legacy non-Gemini Core to Gemini and saves the goal-ready key', async () => {
    saveKey.mockResolvedValue({ id: 'new-key-id' });
    const onComplete = vi.fn();
    render(
      <ByokByosCard config={{ provider: 'openai', model: 'gpt-4o' }} onComplete={onComplete} />
    );

    fireEvent.change(screen.getByPlaceholderText('Paste your Gemini key'), {
      target: { value: 'test-gemini-key-123456' },
    });
    fireEvent.click(screen.getByText('Save Core'));

    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(saveKey).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'llm:gemini', apiKey: 'test-gemini-key-123456' })
    );
    expect(onComplete).toHaveBeenCalledWith({
      config: expect.objectContaining({
        mode: 'byok',
        provider: 'gemini',
        keyId: 'new-key-id',
      }),
    });
  });

  it('auto-selects an existing Gemini key into parent state before Save Core', async () => {
    availableKeys = [
      {
        id: 'gemini-existing',
        provider: 'llm:gemini',
        label: 'Existing Gemini',
        maskedPreview: '••1234',
      },
    ];
    const onComplete = vi.fn();
    render(<ByokByosCard config={{}} onComplete={onComplete} />);

    expect(screen.getByText(/Existing Gemini/)).toBeTruthy();
    fireEvent.click(screen.getByText('Save Core'));

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith({
        config: expect.objectContaining({
          mode: 'byok',
          provider: 'gemini',
          keyId: 'gemini-existing',
        }),
      })
    );
    expect(saveKey).not.toHaveBeenCalled();
  });

  it('fails Save Core when no Gemini key was selected or entered', async () => {
    const onComplete = vi.fn();
    render(<ByokByosCard config={{}} onComplete={onComplete} />);

    fireEvent.click(screen.getByText('Save Core'));

    expect(await screen.findByRole('alert')).toHaveTextContent(/API key/);
    expect(onComplete).not.toHaveBeenCalled();
    expect(saveKey).not.toHaveBeenCalled();
  });
});
