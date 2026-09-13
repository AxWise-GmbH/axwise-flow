import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import VoiceboxInstructionsDialog from './VoiceboxInstructionsDialog';

describe('VoiceboxInstructionsDialog', () => {
  it('renders the three setup tabs and the port', () => {
    render(<VoiceboxInstructionsDialog open onClose={() => {}} />);
    expect(screen.getByText('Voicebox Voice Setup')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Install & run/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Allow this site/i })).toBeInTheDocument();
    expect(screen.getAllByText(/17493/).length).toBeGreaterThan(0);
  });

  it('surfaces the CORS env var and the site origin on the second tab', () => {
    render(<VoiceboxInstructionsDialog open onClose={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: /Allow this site/i }));
    expect(screen.getAllByText(/VOICEBOX_CORS_ORIGINS/).length).toBeGreaterThan(0);
    // jsdom's default origin is http://localhost
    expect(screen.getAllByText(/localhost/).length).toBeGreaterThan(0);
  });

  it('mentions the Safari fallback on the browser-notes tab', () => {
    render(<VoiceboxInstructionsDialog open onClose={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: /Browser notes/i }));
    expect(screen.getByText(/Safari/)).toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(<VoiceboxInstructionsDialog open onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /Close/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
