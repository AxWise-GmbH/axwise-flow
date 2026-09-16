import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  Typography,
  Stack,
  Chip,
  IconButton,
  Tooltip,
  useTheme,
  alpha,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import GlassIcon from './../icons/GlassIcon';
import { PROVIDERS } from '../../data/providerCatalog';

import AppIcon from '../icons/AppIcon';

const PROVIDER_BY_ID = PROVIDERS.reduce((acc, p) => {
  acc[p.id] = p;
  return acc;
}, {});

export default function ViewKeysDialog({ open, onClose, keys, onEdit, onDelete }) {
  const theme = useTheme();
  const tint = theme.palette.primary.main;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6" fontWeight={700}>
          Stored Keys
        </Typography>
        <IconButton onClick={onClose} size="small">
          <AppIcon name="Close" fallback={CloseIcon} />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {!keys || keys.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No keys stored.
          </Typography>
        ) : (
          <Stack spacing={1}>
            {keys.map((k) => {
              const prov = PROVIDER_BY_ID[k.provider] || { label: k.provider };
              return (
                <Box
                  key={k.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    p: 1.25,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: 'divider',
                    bgcolor: alpha(tint, 0.03),
                  }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                      {prov.label || k.provider}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {k.maskedPreview || `${k.provider}:${k.slot}`}
                    </Typography>
                  </Box>
                  {k.lastTestOk === true && <Chip size="small" color="success" label="Connected" />}
                  {k.lastTestOk === false && (
                    <Tooltip title={k.lastTestError || 'Last probe failed'}>
                      <Chip size="small" color="error" label="Failed" />
                    </Tooltip>
                  )}
                  <Tooltip title="Replace key">
                    <IconButton
                      size="small"
                      onClick={() => {
                        onEdit(k.provider);
                        onClose();
                      }}
                    >
                      <GlassIcon name="EditOutlined" fallback={EditOutlinedIcon} size={18} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Disconnect">
                    <IconButton size="small" color="error" onClick={() => onDelete(k.id)}>
                      <GlassIcon name="DeleteOutline" fallback={DeleteOutlineIcon} size={18} />
                    </IconButton>
                  </Tooltip>
                </Box>
              );
            })}
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
}
