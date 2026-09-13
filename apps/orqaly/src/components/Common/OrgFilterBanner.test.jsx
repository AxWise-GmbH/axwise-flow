import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import OrgFilterBanner from './OrgFilterBanner';

function Wrap({ children }) {
  return <ThemeProvider theme={createTheme()}>{children}</ThemeProvider>;
}

describe('OrgFilterBanner', () => {
  it('renders nothing without a name', () => {
    const { container } = render(
      <Wrap>
        <OrgFilterBanner name="" onClear={() => {}} />
      </Wrap>
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the org name and fires onClear', () => {
    const onClear = vi.fn();
    render(
      <Wrap>
        <OrgFilterBanner name="Acme Holding" onClear={onClear} />
      </Wrap>
    );
    expect(screen.getByText('Acme Holding')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /clear/i }));
    expect(onClear).toHaveBeenCalled();
  });
});
