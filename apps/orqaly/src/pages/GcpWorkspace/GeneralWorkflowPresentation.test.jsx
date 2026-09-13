import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import WorkflowContractSummary from './WorkflowContractSummary.jsx';
import WorkflowJsonInput from './WorkflowJsonInput.jsx';
import WorkflowExecutionEvidence from './WorkflowExecutionEvidence.jsx';
import { buildFailureMessage, isWorkingBuild } from './workflow-build-presentation.js';
import {
  hasVerifiedBuildTest,
  workflowExampleInput,
  workflowInputError,
} from './solution-presentation.js';

const spec = {
  kind: 'n8n_workflow_v2',
  requirements: [
    { id: 'valid-orders', description: 'Keep valid orders and sum their quantities.' },
  ],
  inputSchema: {
    type: 'object',
    required: ['orders'],
    properties: {
      orders: {
        type: 'array',
        items: { type: 'object', properties: { quantity: { type: 'integer' } } },
      },
    },
  },
  outputSchema: {
    type: 'object',
    properties: { accepted: { type: 'array' }, total: { type: 'number' } },
  },
  acceptanceCases: [
    {
      id: 'mixed-orders',
      description: 'Valid and invalid orders',
      input: { orders: [{ quantity: 2 }, { quantity: -1 }] },
      expectedOutput: { total: 2 },
      assertions: [],
    },
  ],
};

function JsonEditor() {
  const [input, setInput] = useState(JSON.stringify(workflowExampleInput(spec)));
  return <WorkflowJsonInput label="Input JSON" spec={spec} value={input} onChange={setInput} />;
}

