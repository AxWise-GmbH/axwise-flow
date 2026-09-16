import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, useThemeMode } from './ThemeContext';

function Probe() {
  const { setPrimaryColor } = useThemeMode();
  return (
    <button type="button" onClick={() => setPrimaryColor('#DC2626')}>
      set-red
    </button>
  );
}

function LogoPageProbe() {
  const { logoDefaultPage, setLogoDefaultPage } = useThemeMode();
  return (
    <div>
      <span data-testid="logo-page">{logoDefaultPage}</span>
      <button type="button" onClick={() => setLogoDefaultPage()}>
        reset-page
      </button>
    </div>
  );
}

describe('ThemeProvider accent CSS variables', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('style');
    document.documentElement.removeAttribute('data-theme');
    localStorage.clear();
  });

  it('writes the brand accent vars onto <html> on mount', () => {
    render(
      <ThemeProvider>
        <div />
      </ThemeProvider>
    );
    const root = document.documentElement;
    expect(root.style.getPropertyValue('--app-accent')).toBe('#10b981');
    expect(root.style.getPropertyValue('--app-accent-rgb')).toBe('16, 185, 129');
  });

  it('updates the accent vars when the primary colour changes', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );
    fireEvent.click(screen.getByText('set-red'));
    const root = document.documentElement;
    expect(root.style.getPropertyValue('--app-accent')).toBe('#DC2626');
    expect(root.style.getPropertyValue('--app-accent-rgb')).toBe('220, 38, 38');
    expect(root.style.getPropertyValue('--app-accent-light-rgb')).toBe('237, 146, 146');
  });
});

function BrandingProbe() {
  const { brandName, brandSubtitle, brandLogo, setBrandName, setBrandSubtitle, setBrandLogo } =
    useThemeMode();
  return (
    <div>
      <span data-testid="brand-name">{brandName}</span>
      <span data-testid="brand-subtitle">{brandSubtitle}</span>
      <span data-testid="brand-logo">{brandLogo}</span>
      <button type="button" onClick={() => setBrandName('Acme')}>
        set-name
      </button>
      <button type="button" onClick={() => setBrandSubtitle('Ops')}>
        set-subtitle
      </button>
      <button type="button" onClick={() => setBrandLogo('data:image/png;base64,AAA')}>
        set-logo
      </button>
      <button type="button" onClick={() => setBrandLogo('')}>
        clear-logo
      </button>
    </div>
  );
}

describe('ThemeProvider branding', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('defaults branding fields to empty when nothing is stored', () => {
    render(
      <ThemeProvider>
        <BrandingProbe />
      </ThemeProvider>
    );
    expect(screen.getByTestId('brand-name').textContent).toBe('');
    expect(screen.getByTestId('brand-subtitle').textContent).toBe('');
    expect(screen.getByTestId('brand-logo').textContent).toBe('');
  });

  it('persists branding values to localStorage', () => {
    render(
      <ThemeProvider>
        <BrandingProbe />
      </ThemeProvider>
    );
    fireEvent.click(screen.getByText('set-name'));
    fireEvent.click(screen.getByText('set-subtitle'));
    fireEvent.click(screen.getByText('set-logo'));
    expect(localStorage.getItem('orchestratori-brand-name')).toBe('Acme');
    expect(localStorage.getItem('orchestratori-brand-subtitle')).toBe('Ops');
    expect(localStorage.getItem('orchestratori-brand-logo')).toBe('data:image/png;base64,AAA');
  });

  it('hydrates branding values from localStorage', () => {
    localStorage.setItem('orchestratori-brand-name', 'Stored Co');
    localStorage.setItem('orchestratori-brand-subtitle', 'Stored Sub');
    render(
      <ThemeProvider>
        <BrandingProbe />
      </ThemeProvider>
    );
    expect(screen.getByTestId('brand-name').textContent).toBe('Stored Co');
    expect(screen.getByTestId('brand-subtitle').textContent).toBe('Stored Sub');
  });

  it('removes the logo key when the logo is cleared', () => {
    render(
      <ThemeProvider>
        <BrandingProbe />
      </ThemeProvider>
    );
    fireEvent.click(screen.getByText('set-logo'));
    expect(localStorage.getItem('orchestratori-brand-logo')).toBe('data:image/png;base64,AAA');
    fireEvent.click(screen.getByText('clear-logo'));
    expect(localStorage.getItem('orchestratori-brand-logo')).toBeNull();
  });
});

describe('ThemeProvider logo default page', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('defaults logoDefaultPage to /home when nothing is stored', () => {
    render(
      <ThemeProvider>
        <LogoPageProbe />
      </ThemeProvider>
    );
    expect(screen.getByTestId('logo-page').textContent).toBe('/home');
  });

  it('falls back to /home when setLogoDefaultPage is called with no page', () => {
    render(
      <ThemeProvider>
        <LogoPageProbe />
      </ThemeProvider>
    );
    fireEvent.click(screen.getByText('reset-page'));
    expect(screen.getByTestId('logo-page').textContent).toBe('/home');
  });
});
