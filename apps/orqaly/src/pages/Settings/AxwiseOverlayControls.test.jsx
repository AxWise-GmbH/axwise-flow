import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Sub-toggle (status bar) still uses the local pref for hidden/view.
const setHidden = vi.fn();
const setView = vi.fn();
let pref = { hidden: false, setHidden, setView };
vi.mock('../../hooks/usePulseBarPref', () => ({
  usePulseBarPref: () => pref,
}));

// Master switch is now the persisted per-user kill switch from useAxwise.
// It is async and rejects when the persist fails (the hook reverts its own state).
const setUserEnabled = vi.fn(async () => {});
let axState = { serverEnabled: true, userEnabled: true, enforce: 'authoritative', loaded: true, setUserEnabled };
vi.mock('../../hooks/useAxwise', () => ({
  useAxwise: () => axState,
}));

import AxwiseOverlayControls from './AxwiseOverlayControls';

describe('AxwiseOverlayControls', () => {
  beforeEach(() => {
    setHidden.mockClear();
    setView.mockClear();
    setUserEnabled.mockReset();
    setUserEnabled.mockResolvedValue(undefined);
    pref = { hidden: false, setHidden, setView };
    axState = {
      serverEnabled: true,
      userEnabled: true,
      enforce: 'authoritative',
      loaded: true,
      setUserEnabled,
    };
  });

  it('renders the master overlay switch and the status-bar sub-toggle', () => {
    render(<AxwiseOverlayControls />);
    expect(screen.getByText('AxWise overlay')).toBeInTheDocument();
    expect(screen.getByText('AxWise status bar')).toBeInTheDocument();
  });

  it('master switch reads On when enabled and toggles the kill switch off', async () => {
    render(<AxwiseOverlayControls />);
    const master = screen.getByRole('button', { name: /Turn AxWise overlay off/i });
    expect(master).toHaveTextContent('On');
    fireEvent.click(master);
    await waitFor(() => expect(setUserEnabled).toHaveBeenCalledWith(false));
  });

  // A kill switch that silently fails to save is worse than one that errors:
  // the user believes AxWise is off while the backend keeps calling it.
  it('surfaces an error when the persist fails, and does not claim success', async () => {
    setUserEnabled.mockRejectedValue(new Error('network'));
    render(<AxwiseOverlayControls />);
    fireEvent.click(screen.getByRole('button', { name: /Turn AxWise overlay off/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/unchanged/i);
  });

  it('clears a previous error on the next attempt', async () => {
    setUserEnabled.mockRejectedValueOnce(new Error('network'));
    render(<AxwiseOverlayControls />);
    const master = screen.getByRole('button', { name: /Turn AxWise overlay/i });
    fireEvent.click(master);
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    setUserEnabled.mockResolvedValue(undefined);
    fireEvent.click(master);
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  // Toggling against a state we haven't fetched yet is what used to pin
  // serverEnabled=false forever, so the control stays disabled until loaded.
  it('the master switch is not clickable before the flags load', () => {
    axState = { ...axState, serverEnabled: false, loaded: false };
    render(<AxwiseOverlayControls />);
    expect(screen.getByRole('button', { name: /Turn AxWise overlay/i })).toBeDisabled();
  });

  it('disables the status-bar sub-toggle when the overlay (kill switch) is off', () => {
    axState = { ...axState, userEnabled: false };
    render(<AxwiseOverlayControls />);
    expect(screen.getByRole('button', { name: /Hide AxWise status bar/i })).toBeDisabled();
  });

  it('showing the status bar un-hides it AND resets the view to collapsed', () => {
    pref = { hidden: true, setHidden, setView };
    render(<AxwiseOverlayControls />);
    fireEvent.click(screen.getByRole('button', { name: /Show AxWise status bar/i }));
    expect(setHidden).toHaveBeenCalledWith(false);
    expect(setView).toHaveBeenCalledWith('collapsed');
  });

  it('hiding the status bar does NOT touch the view', () => {
    render(<AxwiseOverlayControls />); // hidden:false -> button reads "Hide"
    fireEvent.click(screen.getByRole('button', { name: /Hide AxWise status bar/i }));
    expect(setHidden).toHaveBeenCalledWith(true);
    expect(setView).not.toHaveBeenCalled();
  });

  // The pill used to collapse "the server never enabled AxWise" and "you turned
  // it off" into one bare "Disconnected", which is what made the reported failure
  // so confusing. Each gate now names itself.
  it('status: Connected when both gates are on and enforce is authoritative', () => {
    render(<AxwiseOverlayControls />);
    expect(screen.getByText('Connected')).toBeInTheDocument();
  });

  it('status: Connected (shadow) says decisions are not applied yet', () => {
    axState = { ...axState, enforce: 'shadow' };
    render(<AxwiseOverlayControls />);
    expect(screen.getByText('Connected (shadow)')).toBeInTheDocument();
    expect(screen.getByText(/decisions are not applied/i)).toBeInTheDocument();
  });

  it('status: Backend off when the env gate is closed, naming AXWISE_ENABLE', () => {
    axState = { ...axState, serverEnabled: false };
    render(<AxwiseOverlayControls />);
    expect(screen.getByText('Backend off')).toBeInTheDocument();
    expect(screen.getByText(/AXWISE_ENABLE is not set/i)).toBeInTheDocument();
    expect(screen.queryByText('Disconnected')).not.toBeInTheDocument();
  });

  it('status: Disconnected only when the USER turned the overlay off', () => {
    axState = { ...axState, userEnabled: false };
    render(<AxwiseOverlayControls />);
    expect(screen.getByText('Disconnected')).toBeInTheDocument();
    expect(screen.getByText(/You turned the AxWise overlay off/i)).toBeInTheDocument();
  });

  it('status: Connecting before the flags load', () => {
    axState = { ...axState, serverEnabled: false, loaded: false };
    render(<AxwiseOverlayControls />);
    expect(screen.getByText(/Connecting/)).toBeInTheDocument();
  });

  // The reported bug: with the backend gate off the toggle was still live, and
  // every click produced "Could not save that change".
  it('the master toggle is dead when the backend gate is off, and cannot error', async () => {
    axState = { ...axState, serverEnabled: false };
    render(<AxwiseOverlayControls />);
    const master = screen.getByRole('button', { name: /Turn AxWise overlay/i });
    expect(master).toBeDisabled();

    fireEvent.click(master);
    await waitFor(() => expect(setUserEnabled).not.toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('the status-bar sub-toggle is dead when the backend gate is off', () => {
    axState = { ...axState, serverEnabled: false };
    render(<AxwiseOverlayControls />);
    expect(screen.getByRole('button', { name: /AxWise status bar/i })).toBeDisabled();
  });
});
