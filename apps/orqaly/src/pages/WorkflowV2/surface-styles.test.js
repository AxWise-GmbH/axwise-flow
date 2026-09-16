import { createTheme } from '@mui/material';
import { describe, expect, it } from 'vitest';
import {
  workflowCatalogTileSx,
  workflowComposerCardSx,
  workflowConversationBubbleSx,
  workflowLoginShellSx,
  workflowProjectionToolbarSx,
} from './surface-styles.js';

describe('Workflow v2 isolated surface styles', () => {
  it('keeps the light composer flat and assistant messages quiet', () => {
    const theme = createTheme();

    expect(workflowComposerCardSx(theme)).toMatchObject({
      bgcolor: theme.palette.background.paper,
      borderColor: theme.palette.divider,
      boxShadow: 'none',
    });
    expect(workflowConversationBubbleSx(theme)).toMatchObject({
      borderColor: theme.palette.divider,
    });
  });

  it('keeps catalog and login surfaces within the isolated flat token set', () => {
    const theme = createTheme();

    expect(workflowCatalogTileSx(theme)).toMatchObject({
      borderColor: theme.palette.divider,
      borderRadius: 1,
      boxShadow: 'none',
    });
    expect(workflowLoginShellSx(theme)).toMatchObject({
      minHeight: '100vh',
      bgcolor: theme.palette.background.default,
    });
  });

  it('uses a distinct plan-bound user bubble in both palette modes', () => {
    const light = createTheme();
    const dark = createTheme({ palette: { mode: 'dark' } });

    expect(workflowConversationBubbleSx(light, { user: true }).bgcolor).not.toBe(
      workflowConversationBubbleSx(light).bgcolor
    );
    expect(workflowConversationBubbleSx(dark, { user: true }).bgcolor).not.toBe(
      workflowConversationBubbleSx(dark).bgcolor
    );
  });

  it('reserves the responsive shell menu hit target only for embedded Goals', () => {
    expect(workflowProjectionToolbarSx({ embedded: true })).toMatchObject({
      flexWrap: 'wrap',
      pl: { xs: 6, md: 0 },
    });
    expect(workflowProjectionToolbarSx()).toEqual({ flexWrap: 'wrap' });
  });
});
