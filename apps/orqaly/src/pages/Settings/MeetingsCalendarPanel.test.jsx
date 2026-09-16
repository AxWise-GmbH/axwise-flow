import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import MeetingsCalendarPanel from './MeetingsCalendarPanel';

vi.mock('../../hooks/usePartners', () => ({
  usePartners: () => ({ partners: [] }),
}));

vi.mock('../../services/meetingService', () => ({
  meetingService: {
    getAll: vi.fn(async () => []),
    createPlanned: vi.fn(async () => ({})),
    clearAll: vi.fn(async () => {}),
  },
  MEETING_CHANNELS: ['Zoom', 'Other'],
}));

const theme = createTheme();

function Wrap({ children }) {
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MeetingsCalendarPanel', () => {
  it('renders month navigation, the Book button and footer counters', async () => {
    render(
      <Wrap>
        <MeetingsCalendarPanel embedded />
      </Wrap>
    );
    expect(await screen.findByRole('button', { name: /previous month/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /next month/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Book' })).toBeTruthy();
    expect(screen.getByText(/Partners: 0/)).toBeTruthy();
    expect(screen.getByText(/Public meetings: 0/)).toBeTruthy();
    expect(screen.getByText('Other: 0')).toBeTruthy();
  });

  it('loads meetings on mount', async () => {
    const { meetingService } = await import('../../services/meetingService');
    render(
      <Wrap>
        <MeetingsCalendarPanel />
      </Wrap>
    );
    await waitFor(() => expect(meetingService.getAll).toHaveBeenCalled());
  });

  it('switches to the Table view', async () => {
    render(
      <Wrap>
        <MeetingsCalendarPanel />
      </Wrap>
    );
    await screen.findByRole('button', { name: /previous month/i });
    fireEvent.click(screen.getByRole('tab', { name: /table/i }));
    expect(await screen.findByText(/No meetings found/i)).toBeTruthy();
  });

  it('opens the Book form dialog from the Book button', async () => {
    render(
      <Wrap>
        <MeetingsCalendarPanel embedded />
      </Wrap>
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Book' }));
    expect(await screen.findByText('Book new meeting')).toBeTruthy();
  });
});
