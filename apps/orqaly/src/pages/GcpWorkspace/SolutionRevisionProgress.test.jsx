import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SolutionRevisionProgress from './SolutionRevisionProgress.jsx';

describe('candidate next-step summary', () => {
  it.each([
    ['draft', 'Check changes', 'Checking does not deploy or run it.'],
    ['reviewed', 'Approve test version', 'The live version stays unchanged.'],
    [
      'approved',
      'Prepare test version',
      'This does not replace the live version or send test requests.',
    ],
    ['deployment_unknown', 'Verify deployment', 'The deployment outcome is unconfirmed.'],
    [
      'ready',
      'Test this candidate',
      'Connected-service tests need a separate explicit authorization.',
    ],
    ['rejected', 'Rejected candidate', 'This version was not activated.'],
  ])(
    'shows the actual next action for %s without claiming runtime success',
    (status, label, instruction) => {
      render(<SolutionRevisionProgress revision={{ version: 2, status }} liveVersion={1} />);
      expect(
        screen.getByRole('region', { name: 'Next step for candidate v2' })
      ).toBeInTheDocument();
      expect(screen.getByText(label)).toBeInTheDocument();
      expect(
        screen.getByText(new RegExp(instruction.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
      ).toBeInTheDocument();
      expect(screen.getByText('Live v1 unchanged')).toBeInTheDocument();
      expect(screen.queryByText('Test passed')).not.toBeInTheDocument();
    }
  );
  it('only presents activation readiness for server-recorded test coverage', () => {
    render(
      <SolutionRevisionProgress
        revision={{ version: 2, status: 'ready', testedAt: '2026-09-07T12:00:00Z' }}
        liveVersion={1}
      />
    );
    expect(screen.getByText('Ready to activate')).toBeInTheDocument();
    expect(screen.getByText(/Activate it only when you want it to replace/)).toBeInTheDocument();
  });
  it('unknown outcome takes precedence over old passed coverage', () => {
    render(
      <SolutionRevisionProgress
        revision={{ version: 2, status: 'ready', testedAt: '2026-09-07T12:00:00Z' }}
        liveVersion={1}
        outcomeUnknown
      />
    );
    expect(screen.getByText('Result needs verification')).toBeInTheDocument();
    expect(screen.queryByText('Ready to activate')).not.toBeInTheDocument();
  });
  it('keeps the summary compact while leaving full changes in the review', () => {
    render(
      <SolutionRevisionProgress
        revision={{
          version: 2,
          status: 'reviewed',
          review: { changes: [1, 2, 3, 4].map((n) => ({ message: `Change ${n}` })) },
        }}
        liveVersion={1}
      />
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.queryByText('Change 4')).not.toBeInTheDocument();
  });
});
