import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Typography,
  Box,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  Chip,
  useTheme,
  alpha,
  Alert,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DevicesOutlinedIcon from '@mui/icons-material/DevicesOutlined';
import CircleIcon from '@mui/icons-material/Circle';
import { supabase, hasSupabase } from '../../lib/supabase';

import AppIcon from '../icons/AppIcon';

export default function ViewModelsDialog({ open, onClose }) {
  const theme = useTheme();
  const tint = theme.palette.primary.main;
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);

    const fetchModels = async () => {
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (hasSupabase()) {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
        }

        const res = await fetch('/api/app?path=local-llm-models', { headers });
        const data = await res.json();

        if (!res.ok) throw new Error(data.error || 'Failed to load models');
        setData(data.endpoints || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchModels();
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pr: 6, fontWeight: 800 }}>
        Local Models
        <IconButton
          onClick={onClose}
          sx={{ position: 'absolute', right: 8, top: 8, color: 'text.secondary' }}
          aria-label="Close"
        >
          <AppIcon name="Close" fallback={CloseIcon} />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ p: 3, pt: 1, minHeight: 300 }}>
        {loading && (
          <Box
            sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}
          >
            <CircularProgress size={32} />
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {!loading && !error && data && data.length === 0 && (
          <Typography color="text.secondary" align="center" sx={{ mt: 4 }}>
            No local LLM endpoints configured. Set one up in the "Run Locally" card first.
          </Typography>
        )}

        {!loading &&
          !error &&
          data &&
          data.map((endpoint, i) => {
            const isOnline = endpoint.status === 'Online';
            return (
              <Box key={i} sx={{ mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1, gap: 1 }}>
                  <AppIcon
                    name="DevicesOutlined"
                    fallback={DevicesOutlinedIcon}
                    sx={{ color: tint, fontSize: 20 }}
                  />
                  <Typography variant="subtitle1" fontWeight={700}>
                    {endpoint.provider}
                  </Typography>
                  <Chip
                    size="small"
                    icon={
                      <AppIcon
                        name="Circle"
                        fallback={CircleIcon}
                        sx={{ fontSize: '8px !important', color: isOnline ? '#4caf50' : '#f44336' }}
                      />
                    }
                    label={endpoint.status}
                    sx={{
                      height: 20,
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      bgcolor: alpha(isOnline ? '#4caf50' : '#f44336', 0.1),
                      color: isOnline ? '#2e7d32' : '#c62828',
                      '& .MuiChip-icon': { ml: 0.5 },
                    }}
                  />
                </Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', mb: 2 }}
                >
                  Endpoint: {endpoint.url || 'Unknown'}
                  {endpoint.error && (
                    <>
                      <br />
                      Error: {endpoint.error}
                    </>
                  )}
                </Typography>
                {endpoint.models && endpoint.models.length > 0 ? (
                  <List
                    sx={{
                      bgcolor: alpha(tint, 0.03),
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: alpha(tint, 0.1),
                      p: 0,
                    }}
                  >
                    {endpoint.models.map((model, j) => (
                      <ListItem key={j} divider={j < endpoint.models.length - 1}>
                        <ListItemText
                          primary={model.name}
                          primaryTypographyProps={{ fontWeight: 600, fontSize: '0.9rem' }}
                          secondary={model.details}
                          secondaryTypographyProps={{ fontSize: '0.75rem' }}
                        />
                      </ListItem>
                    ))}
                  </List>
                ) : (
                  isOnline && (
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ fontStyle: 'italic', ml: 1 }}
                    >
                      No models downloaded.
                    </Typography>
                  )
                )}
              </Box>
            );
          })}
      </DialogContent>
    </Dialog>
  );
}
