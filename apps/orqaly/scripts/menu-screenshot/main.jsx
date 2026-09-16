import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider, CssBaseline, Box, Typography } from '@mui/material';
import { createTheme } from '@mui/material/styles';
import SimpleMenuBeforePanel from './SimpleMenuBeforePanel';
import SimpleMenuNowPanel from './SimpleMenuNowPanel';

const theme = createTheme({ palette: { mode: 'dark' } });

function ComparePage() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ minHeight: '100vh', bgcolor: '#0a0f0d', p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary', textAlign: 'center' }}>
          Simple mode · mobile account menu · tap profile avatar (top-right)
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Typography variant="overline" sx={{ color: 'primary.main', letterSpacing: 1.2 }}>
            Before (glass tile panel)
          </Typography>
          <Box sx={{ display: 'flex', justifyContent: 'center' }}>
            <SimpleMenuBeforePanel />
          </Box>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Typography variant="overline" sx={{ color: 'primary.main', letterSpacing: 1.2 }}>
            Now (list menu — same as advanced)
          </Typography>
          <Box sx={{ display: 'flex', justifyContent: 'center' }}>
            <SimpleMenuNowPanel />
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ComparePage />
  </StrictMode>,
);
