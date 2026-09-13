import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ConversationHistoryCard from './ConversationHistoryCard';

const conversations = [
  {
    id: 't1',
    platform: 'telegram',
    between: 'Assistant & Orqaly',
    lastMessage: 'Hey, can you check the report?',
    date: new Date().toISOString(),
  },
  {
    id: 't2',
    platform: 'web',
    between: 'Jane Doe',
    lastMessage: 'Following up on the proposal',
    date: new Date().toISOString(),
  },
];

describe('ConversationHistoryCard', () => {
  it('renders conversations as a simple list, with no table or dropdown filters', () => {
    render(<ConversationHistoryCard conversations={conversations} onViewAll={() => {}} />);
    expect(screen.getByText('Assistant & Orqaly')).toBeInTheDocument();
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('shows an empty state when there are no conversations', () => {
    render(<ConversationHistoryCard conversations={[]} onViewAll={() => {}} />);
    expect(screen.getByText('No conversations yet')).toBeInTheDocument();
  });
});
