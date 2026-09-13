import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import EventTable from './EventTable';

const theme = createTheme();
const COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'val', label: 'Value', render: (r) => `#${r.val}` },
];
const ROWS = [
  { id: 'a', name: 'alpha', val: 1 },
  { id: 'b', name: 'beta', val: 2 },
];
const renderTable = (props) =>
  render(
    <ThemeProvider theme={theme}>
      <EventTable columns={COLUMNS} rows={ROWS} {...props} />
    </ThemeProvider>
  );

describe('EventTable', () => {
  it('renders headers, rows, and render() cells', () => {
    renderTable();
    expect(screen.getByText('Name')).toBeTruthy();
    expect(screen.getByText('alpha')).toBeTruthy();
    expect(screen.getByText('#2')).toBeTruthy();
  });

  it('calls onRowClick with the row', () => {
    const onRowClick = vi.fn();
    renderTable({ onRowClick });
    fireEvent.click(screen.getByText('alpha'));
    expect(onRowClick).toHaveBeenCalledWith(ROWS[0]);
  });

  it('filters rows by the search box', () => {
    renderTable();
    fireEvent.change(screen.getByPlaceholderText(/search this tab/i), {
      target: { value: 'beta' },
    });
    expect(screen.queryByText('alpha')).toBeNull();
    expect(screen.getByText('beta')).toBeTruthy();
  });

  it('shows the empty text when there are no rows', () => {
    render(
      <ThemeProvider theme={theme}>
        <EventTable columns={COLUMNS} rows={[]} emptyText="Nothing here" />
      </ThemeProvider>
    );
    expect(screen.getByText('Nothing here')).toBeTruthy();
  });
});
