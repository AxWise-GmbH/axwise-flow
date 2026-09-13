import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import Pagination from '../Pagination';
import { getPageWindow } from '../paginationUtils';

function renderWithTheme(ui) {
  return render(<ThemeProvider theme={createTheme()}>{ui}</ThemeProvider>);
}

const noop = () => {};

describe('getPageWindow', () => {
  it('returns all pages when total ≤ maxVisible', () => {
    expect(getPageWindow(5, 0, 6)).toEqual([1, 2, 3, 4, 5]);
  });

  it('collapses the right side when current is near the start', () => {
    expect(getPageWindow(100, 0, 6)).toEqual([1, 2, 3, 4, 5, '…', 100]);
  });

  it('collapses the left side when current is near the end', () => {
    expect(getPageWindow(100, 99, 6)).toEqual([1, '…', 96, 97, 98, 99, 100]);
  });

  it('collapses both sides when current is in the middle', () => {
    expect(getPageWindow(100, 49, 6)).toEqual([1, '…', 49, 50, 51, '…', 100]);
  });
});

describe('Pagination component', () => {
  it('returns null when count is 0', () => {
    const { container } = renderWithTheme(
      <Pagination
        count={0}
        page={0}
        rowsPerPage={10}
        onPageChange={noop}
        onRowsPerPageChange={noop}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('hides pager when count ≤ rowsPerPage', () => {
    renderWithTheme(
      <Pagination
        count={8}
        page={0}
        rowsPerPage={10}
        onPageChange={noop}
        onRowsPerPageChange={noop}
      />
    );
    expect(screen.queryByLabelText('Previous page')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Next page')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /10 \/ page/i })).toBeInTheDocument();
  });

  it('fires onPageChange when a page number is clicked', () => {
    const onPageChange = vi.fn();
    renderWithTheme(
      <Pagination
        count={70}
        page={0}
        rowsPerPage={10}
        onPageChange={onPageChange}
        onRowsPerPageChange={noop}
      />
    );
    fireEvent.click(screen.getByLabelText('Go to page 3'));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('fires onPageChange on chevron clicks', () => {
    const onPageChange = vi.fn();
    renderWithTheme(
      <Pagination
        count={70}
        page={2}
        rowsPerPage={10}
        onPageChange={onPageChange}
        onRowsPerPageChange={noop}
      />
    );
    fireEvent.click(screen.getByLabelText('Previous page'));
    expect(onPageChange).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByLabelText('Next page'));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it('disables prev on first page and next on last', () => {
    const { rerender } = renderWithTheme(
      <Pagination
        count={30}
        page={0}
        rowsPerPage={10}
        onPageChange={noop}
        onRowsPerPageChange={noop}
      />
    );
    expect(screen.getByLabelText('Previous page')).toBeDisabled();
    expect(screen.getByLabelText('Next page')).not.toBeDisabled();

    rerender(
      <ThemeProvider theme={createTheme()}>
        <Pagination
          count={30}
          page={2}
          rowsPerPage={10}
          onPageChange={noop}
          onRowsPerPageChange={noop}
        />
      </ThemeProvider>
    );
    expect(screen.getByLabelText('Next page')).toBeDisabled();
  });

  it('shows Load all only when count > rowsPerPage*2 and <= maxLoadAll', () => {
    const { rerender } = renderWithTheme(
      <Pagination
        count={15}
        page={0}
        rowsPerPage={10}
        onPageChange={noop}
        onRowsPerPageChange={noop}
        onLoadAll={noop}
      />
    );
    expect(screen.queryByText(/load all/i)).not.toBeInTheDocument();

    rerender(
      <ThemeProvider theme={createTheme()}>
        <Pagination
          count={100}
          page={0}
          rowsPerPage={10}
          onPageChange={noop}
          onRowsPerPageChange={noop}
          onLoadAll={noop}
          maxLoadAll={500}
        />
      </ThemeProvider>
    );
    expect(screen.getByText(/load all/i)).toBeInTheDocument();
  });

  it('renders allMode collapsed summary with Collapse action', () => {
    const onCollapseAll = vi.fn();
    renderWithTheme(
      <Pagination
        count={70}
        page={0}
        rowsPerPage={70}
        onPageChange={noop}
        onRowsPerPageChange={noop}
        onLoadAll={noop}
        onCollapseAll={onCollapseAll}
        allMode
        label="rows"
      />
    );
    expect(screen.getByText(/showing all 70 rows/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/collapse/i));
    expect(onCollapseAll).toHaveBeenCalled();
  });

  it('jumps to the submitted page number on Enter', () => {
    const onPageChange = vi.fn();
    renderWithTheme(
      <Pagination
        count={1000}
        page={0}
        rowsPerPage={10}
        onPageChange={onPageChange}
        onRowsPerPageChange={noop}
      />
    );
    const input = screen.getByLabelText('Go to page');
    fireEvent.change(input, { target: { value: '47' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onPageChange).toHaveBeenCalledWith(46);
  });

  it('clamps out-of-range jump input to valid range', () => {
    const onPageChange = vi.fn();
    renderWithTheme(
      <Pagination
        count={1000}
        page={0}
        rowsPerPage={10}
        onPageChange={onPageChange}
        onRowsPerPageChange={noop}
      />
    );
    const input = screen.getByLabelText('Go to page');
    fireEvent.change(input, { target: { value: '9999' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onPageChange).toHaveBeenCalledWith(99); // pageCount 100 → index 99
  });
});
