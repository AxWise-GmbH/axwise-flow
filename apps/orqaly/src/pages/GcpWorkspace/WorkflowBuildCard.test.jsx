import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { WorkflowBuildCard } from './WorkflowBuildCard.jsx';
import { unduplicatedWorkflowBuilds } from './workflow-discovery.js';

const draft = {
  id: 'draft-1',
  name: 'Order workflow',
  instruction: 'Clean orders',
  status: 'draft',
  rowVersion: 1,
};
const show = (props) =>
  render(
    <MemoryRouter>
      <WorkflowBuildCard {...props} />
    </MemoryRouter>
  );
describe('one workflow identity across its lifecycle', () => {
  it('opens a preparation in the host panel but preserves modified-click navigation', () => {
    const onOpenBuild = vi.fn(),
      onOpenWorkflow = vi.fn();
    show({ build: draft, onOpenBuild, onOpenWorkflow });
    const link = screen.getByRole('link', { name: 'View draft' });
    fireEvent.click(link);
    expect(onOpenBuild).toHaveBeenCalledExactlyOnceWith(draft.id);
    expect(onOpenWorkflow).not.toHaveBeenCalled();
    // Observe the modifier handling without asking jsdom to open another tab.
    let modifierNavigationPreserved;
    const stopBrowserNavigation = (event) => {
      modifierNavigationPreserved = !event.defaultPrevented;
      event.preventDefault();
    };
    document.addEventListener('click', stopBrowserNavigation, { once: true });
    fireEvent.click(link, { ctrlKey: true });
    expect(modifierNavigationPreserved).toBe(true);
    expect(onOpenBuild).toHaveBeenCalledTimes(1);
  });
  it('opens a saved workflow in the host panel without retargeting to its build', () => {
    const onOpenBuild = vi.fn(),
      onOpenWorkflow = vi.fn();
    show({
      build: { ...draft, solutionId: 'solution-1', status: 'completed' },
      onOpenBuild,
      onOpenWorkflow,
    });
    fireEvent.click(screen.getByRole('link', { name: 'Open workflow' }));
    expect(onOpenWorkflow).toHaveBeenCalledExactlyOnceWith('solution-1');
    expect(onOpenBuild).not.toHaveBeenCalled();
  });
  it('shows a specific missing question and one next action', () => {
    show({
      build: {
        ...draft,
        status: 'needs_input',
        questions: [{ id: 'output', prompt: 'Which output field should contain the total?' }],
      },
    });
    expect(screen.getByText('Needs you')).toBeInTheDocument();
    expect(screen.getByText('Which output field should contain the total?')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Answer & continue' })).toHaveAttribute(
      'href',
      '/workspace/builds/draft-1'
    );
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });
  it('links a completed build to its actual saved workflow without claiming activation', () => {
    show({ build: { ...draft, status: 'completed', solutionId: 'solution-1' } });
    expect(screen.getByRole('link', { name: 'Open workflow' })).toHaveAttribute(
      'href',
      '/workspace/solutions/solution-1'
    );
    expect(screen.getByText('Workflow saved')).toBeInTheDocument();
    expect(screen.queryByText('Ready to run')).toBeNull();
  });
  it.each([
    ['active', 'Ready to run'],
    ['paused', 'Paused'],
    ['draft', 'Ready for setup'],
    ['ready', 'Not active yet'],
  ])('projects confirmed %s runtime state', (status, label) => {
    show({ solution: { id: 'solution-1', name: 'Order workflow', status } });
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/workspace/solutions/solution-1');
  });
  it('does not hide an unknown result behind stale testing progress', () => {
    show({
      build: {
        ...draft,
        progress: { stage: 'testing' },
        testEvidence: { status: 'outcome_unknown' },
      },
    });
    expect(screen.getByText('Needs attention')).toBeInTheDocument();
    expect(screen.queryByText('Testing workflow')).toBeNull();
  });
  it('does not hide a stopped build behind stale progress', () => {
    show({ build: { ...draft, status: 'cancelled', progress: { stage: 'designing' } } });
    expect(screen.getByText('Build stopped')).toBeInTheDocument();
  });
  it('deduplicates by either durable association without hiding unrelated drafts', () => {
    const unrelated = { ...draft, id: 'unrelated' };
    expect(
      unduplicatedWorkflowBuilds(
        [{ ...draft, solutionId: 'solution-1' }, { ...draft, id: 'other-build' }, unrelated],
        [{ id: 'solution-1' }, { id: 'solution-2', buildRequestId: 'other-build' }]
      )
    ).toEqual([unrelated]);
  });
});
