import { Component } from 'react';
import { Box, Typography, Button, alpha } from '@mui/material';
import ReplayIcon from '@mui/icons-material/Replay';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';

import AppIcon from '../icons/AppIcon';

/**
 * Per-block error boundary. One bad block must not break the dashboard.
 * Renders a compact retry card.
 */
export default class BlockErrorBoundary extends Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.warn('Dashboard block error:', error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <Box
          sx={{
            p: 2,
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            gap: 1,
            borderRadius: 2,
            border: '1px solid',
            borderColor: (t) => alpha(t.palette.error.main, 0.4),
            bgcolor: (t) => alpha(t.palette.error.main, 0.04),
          }}
        >
          <AppIcon name="ErrorOutline" fallback={ErrorOutlineIcon} color="error" />
          <Typography variant="caption" color="error.main" sx={{ fontWeight: 600 }}>
            Block error
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 220 }}>
            {this.state.error?.message || 'Unexpected failure rendering this block.'}
          </Typography>
          <Button
            size="small"
            startIcon={<AppIcon name="Replay" fallback={ReplayIcon} fontSize="small" />}
            onClick={this.handleReset}
            sx={{ textTransform: 'none', mt: 0.5 }}
          >
            Retry
          </Button>
        </Box>
      );
    }
    return this.props.children;
  }
}
