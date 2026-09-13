import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../../services/agentHubService', () => ({ getAgents: () => [] }));
vi.mock('../../../services/knowledgeBaseService', () => ({ listDocuments: vi.fn(async () => []) }));
vi.mock('../../../services/organizationService', () => ({
  listOrganizations: vi.fn(async () => [{ id: 'org-1', name: 'Orqaly Main' }]),
  createGoalOrganization: vi.fn(),
}));
vi.mock('../../../services/workflowService', () => ({ getAllWorkflows: vi.fn(async () => []) }));
vi.mock('../../../services/goalService', () => ({
  createGoal: vi.fn(),
  createSmartRequestDraft: vi.fn(),
  listGoals: vi.fn(async () => []),
  preparePhysicalEvidenceProfile: vi.fn(),
  startGoal: vi.fn(),
}));

import SmartRequestDialog from '../SmartRequestDialog';

function open() {
  render(
    <MemoryRouter>
      <SmartRequestDialog open onClose={() => {}} onSubmit={() => {}} />
    </MemoryRouter>
  );
}

/**
 * Open one of the Manual setup blocks.
 *
 * They are compact rows until you ask for them: rendering Materials, Tools and
 * Destination expanded at once put a Knowledge Base picker, a tool chooser and
 * a workspace selector on screen together and pushed the conversation off the
 * top of the thread.
 */
function openBlock(testId) {
  fireEvent.click(within(screen.getByTestId(testId)).getByRole('button', { expanded: false }));
}

describe('New Goal dialog, Step 1 smoke', () => {
  it('renders the two-step indicator and the describe field', async () => {
    open();
    expect(await screen.findByText('Describe')).toBeInTheDocument();
    expect(screen.getByText('Progress')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Describing your goal/i })).toBeInTheDocument();
  });

  // The goal's own setup stays on screen. Auto locks the three and shows what
  // it picked; the ordinals went with the form, since thread order already
  // carries sequence.
  it('shows all three blocks with the Auto defaults locked', async () => {
    open();
    await screen.findByText('Describe');
    expect(screen.getByText('Materials')).toBeInTheDocument();
    expect(screen.getByText('Tools')).toBeInTheDocument();
    expect(screen.getByText('Destination')).toBeInTheDocument();
    expect(screen.getByText('Execution approval')).toBeInTheDocument();
    expect(screen.getByTestId('tools-block')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Picked for you')).toBeInTheDocument();
    expect(screen.getByText('Standalone')).toBeInTheDocument();
  });

  it('brings the real blocks into the thread when Setup flips to Manual', async () => {
    open();
    await screen.findByText('Describe');
    const setup = screen.getByLabelText('Choose the setup yourself instead of letting us pick');

    fireEvent.click(setup);

    expect(screen.getByTestId('tools-block')).not.toHaveAttribute('aria-disabled');

    openBlock('tools-block');
    expect(screen.getByRole('radio', { name: 'All library' })).toHaveAttribute(
      'aria-checked',
      'true'
    );

    openBlock('destination-block');
    expect(screen.getByRole('radio', { name: 'Standalone' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });

  it('keeps approval checkpoints usable in Auto, and off by default', async () => {
    open();
    await screen.findByText('Describe');
    const approve = screen.getByLabelText('Pause for my approval before execution');
    expect(approve).not.toBeChecked();
    expect(approve).toBeEnabled();
  });

  it('offers the four intake questions in Professional', async () => {
    open();
    await screen.findByText('Describe');
    fireEvent.click(screen.getByRole('button', { name: /Simple/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Professional/i }));

    expect(await screen.findByText('Brief')).toBeInTheDocument();
    expect(screen.getByLabelText(/What is your main goal/)).toBeInTheDocument();
    expect(screen.getByLabelText(/What challenges are you facing/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Expected timeline/)).toBeInTheDocument();
    expect(screen.getByLabelText(/specific requirements or preferences/)).toBeInTheDocument();
  });
});
