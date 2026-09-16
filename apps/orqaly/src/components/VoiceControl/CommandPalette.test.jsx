import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useRef } from 'react';
import CommandPalette from './CommandPalette';

function Harness({ query = '', onSelect, onClose, open = true }) {
  const anchorRef = useRef(null);
  const keyHandlerRef = useRef(null);
  return (
    <div>
      <div ref={anchorRef} data-testid="anchor" style={{ width: 400 }} />
      <button data-testid="trigger-key" onClick={(e) => keyHandlerRef.current?.(e)}>
        trigger
      </button>
      <CommandPalette
        open={open}
        anchorEl={anchorRef.current}
        query={query}
        onSelect={onSelect}
        onClose={onClose}
        keyHandlerRef={keyHandlerRef}
      />
    </div>
  );
}

beforeEach(() => {
  cleanup();
});

describe('CommandPalette', () => {
  it('renders the full command catalog when query is empty', () => {
    render(<Harness query="" onSelect={() => {}} onClose={() => {}} />);
    // Goals category and at least one well-known command should be present
    expect(screen.getByText('Goals')).toBeInTheDocument();
    expect(screen.getByText('Create a goal')).toBeInTheDocument();
  });

  it('filters by query', () => {
    render(<Harness query="goal" onSelect={() => {}} onClose={() => {}} />);
    expect(screen.getByText('Create a goal')).toBeInTheDocument();
    // partner.create is unrelated to "goal" and should be filtered out
    expect(screen.queryByText('Create a partner')).not.toBeInTheDocument();
  });

  it('shows an empty state for unmatched queries', () => {
    render(<Harness query="zzzz-no-match" onSelect={() => {}} onClose={() => {}} />);
    expect(screen.getByText(/No commands match/i)).toBeInTheDocument();
  });

  it('invokes onSelect when an item is clicked', () => {
    const onSelect = vi.fn();
    render(<Harness query="" onSelect={onSelect} onClose={() => {}} />);
    fireEvent.mouseDown(screen.getByText('Create a goal'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].id).toBe('goal.create');
  });

  it('renders the keyboard hints in the footer', () => {
    render(<Harness query="" onSelect={() => {}} onClose={() => {}} />);
    expect(screen.getByText(/↑↓ navigate · ↵ select · esc close/i)).toBeInTheDocument();
  });

  it('renders nothing when closed', () => {
    render(<Harness query="" onSelect={() => {}} onClose={() => {}} open={false} />);
    expect(screen.queryByText('Goals')).not.toBeInTheDocument();
  });
});
