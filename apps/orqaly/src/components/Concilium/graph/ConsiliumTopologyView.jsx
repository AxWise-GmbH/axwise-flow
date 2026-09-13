/**
 * ConsiliumTopologyView - lazy entry for the Boards "Graph" view.
 *
 * Loads (and, on first open, server-seeds) the user's topology diagram, then hosts
 * the editable canvas inside a ReactFlowProvider. Lazy-loaded from BoardList so
 * @xyflow/react stays out of the initial Boards bundle.
 */
import { useEffect, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { Box, CircularProgress, Typography, Button } from '@mui/material';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';

import AppIcon from '../../icons/AppIcon';
import ConsiliumTopologyCanvas from './ConsiliumTopologyCanvas';
import { getTopology } from '../../../services/consiliumTopologyService';

const CANVAS_HEIGHT = 'calc(100vh - 300px)';

export default function ConsiliumTopologyView({ user, variant }) {
  const [state, setState] = useState({ loading: true, error: null, diagram: null });

  useEffect(() => {
    let active = true;
    (async () => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const { diagram } = await getTopology();
        if (active) setState({ loading: false, error: null, diagram });
      } catch (err) {
        if (active)
          setState({
            loading: false,
            error: err?.message || 'Failed to load graph',
            diagram: null,
          });
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const frame = { height: CANVAS_HEIGHT, minHeight: 520, position: 'relative' };

  if (state.loading) {
    return (
      <Box sx={{ ...frame, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (state.error) {
    return (
      <Box
        data-testid="boards-graph-error"
        sx={{
          ...frame,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 1.5,
        }}
      >
        <Typography color="text.secondary">{state.error}</Typography>
        <Button variant="outlined" onClick={() => setState((s) => ({ ...s, loading: true }))}>
          Retry
        </Button>
      </Box>
    );
  }

  const hasNodes = (state.diagram?.nodes?.length || 0) > 0;

  return (
    <Box sx={frame}>
      {!hasNodes && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            zIndex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1,
            pointerEvents: 'none',
            color: 'text.secondary',
          }}
        >
          <AppIcon fallback={AccountTreeOutlinedIcon} sx={{ fontSize: 40, opacity: 0.4 }} />
          <Typography variant="body2">
            No organizations to graph yet. Use Add or Refresh to start.
          </Typography>
        </Box>
      )}
      <ReactFlowProvider>
        <ConsiliumTopologyCanvas diagram={state.diagram} user={user} variant={variant} />
      </ReactFlowProvider>
    </Box>
  );
}
