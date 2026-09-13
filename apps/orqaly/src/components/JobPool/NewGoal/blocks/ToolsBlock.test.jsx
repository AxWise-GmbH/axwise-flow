import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ToolsBlock from './ToolsBlock';

describe('ToolsBlock', () => {
  it('offers the three policies with None selected by default', () => {
    render(<ToolsBlock value="no_tools" onChange={() => {}} />);

    expect(screen.getByRole('radio', { name: 'None' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'All library' })).toHaveAttribute(
      'aria-checked',
      'false'
    );
    expect(screen.getByRole('radio', { name: 'Only existing' })).toBeInTheDocument();
    expect(screen.getByText('LLM knowledge only, no external calls.')).toBeInTheDocument();
  });

  it('emits the unchanged wire value, not the new label', () => {
    // The labels changed; tool_mode values must not, or every consumer of
    // goals.data.tool_mode breaks.
    const onChange = vi.fn();
    render(<ToolsBlock value="no_tools" onChange={onChange} />);

    fireEvent.click(screen.getByRole('radio', { name: 'All library' }));
    expect(onChange).toHaveBeenCalledWith('with_tools');

    fireEvent.click(screen.getByRole('radio', { name: 'Only existing' }));
    expect(onChange).toHaveBeenCalledWith('existing_only');
  });

  it('explains each policy as it is selected', () => {
    const { rerender } = render(<ToolsBlock value="with_tools" onChange={() => {}} />);
    expect(screen.getByText(/APIs, web search and external tools/)).toBeInTheDocument();

    rerender(<ToolsBlock value="existing_only" onChange={() => {}} />);
    expect(screen.getByText(/already configured/)).toBeInTheDocument();
  });

  it('warns when grounded research cannot be honoured without tools', () => {
    render(<ToolsBlock value="no_tools" onChange={() => {}} groundedResearchConflict />);

    expect(screen.getByRole('alert')).toHaveTextContent(/Grounded research needs live sources/);
    expect(screen.getByRole('alert')).toHaveTextContent(/instant research/);
  });

  it('stays quiet when there is no conflict', () => {
    render(<ToolsBlock value="with_tools" onChange={() => {}} groundedResearchConflict={false} />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('falls back to the first option rather than blanking on an unknown value', () => {
    render(<ToolsBlock value="something_else" onChange={() => {}} />);

    expect(screen.getByText('LLM knowledge only, no external calls.')).toBeInTheDocument();
  });
});
