import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import DemoTaskManager from './DemoTaskManager';
import { TASK_MANAGER_SCOPES, TASK_MANAGER_TAGS } from '../../../data/taskManagerCategories';

function renderDemo() {
  return render(
    <ThemeProvider theme={createTheme()}>
      <DemoTaskManager />
    </ThemeProvider>,
  );
}

describe('DemoTaskManager', () => {
  it('opens categories menu with all platform scopes and tags', () => {
    renderDemo();
    fireEvent.click(screen.getByRole('button', { name: /task categories/i }));
    TASK_MANAGER_SCOPES.forEach((scope) => {
      expect(screen.getByText(scope.label)).toBeInTheDocument();
    });
    TASK_MANAGER_TAGS.forEach((tag) => {
      expect(screen.getAllByText(tag).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('filters demo tasks when a tag is selected', () => {
    renderDemo();
    fireEvent.click(screen.getByRole('button', { name: /task categories/i }));
    const menu = screen.getByRole('menu');
    fireEvent.click(within(menu).getByText('Legal'));
    expect(screen.getByText('Draft NDA for Acme Co')).toBeInTheDocument();
    expect(screen.queryByText('Review Q4 budget')).not.toBeInTheDocument();
  });
});
