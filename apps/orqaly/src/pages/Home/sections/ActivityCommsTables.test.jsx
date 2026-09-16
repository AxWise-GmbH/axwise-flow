import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import ActivityCommsTables from './ActivityCommsTables';

// Stub the heavy agent dialog so we can assert it opens with the right agent.
vi.mock('../../../components/AgentHub/AgentDetailDialog', () => ({
  default: ({ open, agent }) => (open ? <div>agent-dialog:{agent?.name}</div> : null),
}));

// Recharts ResponsiveContainer needs a sized box in jsdom.
vi.mock('recharts', async (orig) => {
  const actual = await orig();
  return { ...actual, ResponsiveContainer: ({ children }) => <div>{children}</div> };
});

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const theme = createTheme();
const Wrap = ({ children }) => <ThemeProvider theme={theme}>{children}</ThemeProvider>;

const chat = {
  total: 2,
  messages: [
    {
      id: 'm1',
      sender: 'Support Agent',
      agentId: 'a1',
      category: 'Organization',
      contextLabel: 'Acme Holding',
      content: 'Resolved 32 live chats.',
      time: '2 min ago',
      datetime: '27/06/26 - 14:23',
      reviewHref: '/communicator?view=workspace&section=organizations',
    },
    {
      id: 'm2',
      sender: 'System',
      agentId: null,
      category: 'Team Lead',
      contextLabel: 'CX Pod',
      content: 'Drafted macros.',
      time: '5 min ago',
      datetime: '27/06/26 - 14:20',
      reviewHref: '/communicator?view=workspace&section=activity',
    },
  ],
};
const activity = { rows: [], spark: [] };

describe('ActivityCommsTables chat', () => {
  it('renders the category chip and the date/time', () => {
    render(
      <Wrap>
        <ActivityCommsTables activity={activity} chat={chat} />
      </Wrap>
    );
    expect(screen.getByText('Organization')).toBeInTheDocument();
    expect(screen.getByText('27/06/26 - 14:23')).toBeInTheDocument();
  });

  it('opens the agent card when an agent with an id is clicked', () => {
    render(
      <Wrap>
        <ActivityCommsTables activity={activity} chat={chat} />
      </Wrap>
    );
    fireEvent.click(screen.getByText('Support Agent'));
    expect(screen.getByText('agent-dialog:Support Agent')).toBeInTheDocument();
  });

  it('does not make a message without an agent id clickable as an agent', () => {
    render(
      <Wrap>
        <ActivityCommsTables activity={activity} chat={chat} />
      </Wrap>
    );
    expect(screen.getByText('System').closest('button')).toBeNull();
  });

  it('opens the Communicator on a single click for a short (untruncated) message', () => {
    const onReviewMessage = vi.fn();
    render(
      <Wrap>
        <ActivityCommsTables activity={activity} chat={chat} onReviewMessage={onReviewMessage} />
      </Wrap>
    );
    fireEvent.click(screen.getByText('Resolved 32 live chats.'));
    expect(onReviewMessage).toHaveBeenCalledWith(
      '/communicator?view=workspace&section=organizations'
    );
  });

  it('clips a long message to 50 chars + ..., expands on click, then opens the Communicator', () => {
    const onReviewMessage = vi.fn();
    const longText =
      'Phase 1 Design Research and Specification PASSED with quality 72 of 100; covers both brands.';
    const longChat = {
      total: 1,
      messages: [
        {
          id: 'mlong',
          sender: 'Consilium',
          agentId: null,
          category: 'Consilium',
          content: longText,
          datetime: '20/05/26 - 21:20:34',
          reviewHref: '/communicator?goal=g1',
        },
      ],
    };
    render(
      <Wrap>
        <ActivityCommsTables
          activity={activity}
          chat={longChat}
          onReviewMessage={onReviewMessage}
        />
      </Wrap>
    );
    const clipped = `${longText.slice(0, 50)}...`;
    expect(screen.getByText(clipped)).toBeInTheDocument();
    expect(screen.queryByText(longText)).not.toBeInTheDocument();
    // First click expands in place and reveals the open affordance; no navigation yet.
    fireEvent.click(screen.getByText(clipped));
    expect(screen.getByText(longText)).toBeInTheDocument();
    expect(screen.getByText('Open in Communicator')).toBeInTheDocument();
    expect(onReviewMessage).not.toHaveBeenCalled();
    // Second click opens the Communicator.
    fireEvent.click(screen.getByText(longText));
    expect(onReviewMessage).toHaveBeenCalledWith('/communicator?goal=g1');
  });

  it('toggles the Activity feed between Agents and Human actions', () => {
    const activityData = {
      spark: [1, 2, 3],
      rows: [
        {
          instrument: 'Workflow',
          action: 'create',
          personaName: 'Backend Developer',
          personaPosition: 'Dev',
          personaKind: 'Agent',
          agentId: 'a1',
          date: '26.06\n10:00:00',
        },
        {
          instrument: 'Organizations',
          action: 'write',
          personaName: 'owner@example.com',
          personaPosition: '',
          personaKind: 'User',
          agentId: '',
          date: '26.06\n09:00:00',
        },
      ],
    };
    render(
      <Wrap>
        <ActivityCommsTables
          activity={activityData}
          chat={{ messages: [] }}
          onPersonaClick={() => {}}
        />
      </Wrap>
    );
    // Default = Agents: persona is the agent Name/Role (clickable), not an email.
    expect(screen.getByRole('button', { name: /Backend Developer/i })).toBeInTheDocument();
    expect(screen.getByText('Workflow')).toBeInTheDocument();
    expect(screen.queryByText('owner@example.com')).not.toBeInTheDocument();
    expect(screen.queryByText('Organizations')).not.toBeInTheDocument();
    // Switch to Human: persona is the account email, not an agent.
    fireEvent.click(screen.getByRole('button', { name: /Human/i }));
    expect(screen.getByText('owner@example.com')).toBeInTheDocument();
    expect(screen.getByText('Organizations')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Backend Developer/i })).not.toBeInTheDocument();
  });
});
