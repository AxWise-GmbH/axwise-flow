import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import ReplicatorPhaseCard from '../components/ReplicatorPhaseCard';

function renderWithTheme(ui) {
  return render(<ThemeProvider theme={createTheme()}>{ui}</ThemeProvider>);
}

const basePhase = {
  id: 'p1',
  name: 'Create issue',
  description: 'Open a new issue in the repo.',
  action_kind: 'http',
  action_config: { method: 'POST', path: '/repos/issues' },
  input_schema: {
    type: 'object',
    required: ['title'],
    properties: {
      title: {
        type: 'string',
        title: 'Title',
        description: 'Issue title',
        example: 'Bug in login',
      },
      body: { type: 'string', title: 'Body' },
    },
  },
};

describe('ReplicatorPhaseCard', () => {
  it('renders phase name, description, and fields derived from the input schema', () => {
    renderWithTheme(<ReplicatorPhaseCard phase={basePhase} onRun={vi.fn()} />);
    expect(screen.getByText('Create issue')).toBeInTheDocument();
    expect(screen.getByText('Open a new issue in the repo.')).toBeInTheDocument();
    expect(screen.getByLabelText(/Title \*/)).toBeInTheDocument();
    expect(screen.getByLabelText('Body')).toBeInTheDocument();
  });

  it('calls onRun with the phase and the collected input values when Run is clicked', async () => {
    const onRun = vi.fn().mockResolvedValue(undefined);
    renderWithTheme(<ReplicatorPhaseCard phase={basePhase} onRun={onRun} />);
    fireEvent.change(screen.getByLabelText(/Title \*/), { target: { value: 'Hello' } });
    fireEvent.change(screen.getByLabelText('Body'), { target: { value: 'World' } });
    fireEvent.click(screen.getByRole('button', { name: /Run/i }));
    await waitFor(() => {
      expect(onRun).toHaveBeenCalledTimes(1);
    });
    expect(onRun).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: basePhase,
        input: { title: 'Hello', body: 'World' },
        signal: expect.any(AbortSignal),
      })
    );
  });

  it('shows empty-state text when the phase has no input fields', () => {
    renderWithTheme(
      <ReplicatorPhaseCard
        phase={{ ...basePhase, input_schema: { type: 'object', properties: {} } }}
        onRun={vi.fn()}
      />
    );
    expect(screen.getByText(/No inputs for this action/i)).toBeInTheDocument();
  });

  it('renders enum fields as a native select', () => {
    renderWithTheme(
      <ReplicatorPhaseCard
        phase={{
          ...basePhase,
          input_schema: {
            type: 'object',
            properties: {
              visibility: { type: 'string', title: 'Visibility', enum: ['public', 'private'] },
            },
          },
        }}
        onRun={vi.fn()}
      />
    );
    const select = screen.getByLabelText('Visibility');
    expect(select.tagName.toLowerCase()).toBe('select');
    expect(select.querySelectorAll('option')).toHaveLength(3); // empty + 2 enum values
  });
});
