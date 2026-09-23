import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import LandingPageSimple from './LandingPageSimple';
import { DESKTOP_RELEASE } from './simple/desktop-release';

function renderPage() {
  return render(
    <ThemeProvider theme={createTheme({ palette: { mode: 'dark' } })}>
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
      screen.getByRole('heading', { name: 'From your request to useful work.' })
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
    expect(document.title).toBe('Orqanix — Cloud reasoning. Local action.');
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
        new RegExp(
          `Orqanix ${DESKTOP_RELEASE.version}.*Apple Silicon.*${Math.round(DESKTOP_RELEASE.bytes / 1_000_000)} MB.*Preview \\(not notarized\\).*Sign in`
        )
      );
    }
    expect(screen.getByRole('link', { name: 'SHA-256 checksum' })).toHaveAttribute(
      'href',
      `${DESKTOP_RELEASE.url}.sha256`
    );
    expect(DESKTOP_RELEASE.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(DESKTOP_RELEASE.version).toBe('2.3.9');
    expect(DESKTOP_RELEASE.build).toBe('5675');
    expect(DESKTOP_RELEASE.url).not.toMatch(/github\.com|token=|X-Goog-Signature/i);
    expect(screen.queryByText(/available separately/)).not.toBeInTheDocument();
  });

  it('uses a scoped light theme and one public brand, with outputs outside the cloud box', () => {
    const { container } = renderPage();
    const root = container.querySelector('[data-landing-root]');
    expect(root).toHaveStyle({ backgroundColor: '#f8f8f8' });
    expect(screen.getByRole('link', { name: 'Orqanix - home' })).toBeInTheDocument();
    expect(root.textContent).not.toMatch(/Orqaly|OrQonics|AxWise/i);
    expect(screen.getByText('Orqanix · pronounced or-KAN-iks')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Orqanix Desktop' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Orqanix Gateway' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Research on demand' })).toBeInTheDocument();
    expect(screen.getByText('Files · Tools · Skills · History')).toBeInTheDocument();
    expect(
      screen.getByText(/Conversation context and selected tool results are sent to the cloud model/)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Your outputs' }).closest('.oq-flow-cloud')
    ).toBeNull();
    expect(screen.getByRole('list', { name: 'Examples of useful outputs' })).toHaveTextContent(
      'Spreadsheets'
    );
  });
});
