import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import BoardForm from './BoardForm';

vi.mock('../Common/FormDialog', () => ({
  default: ({ open, children, title, actions }) =>
    open ? (
      <div data-testid="form-dialog">
        <h2>{title}</h2>
        {children}
        <div>{actions}</div>
      </div>
    ) : null,
  FORM_FIELD_SX: {},
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
    from: vi.fn(),
  },
  hasSupabase: vi.fn().mockReturnValue(false),
}));

function renderForm(props = {}) {
  return render(
    <ThemeProvider theme={createTheme()}>
      <BoardForm
        open
        onClose={() => {}}
        onSave={() => {}}
        editing={null}
        saving={false}
        theme={createTheme()}
        isDark={false}
        {...props}
      />
    </ThemeProvider>
  );
}

describe('BoardForm', () => {
  it('renders approval & confidence helper text', () => {
    renderForm();
    expect(
      screen.getByText(/weighted member votes needed to mark an evaluation/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/escalated for human review/i)).toBeInTheDocument();
  });

  it('renders the Decision & Consensus section with new fields', () => {
    renderForm();
    expect(screen.getByText('Decision & Consensus')).toBeInTheDocument();
    // Quorum is a TextField — label association works.
    expect(screen.getByLabelText(/Quorum/i)).toBeInTheDocument();
    // Consensus Type / Tie-break Strategy are MUI Selects (rendered as comboboxes).
    expect(screen.getAllByText('Consensus Type').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Tie-break Strategy').length).toBeGreaterThan(0);
    // Default consensus type shows the 'majority' helper text.
    expect(screen.getByText(/More than half of voting members/i)).toBeInTheDocument();
  });
});
