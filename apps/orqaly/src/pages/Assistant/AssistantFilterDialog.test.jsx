import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import AssistantFilterDialog from './AssistantFilterDialog';

const theme = createTheme();

function makeLayout() {
  return {
    sortableKeys: ['usage', 'brief'],
    labels: { usage: 'Usage', brief: 'Company Brief' },
    hiddenSections: new Set(),
    sectionOrder: ['usage', 'brief'],
    toggleSection: vi.fn(),
    reorderSections: vi.fn(),
    showAllSections: vi.fn(),
    hideAllSections: vi.fn(),
    resetLayout: vi.fn(),
  };
}

const beginner = {
  id: 'builtin:beginner',
  name: 'Beginner',
  builtin: true,
  order: ['usage', 'brief'],
  hidden: [],
  widths: [],
};

function renderDialog(overrides = {}) {
  const props = {
    open: true,
    onClose: vi.fn(),
    demo: true,
    onDemoChange: vi.fn(),
    layout: makeLayout(),
    templates: [beginner],
    activeTemplateId: 'builtin:beginner',
    onApplyTemplate: vi.fn(),
    onSaveTemplate: vi.fn(),
    onRenameTemplate: vi.fn(),
    onDeleteTemplate: vi.fn(),
    ...overrides,
  };
  render(
    <ThemeProvider theme={theme}>
      <AssistantFilterDialog {...props} />
    </ThemeProvider>
  );
  return props;
}

describe('AssistantFilterDialog', () => {
  it('shows the layout template picker with the Beginner preset', () => {
    renderDialog();
    expect(screen.getByText('Layout template')).toBeInTheDocument();
    expect(screen.getByText('Beginner')).toBeInTheDocument();
  });

  it('applies a template when its chip is clicked', () => {
    const props = renderDialog();
    fireEvent.click(screen.getByText('Beginner'));
    expect(props.onApplyTemplate).toHaveBeenCalledWith(beginner);
  });

  it('toggles demo data', () => {
    const props = renderDialog();
    fireEvent.click(screen.getByRole('switch', { name: /demo data/i }));
    expect(props.onDemoChange).toHaveBeenCalledWith(false);
  });

  it('still renders the block arrange controls', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide all' })).toBeInTheDocument();
  });
});
