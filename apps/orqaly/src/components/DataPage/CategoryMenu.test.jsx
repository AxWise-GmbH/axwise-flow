import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import CategoryMenu, { CATEGORY_OPTIONS } from './CategoryMenu';

const theme = createTheme();

function renderMenu(props = {}) {
  const onChange = props.onChange ?? vi.fn();
  const utils = render(
    <ThemeProvider theme={theme}>
      <CategoryMenu value="platform" onChange={onChange} counts={{}} {...props} />
    </ThemeProvider>
  );
  return { ...utils, onChange };
}

describe('CategoryMenu', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('exports CATEGORY_OPTIONS with all 15 categories', () => {
    expect(CATEGORY_OPTIONS.length).toBe(15);
    const slugs = CATEGORY_OPTIONS.map((o) => o.slug);
    expect(slugs).toEqual(
      expect.arrayContaining([
        'platform',
        'audit',
        'all',
        'full',
        'database',
        'apis',
        'services',
        'security',
        'storage',
        'communication',
        'agents',
        'teams',
        'consilium',
        'llm',
        'crons',
      ])
    );
  });

  it('renders a button labeled with the active category name', () => {
    renderMenu({ value: 'database' });
    expect(screen.getByRole('button', { name: /categories.*database/i })).toBeInTheDocument();
  });

  it('opens a menu listing all categories when the button is clicked', async () => {
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: /categories/i }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByText('Platform')).toBeInTheDocument();
    expect(within(menu).getByText('Database')).toBeInTheDocument();
    expect(within(menu).getByText('Crons')).toBeInTheDocument();
  });

  it('calls onChange with the slug when a category is selected', async () => {
    const { onChange } = renderMenu();
    fireEvent.click(screen.getByRole('button', { name: /categories/i }));
    const menu = await screen.findByRole('menu');
    fireEvent.click(within(menu).getByText('Database'));
    expect(onChange).toHaveBeenCalledWith('database');
  });

  it('marks the active option with aria-checked=true', async () => {
    renderMenu({ value: 'llm' });
    fireEvent.click(screen.getByRole('button', { name: /categories/i }));
    const menu = await screen.findByRole('menu');
    const checkedItem = within(menu)
      .getAllByRole('menuitemradio')
      .find((el) => el.getAttribute('aria-checked') === 'true');
    expect(checkedItem).toBeDefined();
    expect(checkedItem).toHaveTextContent('LLM');
  });

  it('renders counts next to each option when provided', async () => {
    renderMenu({ counts: { database: 12, apis: 7 } });
    fireEvent.click(screen.getByRole('button', { name: /categories/i }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByText('12')).toBeInTheDocument();
    expect(within(menu).getByText('7')).toBeInTheDocument();
  });
});
