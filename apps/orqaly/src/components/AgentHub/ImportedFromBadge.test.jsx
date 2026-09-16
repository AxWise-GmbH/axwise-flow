import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import ImportedFromBadge from './ImportedFromBadge';

const theme = createTheme();
const Wrap = ({ children }) => <ThemeProvider theme={theme}>{children}</ThemeProvider>;

describe('ImportedFromBadge', () => {
  it('renders nothing without importedFrom', () => {
    const { container } = render(
      <Wrap>
        <ImportedFromBadge importedFrom={null} />
      </Wrap>
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a non-github source', () => {
    const { container } = render(
      <Wrap>
        <ImportedFromBadge importedFrom={{ source: 'marketplace', repo: 'acme/agents' }} />
      </Wrap>
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('labels the badge with the last segment of the repo', () => {
    render(
      <Wrap>
        <ImportedFromBadge importedFrom={{ source: 'github', repo: 'agency/agency-agents' }} />
      </Wrap>
    );
    expect(screen.getByText('agency-agents')).toBeInTheDocument();
  });

  it('falls back to GitHub when no repo is set', () => {
    render(
      <Wrap>
        <ImportedFromBadge importedFrom={{ source: 'github' }} />
      </Wrap>
    );
    expect(screen.getByText('GitHub')).toBeInTheDocument();
  });

  it('links to the repo in a new tab when a url is present', () => {
    render(
      <Wrap>
        <ImportedFromBadge
          importedFrom={{
            source: 'github',
            repo: 'agency/agency-agents',
            url: 'https://github.com/agency/agency-agents',
          }}
        />
      </Wrap>
    );
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://github.com/agency/agency-agents');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener');
  });

  it('renders a plain chip with no link when url is missing', () => {
    render(
      <Wrap>
        <ImportedFromBadge importedFrom={{ source: 'github', repo: 'agency/agency-agents' }} />
      </Wrap>
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('does not bubble clicks to the surrounding card', () => {
    const onCardClick = vi.fn();
    render(
      <Wrap>
        <div onClick={onCardClick}>
          <ImportedFromBadge
            importedFrom={{
              source: 'github',
              repo: 'agency/agency-agents',
              url: 'https://github.com/agency/agency-agents',
            }}
          />
        </div>
      </Wrap>
    );
    fireEvent.click(screen.getByRole('link'));
    expect(onCardClick).not.toHaveBeenCalled();
  });
});
