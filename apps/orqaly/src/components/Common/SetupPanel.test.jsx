import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme, Select, MenuItem } from '@mui/material';
import SetupPanel from './SetupPanel';

const theme = createTheme();

function renderPanel(props = {}) {
  return render(
    <ThemeProvider theme={theme}>
      <SetupPanel open onClose={vi.fn()} title="Goal setup" {...props}>
        <div>body content</div>
      </SetupPanel>
    </ThemeProvider>
  );
}

describe('SetupPanel', () => {
  it('shows its title and body', () => {
    renderPanel();
    expect(screen.getByText('Goal setup')).toBeInTheDocument();
    expect(screen.getByText('body content')).toBeInTheDocument();
  });

  it('closes from the header button, under the label it was given', () => {
    const onClose = vi.fn();
    renderPanel({ onClose, closeLabel: 'Close goal setup' });
    fireEvent.click(screen.getByLabelText('Close goal setup'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders a subtitle and a header slot above the body', () => {
    renderPanel({
      subtitle: 'Runs on: the whole workspace',
      headerContent: <button type="button">header slot</button>,
    });
    expect(screen.getByText('Runs on: the whole workspace')).toBeInTheDocument();
    expect(screen.getByText('header slot')).toBeInTheDocument();
  });

  // The entrance fades the body in after the drawer lands. Fading is not
  // hiding: the content has to be present and reachable from the first paint,
  // or every query in the panels' own suites would be racing a timer.
  it('has its children in the document before the entrance timer fires', () => {
    vi.useFakeTimers();
    try {
      renderPanel();
      expect(screen.getByText('body content')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  // AssistantContextDrawer pins its assistant selector as the first combobox in
  // the drawer. A control quietly added by the shell would break that from a
  // distance, so the shell owns no fields.
  it('adds no field of its own that could shift a caller_s control order', () => {
    renderPanel({
      headerContent: (
        <Select value="a" onChange={vi.fn()} inputProps={{ 'aria-label': 'Caller field' }}>
          <MenuItem value="a">A</MenuItem>
        </Select>
      ),
    });
    const comboboxes = screen.getAllByRole('combobox');
    expect(comboboxes).toHaveLength(1);
    expect(comboboxes[0]).toHaveAttribute('aria-label', 'Caller field');
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });

  it('renders nothing while closed', () => {
    renderPanel({ open: false });
    expect(screen.queryByText('body content')).not.toBeInTheDocument();
  });
});
