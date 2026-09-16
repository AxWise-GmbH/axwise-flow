import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import LandingVariantToggle from './LandingVariantToggle';

function renderToggle(props) {
  return render(
    <ThemeProvider theme={createTheme()}>
      <LandingVariantToggle {...props} />
    </ThemeProvider>
  );
}

describe('LandingVariantToggle', () => {
  it('marks the active variant as pressed', () => {
    renderToggle({ variant: 'simple', onChange: vi.fn() });
    expect(screen.getByText('Simple')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Full')).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onChange with the clicked variant', () => {
    const onChange = vi.fn();
    renderToggle({ variant: 'simple', onChange });
    fireEvent.click(screen.getByText('Full'));
    expect(onChange).toHaveBeenCalledWith('full');
  });
});
