import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const svc = vi.hoisted(() => ({
  listEntities: vi.fn(),
  createEntity: vi.fn(),
  updateEntity: vi.fn(),
  deleteEntity: vi.fn(),
  transformEntity: vi.fn(),
}));
vi.mock('../../../services/partnerEntityService', () => svc);

import EntityListPage from './EntityListPage';

const type = {
  type_key: 'partner',
  label: 'Partners',
  color: '#0EA5E9',
  icon: 'HandshakeOutlined',
  fields: [
    { key: 'category', label: 'Category', type: 'select', options: ['Webmaster'], showInTable: true },
    { key: 'revenue', label: 'Revenue', type: 'currency', showInTable: true },
  ],
  filters: [{ key: 'category', label: 'Category', field: 'category', kind: 'select' }],
  metrics: [{ key: 'revenue', label: 'Revenue', helper: 'Total generated', agg: 'sum', field: 'revenue', format: 'currency' }],
};

beforeEach(() => {
  localStorage.setItem('orch_partnersHub_partner_view', 'list'); // deterministic: table view
  svc.listEntities.mockReset().mockResolvedValue({
    rows: [{ id: 'e1', name: 'AceMedia', data: { category: 'Webmaster', revenue: 48200 } }],
    total: 1,
    metrics: [{ key: 'revenue', label: 'Revenue', value: 48200, format: 'currency', helper: 'Total generated' }],
  });
});

describe('EntityListPage', () => {
  it('loads rows for the type and renders config-driven columns + formatted cells (list view)', async () => {
    render(<EntityListPage type={type} allTypes={[type]} />);
    await waitFor(() => expect(svc.listEntities).toHaveBeenCalledWith('partner', expect.any(Object)));
    expect(await screen.findByText('AceMedia')).toBeInTheDocument();
    // $48,200 appears as both the metric value and the table cell — both are the real data.
    expect(screen.getAllByText('$48,200').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Webmaster')).toBeInTheDocument(); // cell value
    expect(screen.getByRole('columnheader', { name: 'Category' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Revenue' })).toBeInTheDocument();
  });

  it('renders a stat card (with helper) from the type metrics', async () => {
    render(<EntityListPage type={type} allTypes={[type]} />);
    // helper text is unique to the metric card (not the BentoCard title)
    expect(await screen.findByText('Total generated')).toBeInTheDocument();
  });
});
