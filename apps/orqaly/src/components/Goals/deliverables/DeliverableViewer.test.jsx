/**
 * [module: frontend]
 *
 * The viewer answers "what did it produce?" without leaving the popup. These
 * cases cover the two ways that goes wrong: showing the wrong renderer for a
 * format, and showing an empty panel where a format cannot be rendered at all.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { DeliverableViewerProvider, DeliverableBody } from './DeliverableViewer';
import { useDeliverableViewer } from './deliverableViewerContext';
import { VIEW_FORMAT } from './deliverableFormats';

const theme = createTheme();

function Body({ item }) {
  return (
    <ThemeProvider theme={theme}>
      <DeliverableBody item={item} />
    </ThemeProvider>
  );
}

/** A row that opens whatever it is handed, the way a real group does. */
function OpenButton({ item }) {
  const viewer = useDeliverableViewer();
  if (!viewer) return <span data-testid="no-viewer" />;
  return (
    <button type="button" onClick={() => viewer.view(item)}>
      View
    </button>
  );
}

function renderWithProvider(item) {
  return render(
    <ThemeProvider theme={theme}>
      <DeliverableViewerProvider>
        <OpenButton item={item} />
      </DeliverableViewerProvider>
    </ThemeProvider>
  );
}

describe('DeliverableBody', () => {
  it('reads a markdown brief as a document, not as source', () => {
    render(
      <Body item={{ title: 'Plan', format: VIEW_FORMAT.markdown, text: '# Budget\n\nSpend.' }} />
    );
    expect(screen.getByText('Budget')).toBeInTheDocument();
    // Rendered, so the hash is not on screen.
    expect(screen.queryByText('# Budget')).toBeNull();
  });

  it('reads a CSV as a table with its header row', () => {
    render(
      <Body item={{ title: 'Costs', format: VIEW_FORMAT.csv, text: 'item,cost\nAds,"$1,200"' }} />
    );
    expect(screen.getByText('item')).toBeInTheDocument();
    // The quoted comma survived the parse and did not split the row.
    expect(screen.getByText('$1,200')).toBeInTheDocument();
  });

  it('keeps JSON as text rather than pretending it is prose', () => {
    render(<Body item={{ title: 'Data', format: VIEW_FORMAT.json, text: '{"a":1}' }} />);
    expect(screen.getByText('{"a":1}')).toBeInTheDocument();
  });

  it('embeds a PDF rather than downloading it', () => {
    const { container } = render(
      <Body item={{ title: 'Deck', format: VIEW_FORMAT.pdf, url: 'https://x.co/a.pdf' }} />
    );
    const object = container.querySelector('object');
    expect(object).toHaveAttribute('data', 'https://x.co/a.pdf');
    expect(object).toHaveAttribute('type', 'application/pdf');
  });

  it('shows an image at its own size', () => {
    render(<Body item={{ title: 'Hero', format: VIEW_FORMAT.image, url: 'https://x.co/a.png' }} />);
    expect(screen.getByRole('img', { name: 'Hero' })).toHaveAttribute('src', 'https://x.co/a.png');
  });

  // A blank grey box that was meant to be a preview is worse than no preview.
  it('says so, and offers the file, when a format cannot be shown', () => {
    render(<Body item={{ title: 'Book', format: 'xlsx', url: 'https://x.co/a.xlsx' }} />);
    expect(screen.getByText(/opens outside the app/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open the file/i })).toHaveAttribute(
      'href',
      'https://x.co/a.xlsx'
    );
  });
});

describe('DeliverableBody over the wire', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    delete globalThis.fetch;
  });

  it('fetches text it was given only a URL for', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, text: async () => 'a,b\n1,2' });
    render(<Body item={{ title: 'Export', format: VIEW_FORMAT.csv, url: 'https://x.co/a.csv' }} />);
    // Says it is working before it has anything to show.
    expect(screen.getByRole('status', { name: /Loading/i })).toBeInTheDocument();
    await act(async () => {});
    expect(screen.getByText('a')).toBeInTheDocument();
    expect(globalThis.fetch).toHaveBeenCalledWith('https://x.co/a.csv', expect.any(Object));
  });

  it('says what went wrong instead of showing an empty panel', async () => {
    globalThis.fetch.mockResolvedValue({ ok: false, status: 403 });
    render(<Body item={{ title: 'Export', format: VIEW_FORMAT.csv, url: 'https://x.co/a.csv' }} />);
    await act(async () => {});
    expect(screen.getByText(/HTTP 403/)).toBeInTheDocument();
  });

  // Inline text is already in hand: a loading frame over it would be a lie.
  it('never shows a loading state for text it already holds', () => {
    render(<Body item={{ title: 'Plan', format: VIEW_FORMAT.markdown, text: 'Ready.' }} />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText('Ready.')).toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe('DeliverableViewerProvider', () => {
  const item = { title: 'Zero-Capital Analysis', format: VIEW_FORMAT.markdown, text: 'Findings.' };

  it('stays out of the way until something is opened', () => {
    renderWithProvider(item);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens over the popup, titled and labelled by format', () => {
    renderWithProvider(item);
    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    expect(screen.getByRole('dialog', { name: /Zero-Capital Analysis/ })).toBeInTheDocument();
    expect(screen.getByText('Markdown')).toBeInTheDocument();
    expect(screen.getByText('Findings.')).toBeInTheDocument();
  });

  it('closes back to the results', () => {
    renderWithProvider(item);
    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close the viewer' }));
    expect(screen.queryByText('Findings.')).toBeNull();
  });

  // Escape must not fall through to the Dialog behind it: that closes the whole
  // popup and loses the user's place in the results.
  it('takes Escape for itself rather than closing the popup behind it', () => {
    const onKey = vi.fn();
    window.addEventListener('keydown', onKey);
    renderWithProvider(item);
    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText('Findings.')).toBeNull();
    expect(onKey).not.toHaveBeenCalled();
    window.removeEventListener('keydown', onKey);
  });

  it('offers the download the row would have done, from the viewer itself', () => {
    const onDownload = vi.fn();
    renderWithProvider({ ...item, onDownload });
    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    fireEvent.click(screen.getByRole('button', { name: /Download/i }));
    expect(onDownload).toHaveBeenCalled();
  });

  // Groups render on pages with no popup to open into, and check for this.
  it('reports itself absent outside a provider', () => {
    render(
      <ThemeProvider theme={theme}>
        <OpenButton item={item} />
      </ThemeProvider>
    );
    expect(screen.getByTestId('no-viewer')).toBeInTheDocument();
  });
});
