import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import CryptoDonateDialog from './CryptoDonateDialog';

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn(() => Promise.resolve('data:image/png;base64,fake')),
  },
}));

vi.mock('../../utils/confettiCanvas', () => ({
  fireConfetti: vi.fn(),
}));

import { fireConfetti } from '../../utils/confettiCanvas';

function renderWithTheme(ui) {
  return render(<ThemeProvider theme={createTheme()}>{ui}</ThemeProvider>);
}

describe('CryptoDonateDialog', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn(() => Promise.resolve()) },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the dialog title when open', () => {
    renderWithTheme(<CryptoDonateDialog open onClose={() => {}} />);
    expect(
      screen.getAllByRole('heading', { name: /Donate with crypto/i }).length
    ).toBeGreaterThanOrEqual(1);
  });

  it('defaults to USDT on ERC-20 and shows that address', async () => {
    renderWithTheme(<CryptoDonateDialog open onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByTestId('donate-address').textContent).toBe(
        '0x4171Fc8062c1687817449d58dFc0Bd4c91d218c6'
      );
    });
  });

  it('switches to BTC and hides the network sub-row', async () => {
    renderWithTheme(<CryptoDonateDialog open onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'BTC' }));
    await waitFor(() => {
      expect(screen.getByTestId('donate-address').textContent).toBe(
        'bc1q2gkqrzg3z37tz8mz08al9ff9j0dltmud0wxk0g'
      );
    });
    expect(screen.queryByRole('button', { name: 'USDT on Solana' })).not.toBeInTheDocument();
  });

  it('switches USDT network to Solana when its chip is clicked', async () => {
    renderWithTheme(<CryptoDonateDialog open onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'USDT on Solana' }));
    await waitFor(() => {
      expect(screen.getByTestId('donate-address').textContent).toBe(
        'D6fifjNu6AFyGiizUFpcTAp215QTXnrPpjDgpWAnc8UU'
      );
    });
  });

  it('fires confetti and shows the thank-you snackbar after "I sent it"', async () => {
    renderWithTheme(<CryptoDonateDialog open onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /I sent it/i }));
    expect(fireConfetti).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.getByText(/Thank you\. Every bit moves us forward\./i)).toBeInTheDocument();
    });
  });
});
