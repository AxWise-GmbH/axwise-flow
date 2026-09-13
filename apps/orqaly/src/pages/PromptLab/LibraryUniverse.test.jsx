import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { createTheme, ThemeProvider } from '@mui/material';

const mocks = vi.hoisted(() => ({
  listOrganizations: vi.fn(),
  listLibraryEntries: vi.fn(),
  countByDeliverableType: vi.fn(),
  deleteLibraryEntry: vi.fn(),
}));

vi.mock('../../services/organizationService', () => ({
  listOrganizations: mocks.listOrganizations,
}));
vi.mock('../../services/libraryUniverseService', () => ({
  listLibraryEntries: mocks.listLibraryEntries,
  countByDeliverableType: mocks.countByDeliverableType,
  deleteLibraryEntry: mocks.deleteLibraryEntry,
}));
vi.mock('./CalibrationWizard', () => ({
  default: ({ open, organizationId, organizationName }) => (
    <div
      data-testid="calibration-wizard-scope"
      data-open={String(open)}
      data-organization-id={organizationId || ''}
    >
      {organizationName}
    </div>
  ),
}));

import LibraryUniverse, { pickCalibrationOrganizationId } from './LibraryUniverse';

const theme = createTheme();

describe('LibraryUniverse calibration organization selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/prompt-lab');
    mocks.listLibraryEntries.mockResolvedValue([]);
    mocks.countByDeliverableType.mockResolvedValue({});
    mocks.listOrganizations.mockResolvedValue([]);
  });

  it('matches the server default: requested scope, then Traktor, then oldest active org', () => {
    const organizations = [
      { id: 'new', name: 'New Co', is_active: true, created_at: '2026-02-01T00:00:00Z' },
      { id: 'old', name: 'Old Co', is_active: true, created_at: '2025-01-01T00:00:00Z' },
      { id: 'traktor', name: 'Traktor', is_active: true, created_at: '2026-03-01T00:00:00Z' },
      { id: 'inactive', name: 'Traktor', is_active: false, created_at: '2024-01-01T00:00:00Z' },
    ];

    expect(pickCalibrationOrganizationId(organizations, 'new')).toBe('new');
    expect(pickCalibrationOrganizationId(organizations, 'foreign')).toBe('traktor');
    expect(pickCalibrationOrganizationId(organizations.filter((org) => org.id !== 'traktor'))).toBe(
      'old'
    );
    expect(pickCalibrationOrganizationId([])).toBe('');
  });

  it('passes the default active organization into the wizard instead of personal scope', async () => {
    mocks.listOrganizations.mockResolvedValue([
      { id: 'new', name: 'New Co', is_active: true, created_at: '2026-02-01T00:00:00Z' },
      { id: 'traktor', name: 'Traktor', is_active: true, created_at: '2026-03-01T00:00:00Z' },
    ]);

    render(
      <ThemeProvider theme={theme}>
        <LibraryUniverse />
      </ThemeProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId('calibration-wizard-scope')).toHaveAttribute(
        'data-organization-id',
        'traktor'
      )
    );
    expect(screen.getByTestId('calibration-wizard-scope')).toHaveTextContent('Traktor');
    expect(screen.getByRole('button', { name: 'Run calibration' })).toBeEnabled();
  });
});
