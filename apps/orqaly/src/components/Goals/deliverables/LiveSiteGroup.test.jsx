/**
 * [module: frontend]
 * Tests for LiveSiteGroup GitHub row.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import LiveSiteGroup from './LiveSiteGroup';

vi.mock('./DeliverableRow', () => ({
  default: ({ meta, extraMeta, actions }) => (
    <div data-testid="row">
      {meta?.map((line) => (
        <span key={line}>{line}</span>
      ))}
      {extraMeta}
      {actions?.map((a) => (
        <a key={a.label} href={a.href}>
          {a.label}
        </a>
      ))}
    </div>
  ),
}));

vi.mock('./GroupHeader', () => ({
  default: ({ label }) => <div>{label}</div>,
}));

const baseItem = {
  url: 'https://nebula.example.workers.dev/',
  host: 'workers.dev',
  taskTitle: 'Deploy site',
};

function renderGroup(items) {
  return render(
    <ThemeProvider theme={createTheme()}>
      <LiveSiteGroup items={items} icon="🌐" label="Live Site" G="#00ff88" />
    </ThemeProvider>
  );
}

describe('LiveSiteGroup', () => {
  it('shows placeholder when githubRepo is missing', () => {
    renderGroup([{ ...baseItem, githubRepo: null }]);
    expect(screen.getByText('Repository not linked')).toBeInTheDocument();
  });

  it('shows repo link and view actions when githubRepo is present', () => {
    renderGroup([
      {
        ...baseItem,
        githubRepo: {
          url: 'https://github.com/acme/site',
          owner: 'acme',
          repo: 'site',
          fullName: 'acme/site',
          hasIndexHtml: true,
        },
      },
    ]);
    expect(screen.getByText('github.com/acme/site')).toBeInTheDocument();
    expect(screen.getByText('View repo')).toHaveAttribute('href', 'https://github.com/acme/site');
    expect(screen.getByText('View source')).toHaveAttribute(
      'href',
      'https://raw.githack.com/acme/site/main/index.html'
    );
  });
});
