import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CssBaseline } from '@mui/material';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import ImportLibraryDialog from './components/Marketplace/ImportLibraryDialog';
import './index.css';

function Harness() {
  const [open] = useState(true);
  return (
    <ImportLibraryDialog open={open} onClose={() => {}} category="agents" onImported={() => {}} />
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <CssBaseline />
        <Harness />
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>
);
