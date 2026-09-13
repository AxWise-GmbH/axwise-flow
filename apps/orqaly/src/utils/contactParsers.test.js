import { describe, it, expect } from 'vitest';
import { parseContacts } from './contactParsers';

describe('parseContacts', () => {
  it('returns empty for blank input', () => {
    expect(parseContacts('')).toEqual({ contacts: [], format: null });
    expect(parseContacts('   ')).toEqual({ contacts: [], format: null });
  });

  it('parses a vCard block', () => {
    const vcf = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:John Doe',
      'EMAIL:john@example.com',
      'TEL:+12345678',
      'NOTE:Investor',
      'END:VCARD',
    ].join('\n');
    const { contacts, format } = parseContacts(vcf);
    expect(format).toBe('vcard');
    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toMatchObject({
      name: 'John Doe',
      email: 'john@example.com',
      phone: '+12345678',
      comment: 'Investor',
    });
  });

  it('parses a headered CSV with attitude', () => {
    const csv = 'Name,Email,Phone,Attitude,Comment\nJane Smith,jane@work.com,+99,vip,Needs demo';
    const { contacts, format } = parseContacts(csv);
    expect(format).toBe('csv');
    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toMatchObject({
      name: 'Jane Smith',
      email: 'jane@work.com',
      phone: '+99',
      attitude: 'vip',
    });
  });

  it('parses a headerless CSV positionally', () => {
    const csv = 'Bob Miller,bob@host.com,+5\nAmy Lee,amy@host.com,';
    const { contacts } = parseContacts(csv);
    expect(contacts).toHaveLength(2);
    expect(contacts[0]).toMatchObject({ name: 'Bob Miller', email: 'bob@host.com', phone: '+5' });
    expect(contacts[1]).toMatchObject({ name: 'Amy Lee', email: 'amy@host.com' });
  });

  it('drops rows without a name', () => {
    const csv = 'Name,Email\n,nameless@x.com\nReal Person,real@x.com';
    const { contacts } = parseContacts(csv);
    expect(contacts).toHaveLength(1);
    expect(contacts[0].name).toBe('Real Person');
  });
});
