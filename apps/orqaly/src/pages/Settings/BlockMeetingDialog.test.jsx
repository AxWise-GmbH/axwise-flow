import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import BlockMeetingDialog from './BlockMeetingDialog';

vi.mock('../../hooks/usePartners', () => ({
  usePartners: () => ({ partners: [] }),
}));

vi.mock('../../services/meetingService', () => ({
  meetingService: { getAll: vi.fn(async () => []) },
  MEETING_CHANNELS: ['Zoom', 'Other'],
}));

const theme = createTheme();

function Wrap({ children }) {
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BlockMeetingDialog', () => {
  it('mounts closed without ReferenceError (IconButton import)', () => {
    expect(() =>
      render(
        <Wrap>
          <BlockMeetingDialog open={false} onClose={() => {}} />
        </Wrap>
      )
    ).not.toThrow();
  });

  it('renders calendar navigation when open', async () => {
    render(
      <Wrap>
        <BlockMeetingDialog open onClose={() => {}} />
      </Wrap>
    );
    expect(await screen.findByText('Meetings')).toBeTruthy();
    expect(screen.getByRole('button', { name: /previous month/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /next month/i })).toBeTruthy();
  });
});
