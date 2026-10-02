import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import AccountGlassMenuPanel from './AccountGlassMenuPanel';

vi.mock('../icons/GlassIcon', () => ({
  default: ({ fallback: Fallback, size }) =>
    Fallback ? <Fallback data-testid="mui-icon" sx={{ fontSize: size }} /> : null,
}));

const theme = createTheme({ palette: { mode: 'dark' } });

const baseProps = {
  displayName: 'mister',
  email: 'misters.builder@gmail.com',
  humanTaskPendingCount: 2,
  notificationCount: 3,
  onClose: vi.fn(),
  onModeToggle: vi.fn(),
  onOpenHumanTasks: vi.fn(),
  onOpenNotifications: vi.fn(),
  onNavigateSettings: vi.fn(),
  onNavigateSetup: vi.fn(),
  onLogout: vi.fn(),
};

function renderPanel(overrides = {}) {
  return render(
    <ThemeProvider theme={theme}>
      <AccountGlassMenuPanel {...baseProps} {...overrides} />
    </ThemeProvider>
  );
}

describe('AccountGlassMenuPanel', () => {
  it('shows Advanced label when not in simple mode', () => {
    renderPanel({ simpleMode: false });
    expect(screen.getByText('Advanced')).toBeInTheDocument();
    expect(screen.getByText('Switch to Simple')).toBeInTheDocument();
  });

  it('omits the Profile & Settings full-width row', () => {
    renderPanel({ simpleMode: true });
    expect(screen.queryByText('Profile & Settings')).not.toBeInTheDocument();
  });

  it('calls onOpenHumanTasks from the Human tasks tile', () => {
    const onOpenHumanTasks = vi.fn();
    renderPanel({ onOpenHumanTasks });
    fireEvent.click(screen.getByText('Human tasks'));
    expect(onOpenHumanTasks).toHaveBeenCalled();
  });

  it('renders AI credits and usage progress when quotaSummary is provided', () => {
    renderPanel({
      quotaSummary: {
        spendUsd: 1.25,
        limitUsd: 5.0,
        tokens: { total: 45000, prompt: 40000, cached: 32000, cacheHitRate: 80.0 },
        savingsUsd: 1.80,
      },
    });
    expect(screen.getByText('AI Credits & Usage')).toBeInTheDocument();
    expect(screen.getByText('⚡ 80% Cached')).toBeInTheDocument();
    expect(screen.getByText('$1.25 / $5.00')).toBeInTheDocument();
    expect(screen.getByText(/45,000 tokens/)).toBeInTheDocument();
    expect(screen.getByText(/32,000 cached/)).toBeInTheDocument();
    expect(screen.getByText(/Saved \$1.80 with 75% cache discount/)).toBeInTheDocument();
  });
  it('shows unlimited usage with metered spend and no quota progress bar', () => {
    renderPanel({ quotaSummary: { isUnlimited: true, spendUsd: 2500, limitUsd: null, tokens: { total: 1_000_000 } } });
    expect(screen.getByText('$2500.00 / Unlimited')).toBeInTheDocument();
    expect(screen.getByText('1,000,000 tokens')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByText('$2500.00 / $5.00')).not.toBeInTheDocument();
  });
});
