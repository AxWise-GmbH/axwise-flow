import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CollapsibleMarkdownDocument } from './CollapsibleMarkdownDocument.jsx';

function renderDocument(text, props = {}) {
  return render(
    <ThemeProvider theme={createTheme()}>
      <CollapsibleMarkdownDocument text={text} {...props} />
    </ThemeProvider>
  );
}

describe('CollapsibleMarkdownDocument', () => {
  it('keeps omitted Markdown blocks out of the accessibility tree until opened', () => {
    const text = [
      '# Report',
      '',
      'Summary.',
      '',
      '## Detail one',
      '',
      '- A complete list item',
      '- A second item',
      '',
      '## Detail two',
      '',
      'TAIL_MARKER',
    ].join('\n');

    renderDocument(text, { previewBlocks: 4 });

    const open = screen.getByRole('button', { name: 'Open full report' });
    expect(open).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('list')).toHaveTextContent('A complete list item');
    expect(screen.queryByText('TAIL_MARKER')).toBeNull();

    fireEvent.click(open);

    expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(screen.getByRole('region', { name: 'Full report' })).toHaveFocus();
    expect(screen.getByText('TAIL_MARKER')).toBeInTheDocument();
  });

  it('does not show a disclosure when every parsed block fits', () => {
    renderDocument('A short answer with an [official link](https://example.com).', {
      endAction: <button type="button">Download .md</button>,
    });

    expect(screen.queryByRole('button', { name: 'Open full report' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Download .md' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'official link' })).toHaveAttribute(
      'href',
      'https://example.com'
    );
  });
});
