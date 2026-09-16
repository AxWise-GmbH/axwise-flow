import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import MemberForm from './MemberForm';

vi.mock('../Common/FormDialog', () => ({
  default: ({ open, children, title, onPrimary, primaryDisabled }) =>
    open ? (
      <div data-testid="form-dialog">
        <h2>{title}</h2>
        {children}
        <button type="button" onClick={onPrimary} disabled={primaryDisabled}>
          Save
        </button>
      </div>
    ) : null,
  FORM_FIELD_SX: {},
}));

function renderForm(props = {}) {
  return render(
    <ThemeProvider theme={createTheme()}>
      <MemberForm open onClose={() => {}} onSave={() => {}} editing={null} {...props} />
    </ThemeProvider>
  );
}

describe('MemberForm', () => {
  it('renders the new tuning fields and active toggle', () => {
    renderForm();
    expect(screen.getByText(/Model Tuning/i)).toBeInTheDocument();
    expect(screen.getByText(/Temperature:/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Max tokens/i)).toBeInTheDocument();
    expect(screen.getByText(/participates in evaluations/i)).toBeInTheDocument();
  });

  it('includes temperature, maxTokens and active in the save payload', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderForm({ onSave });

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Auditor Bot' } });
    fireEvent.change(screen.getByLabelText(/Max tokens/i), { target: { value: '8000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = onSave.mock.calls[0][0];
    expect(payload.name).toBe('Auditor Bot');
    expect(payload.maxTokens).toBe(8000);
    expect(payload.active).toBe(true);
    expect(payload).toHaveProperty('temperature');
  });
});
