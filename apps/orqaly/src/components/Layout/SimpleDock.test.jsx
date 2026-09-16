import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider, createTheme, alpha, darken } from '@mui/material/styles';

vi.mock('../../hooks/useSimpleMode', () => ({
  useSimpleMode: () => ({ simpleMode: true, setSimpleMode: vi.fn(), toggleSimpleMode: vi.fn() }),
}));

import SimpleDock, { dockSurfaceBg } from './SimpleDock';

const theme = createTheme();
const originalMatchMedia = window.matchMedia;

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

function Wrap({ children }) {
  return (
    <MemoryRouter initialEntries={['/dashboard']}>
      <ThemeProvider theme={theme}>{children}</ThemeProvider>
    </MemoryRouter>
  );
}

describe('SimpleDock', () => {
  it('renders the items in order: Home, Organizations, Reports, Personal Catalog', () => {
    render(
      <Wrap>
        <SimpleDock />
      </Wrap>
    );
    const links = screen.getAllByRole('link');
    const labels = links.map((a) => a.getAttribute('aria-label'));
    expect(labels).toEqual(['Home', 'Organizations', 'Reports', 'Personal Catalog']);
  });

  it('the Reports item targets /hub (so the dock position becomes the new Reports surface)', () => {
    render(
      <Wrap>
        <SimpleDock />
      </Wrap>
    );
    const reports = screen.getByLabelText('Reports');
    expect(reports.getAttribute('href')).toBe('/hub');
  });

  it('the Personal Catalog item sits last in the dock', () => {
    render(
      <Wrap>
        <SimpleDock />
      </Wrap>
    );
    const links = screen.getAllByRole('link');
    expect(links[links.length - 1].getAttribute('aria-label')).toBe('Personal Catalog');
    expect(screen.getByLabelText('Personal Catalog').getAttribute('href')).toBe('/marketplace');
  });

  it('stays visible for an unrelated field and hides for a marked composer on compact screens', () => {
    window.matchMedia = vi.fn((query) => ({
      matches: query.includes('max-width'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    render(
      <Wrap>
        <SimpleDock />
      </Wrap>
    );
    const dock = screen.getByRole('navigation', { name: 'Simple mode navigation' });
    const filter = document.createElement('input');
    document.body.appendChild(filter);

    fireEvent.focus(filter);
    expect(dock).toBeVisible();

    const composerRoot = document.createElement('div');
    composerRoot.setAttribute('data-composer-text-entry', '');
    const composer = document.createElement('textarea');
    composerRoot.appendChild(composer);
    document.body.appendChild(composerRoot);
    fireEvent.focusOut(filter, { relatedTarget: composer });
    fireEvent.focusIn(composer);

    expect(dock).not.toBeVisible();
    filter.remove();
    composerRoot.remove();
  });
});

describe('dockSurfaceBg', () => {
  const darkTheme = (main) => createTheme({ palette: { mode: 'dark', primary: { main } } });

  it('derives the dark-mode dock surface from the accent, not a fixed green', () => {
    const red = dockSurfaceBg(darkTheme('#DC2626'));
    const blue = dockSurfaceBg(darkTheme('#2563EB'));
    expect(red).not.toBe(blue); // follows the chosen accent
    expect(red).not.toContain('#0f1a16');
    expect(red).toBe(alpha(darken('#DC2626', 0.86), 0.72));
  });

  it('deepens the surface on hover', () => {
    const rest = dockSurfaceBg(darkTheme('#DC2626'));
    const hover = dockSurfaceBg(darkTheme('#DC2626'), { hover: true });
    expect(hover).toBe(alpha(darken('#DC2626', 0.86), 0.82));
    expect(hover).not.toBe(rest);
  });

  it('uses the paper surface (no accent tint) in light mode', () => {
    const light = createTheme({ palette: { mode: 'light', primary: { main: '#DC2626' } } });
    expect(dockSurfaceBg(light)).toBe(alpha(light.palette.background.paper, 0.78));
    expect(dockSurfaceBg(light, { hover: true })).toBe(alpha(light.palette.background.paper, 0.88));
  });
});
