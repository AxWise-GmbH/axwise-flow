import { alpha } from '@mui/material';

// The isolated v2 app intentionally carries only the small, flat subset of the
// current Orqaly visual language that its workflow surfaces need. It does not
// import the legacy application theme or its persisted view-mode machinery.

function isLight(theme) {
  return theme?.palette?.mode !== 'dark';
}

export function workflowComposerCardSx(theme) {
  if (!isLight(theme)) {
    return {
      bgcolor: theme.palette.background.paper,
      border: '1px solid',
      borderColor: alpha('#fff', 0.12),
      boxShadow: 'none',
    };
  }
  return {
    bgcolor: theme.palette.background.paper,
    border: '1px solid',
    borderColor: theme.palette.divider,
    boxShadow: 'none',
  };
}

export function workflowConversationBubbleSx(theme, { user = false } = {}) {
  if (user) {
    return {
      bgcolor: alpha(theme.palette.text.primary, isLight(theme) ? 0.08 : 0.12),
      border: '1px solid',
      borderColor: alpha(theme.palette.text.primary, isLight(theme) ? 0.18 : 0.14),
    };
  }
  if (!isLight(theme)) {
    return {
      bgcolor: alpha('#fff', 0.05),
      border: '1px solid',
      borderColor: alpha('#fff', 0.08),
    };
  }
  return {
    bgcolor: theme.palette.background.paper,
    border: '1px solid',
    borderColor: theme.palette.divider,
  };
}

export function workflowCatalogTileSx(theme) {
  return {
    border: '1px solid',
    borderColor: theme.palette.divider,
    borderRadius: 1,
    bgcolor: alpha(theme.palette.background.paper, isLight(theme) ? 0.86 : 0.64),
    boxShadow: 'none',
    p: 1.5,
  };
}

export function workflowLoginShellSx(theme) {
  return {
    minHeight: '100vh',
    display: 'grid',
    gridTemplateColumns: { xs: '1fr', md: 'minmax(260px, 0.8fr) minmax(360px, 1.2fr)' },
    bgcolor: theme.palette.background.default,
  };
}

export function workflowProjectionToolbarSx({ embedded = false } = {}) {
  return {
    flexWrap: 'wrap',
    // The responsive GCP shell owns a 42px fixed menu button at left: 12px.
    // Container padding plus this 48px inset keeps the Goal mode controls
    // outside that hit target until the permanent navigation appears at md.
    ...(embedded ? { pl: { xs: 6, md: 0 } } : {}),
  };
}
