import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined';
import ApiOutlinedIcon from '@mui/icons-material/ApiOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import SectionMenu from './SectionMenu';

const theme = createTheme();

const TYPE_META = {
  table: { color: '#2563EB', icon: TableChartOutlinedIcon, label: 'Table' },
  api: { color: '#1D4ED8', icon: ApiOutlinedIcon, label: 'API Route' },
  agent: { color: '#EC4899', icon: SmartToyOutlinedIcon, label: 'Agent Handler' },
};

function renderMenu(props = {}) {
  const onChange = props.onChange ?? vi.fn();
  const utils = render(
    <ThemeProvider theme={theme}>
      <SectionMenu
        value="all"
        onChange={onChange}
        types={['table', 'api', 'agent']}
        typeMeta={TYPE_META}
        counts={{}}
        {...props}
      />
    </ThemeProvider>
  );
  return { ...utils, onChange };
}

describe('SectionMenu', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders a button labeled "All" when value is "all"', () => {
    renderMenu();
    expect(screen.getByRole('button', { name: /sections.*all/i })).toBeInTheDocument();
  });

  it('renders the active type label when a type is selected', () => {
    renderMenu({ value: 'api' });
    expect(screen.getByRole('button', { name: /sections.*api route/i })).toBeInTheDocument();
  });

  it('opens a menu listing "All sections" and every type when clicked', async () => {
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: /sections/i }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByText(/all sections/i)).toBeInTheDocument();
    expect(within(menu).getByText('Table')).toBeInTheDocument();
    expect(within(menu).getByText('API Route')).toBeInTheDocument();
    expect(within(menu).getByText('Agent Handler')).toBeInTheDocument();
  });

  it('calls onChange with the type slug when a section is chosen', async () => {
    const { onChange } = renderMenu();
    fireEvent.click(screen.getByRole('button', { name: /sections/i }));
    const menu = await screen.findByRole('menu');
    fireEvent.click(within(menu).getByText('API Route'));
    expect(onChange).toHaveBeenCalledWith('api');
  });

  it('toggles back to "all" when the currently active type is clicked again', async () => {
    const { onChange } = renderMenu({ value: 'api' });
    fireEvent.click(screen.getByRole('button', { name: /sections/i }));
    const menu = await screen.findByRole('menu');
    fireEvent.click(within(menu).getByText('API Route'));
    expect(onChange).toHaveBeenCalledWith('all');
  });

  it('calls onChange with "all" when "All sections" is selected', async () => {
    const { onChange } = renderMenu({ value: 'api' });
    fireEvent.click(screen.getByRole('button', { name: /sections/i }));
    const menu = await screen.findByRole('menu');
    fireEvent.click(within(menu).getByText(/all sections/i));
    expect(onChange).toHaveBeenCalledWith('all');
  });

  it('disables the button when types list is empty', () => {
    renderMenu({ types: [] });
    const button = screen.getByRole('button', { name: /sections/i });
    expect(button).toBeDisabled();
  });

  it('marks the active type with aria-checked=true', async () => {
    renderMenu({ value: 'agent' });
    fireEvent.click(screen.getByRole('button', { name: /sections/i }));
    const menu = await screen.findByRole('menu');
    const checked = within(menu)
      .getAllByRole('menuitemradio')
      .find((el) => el.getAttribute('aria-checked') === 'true');
    expect(checked).toHaveTextContent('Agent Handler');
  });

  it('shows counts next to types when provided', async () => {
    renderMenu({ counts: { table: 4, api: 9 } });
    fireEvent.click(screen.getByRole('button', { name: /sections/i }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByText('4')).toBeInTheDocument();
    expect(within(menu).getByText('9')).toBeInTheDocument();
  });
});
