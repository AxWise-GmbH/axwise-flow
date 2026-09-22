import { CssBaseline } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { RouterProvider } from 'react-router-dom';
import ClerkOnDemand from './components/Auth/ClerkOnDemand';
import { gcpRouter } from './gcp-routes';
import { standartTheme } from './pages/Standart/standartTheme';

export default function GcpApp({ clerkProps }) {
  return (
    <ThemeProvider theme={standartTheme}>
      <CssBaseline />
      <ClerkOnDemand router={gcpRouter} clerkProps={clerkProps}>
        <RouterProvider router={gcpRouter} />
      </ClerkOnDemand>
    </ThemeProvider>
  );
}
