import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import LlmCoreChooser, { CORE_MODES, commitLlmCoreChoice } from './LlmCoreChooser';

describe('LlmCoreChooser', () => {
  it('renders only the goal-ready Gemini path and disabled credits', () => {
    render(
      <LlmCoreChooser
        value={{
          mode: CORE_MODES.BYOK,
          provider: 'gemini',
          model: 'gemini-2.5-flash',
          keyId: 'new',
        }}
        onChange={vi.fn()}
        keys={[]}
      />
    );
    expect(screen.getByLabelText(/Platform credits \(coming soon\)/)).toBeDisabled();
    expect(screen.getByLabelText(/Connect Google Gemini/)).toBeTruthy();
    expect(screen.queryByLabelText(/Use local \.env keys/)).toBeNull();
    expect(screen.queryByLabelText(/Connect OpenRouter/)).toBeNull();
    expect(screen.queryByText('OpenAI')).toBeNull();
  });

  it('recommends the supported Gemini BYOK path instead of platform credits', () => {
    render(
      <LlmCoreChooser
        value={{ mode: CORE_MODES.BYOK, provider: 'gemini', keyId: 'new' }}
        onChange={vi.fn()}
        keys={[]}
      />
    );
    expect(screen.getAllByText('Recommended')).toHaveLength(1);
    expect(screen.getByLabelText(/Platform credits \(coming soon\)/)).toBeDisabled();
  });

  it('defaults to Gemini model and key fields when in BYOK mode', () => {
    render(
      <LlmCoreChooser
        value={{
          mode: CORE_MODES.BYOK,
          provider: 'gemini',
          model: 'gemini-2.5-flash',
          keyId: 'new',
        }}
        onChange={vi.fn()}
        keys={[]}
      />
    );
    expect(screen.getAllByText('Gemini model').length).toBeGreaterThan(0);
    expect(screen.getByPlaceholderText('Paste your Gemini key')).toBeTruthy();
  });

  it('shows an existing Gemini key and ignores another provider key', () => {
    render(
      <LlmCoreChooser
        value={{ mode: CORE_MODES.BYOK, provider: 'gemini', keyId: 'gemini-key' }}
        onChange={vi.fn()}
        keys={[
          { id: 'openai-key', provider: 'llm:openai', label: 'OpenAI', maskedPreview: '••aaaa' },
          {
            id: 'gemini-key',
            provider: 'llm:gemini',
            label: 'Goal Gemini',
            maskedPreview: '••1a2b',
          },
        ]}
      />
    );
    expect(screen.getByText(/Goal Gemini/)).toBeTruthy();
    expect(screen.queryByText(/OpenAI/)).toBeNull();
    expect(screen.queryByPlaceholderText('Paste your Gemini key')).toBeNull();
  });

  it('keeps an explicit new-key choice when a saved Gemini key already exists', async () => {
    const onChange = vi.fn();
    render(
      <LlmCoreChooser
        value={{
          mode: CORE_MODES.BYOK,
          provider: 'gemini',
          model: 'gemini-3.8-flash',
          keyId: 'saved-gemini',
          newKey: '',
        }}
        onChange={onChange}
        keys={[{ id: 'saved-gemini', provider: 'llm:gemini', label: 'Saved Gemini' }]}
      />
    );

    fireEvent.mouseDown(screen.getAllByRole('combobox')[1]);
    fireEvent.click(await screen.findByText('+ Use a new key'));

    expect(await screen.findByPlaceholderText('Paste your Gemini key')).toBeTruthy();
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ keyId: 'new', provider: 'gemini' })
      )
    );
  });

  it('reflects automatic Gemini model and existing-key selection to the parent once', async () => {
    const onChange = vi.fn();
    render(
      <LlmCoreChooser
        value={{ mode: CORE_MODES.BYOK, provider: 'openai', model: 'gpt-4o', keyId: '' }}
        onChange={onChange}
        keys={[{ id: 'gemini-existing', provider: 'llm:gemini', label: 'Goal Gemini' }]}
      />
    );

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        mode: CORE_MODES.BYOK,
        provider: 'gemini',
        model: 'gemini-3.8-flash',
        keyId: 'gemini-existing',
        newKey: '',
      })
    );
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('labels the saved-key select and the new-key field distinctly (no duplicate "API key" label)', () => {
    render(
      <LlmCoreChooser
        value={{ mode: CORE_MODES.BYOK, provider: 'gemini', keyId: 'new' }}
        onChange={vi.fn()}
        keys={[]}
      />
    );
    expect(screen.getAllByText('Saved key').length).toBeGreaterThan(0);
    expect(screen.getAllByText('New API key').length).toBeGreaterThan(0);
    expect(screen.queryByText('API key')).toBeNull();
  });

  it('platform mode has no sub-fields', () => {
    render(<LlmCoreChooser value={{ mode: CORE_MODES.PLATFORM }} onChange={vi.fn()} keys={[]} />);
    expect(screen.queryByText('Provider')).toBeNull();
    expect(screen.queryByText('Saved key')).toBeNull();
  });
});

