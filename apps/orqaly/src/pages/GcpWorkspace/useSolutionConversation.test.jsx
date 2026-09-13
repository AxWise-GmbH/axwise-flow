import { useState } from 'react';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSolutionConversation } from './useSolutionConversation.js';
import {
  SolutionConversationActions,
  SolutionConversationFeedback,
  SolutionConversationNotices,
  SolutionConversationTurn,
} from './SolutionConversation.jsx';

const solution = { id: 'workflow-one', version: 1, name: 'Example' };
const hash = 'a'.repeat(64);
const snapshot = (values = {}) => ({
  solutionId: solution.id,
  context: { solutionVersion: 1, workflowHash: hash, selectedDraft: null, availableDraft: null },
  turns: [],
  ...values,
});
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
function clientFixture() {
  return {
    solutionConversation: vi.fn().mockResolvedValue(snapshot()),
    sendSolutionConversationTurn: vi.fn(async (_id, command) =>
      snapshot({
        turns: [
          { id: command.turnId, mode: command.mode, message: command.message, status: 'queued' },
        ],
      })
    ),
  };
}

function SharedComposer({ initialText = '', ...props }) {
  const [text, setText] = useState(initialText);
  const controller = useSolutionConversation({ ...props, message: text, onMessageChange: setText });
  return (
    <>
      <div role="log" aria-label="Original Assistant">
        <p>Original conversation stays here.</p>
        {controller.turns.map((turn) => (
          <SolutionConversationTurn key={turn.id} turn={turn} controller={controller} />
        ))}
      </div>
      <form aria-label="Original composer" onSubmit={(event) => event.preventDefault()}>
        <SolutionConversationNotices controller={controller} />
        <input
          aria-label="Message Assistant"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <SolutionConversationActions controller={controller} />
      </form>
      <SolutionConversationFeedback controller={controller} />
    </>
  );
}

