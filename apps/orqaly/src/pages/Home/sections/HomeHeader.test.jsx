import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import HomeHeader from './HomeHeader';

const theme = createTheme();
const Wrap = ({ children }) => <ThemeProvider theme={theme}>{children}</ThemeProvider>;

describe('HomeHeader', () => {
  it('renders an Explain? button that fires onExplain', () => {
    const onExplain = vi.fn();
    render(
      <Wrap>
        <HomeHeader
          isLive
          lastUpdated={Date.now()}
          onOpenFilters={() => {}}
          onExplain={onExplain}
        />
      </Wrap>
    );
    const btn = screen.getByRole('button', { name: /explain/i });
    fireEvent.click(btn);
    expect(onExplain).toHaveBeenCalledTimes(1);
  });

  it('omits the Explain? button when no onExplain is provided', () => {
    render(
      <Wrap>
        <HomeHeader isLive lastUpdated={Date.now()} onOpenFilters={() => {}} />
      </Wrap>
    );
    expect(screen.queryByRole('button', { name: /explain/i })).not.toBeInTheDocument();
  });
});
