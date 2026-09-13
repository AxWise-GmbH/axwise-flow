import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import ToolIcon from './ToolIcon';

function renderWithTheme(ui) {
  return render(<ThemeProvider theme={createTheme()}>{ui}</ThemeProvider>);
}

describe('ToolIcon', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders a logo img when a domain resolves', () => {
    renderWithTheme(<ToolIcon tool={{ name: 'GitHub', endpointUrl: 'https://api.github.com' }} />);
    const img = screen.getByRole('img', { name: 'GitHub' });
    expect(img).toBeInTheDocument();
    expect(img.getAttribute('src')).toBe('https://icons.duckduckgo.com/ip3/github.com.ico');
  });

  it('falls back to a monochrome icon when no domain resolves', () => {
    const { container } = renderWithTheme(<ToolIcon tool={{ name: 'Generic Action' }} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    // MUI icons render as inline <svg>
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('swaps to the category fallback icon when the favicon fails and no brand glyph exists', () => {
    // OpenAI resolves a domain but is intentionally absent from simple-icons.
    const { container } = renderWithTheme(
      <ToolIcon tool={{ name: 'OpenAI', endpointUrl: 'https://api.openai.com' }} />
    );
    const img = screen.getByRole('img', { name: 'OpenAI' });
    fireEvent.error(img);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('falls back to the monochrome brand glyph when the favicon fails', () => {
    // Hugging Face row carries only composioApp (the MCP-row case) and has a glyph.
    renderWithTheme(
      <ToolIcon
        tool={{ name: 'Hugging Face', id: 'mcp-huggingface', composioApp: 'huggingface' }}
      />
    );
    const img = screen.getByRole('img', { name: 'Hugging Face' });
    expect(img.tagName.toLowerCase()).toBe('img');
    expect(img.getAttribute('src')).toBe('https://icons.duckduckgo.com/ip3/huggingface.co.ico');

    fireEvent.error(img);
    const glyph = screen.getByRole('img', { name: 'Hugging Face' });
    expect(glyph.tagName.toLowerCase()).toBe('svg');
    expect(glyph.querySelector('path')).toBeInTheDocument();
  });

  it('renders Google Workspace products as their distinct brand-colored glyph', () => {
    // The shared Google "G" favicon is skipped; the distinct glyph shows directly.
    const { container } = renderWithTheme(
      <ToolIcon
        tool={{ name: 'Google Drive', id: 'mcp-google-drive', composioApp: 'googledrive' }}
      />
    );
    expect(container.querySelector('img')).not.toBeInTheDocument();
    const glyph = screen.getByRole('img', { name: 'Google Drive' });
    expect(glyph.tagName.toLowerCase()).toBe('svg');
    const path = glyph.querySelector('path');
    expect(path).toBeInTheDocument();
    expect(path.getAttribute('fill')).toBe('#4285F4');
  });

  it('advances Brandfetch -> DuckDuckGo -> fallback icon on successive errors', () => {
    vi.stubEnv('VITE_BRANDFETCH_CLIENT_ID', 'test-client');
    const { container } = renderWithTheme(
      <ToolIcon tool={{ name: 'OpenAI', endpointUrl: 'https://api.openai.com' }} />
    );
    let img = screen.getByRole('img', { name: 'OpenAI' });
    expect(img.getAttribute('src')).toBe(
      'https://cdn.brandfetch.io/openai.com/w/64/h/64?c=test-client'
    );

    fireEvent.error(img);
    img = screen.getByRole('img', { name: 'OpenAI' });
    expect(img.getAttribute('src')).toBe('https://icons.duckduckgo.com/ip3/openai.com.ico');

    fireEvent.error(img);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
