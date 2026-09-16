import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import KBCategoryCard from './KBCategoryCard';

const theme = createTheme();
const doc = {
  id: '1',
  title: 'Agent Work: Build & Deploy RoyalFlare Casino',
  category: 'agent-work',
  content_type: 'note',
  content: 'Some body text describing the agent work output in detail.',
  source: 'manual',
  tags: ['agent', 'work-memory', 'task-output'],
  metadata: { agent_name: 'Frontend Developer', agent_role: 'frontend' },
  created_at: new Date(Date.now() - 8 * 3600 * 1000).toISOString(),
};

const renderCard = (props) =>
  render(
    <ThemeProvider theme={theme}>
      <KBCategoryCard doc={doc} {...props} />
    </ThemeProvider>
  );

describe('KBCategoryCard', () => {
  it('renders the title, a tag and the note snippet', () => {
    renderCard({});
    expect(screen.getByText(/Agent Work/)).toBeTruthy();
    expect(screen.getByText('#agent')).toBeTruthy();
    expect(screen.getByText(/body text describing/)).toBeTruthy();
  });

  it('fires onView when the card is clicked', () => {
    const onView = vi.fn();
    renderCard({ onView });
    fireEvent.click(screen.getByText(/Agent Work/));
    expect(onView).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }));
  });

  it('fires onDelete from the action button without triggering onView', () => {
    const onView = vi.fn();
    const onDelete = vi.fn();
    renderCard({ onView, onDelete });
    fireEvent.click(screen.getByRole('button')); // only the delete action is passed
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }));
    expect(onView).not.toHaveBeenCalled();
  });
});
