import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import AssistantHeaderActions from './AssistantHeaderActions';

const theme = createTheme();
const ASSISTANTS = [
  { id: 'a1', name: 'Aurum Assistant' },
  { id: 'a2', name: 'Fintech Assistant' },
];

function renderToolbar(props = {}) {
  return render(
    <ThemeProvider theme={theme}>
      <AssistantHeaderActions
        onExplain={() => {}}
        onOpenFilters={() => {}}
        assistants={ASSISTANTS}
        currentId="a1"
        onSwitch={() => {}}
        onNewAssistant={() => {}}
        onFinishSetup={() => {}}
        {...props}
      />
    </ThemeProvider>
  );
}

describe('AssistantHeaderActions', () => {
  it('renders the filter, Explain? and + buttons and fires their callbacks', () => {
    const onExplain = vi.fn();
    const onOpenFilters = vi.fn();
    renderToolbar({ onExplain, onOpenFilters });

    fireEvent.click(screen.getByRole('button', { name: /explain/i }));
    expect(onExplain).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /filters & options/i }));
    expect(onOpenFilters).toHaveBeenCalledTimes(1);

    expect(screen.getByRole('button', { name: /setup options/i })).toBeInTheDocument();
  });

  it('opens the + menu with New Assistant and Finish Setup', () => {
    const onNewAssistant = vi.fn();
    const onFinishSetup = vi.fn();
    renderToolbar({ onNewAssistant, onFinishSetup });

    fireEvent.click(screen.getByRole('button', { name: /setup options/i }));
    expect(screen.getByText('New Assistant')).toBeInTheDocument();
    expect(screen.getByText('Finish Setup')).toBeInTheDocument();

    fireEvent.click(screen.getByText('New Assistant'));
    expect(onNewAssistant).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /setup options/i }));
    fireEvent.click(screen.getByText('Finish Setup'));
    expect(onFinishSetup).toHaveBeenCalledTimes(1);
  });

  it('shows the robot switcher and switches assistant when showSwitcher is set', () => {
    const onSwitch = vi.fn();
    renderToolbar({ showSwitcher: true, onSwitch });

    fireEvent.click(screen.getByRole('button', { name: /switch assistant/i }));
    fireEvent.click(screen.getByText('Fintech Assistant'));
    expect(onSwitch).toHaveBeenCalledWith('a2');
  });

  it('hides the switcher when showSwitcher is false', () => {
    renderToolbar({ showSwitcher: false });
    expect(screen.queryByRole('button', { name: /switch assistant/i })).not.toBeInTheDocument();
  });
});
