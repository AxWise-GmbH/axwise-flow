import { CssBaseline } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { RouterProvider } from 'react-router-dom';
import { gcpRouter } from './gcp-routes';
import { standartTheme } from './pages/Standart/standartTheme';

export default function GcpApp() {
  return (
    <ThemeProvider theme={standartTheme}>
      <CssBaseline />
      <RouterProvider router={gcpRouter} />
    </ThemeProvider>
  );
}
