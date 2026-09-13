import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const svc = vi.hoisted(() => ({
  listEntityTypes: vi.fn(),
  listEntities: vi.fn(),
  createEntity: vi.fn(),
  updateEntity: vi.fn(),
  deleteEntity: vi.fn(),
  transformEntity: vi.fn(),
  upsertEntityType: vi.fn(),
}));
vi.mock('../../services/partnerEntityService', () => svc);

// PageLayout pulls PageExplain → keep it inert for the test.
vi.mock('../../components/Common/PageExplain', () => ({ default: () => null }));

import PartnersHub from './PartnersHub';

const TYPES = [
  { type_key: 'partner', label: 'Partners', color: '#0EA5E9', description: 'p', fields: [], filters: [], metrics: [{ key: 'count', label: 'Partners', format: 'number', value: 0 }] },
  { type_key: 'supplier', label: 'Suppliers', color: '#F59E0B', description: 's', fields: [], filters: [], metrics: [] },
];

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/partners-hub/:section" element={<PartnersHub />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  svc.listEntityTypes.mockReset().mockResolvedValue(TYPES);
  svc.listEntities.mockReset().mockResolvedValue({ rows: [], total: 0, metrics: [] });
});

describe('PartnersHub', () => {
  it('routes a type_key section to that type list', async () => {
    renderAt('/partners-hub/partner');
    await waitFor(() => expect(svc.listEntityTypes).toHaveBeenCalled());
    expect(await screen.findByText('Partners')).toBeInTheDocument();
    await waitFor(() => expect(svc.listEntities).toHaveBeenCalledWith('partner', expect.any(Object)));
  });

  it('renders the overview rollup with a card per type', async () => {
    renderAt('/partners-hub/overview');
    expect(await screen.findByText('Partners Overview')).toBeInTheDocument();
    expect(await screen.findByText('Suppliers')).toBeInTheDocument();
  });
});