describe('extracted workflow conversation controller', () => {
  it('makes no API request or side effect when no workflow is selected', () => {
    const client = clientFixture();
    const { result } = renderHook(() => useSolutionConversation({ client, solution: null }));
    expect(client.solutionConversation).not.toHaveBeenCalled();
    expect(result.current.contextReady).toBe(false);
    act(() => {
      result.current.send('ask');
      result.current.send('change');
      result.current.retrySame();
    });
    expect(client.sendSolutionConversationTurn).not.toHaveBeenCalled();
  });

  it('uses one stable host text field, log and form through workflow selection and explicit send', async () => {
    const client = clientFixture();
    const view = render(
      <SharedComposer client={client} solution={null} initialText="Explain the branching" />
    );
    const originalInput = screen.getByRole('textbox', { name: 'Message Assistant' });
    view.rerender(
      <SharedComposer
        client={client}
        solution={solution}
        initialText="unused"
        scopeKey="thread-one"
      />
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled());
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.getAllByRole('log')).toHaveLength(1);
    expect(screen.getAllByRole('form')).toHaveLength(1);
    expect(screen.getByRole('textbox')).toBe(originalInput);
    expect(originalInput).toHaveValue('Explain the branching');
    expect(client.sendSolutionConversationTurn).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(originalInput).toHaveValue(''));
    expect(client.sendSolutionConversationTurn).toHaveBeenCalledTimes(1);
    expect(client.sendSolutionConversationTurn.mock.calls[0][1]).toMatchObject({
      mode: 'auto',
      message: 'Explain the branching',
      workflowHash: hash,
      expectedSolutionVersion: 1,
    });
    expect(screen.getByRole('textbox')).toBe(originalInput);
  });

  it('ignores a late same-workflow response after the owning Assistant thread changes', async () => {
    const client = clientFixture();
    const old = deferred();
    client.sendSolutionConversationTurn.mockReturnValue(old.promise);
    const view = render(
      <SharedComposer
        client={client}
        solution={solution}
        scopeKey="thread-one"
        initialText="First thread question"
      />
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    const command = client.sendSolutionConversationTurn.mock.calls[0][1];
    // Parent normally blocks this navigation while pending. Even forced auth/
    // route replacement must not let its acknowledgement consume another draft.
    view.rerender(<SharedComposer client={client} solution={solution} scopeKey="thread-two" />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Second thread draft' } });
    await act(async () =>
      old.resolve(
        snapshot({
          turns: [
            {
              id: command.turnId,
              status: 'completed',
              message: command.message,
              mode: 'ask',
              reply: 'Old response',
            },
          ],
        })
      )
    );
    expect(screen.getByRole('textbox')).toHaveValue('Second thread draft');
    expect(screen.queryByText('Old response')).toBeNull();
    expect(client.sendSolutionConversationTurn).toHaveBeenCalledTimes(1);
  });

  it('invalidates a late read and all old actions when the client or solution scope changes', async () => {
    const first = clientFixture();
    const second = clientFixture();
    const stale = deferred();
    first.solutionConversation.mockReturnValue(stale.promise);
    second.solutionConversation.mockResolvedValue(snapshot({ solutionId: 'workflow-two' }));
    const { result, rerender } = renderHook((props) => useSolutionConversation(props), {
      initialProps: { client: first, solution, message: 'A question' },
    });
    const oldController = result.current;
    rerender({
      client: second,
      solution: { ...solution, id: 'workflow-two' },
      message: 'A question',
    });
    await waitFor(() => expect(result.current.contextReady).toBe(true));
    await act(async () =>
      stale.resolve(
        snapshot({ turns: [{ id: 'old', status: 'completed', message: 'Wrong owner history' }] })
      )
    );
    expect(result.current.snapshot.solutionId).toBe('workflow-two');
    expect(result.current.turns).toEqual([]);
    act(() => oldController.send('change'));
    expect(first.sendSolutionConversationTurn).not.toHaveBeenCalled();
    expect(second.sendSolutionConversationTurn).not.toHaveBeenCalled();
  });

  it('reports uncertain delivery and retries only the same frozen command and key', async () => {
    const client = clientFixture();
    const onWorkingChange = vi.fn();
    client.sendSolutionConversationTurn.mockRejectedValueOnce(new Error('Network unavailable'));
    const view = render(
      <SharedComposer
        client={client}
        solution={solution}
        onWorkingChange={onWorkingChange}
        initialText="Change only my draft"
      />
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText(/Delivery is unconfirmed/);
    const first = structuredClone(client.sendSolutionConversationTurn.mock.calls[0]);
    expect(onWorkingChange).toHaveBeenLastCalledWith(true);
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'New text cannot replace frozen request' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Retry same request' }));
    await waitFor(() => expect(client.sendSolutionConversationTurn).toHaveBeenCalledTimes(2));
    expect(client.sendSolutionConversationTurn.mock.calls[1]).toEqual(first);
    view.unmount();
  });

  it('renders inactive workflow turns without any current-target actions, composer or nested log', () => {
    const onSelectDraft = vi.fn();
    const view = render(
      <div role="log">
        <SolutionConversationTurn
          controller={null}
          onSelectDraft={onSelectDraft}
          turn={{
            id: 'old-ask',
            mode: 'ask',
            status: 'completed',
            message: 'Old question',
            reply: 'Old saved answer',
          }}
        />
        <SolutionConversationTurn
          controller={null}
          onSelectDraft={onSelectDraft}
          turn={{
            id: 'old-change',
            mode: 'change',
            status: 'completed',
            message: 'Old change',
            draftRevisionId: 'other-draft',
            reply: 'A prior proposal',
          }}
        />
      </div>
    );
    expect(screen.getByText('Old saved answer')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Propose this change' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Show changes' })).toBeNull();
    expect(screen.getAllByRole('log')).toHaveLength(1);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(view.container.querySelector('form')).toBeNull();
    expect(onSelectDraft).not.toHaveBeenCalled();
  });

  it('does not repoll for inline host callbacks and rejects an oversized original-chat draft', async () => {
    const client = clientFixture();
    const { result, rerender } = renderHook(
      ({ text }) =>
        useSolutionConversation({
          client,
          solution,
          message: text,
          onMessageChange: () => {},
          onDraftReady: () => {},
        }),
      { initialProps: { text: 'Small question' } }
    );
    await waitFor(() => expect(result.current.contextReady).toBe(true));
    const reads = client.solutionConversation.mock.calls.length;
    rerender({ text: 'x'.repeat(8001) });
    expect(result.current.messageTooLong).toBe(true);
    expect(result.current.actionDisabled).toBe(true);
    act(() => result.current.send('change'));
    expect(client.sendSolutionConversationTurn).not.toHaveBeenCalled();
    expect(client.solutionConversation).toHaveBeenCalledTimes(reads);
  });
});
