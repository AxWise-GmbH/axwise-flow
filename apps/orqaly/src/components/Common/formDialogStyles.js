/** Shared field styles for FormDialog content (matches Task Manager create forms). */
export const FORM_FIELD_SX = { '& .MuiOutlinedInput-root': { borderRadius: 2 } };
export const FORM_LABEL_PROPS = { shrink: true, sx: { fontSize: '0.8125rem', fontWeight: 600 } };
export const FORM_INPUT_FONT = { fontSize: '0.9375rem' };

export const FORM_DIALOG_PAPER_SX = {
  borderRadius: 3,
  overflow: 'hidden',
  boxShadow: '0 24px 48px rgba(0,0,0,0.12)',
};

export const FORM_DIALOG_CONTENT_SX = { pt: 3.5, px: 3, pb: 3.5 };

export const FORM_DIALOG_FOOTER_SX = {
  px: 3,
  py: 2.25,
  borderTop: '1px solid',
  borderColor: 'divider',
  bgcolor: 'background.default',
  gap: 1.5,
};
