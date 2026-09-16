const SUPPORTED = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/csv': 'csv',
};

const MAX_SIZE_BYTES = 10 * 1024 * 1024;

export function getSupportedAttachmentTypes() {
  return { ...SUPPORTED };
}

export function validateChatAttachment(file) {
  if (!file) {
    return { ok: false, error: 'No file selected.' };
  }
  const name = String(file.name || '').trim();
  const type = String(file.type || '')
    .trim()
    .toLowerCase();
  const size = Number(file.size || 0);
  const normalizedType = SUPPORTED[type];
  if (!normalizedType) {
    return { ok: false, error: 'Unsupported file type. Allowed: PDF, DOCX, CSV.' };
  }
  if (size <= 0) {
    return { ok: false, error: 'File appears to be empty.' };
  }
  if (size > MAX_SIZE_BYTES) {
    return { ok: false, error: 'File is too large. Max supported size is 10MB.' };
  }
  return {
    ok: true,
    file: {
      name: name || 'attachment',
      mimeType: type,
      kind: normalizedType,
      size,
    },
  };
}
