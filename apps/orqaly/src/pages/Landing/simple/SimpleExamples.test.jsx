import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import SimpleExamples from './SimpleExamples';

function renderExamples(mode = 'light') {
  return render(
    <ThemeProvider
      theme={createTheme({
        palette: { mode },
        components: { MuiButtonBase: { defaultProps: { disableRipple: true } } },
      })}
    >
      <SimpleExamples />
    </ThemeProvider>
  );
}

function selectedPanel() {
  return document.getElementById('use-case-panel');
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('SimpleExamples', () => {
  it('starts with an everyday operations example and its workspace, without screenshots', () => {
    const { container } = renderExamples();
    expect(
      screen.getByRole('heading', { name: 'One chat. A connected workspace.' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Business operations' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(selectedPanel()).toHaveAttribute('data-case-id', 'operations');
    expect(selectedPanel()).toHaveAccessibleName('See what needs your attention today.');
    expect(screen.getByText('operations-review')).toBeInTheDocument();
    expect(screen.getByLabelText('Example workspace documents and results')).toHaveTextContent(
      'Operations brief.md'
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('selects all five distinct scenes and keeps exactly one selector pressed', () => {
    renderExamples();
    const cases = [
      ['Build locally', 'local', 'Implementation notes.md'],
      ['n8n workflows', 'n8n', 'Order workflow.json'],
      ['Business operations', 'operations', 'Operations brief.md'],
      ['Role-based copilot', 'role', 'Customer handover.md'],
      ['Connected chat', 'chat', 'Launch brief.md'],
    ];
    for (const [label, id, artifact] of cases) {
      fireEvent.click(screen.getByRole('button', { name: label }));
      expect(selectedPanel()).toHaveAttribute('data-case-id', id);
      expect(
        within(screen.getByRole('group', { name: 'Choose a use case' })).getAllByRole('button', {
          pressed: true,
        })
      ).toHaveLength(1);
      expect(screen.getByLabelText('Example workspace documents and results')).toHaveTextContent(
        artifact
      );
    }
    expect(screen.getAllByText('Explore the desktop')).toHaveLength(1);
    expect(screen.getAllByText(/Interactive product demo/)).toHaveLength(1);
    expect(screen.getAllByText('Connected-tool examples depend on your setup.')).toHaveLength(1);
  });

  it('wraps previous and next controls and supports their arrow keys', () => {
    renderExamples();
    fireEvent.click(screen.getByRole('button', { name: 'Build locally' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous use case' }));
    expect(selectedPanel()).toHaveAttribute('data-case-id', 'chat');
    fireEvent.click(screen.getByRole('button', { name: 'Next use case' }));
    expect(selectedPanel()).toHaveAttribute('data-case-id', 'local');
    fireEvent.keyDown(screen.getByRole('button', { name: 'Next use case' }), { key: 'ArrowRight' });
    expect(selectedPanel()).toHaveAttribute('data-case-id', 'n8n');
    fireEvent.keyDown(screen.getByRole('button', { name: 'Previous use case' }), {
      key: 'ArrowLeft',
    });
    expect(selectedPanel()).toHaveAttribute('data-case-id', 'local');
  });

  it('moves selection and focus with arrows, Home, and End on selectors', () => {
    renderExamples();
    const build = screen.getByRole('button', { name: 'Build locally' });
    act(() => {
      build.focus();
    });
    fireEvent.keyDown(build, { key: 'ArrowRight' });
    expect(screen.getByRole('button', { name: 'n8n workflows' })).toHaveFocus();
    expect(selectedPanel()).toHaveAttribute('data-case-id', 'n8n');
    fireEvent.keyDown(document.activeElement, { key: 'End' });
    expect(screen.getByRole('button', { name: 'Connected chat' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement, { key: 'ArrowRight' });
    expect(build).toHaveFocus();
    fireEvent.keyDown(build, { key: 'ArrowLeft' });
    expect(screen.getByRole('button', { name: 'Connected chat' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement, { key: 'Home' });
    expect(build).toHaveFocus();
    expect(build).toHaveAttribute('aria-pressed', 'true');
    const unselected = screen.getByRole('button', { name: 'n8n workflows' });
    act(() => {
      unselected.focus();
    });
    fireEvent.keyDown(unselected, { key: 'ArrowRight' });
    expect(screen.getByRole('button', { name: 'Business operations' })).toHaveFocus();
    expect(selectedPanel()).toHaveAttribute('data-case-id', 'operations');
  });

  it('does not auto-rotate or react to arrow keys outside the controls', () => {
    vi.useFakeTimers();
    renderExamples();
    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(selectedPanel()).toHaveAttribute('data-case-id', 'operations');
    fireEvent.keyDown(selectedPanel(), { key: 'ArrowRight' });
    expect(selectedPanel()).toHaveAttribute('data-case-id', 'operations');
  });

  it('uses example records and reusable role context without unsupported live-integration claims', () => {
    renderExamples('dark');
    fireEvent.click(screen.getByRole('button', { name: 'Business operations' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Operations brief.md' }));
    expect(screen.getByRole('table', { name: 'Orders for item A' })).toHaveTextContent(
      'Review 2-unit shortfall'
    );
    expect(screen.getByText('10 on hand − 8 allocated = 2 available.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Role-based copilot' }));
    expect(screen.getByText('Employee digital twin')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open Account manager role.md' }));
    expect(screen.getByText('Responsibilities')).toBeInTheDocument();
    expect(screen.getByText('Preferences')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Connected chat' }));
    expect(
      screen.getByText(/Bring updates from your team chat into the conversation/)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Slack|Telegram|live metrics|autonomous employee/i)
    ).not.toBeInTheDocument();
  });
});
