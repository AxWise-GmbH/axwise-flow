import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const tts = vi.hoisted(() => ({ speak: vi.fn(), stopSpeaking: vi.fn() }));
vi.mock('../../../services/ttsService', () => ({
  speak: tts.speak,
  stopSpeaking: tts.stopSpeaking,
}));

import VoiceSampleCard from './VoiceSampleCard';

const voice = {
  name: 'Morgan',
  provider: 'voicebox',
  status: 'unreachable',
  profileId: '',
  profiles: [],
  language: 'en-US',
  sampleText: 'Hello! How can I help you today?',
  positionLabel: '0:00',
  durationLabel: '0:06',
};

describe('VoiceSampleCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tts.speak.mockResolvedValue(undefined);
  });

  it('renders an animated waveform of bars', () => {
    render(<VoiceSampleCard voice={voice} onEdit={() => {}} />);
    const waveform = screen.getByTestId('voice-waveform');
    expect(waveform.childElementCount).toBeGreaterThan(0);
    // Each bar carries an emotion animation class (the equalizer keyframe).
    expect(waveform.firstChild.className).toMatch(/css-/);
  });

  it('plays the preview when the play button is pressed', () => {
    render(<VoiceSampleCard voice={voice} onEdit={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /play voice preview/i }));
    expect(tts.speak).toHaveBeenCalledWith(expect.objectContaining({ text: voice.sampleText }));
  });

  it('no longer embeds the activity chart (moved to its own block)', () => {
    render(<VoiceSampleCard voice={voice} onEdit={() => {}} />);
    expect(screen.queryByTestId('assistant-activity')).not.toBeInTheDocument();
  });

  it('hides the preview and disables play when there is no sample text', () => {
    render(<VoiceSampleCard voice={{ ...voice, sampleText: '' }} onEdit={() => {}} />);
    // No canned preview sentence (real mode without a configured sample).
    expect(screen.queryByText('Preview')).not.toBeInTheDocument();
    const play = screen.getByRole('button', { name: /play voice preview/i });
    expect(play).toBeDisabled();
    fireEvent.click(play);
    expect(tts.speak).not.toHaveBeenCalled();
  });
});
