import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import RatingCommentDialog from './RatingCommentDialog';

vi.mock('../Common/FormDialog', () => ({
  default: ({ open, children, title }) =>
    open ? (
      <div data-testid="form-dialog">
        <h2>{title}</h2>
        {children}
      </div>
    ) : null,
  FORM_FIELD_SX: {},
}));

function renderDialog(props = {}) {
  return render(
    <ThemeProvider theme={createTheme()}>
      <RatingCommentDialog
        open
        onClose={() => {}}
        itemName="Test template"
        onSave={() => {}}
        {...props}
      />
    </ThemeProvider>
  );
}

describe('RatingCommentDialog', () => {
  it('renders the comment field without crashing', () => {
    renderDialog();
    expect(screen.getByText('Rate Test template')).toBeInTheDocument();
    expect(screen.getByLabelText('Comment (optional)')).toBeInTheDocument();
  });
});
