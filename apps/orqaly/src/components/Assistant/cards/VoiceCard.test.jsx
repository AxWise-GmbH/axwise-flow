import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const vb = vi.hoisted(() => ({
  isAvailable: vi.fn(),
  listProfiles: vi.fn(),
  clearAvailabilityCache: vi.fn(),
}));
vi.mock('../../../services/voiceboxService', () => ({
  isAvailable: vb.isAvailable,
  listProfiles: vb.listProfiles,
  clearAvailabilityCache: vb.clearAvailabilityCache,
  DEFAULT_BASE_URL: 'http://127.0.0.1:17493',
  DEFAULT_CLIENT_ID: 'orchestratori',
}));

import VoiceCard from './VoiceCard';

describe('VoiceCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vb.isAvailable.mockResolvedValue({ ok: true });
    vb.listProfiles.mockResolvedValue([
      { id: 'p1', name: 'Morgan' },
      { id: 'p2', name: 'Ada' },
    ]);
  });

  it('renders the provider toggle', () => {
    render(<VoiceCard config={{}} onComplete={() => {}} />);
    expect(screen.getByRole('button', { name: /Voicebox \(local/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Built-in voice/i })).toBeInTheDocument();
  });

  it('Test connection populates the profile picker on success', async () => {
    render(<VoiceCard config={{}} onComplete={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Test connection/i }));
    await waitFor(() => expect(vb.isAvailable).toHaveBeenCalled());
    await screen.findByText(/Connected/i);
    // The picker renders with the first profile selected.
    expect(screen.getByText('Morgan')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('Test connection shows an error (naming the CORS fix) on failure', async () => {
    vb.isAvailable.mockResolvedValue({ ok: false });
    render(<VoiceCard config={{}} onComplete={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Test connection/i }));
    expect(await screen.findByText(/VOICEBOX_CORS_ORIGINS/)).toBeInTheDocument();
    expect(vb.listProfiles).not.toHaveBeenCalled();
  });

  it('emits the voicebox config on save', async () => {
    const onComplete = vi.fn();
    render(<VoiceCard config={{}} onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: /Test connection/i }));
    await screen.findByText(/Connected/i);
    fireEvent.click(screen.getByRole('button', { name: /Save voice/i }));

    expect(onComplete).toHaveBeenCalledWith({
      config: {
        voice: {
          provider: 'voicebox',
          baseUrl: 'http://127.0.0.1:17493',
          profileId: 'p1',
          clientId: 'orchestratori',
        },
      },
    });
  });

  it('emits the built-in config when that provider is chosen', () => {
    const onComplete = vi.fn();
    render(<VoiceCard config={{}} onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: /Built-in voice/i }));
    fireEvent.click(screen.getByRole('button', { name: /Save voice/i }));
    expect(onComplete).toHaveBeenCalledWith({ config: { voice: { provider: 'builtin' } } });
  });
});
