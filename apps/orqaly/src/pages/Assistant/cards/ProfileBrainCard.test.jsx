import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import ProfileBrainCard from './ProfileBrainCard';

const brain = { provider: 'openai', model: 'gpt-4o', tone: 'professional', creativity: 50 };

describe('ProfileBrainCard', () => {
  it('renders the animated pulse (no brain illustration, no embedded activity chart)', () => {
    render(<ProfileBrainCard brain={brain} onEdit={() => {}} onChange={() => {}} />);
    expect(screen.getByTestId('profile-pulse')).toBeInTheDocument();
    // The brain Lottie was replaced by the pulse...
    expect(screen.queryByLabelText(/ai brain filling with data/i)).not.toBeInTheDocument();
    // ...and the activity chart lives in its own full-width block, not in this card.
    expect(screen.queryByTestId('assistant-activity')).not.toBeInTheDocument();
  });
});
