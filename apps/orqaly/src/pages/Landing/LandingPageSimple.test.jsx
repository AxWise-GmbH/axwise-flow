import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import LandingPageSimple from './LandingPageSimple';
import { DESKTOP_RELEASE } from './simple/desktop-release';

function renderPage() {
  return render(
    <ThemeProvider theme={createTheme()}>
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<LandingPageSimple />} />
          <Route path="/goals" element={<div>Preview destination</div>} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>
  );
}

describe('LandingPageSimple', () => {
  it('explains the actual local/cloud boundary without the old long marketing tour', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Cloud reasoning.Local action.'
    );
    expect(
      screen.getByRole('heading', { name: 'Local workspace. Connected cloud context.' })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Automatic syncing of local files and chat history is not part of this preview/
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Start with the work in front of you.' })
    ).toBeInTheDocument();
    expect(screen.getByRole('main').querySelector('img')).toBeNull();
    expect(screen.queryByRole('group', { name: 'Landing page style' })).not.toBeInTheDocument();
  });

  it('provides usable links to the examples, explanation, and preview', () => {
    renderPage();
    expect(screen.getByRole('link', { name: 'Explore the possibilities' })).toHaveAttribute(
      'href',
      '#use-cases'
    );
    expect(screen.getByRole('link', { name: 'Local + cloud' })).toHaveAttribute(
      'href',
      '#how-it-works'
    );
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
    fireEvent.click(screen.getAllByRole('button', { name: 'Open web preview' })[0]);
    expect(screen.getByText('Preview destination')).toBeInTheDocument();
  });

  it('sets the page title and restores it when unmounted', () => {
    const before = document.title;
    const page = renderPage();
    expect(document.title).toBe('Orqaly × AxWise — Cloud reasoning. Local action.');
    page.unmount();
    expect(document.title).toBe(before);
  });

  it('offers the public installer with platform, sign-in and checksum details', () => {
    renderPage();
    expect(screen.getByRole('link', { name: 'Download', exact: true })).toHaveAttribute(
      'href',
      '#download'
    );
    const downloads = screen.getAllByRole('link', { name: 'Download for macOS', exact: true });
    expect(downloads).toHaveLength(2);
    for (const download of downloads) {
      expect(download).toHaveAttribute('href', DESKTOP_RELEASE.url);
      expect(download).toHaveAttribute('download', DESKTOP_RELEASE.filename);
      expect(download).toHaveAccessibleDescription(
        /Apple Silicon.*257 MB.*Unsigned preview.*Sign in/
      );
    }
    expect(screen.getByRole('link', { name: 'SHA-256 checksum' })).toHaveAttribute(
      'href',
      `${DESKTOP_RELEASE.url}.sha256`
    );
    expect(DESKTOP_RELEASE.sha256).toBe(
      '02fc15a31ad2703e446c71792c8bf9467222117830a4d7e66843f867626011a6'
    );
    expect(DESKTOP_RELEASE.url).not.toMatch(/github\.com|token=|X-Goog-Signature/i);
    expect(screen.queryByText(/available separately/)).not.toBeInTheDocument();
  });
});
