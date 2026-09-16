import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { describe, expect, it, vi } from 'vitest';
import SolutionControlTabs from './SolutionControlTabs.jsx';

function Harness({ onChange = () => {} }) {
  const [value, setValue] = useState(0);
  return (
    <>
      <SolutionControlTabs
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange(next);
        }}
      />
      {['Workflow', 'Run', 'History', 'Settings'].map((label, index) => (
        <section
          key={label}
          role="tabpanel"
          id={`solution-panel-${index}`}
          aria-labelledby={`solution-tab-${index}`}
          hidden={value !== index}
        >
          {label} panel
        </section>
      ))}
    </>
  );
}

describe('SolutionControlTabs', () => {
  it('keeps tab and panel ownership exact with one tab in the tab order', () => {
    render(<Harness />);
    expect(screen.getByRole('tablist', { name: 'Solution controls' })).toHaveAttribute(
      'aria-orientation',
      'horizontal'
    );
    for (const [index, tab] of screen.getAllByRole('tab').entries()) {
      expect(tab).toHaveAttribute('id', `solution-tab-${index}`);
      expect(tab).toHaveAttribute('aria-controls', `solution-panel-${index}`);
      expect(tab).toHaveAttribute('aria-selected', String(index === 0));
      expect(tab).toHaveAttribute('tabindex', index === 0 ? '0' : '-1');
    }
    expect(screen.getByRole('tabpanel', { name: 'Workflow' })).toBeVisible();
  });

  it('moves and wraps keyboard focus without changing the mounted panel and leaves native button activation intact', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const [workflow, run, history, settings] = screen.getAllByRole('tab');
    await act(async () => workflow.focus());
    fireEvent.keyDown(workflow, { key: 'ArrowRight' });
    expect(run).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('tabpanel', { name: 'Workflow' })).toBeVisible();
    fireEvent.keyDown(run, { key: 'End' });
    expect(settings).toHaveFocus();
    fireEvent.keyDown(settings, { key: 'ArrowRight' });
    expect(workflow).toHaveFocus();
    fireEvent.keyDown(workflow, { key: 'ArrowLeft' });
    expect(settings).toHaveFocus();
    fireEvent.keyDown(settings, { key: 'Home' });
    fireEvent.keyDown(workflow, { key: 'ArrowRight' });
    expect(run.tagName).toBe('BUTTON');
    expect(run).toHaveAttribute('type', 'button');
    expect(fireEvent.keyDown(run, { key: 'Enter' })).toBe(true);
    // jsdom does not synthesize the browser's native keyboard click.
    fireEvent.click(run);
    expect(run).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Run' })).toBeVisible();
    expect(document.getElementById('solution-panel-0')).toHaveAttribute('hidden');
    fireEvent.keyDown(run, { key: 'ArrowRight' });
    expect(fireEvent.keyDown(history, { key: ' ' })).toBe(true);
    fireEvent.click(history);
    expect(history).toHaveAttribute('aria-selected', 'true');
    expect(onChange.mock.calls).toEqual([[1], [2]]);
    await act(async () => {});
  });

  it('supports pointer activation, RTL focus order, and nearest scrolling for narrow panels', async () => {
    render(
      <ThemeProvider theme={createTheme({ direction: 'rtl' })}>
        <Harness />
      </ThemeProvider>
    );
    const tabs = screen.getAllByRole('tab');
    tabs[1].scrollIntoView = vi.fn();
    await act(async () => tabs[0].focus());
    fireEvent.keyDown(tabs[0], { key: 'ArrowLeft' });
    expect(tabs[1]).toHaveFocus();
    expect(tabs[1].scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
    fireEvent.click(tabs[3]);
    expect(screen.getByRole('tabpanel', { name: 'Settings' })).toBeVisible();
    expect(screen.getByRole('tablist')).toHaveStyle({ overflowX: 'auto', maxWidth: '100%' });
    await act(async () => {});
  });
});
