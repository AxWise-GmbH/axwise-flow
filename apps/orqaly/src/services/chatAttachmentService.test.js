import { describe, it, expect } from 'vitest';
import { validateChatAttachment } from './chatAttachmentService';

function mkFile({ name, type, size }) {
  return { name, type, size };
}

describe('chatAttachmentService', () => {
  it('accepts PDF, DOCX, and CSV', () => {
    const pdf = validateChatAttachment(
      mkFile({ name: 'doc.pdf', type: 'application/pdf', size: 1200 })
    );
    const docx = validateChatAttachment(
      mkFile({
        name: 'doc.docx',
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size: 1200,
      })
    );
    const csv = validateChatAttachment(mkFile({ name: 'doc.csv', type: 'text/csv', size: 1200 }));
    expect(pdf.ok).toBe(true);
    expect(docx.ok).toBe(true);
    expect(csv.ok).toBe(true);
  });

  it('rejects unsupported type', () => {
    const result = validateChatAttachment(
      mkFile({ name: 'image.png', type: 'image/png', size: 4000 })
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Unsupported/);
  });

  it('rejects oversized file', () => {
    const result = validateChatAttachment(
      mkFile({ name: 'big.pdf', type: 'application/pdf', size: 11 * 1024 * 1024 })
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/too large/i);
  });
});
