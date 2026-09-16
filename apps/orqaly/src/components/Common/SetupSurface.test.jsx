import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import SetupSurface, { useSetupSurface } from './SetupSurface.jsx';
import { PANEL_DARK } from '../../theme/panelSurface';

function Probe() {
  const tokens = useSetupSurface();
  return <span data-testid="bg">{tokens.bg}</span>;
}

function renderProbe(ui, mode = 'light') {
  return render(<ThemeProvider theme={createTheme({ palette: { mode } })}>{ui}</ThemeProvider>);
}

describe('SetupSurface', () => {
  it('defaults to the drawers own dark ground when nothing wraps it', () => {
    renderProbe(<Probe />);
    expect(screen.getByTestId('bg')).toHaveTextContent(PANEL_DARK.bg);
  });

  it('keeps that ground when a provider asks for dark explicitly', () => {
    renderProbe(
      <SetupSurface mode="dark">
        <Probe />
      </SetupSurface>
    );
    expect(screen.getByTestId('bg')).toHaveTextContent(PANEL_DARK.bg);
  });

  it('follows the palette when a provider asks for auto', () => {
    renderProbe(
      <SetupSurface mode="auto">
        <Probe />
      </SetupSurface>
    );
    expect(screen.getByTestId('bg')).not.toHaveTextContent(PANEL_DARK.bg);
  });
});
