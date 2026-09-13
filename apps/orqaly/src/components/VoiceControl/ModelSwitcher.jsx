/**
 * ModelSwitcher — compact in-chat LLM provider/model picker for the input bar.
 * Reuses src/config/assistantBrain.js as the source of providers + models.
 */
import { useState } from 'react';
import { Box, Chip, Menu, MenuItem, Typography, useTheme } from '@mui/material';
import {
  PROVIDERS,
  modelsForProvider,
  providerLabel,
  shortModelLabel,
} from '../../config/assistantBrain';
import {
  composerChipSx,
  composerInk,
  composerSurfaceTone,
  withComposerSurfaceTone,
} from '../../theme/composerSurface';

export default function ModelSwitcher({ provider, model, onChange, surfaceTone = 'auto' }) {
  const ambientTheme = useTheme();
  const theme = withComposerSurfaceTone(ambientTheme, surfaceTone);
  const isLight = composerSurfaceTone(theme) === 'light';
  const [anchor, setAnchor] = useState(null);
  const open = Boolean(anchor);

  const currentModel = model || modelsForProvider(provider)?.[0] || '';
  const label = currentModel ? shortModelLabel(currentModel) : providerLabel(provider) || 'Model';

  const handlePick = (p, m) => {
    onChange?.({ provider: p, model: m });
    setAnchor(null);
  };

  return (
    <>
      <Chip
        label={label}
        size="small"
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{
          height: 26,
          maxWidth: 150,
          '& .MuiChip-label': { fontSize: '0.68rem', px: 0.75 },
          ...composerChipSx(theme, { variant: 'model' }),
        }}
      />
      <Menu
        anchorEl={anchor}
        open={open}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: isLight
              ? { maxHeight: 360 }
              : { maxHeight: 360, bgcolor: '#141414', color: '#fff' },
          },
        }}
      >
        {PROVIDERS.flatMap((p) =>
          (p.models || []).map((m) => (
            <MenuItem
              key={`${p.id}-${m}`}
              selected={p.id === provider && m === currentModel}
              onClick={() => handlePick(p.id, m)}
              sx={{ py: 0.75 }}
            >
              <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                  {p.label}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    fontSize: '0.7rem',
                    color: composerInk(theme, { muted: true }),
                  }}
                >
                  ({m})
                </Typography>
              </Box>
            </MenuItem>
          ))
        )}
      </Menu>
    </>
  );
}
