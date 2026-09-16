/**
 * Pure contact parsers shared by the Knowledge Base import dialog and the
 * assistant-setup "Add knowledge" card. Auto-detects vCard vs CSV and returns a
 * plain array of contacts - no React state, so it is easy to unit test and
 * reuse. Contact shape: { name, email, phone, attitude, comment }.
 */
const ATTITUDES = new Set(['vip', 'friendly', 'neutral', 'cold_lead', 'hostile']);

const emptyContact = () => ({ name: '', email: '', phone: '', attitude: 'neutral', comment: '' });

/** Parse one or more BEGIN:VCARD ... END:VCARD blocks. */
export function parseVCards(text) {
  const contacts = [];
  for (const card of String(text || '').split('END:VCARD')) {
    if (!card.includes('BEGIN:VCARD')) continue;
    const contact = emptyContact();
    for (let line of card.split('\n')) {
      line = line.trim();
      if (!line) continue;
      if (line.startsWith('FN:')) {
        contact.name = line.substring(3).trim();
      } else if (line.startsWith('FN;') && line.includes(':')) {
        contact.name = line.substring(line.indexOf(':') + 1).trim();
      } else if (!contact.name && (line.startsWith('N:') || line.startsWith('N;'))) {
        const nVal = line.substring(line.indexOf(':') + 1).trim();
        const [last = '', first = '', middle = ''] = nVal.split(';').map((p) => p.trim());
        contact.name = `${first} ${middle} ${last}`.replace(/\s+/g, ' ').trim();
      }
      if (line.startsWith('EMAIL:') || (line.startsWith('EMAIL;') && line.includes(':'))) {
        contact.email = line.substring(line.indexOf(':') + 1).trim();
      }
      if (line.startsWith('TEL:') || (line.startsWith('TEL;') && line.includes(':'))) {
        contact.phone = line.substring(line.indexOf(':') + 1).trim();
      }
      if (line.startsWith('NOTE:') || (line.startsWith('NOTE;') && line.includes(':'))) {
        contact.comment = line.substring(line.indexOf(':') + 1).trim();
      }
    }
    if (contact.name) contacts.push(contact);
  }
  return contacts;
}

/** Parse CSV. Uses a header row when present, otherwise assumes name,email,phone,attitude,comment. */
export function parseContactsCsv(text) {
  const lines = String(text || '').split('\n');
  const contacts = [];
  let header = [];
  let dataLines = [];
  if (lines.length > 0) {
    const firstLine = lines[0].toLowerCase();
    if (
      firstLine.includes('name') ||
      firstLine.includes('email') ||
      firstLine.includes('phone') ||
      firstLine.includes('attitude')
    ) {
      header = lines[0].split(',').map((h) => h.trim().toLowerCase());
      dataLines = lines.slice(1);
    } else {
      header = ['name', 'email', 'phone', 'attitude', 'comment'];
      dataLines = lines;
    }
  }
  for (const raw of dataLines) {
    if (!raw.trim()) continue;
    const parts = raw.split(',').map((p) => p.trim());
    const contact = emptyContact();
    header.forEach((fieldName, index) => {
      const val = parts[index];
      if (val === undefined) return;
      if (fieldName === 'name') contact.name = val;
      else if (fieldName === 'email') contact.email = val;
      else if (fieldName === 'phone') contact.phone = val;
      else if (fieldName === 'comment' || fieldName === 'notes' || fieldName === 'description')
        contact.comment = val;
      else if (fieldName === 'attitude') {
        const a = val.toLowerCase().replace(' ', '_');
        if (ATTITUDES.has(a)) contact.attitude = a;
      }
    });
    if (!header.includes('name') && parts[0]) contact.name = parts[0];
    if (!header.includes('email') && parts[1]) contact.email = parts[1];
    if (!header.includes('phone') && parts[2]) contact.phone = parts[2];
    if (contact.name) contacts.push(contact);
  }
  return contacts;
}

/**
 * Parse pasted/uploaded contact text, auto-detecting the format.
 * @returns {{ contacts: Array, format: 'vcard'|'csv'|null }}
 */
export function parseContacts(text) {
  const t = String(text || '');
  if (!t.trim()) return { contacts: [], format: null };
  if (t.includes('BEGIN:VCARD')) return { contacts: parseVCards(t), format: 'vcard' };
  return { contacts: parseContactsCsv(t), format: 'csv' };
}
