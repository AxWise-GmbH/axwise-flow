import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CssBaseline } from '@mui/material';
import './index.css';
import LandingRoot from './pages/Landing/LandingRoot';
import { ThemeProvider } from './context/ThemeContext';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <CssBaseline />
      <LandingRoot />
    </ThemeProvider>
  </StrictMode>
);
