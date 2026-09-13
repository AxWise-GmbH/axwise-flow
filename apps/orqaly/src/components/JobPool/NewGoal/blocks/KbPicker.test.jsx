import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../services/knowledgeBaseService', () => ({
  listDocuments: vi.fn(),
}));

import KbPicker from './KbPicker';
import { listDocuments } from '../../../../services/knowledgeBaseService';

const rows = [
  { id: 'doc-1', title: 'Competitor pricing scan', category: 'business' },
  { id: 'doc-2', title: 'Brand voice guide', category: 'general' },
];

beforeEach(() => {
  vi.clearAllMocks();
  listDocuments.mockResolvedValue(rows);
});

describe('KbPicker', () => {
  it('lists the user documents on open', async () => {
    render(<KbPicker selectedIds={[]} onToggle={() => {}} remainingSlots={20} />);

    expect(await screen.findByText('Competitor pricing scan')).toBeInTheDocument();
    expect(screen.getByText('Brand voice guide')).toBeInTheDocument();
  });

  it('filters by category group using the server-side grouping', async () => {
    render(<KbPicker selectedIds={[]} onToggle={() => {}} remainingSlots={20} />);
    await screen.findByText('Competitor pricing scan');

    fireEvent.click(screen.getByRole('button', { name: 'Goals' }));

    await waitFor(() =>
      expect(listDocuments).toHaveBeenCalledWith(
        expect.objectContaining({ category_group: 'Goals' })
      )
    );
  });

  it('does not scope the query by organization', async () => {
    // The list endpoint matches organization_id exactly and cannot express
    // "this org OR unscoped", so filtering here would hide personal documents.
    render(<KbPicker selectedIds={[]} onToggle={() => {}} remainingSlots={20} />);
    await screen.findByText('Competitor pricing scan');

    expect(listDocuments).toHaveBeenCalledWith(
      expect.not.objectContaining({ organization_id: expect.anything() })
    );
  });

  it('reports the picked document to the parent', async () => {
    const onToggle = vi.fn();
    render(<KbPicker selectedIds={[]} onToggle={onToggle} remainingSlots={20} />);
    await screen.findByText('Competitor pricing scan');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Competitor pricing scan' }));

    expect(onToggle).toHaveBeenCalledWith(rows[0]);
  });

  it('shows an already-picked document as checked', async () => {
    render(<KbPicker selectedIds={['doc-1']} onToggle={() => {}} remainingSlots={19} />);
    await screen.findByText('Competitor pricing scan');

    expect(screen.getByRole('checkbox', { name: 'Select Competitor pricing scan' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select Brand voice guide' })).not.toBeChecked();
  });

  it('counts down the shared evidence budget', async () => {
    render(<KbPicker selectedIds={[]} onToggle={() => {}} remainingSlots={17} />);
    await screen.findByText('Competitor pricing scan');

    expect(screen.getByText('17 slots left')).toBeInTheDocument();
  });

  it('uses the singular when one slot is left', async () => {
    render(<KbPicker selectedIds={[]} onToggle={() => {}} remainingSlots={1} />);
    await screen.findByText('Competitor pricing scan');

    expect(screen.getByText('1 slot left')).toBeInTheDocument();
  });

  it('blocks new picks at capacity but keeps existing ones removable', async () => {
    render(<KbPicker selectedIds={['doc-1']} onToggle={() => {}} remainingSlots={0} />);
    await screen.findByText('Competitor pricing scan');

    expect(screen.getByRole('checkbox', { name: 'Select Brand voice guide' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Select Competitor pricing scan' })).toBeEnabled();
    expect(screen.getByText('No slots left. Remove something to add another.')).toBeInTheDocument();
  });

  it('surfaces a load failure instead of showing a silent empty list', async () => {
    listDocuments.mockRejectedValue(new Error('network down'));
    render(<KbPicker selectedIds={[]} onToggle={() => {}} remainingSlots={20} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('network down');
  });

  it('tells the user where to go when the knowledge base is empty', async () => {
    listDocuments.mockResolvedValue([]);
    render(<KbPicker selectedIds={[]} onToggle={() => {}} remainingSlots={20} />);

    expect(await screen.findByText(/knowledge base is empty/)).toBeInTheDocument();
  });
});
