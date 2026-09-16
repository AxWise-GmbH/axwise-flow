import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ContactsCard from './ContactsCard';

const contacts = { total: 3, mail: 2, phone: 1, list: [] };

describe('ContactsCard', () => {
  it('labels the total count "Unique", not "Total unique"', () => {
    render(<ContactsCard contacts={contacts} organizations={[]} onEdit={() => {}} onAdd={() => {}} />);
    expect(screen.getByText('Unique')).toBeInTheDocument();
    expect(screen.queryByText('Total unique')).not.toBeInTheDocument();
  });
});
