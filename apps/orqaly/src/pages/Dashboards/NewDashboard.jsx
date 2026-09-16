import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { createDashboard } from '../../services/dashboardService';

/**
 * /dashboards/new - creates a blank dashboard then redirects to its editor.
 * Accepts ?auto=1 to start in auto-build mode (handled in editor).
 */
export default function NewDashboard() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const auto = params.get('auto') === '1';
  const onceRef = useRef(false);

  useEffect(() => {
    if (onceRef.current) return;
    onceRef.current = true;
    (async () => {
      try {
        const d = await createDashboard({ title: 'Untitled dashboard' });
        navigate(`/dashboards/${d.id}/edit${auto ? '?auto=1' : ''}`, { replace: true });
      } catch (err) {
        console.warn('Failed to create dashboard', err);
        navigate('/dashboards', { replace: true });
      }
    })();
  }, [navigate, auto]);

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
      <CircularProgress size={32} />
    </Box>
  );
}