describe('commitLlmCoreChoice', () => {
  it('rejects unavailable platform credits instead of reporting a ready Core', async () => {
    const saveKey = vi.fn();
    await expect(commitLlmCoreChoice({ mode: CORE_MODES.PLATFORM }, saveKey)).rejects.toThrow(
      /Google Gemini API key/
    );
    expect(saveKey).not.toHaveBeenCalled();
  });

  it('rejects local environment mode because it cannot complete hosted goal setup', async () => {
    const saveKey = vi.fn();
    await expect(commitLlmCoreChoice({ mode: CORE_MODES.ENV_LOCAL }, saveKey)).rejects.toThrow(
      /Google Gemini API key/
    );
    expect(saveKey).not.toHaveBeenCalled();
  });

  it('saves a new Gemini key and resolves its id', async () => {
    const saveKey = vi.fn().mockResolvedValue({ id: 'abc' });
    const result = await commitLlmCoreChoice(
      {
        mode: CORE_MODES.BYOK,
        provider: 'gemini',
        model: 'gemini-3.8-flash',
        keyId: 'new',
        newKey: 'gemini-key-value',
      },
      saveKey
    );
    expect(saveKey).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'llm:gemini', apiKey: 'gemini-key-value' })
    );
    expect(result).toEqual({
      mode: 'byok',
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      keyId: 'abc',
      usePlatformKey: false,
    });
  });

  it('rejects OpenRouter and other remote providers for the pinned goal pipeline', async () => {
    const saveKey = vi.fn();
    await expect(
      commitLlmCoreChoice(
        {
          mode: CORE_MODES.OPENROUTER,
          provider: 'openrouter',
          keyId: 'openrouter-key',
        },
        saveKey
      )
    ).rejects.toThrow(/Google Gemini API key/);
    await expect(
      commitLlmCoreChoice(
        { mode: CORE_MODES.BYOK, provider: 'openai', keyId: 'openai-key' },
        saveKey
      )
    ).rejects.toThrow(/Google Gemini API key/);
    expect(saveKey).not.toHaveBeenCalled();
  });

  it('throws when "new" key is selected but no key text was entered', async () => {
    const saveKey = vi.fn();
    await expect(
      commitLlmCoreChoice(
        { mode: CORE_MODES.BYOK, provider: 'gemini', keyId: 'new', newKey: '' },
        saveKey
      )
    ).rejects.toThrow('Enter an API key');
  });

  it('fails closed when BYOK has neither an existing Gemini key nor a new key', async () => {
    const saveKey = vi.fn();
    await expect(
      commitLlmCoreChoice(
        {
          mode: CORE_MODES.BYOK,
          provider: 'gemini',
          model: 'gemini-3.8-flash',
          keyId: '',
          newKey: '',
        },
        saveKey,
        []
      )
    ).rejects.toThrow(/existing Gemini API key|new one/);
    expect(saveKey).not.toHaveBeenCalled();
  });

  it('reuses an existing keyId without calling save', async () => {
    const saveKey = vi.fn();
    const result = await commitLlmCoreChoice(
      {
        mode: CORE_MODES.BYOK,
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        keyId: 'existing-id',
      },
      saveKey,
      [{ id: 'existing-id', provider: 'llm:gemini' }]
    );
    expect(saveKey).not.toHaveBeenCalled();
    expect(result.keyId).toBe('existing-id');
  });
});