describe('capability-neutral workflow presentation', () => {
  it('explains bounded design stops without claiming success or an automatic retry', () => {
    expect(buildFailureMessage('AXWISE_NATIVE_SOLUTION_BUDGET_EXHAUSTED')).toMatch(
      /usage limit.*saved draft are safe.*no automatic retry/
    );
    expect(buildFailureMessage({ code: 'AXWISE_SOLUTION_DESIGN_DEADLINE' })).toMatch(
      /time limit.*saved draft are safe.*no automatic retry/
    );
    expect(buildFailureMessage(null)).toMatch(/failed.*saved request/);
    expect(buildFailureMessage({ message: 'The saved provider could not be reached.' })).toBe(
      'The saved provider could not be reached.'
    );
  });
  it('explains queued execution and keeps polling without pretending that n8n has run', () => {
    render(<WorkflowExecutionEvidence evidence={{ status: 'queued' }} />);
    expect(screen.getByText(/Test queued · you can leave this page/)).toBeInTheDocument();
    expect(screen.queryByText(/Tests passed|Test passed|n8n execution [0-9]/)).toBeNull();
    expect(isWorkingBuild({ status: 'draft', testEvidence: { status: 'queued' } })).toBe(true);
    expect(isWorkingBuild({ status: 'draft', progress: { stage: 'testing' } })).toBe(true);
    expect(isWorkingBuild({ status: 'cancelled', testEvidence: { status: 'queued' } })).toBe(false);
  });
  it('shows nested contracts and agreed cases without generating a contact mapping or claiming success', () => {
    render(<WorkflowContractSummary spec={spec} />);
    expect(screen.getByText('Keep valid orders and sum their quantities.')).toBeInTheDocument();
    expect(screen.getByText('orders[].quantity')).toBeInTheDocument();
    expect(screen.getByLabelText('Expected input')).toHaveTextContent('orders · array · required');
    expect(screen.queryByText(/Alice|customer_name|Test passed/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Agreed acceptance cases' }));
    expect(screen.getByText(/checks are not passed tests/)).toBeInTheDocument();
    expect(workflowExampleInput(spec)).toEqual({ orders: [{ quantity: 2 }, { quantity: -1 }] });
  });

  it('edits and formats nested JSON with accessible feedback and no execution', () => {
    render(<JsonEditor />);
    const input = screen.getByRole('textbox', { name: 'Input JSON' });
    act(() => input.focus());
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: '{"orders":[{"quantity":3}]}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Format JSON' }));
    expect(input).toHaveValue(JSON.stringify({ orders: [{ quantity: 3 }] }, null, 2));
    fireEvent.change(input, { target: { value: '{broken' } });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: 'Format JSON' })).toBeDisabled();
    expect(screen.getByText(/Enter valid JSON/)).toBeInTheDocument();
    expect(workflowInputError('[{"nested":[1,true,null]}]')).toBeNull();
  });

  it('uses an explicit empty schema scaffold rather than invented data when no case is available', () => {
    expect(workflowExampleInput({ ...spec, acceptanceCases: [] })).toEqual({ orders: [] });
    expect(
      workflowExampleInput({ kind: 'webhook_transform_v1', fields: [{ source: 'email' }] })
    ).toEqual({ email: 'ALICE@EXAMPLE.COM' });
  });

  it('distinguishes static, mocked, failed and unknown evidence from a verified live result', () => {
    const view = render(
      <WorkflowExecutionEvidence
        evidence={{ kind: 'static', status: 'succeeded', output: { fake: true } }}
      />
    );
    expect(screen.getByText('Static checks only · no n8n execution')).toBeInTheDocument();
    expect(screen.queryByLabelText('Test result')).toBeNull();
    view.rerender(
      <WorkflowExecutionEvidence
        evidence={{
          kind: 'mocked',
          status: 'succeeded',
          executionId: '10',
          output: { result: 'mock' },
          mockedNodes: ['Send SMS'],
        }}
      />
    );
    expect(screen.getByText('Mocked test completed · n8n execution 10')).toBeInTheDocument();
    expect(screen.getByText(/not proof of live provider actions/)).toBeInTheDocument();
    view.rerender(
      <WorkflowExecutionEvidence evidence={{ status: 'outcome_unknown', output: { fake: true } }} />
    );
    expect(screen.getByText(/Outcome unknown/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Test result')).toBeNull();
    view.rerender(
      <WorkflowExecutionEvidence
        evidence={{
          status: 'failed',
          failedNode: 'Validate orders',
          diagnostics: [{ message: 'An order quantity is missing.' }],
        }}
      />
    );
    expect(screen.getByText('Failed node: Validate orders')).toBeInTheDocument();
    expect(screen.queryByText(/Test passed/)).toBeNull();
  });

  it('uses each real n8n case receipt and requires current-version complete evidence for handoff', () => {
    const testEvidence = {
      status: 'succeeded',
      kind: 'controlled_runtime',
      workflowHash: 'hash-v2',
      caseResults: [
        {
          id: 'mixed-orders',
          passed: true,
          executionId: '18',
          input: { orders: [] },
          output: { total: 0 },
        },
      ],
    };
    render(<WorkflowExecutionEvidence evidence={testEvidence} />);
    expect(screen.getByText('Tests passed · n8n execution 18')).toBeInTheDocument();
    expect(screen.getByLabelText('Recorded case mixed-orders input and output')).toHaveTextContent(
      '"total": 0'
    );
    expect(hasVerifiedBuildTest({ spec, workflowHash: 'hash-v2', testEvidence })).toBe(true);
    expect(hasVerifiedBuildTest({ spec, workflowHash: 'new-hash', testEvidence })).toBe(false);
    expect(
      hasVerifiedBuildTest({
        spec,
        workflowHash: 'hash-v2',
        testEvidence: { ...testEvidence, kind: 'mocked' },
      })
    ).toBe(false);
    expect(
      hasVerifiedBuildTest({
        spec,
        workflowHash: 'hash-v2',
        testEvidence: { ...testEvidence, caseResults: [{ id: 'case', passed: true }] },
      })
    ).toBe(false);
  });
});
