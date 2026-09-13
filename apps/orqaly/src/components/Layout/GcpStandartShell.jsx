import { Box } from '@mui/material';
import { Outlet } from 'react-router-dom';
import GcpStandardNav from './GcpStandardNav.jsx';

export default function GcpStandartShell() {
  return (
    <Box
      data-testid="gcp-workspace-shell"
      sx={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'stretch',
        bgcolor: 'background.default',
        color: 'text.primary',
      }}
    >
      <Box
        component="a"
        href="#gcp-main"
        sx={{
          position: 'fixed',
          left: 12,
          top: -60,
          zIndex: 2000,
          bgcolor: '#F5F5F5',
          color: '#0A0A0A',
          px: 2,
          py: 1,
          '&:focus': { top: 12 },
        }}
      >
        Skip to content
      </Box>
      <GcpStandardNav />
      <Box
        id="gcp-main"
        component="main"
        sx={{
          flex: 1,
          minWidth: 0,
          minHeight: '100dvh',
          overflowX: 'hidden',
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
}
