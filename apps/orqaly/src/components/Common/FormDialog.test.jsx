import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FormDialog from './FormDialog';
import EventRepeatOutlinedIcon from '@mui/icons-material/EventRepeatOutlined';

describe('FormDialog', () => {
  it('renders title and fires primary action', () => {
    const onPrimary = vi.fn();
    render(
      <FormDialog
        open
        onClose={() => {}}
        title="Test Dialog"
        icon={EventRepeatOutlinedIcon}
        primaryLabel="Save"
        onPrimary={onPrimary}
      >
        <p>Body</p>
      </FormDialog>
    );
    expect(screen.getByText('Test Dialog')).toBeInTheDocument();
    expect(screen.getByText('Body')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onPrimary).toHaveBeenCalledOnce();
  });
});
