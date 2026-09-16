import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ChannelsCard from './ChannelsCard';

const channels = [{ id: 'tg', platform: 'telegram', handle: '@aurum', status: 'connected' }];

describe('ChannelsCard', () => {
  it('renders the animated channel icons (no embedded activity chart)', () => {
    render(<ChannelsCard channels={channels} onEdit={() => {}} onAddChannel={() => {}} />);
    expect(screen.getByTestId('channels-art')).toBeInTheDocument();
    // The activity chart now lives in its own full-width block, not in this card.
    expect(screen.queryByTestId('assistant-activity')).not.toBeInTheDocument();
  });
});
