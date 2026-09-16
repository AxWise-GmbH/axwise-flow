import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SetupSwitch from './SetupSwitch';
import HumanApproveSwitch from './HumanApproveSwitch';
import GatedBlock from './GatedBlock';

describe('SetupSwitch', () => {
  it('reads as Auto by default and explains what Auto does', () => {
    render(<SetupSwitch manual={false} onChange={() => {}} />);

    expect(screen.getByRole('switch')).not.toBeChecked();
    expect(screen.getByText('We choose the materials, tools and destination.')).toBeInTheDocument();
  });

  it('explains the consequence once flipped to Manual', () => {
    render(<SetupSwitch manual onChange={() => {}} />);

    expect(screen.getByRole('switch')).toBeChecked();
    expect(screen.getByText('You choose what the team works with.')).toBeInTheDocument();
  });

  it('reports the flip', () => {
    const onChange = vi.fn();
    render(<SetupSwitch manual={false} onChange={onChange} />);

    fireEvent.click(screen.getByRole('switch'));

    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('Execution approval', () => {
  it('defaults to off while preserving mandatory AxWise scope confirmation', () => {
    render(<HumanApproveSwitch enabled={false} onChange={() => {}} />);

    expect(screen.getByRole('switch')).not.toBeChecked();
    expect(screen.getByText(/after you confirm the AxWise scope/i)).toBeInTheDocument();
    expect(screen.getByText(/continue automatically/i)).toBeInTheDocument();
  });

  it('makes the optional second pause explicit when switched on', () => {
    render(<HumanApproveSwitch enabled onChange={() => {}} />);

    expect(screen.getByRole('switch')).toBeChecked();
    expect(screen.getByText(/after you confirm the AxWise scope/i)).toBeInTheDocument();
    expect(screen.getByText(/pause again before execution/i)).toBeInTheDocument();
  });

  it('is labelled for screen readers in terms of what it does', () => {
    render(<HumanApproveSwitch enabled={false} onChange={() => {}} />);

    expect(screen.getByRole('switch')).toHaveAccessibleName(
      'Pause for my approval before execution'
    );
  });
});

describe('GatedBlock', () => {
  it('shows the Auto choice and hides the controls when locked', () => {
    render(
      <GatedBlock
        index={3}
        title="Tools"
        locked
        summary="None"
        lockedSummary="None"
        data-testid="tools-block"
      >
        <button type="button">Pick tools</button>
      </GatedBlock>
    );

    expect(screen.getByText('3 · Tools')).toBeInTheDocument();
    // Locked is a single row: the header carries what was chosen for you, and
    // the lock icon plus the Setup switch above already say it was automatic.
    // A second row restating "Auto" tripled the height of every locked block.
    expect(screen.getByText('None')).toBeInTheDocument();
    // But the control itself is not rendered, so it cannot be tabbed into.
    expect(screen.queryByRole('button', { name: 'Pick tools' })).not.toBeInTheDocument();
    expect(screen.getByTestId('tools-block')).toHaveAttribute('aria-disabled', 'true');
  });

  // Unlocked is still one row until you open it: three expanded blocks put a
  // Knowledge Base picker, a tool chooser and a workspace selector on screen at
  // once and pushed the conversation off the top.
  it('renders its controls and drops the disabled flag when unlocked', () => {
    render(
      <GatedBlock
        index={3}
        title="Tools"
        locked={false}
        summary="All library"
        lockedSummary="None"
        data-testid="tools-block"
      >
        <button type="button">Pick tools</button>
      </GatedBlock>
    );

    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByRole('button', { name: 'Pick tools' })).toBeInTheDocument();
    expect(screen.getByText('All library')).toBeInTheDocument();
    expect(screen.getByTestId('tools-block')).not.toHaveAttribute('aria-disabled');
  });
});
