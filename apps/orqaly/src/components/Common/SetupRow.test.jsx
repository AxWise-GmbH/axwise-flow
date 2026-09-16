import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme, IconButton } from '@mui/material';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import SetupRow from './SetupRow';

const theme = createTheme({ palette: { primary: { main: '#10B981' } } });

function renderRow(props = {}) {
  return render(
    <ThemeProvider theme={theme}>
      <SetupRow icon={GroupsOutlinedIcon} title="Ops" {...props} />
    </ThemeProvider>
  );
}

describe('SetupRow - selectable', () => {
  it('carries the role and checked state it was given', () => {
    renderRow({ onSelect: vi.fn(), role: 'radio', selected: true });
    expect(screen.getByRole('radio', { name: /Ops/ })).toHaveAttribute('aria-checked', 'true');
  });

  it('reports itself unchecked when it is not the pick', () => {
    renderRow({ onSelect: vi.fn(), role: 'radio', selected: false });
    expect(screen.getByRole('radio', { name: /Ops/ })).toHaveAttribute('aria-checked', 'false');
  });

  it('selects from a click on the title text', () => {
    const onSelect = vi.fn();
    renderRow({ onSelect });
    fireEvent.click(screen.getByText('Ops'));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('ticks the row that is picked, and only that one', () => {
    const { rerender } = renderRow({ onSelect: vi.fn(), selected: false });
    expect(screen.queryByTestId('CheckCircleRoundedIcon')).not.toBeInTheDocument();
    rerender(
      <ThemeProvider theme={theme}>
        <SetupRow icon={GroupsOutlinedIcon} title="Ops" onSelect={vi.fn()} selected />
      </ThemeProvider>
    );
    expect(screen.getByTestId('CheckCircleRoundedIcon')).toBeInTheDocument();
  });

  it('shows the line under the name', () => {
    renderRow({ onSelect: vi.fn(), subtitle: 'Team' });
    expect(screen.getByText('Team')).toBeInTheDocument();
  });
});

describe('SetupRow - static', () => {
  // A button inside a button is invalid, and MUI will happily render it. The
  // static branch is what lets a row carry an "open this elsewhere" action.
  it('renders its action without nesting a control inside a control', () => {
    render(
      <ThemeProvider theme={theme}>
        <SetupRow
          icon={GroupsOutlinedIcon}
          title="Phone contacts"
          subtitle="3 contacts"
          action={
            <IconButton size="small" aria-label="Open Phone Contacts">
              <GroupsOutlinedIcon />
            </IconButton>
          }
        />
      </ThemeProvider>
    );
    const action = screen.getByLabelText('Open Phone Contacts');
    expect(action).toBeInTheDocument();
    expect(action.closest('.MuiListItemButton-root')).toBeNull();
  });

  it('is not clickable when it has nothing to select', () => {
    renderRow();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
