/**
 * FormDialog — unified modal shell (Task Manager "Create Task" pattern).
 * Use for create/edit/view popups; pass children as body content only.
 */
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  IconButton,
  Button,
  CircularProgress,
  Stack,
  useTheme,
  alpha,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import {
  FORM_DIALOG_PAPER_SX,
  FORM_DIALOG_CONTENT_SX,
  FORM_DIALOG_FOOTER_SX,
} from './formDialogStyles';

import AppIcon from '../icons/AppIcon';

export { FORM_FIELD_SX, FORM_LABEL_PROPS, FORM_INPUT_FONT } from './formDialogStyles';

const ICON_VARIANT_MAP = {
  primary: 'primary',
  success: 'success',
  info: 'info',
  warning: 'warning',
  error: 'error',
};

/**
 * Bordered block with header row (Assign Agent / Attachments pattern).
 */
export function FormDialogSection({
  title,
  icon: Icon,
  action,
  children,
  borderColor,
  spacing = 2,
}) {
  const theme = useTheme();
  const bc = borderColor || alpha(theme.palette.primary.main, 0.15);
  return (
    <Box sx={{ borderRadius: 2, border: '1px solid', borderColor: bc, overflow: 'hidden' }}>
      {(title || Icon) && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 2,
            py: 1.25,
            bgcolor: alpha(theme.palette.primary.main, 0.04),
            borderBottom: '1px solid',
            borderColor: alpha(theme.palette.primary.main, 0.1),
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {Icon && <Icon sx={{ fontSize: 18, color: 'primary.main' }} />}
            {title && (
              <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.8125rem' }}>
                {title}
              </Typography>
            )}
          </Box>
          {action}
        </Box>
      )}
      <Box sx={{ px: 2, py: 1.5 }}>
        {spacing ? <Stack spacing={spacing}>{children}</Stack> : children}
      </Box>
    </Box>
  );
}

export default function FormDialog({
  open,
  onClose,
  title,
  subtitle,
  icon: Icon,
  headerIcon,
  iconVariant = 'primary',
  titleAdornment,
  maxWidth = 'sm',
  fullWidth = true,
  children,
  actions,
  cancelLabel = 'Cancel',
  onCancel,
  primaryLabel,
  onPrimary,
  primaryDisabled = false,
  primaryLoading = false,
  hideCancel = false,
  hideFooter = false,
  footerJustify = 'flex-end',
  footerLeft = null,
  formId,
  component,
  onSubmit,
  noValidate = true,
  contentDividers = true,
  contentSx,
  paperSx,
  fullScreen = false,
  disableEscapeKeyDown,
  contentRef,
}) {
  const theme = useTheme();
  const paletteKey = ICON_VARIANT_MAP[iconVariant] || 'primary';
  const handleCancel = onCancel || onClose;

  const defaultActions = (
    <>
      {footerLeft}
      <Box sx={{ flex: footerJustify === 'space-between' ? 1 : 0 }} />
      {!hideCancel && (
        <Button
          onClick={handleCancel}
          sx={{
            fontSize: '0.875rem',
            fontWeight: 600,
            color: 'text.secondary',
            textTransform: 'none',
          }}
        >
          {cancelLabel}
        </Button>
      )}
      {primaryLabel && (onPrimary || formId) && (
        <Button
          type={formId ? 'submit' : 'button'}
          form={formId || undefined}
          variant="contained"
          disableElevation
          disabled={primaryDisabled || primaryLoading}
          onClick={formId ? undefined : onPrimary}
          startIcon={primaryLoading ? <CircularProgress size={16} color="inherit" /> : null}
          sx={{
            fontSize: '0.875rem',
            fontWeight: 600,
            px: 3,
            py: 1,
            borderRadius: 2,
            textTransform: 'none',
          }}
        >
          {primaryLoading ? 'Saving…' : primaryLabel}
        </Button>
      )}
    </>
  );

  const isForm = component === 'form' || formId || onSubmit;
  const ContentTag = isForm ? 'form' : 'div';
  const contentProps = isForm
    ? {
        id: formId,
        noValidate,
        onSubmit: (e) => {
          e.preventDefault();
          onSubmit?.(e);
        },
      }
    : {};

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={maxWidth}
      fullWidth={fullWidth}
      fullScreen={fullScreen}
      disableEscapeKeyDown={disableEscapeKeyDown}
      PaperProps={fullScreen ? undefined : { sx: { ...FORM_DIALOG_PAPER_SX, ...paperSx } }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          py: 2.25,
          px: 3,
          bgcolor: alpha(theme.palette.primary.main, 0.06),
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0, flex: 1 }}>
          {headerIcon ||
            (Icon && (
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: 2,
                  flexShrink: 0,
                  bgcolor: alpha(theme.palette[paletteKey].main, 0.12),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: `${paletteKey}.main`,
                }}
              >
                <Icon sx={{ fontSize: 22 }} />
              </Box>
            ))}
          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 700,
                fontSize: '1.125rem',
                letterSpacing: '-0.01em',
                color: 'text.primary',
              }}
            >
              {title}
            </Typography>
            {subtitle && (
              <Typography
                variant="caption"
                sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}
              >
                {subtitle}
              </Typography>
            )}
          </Box>
          {titleAdornment}
        </Box>
        <IconButton
          size="small"
          onClick={onClose}
          sx={{ color: 'text.secondary', flexShrink: 0 }}
          aria-label="Close"
        >
          <AppIcon name="Close" fallback={CloseIcon} />
        </IconButton>
      </DialogTitle>
      <DialogContent
        ref={contentRef}
        dividers={contentDividers}
        component={ContentTag}
        {...contentProps}
        sx={{ ...FORM_DIALOG_CONTENT_SX, ...contentSx }}
      >
        {children}
      </DialogContent>
      {!hideFooter && (
        <DialogActions sx={{ ...FORM_DIALOG_FOOTER_SX, justifyContent: footerJustify }}>
          {actions !== undefined ? actions : defaultActions}
        </DialogActions>
      )}
    </Dialog>
  );
}
