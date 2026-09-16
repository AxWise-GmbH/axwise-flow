import { RouterProvider } from 'react-router-dom';
import { CssBaseline } from '@mui/material';
import router from './routes';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { PartnerAccessProvider } from './context/PartnerAccessContext';
import { TaskManagerProvider } from './context/TaskManagerContext';
import { DevTasksProvider } from './context/DevTasksContext';
import { ToolRequirementProvider } from './context/ToolRequirementContext';
import { ReplicatorProvider } from './context/ReplicatorContext';

export default function App() {
  return (
    <ThemeProvider>
      <CssBaseline />
      <AuthProvider>
        <PartnerAccessProvider>
          <TaskManagerProvider>
            <DevTasksProvider>
              <ToolRequirementProvider>
                <ReplicatorProvider>
                  <RouterProvider router={router} />
                </ReplicatorProvider>
              </ToolRequirementProvider>
            </DevTasksProvider>
          </TaskManagerProvider>
        </PartnerAccessProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
