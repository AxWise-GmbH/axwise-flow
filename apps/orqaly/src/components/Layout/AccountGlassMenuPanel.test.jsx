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
});
