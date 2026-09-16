import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

const listDocumentVersions = vi.fn();
vi.mock('../../services/knowledgeBaseService', () => ({
  listDocumentVersions: (...a) => listDocumentVersions(...a),
}));

import KBVersionDiffDialog from './KBVersionDiffDialog';

function Wrap({ children }) {
  return <ThemeProvider theme={createTheme()}>{children}</ThemeProvider>;
}

beforeEach(() => listDocumentVersions.mockReset());

describe('KBVersionDiffDialog', () => {
  it('shows the content diff between the latest version and its predecessor', async () => {
    listDocumentVersions.mockResolvedValue({
      versions: [
        {
          id: 'v2',
          version_no: 2,
          change_type: 'write',
          title: 'Spec',
          content: 'line one\nline two edited',
          created_at: '2026-06-26T10:00:00.000Z',
        },
        {
          id: 'v1',
          version_no: 1,
          change_type: 'create',
          title: 'Spec',
          content: 'line one\nline two',
          created_at: '2026-06-26T09:00:00.000Z',
        },
      ],
    });
    render(
      <Wrap>
        <KBVersionDiffDialog open doc={{ id: 'd1', title: 'Spec' }} onClose={() => {}} />
      </Wrap>
    );

    // Added + removed lines from the diff both render.
    await waitFor(() => expect(screen.getByText('line two edited')).toBeInTheDocument());
    expect(screen.getByText('line two')).toBeInTheDocument();
    expect(listDocumentVersions).toHaveBeenCalledWith('d1');
  });

  it('shows an empty state when there is no version history', async () => {
    listDocumentVersions.mockResolvedValue({ versions: [] });
    render(
      <Wrap>
        <KBVersionDiffDialog open doc={{ id: 'd1', title: 'Spec' }} onClose={() => {}} />
      </Wrap>
    );
    await waitFor(() => expect(screen.getByText(/No version history yet/i)).toBeInTheDocument());
  });
});
