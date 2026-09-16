import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import MessageMeta from './MessageMeta';

const at = new Date(2026, 7, 23, 9, 4, 7); // 23.08.2026, 09:04:07 local

function renderMeta(props = {}) {
  return render(
    <ThemeProvider theme={createTheme()}>
      <MessageMeta text="hello world" at={at} {...props} />
    </ThemeProvider>
  );
}

describe('MessageMeta', () => {
  let writeText;

  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the time above the date, both to the second', () => {
    const { getByText } = renderMeta();
    const time = getByText('09:04:07');
    const date = getByText('23.08.2026');
    // DOCUMENT_POSITION_FOLLOWING: the date comes after the time in the tree,
    // which is what stacks it underneath.
    expect(time.compareDocumentPosition(date) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('copies the message text', async () => {
    const { getByLabelText } = renderMeta();
    fireEvent.click(getByLabelText('Copy message'));
    expect(writeText).toHaveBeenCalledWith('hello world');
    await waitFor(() => expect(getByLabelText('Message copied')).toBeInTheDocument());
  });

  it('does not claim success when the clipboard refuses', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    const { getByLabelText, queryByLabelText } = renderMeta();
    fireEvent.click(getByLabelText('Copy message'));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(queryByLabelText('Message copied')).toBeNull();
    expect(getByLabelText('Copy message')).toBeInTheDocument();
  });

  it('does not claim success when the Clipboard API is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    const { getByLabelText, queryByLabelText } = renderMeta();
    fireEvent.click(getByLabelText('Copy message'));
    await Promise.resolve();
    expect(queryByLabelText('Message copied')).toBeNull();
    expect(getByLabelText('Copy message')).toBeInTheDocument();
  });

  it('hangs the stamp on the right for the sender own message', () => {
    const { getByTestId } = renderMeta({ align: 'right' });
    expect(getComputedStyle(getByTestId('message-meta')).justifyContent).toBe('flex-end');
  });

  it('hangs on the left for everything answering', () => {
    const { getByTestId } = renderMeta({ align: 'left' });
    expect(getComputedStyle(getByTestId('message-meta')).justifyContent).toBe('flex-start');
  });

  it('shows a stamp with no copy button when there is nothing to copy', () => {
    const { queryByLabelText, getByText } = renderMeta({ text: '' });
    expect(queryByLabelText('Copy message')).toBeNull();
    expect(getByText('09:04:07')).toBeInTheDocument();
  });

  it('shows a copy button with no stamp when the time is unknown', () => {
    const { getByLabelText, queryByTestId } = renderMeta({ at: null });
    expect(getByLabelText('Copy message')).toBeInTheDocument();
    expect(queryByTestId('message-stamp')).toBeNull();
  });

  // The typing indicator is a bubble with neither.
  it('renders nothing at all when it has neither', () => {
    const { queryByTestId } = renderMeta({ text: '', at: null });
    expect(queryByTestId('message-meta')).toBeNull();
  });
});
