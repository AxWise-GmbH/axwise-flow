import { Box, Stack, Chip, Typography, useTheme, alpha } from '@mui/material';
import StepShell from './StepShell';

/**
 * Step - IDE Synchronization (placeholder). The shipped approach will be a
 * lightweight local companion (no per-editor extension): it reads installed
 * addons + settings across VS Code / Cursor / Windsurf and JetBrains and syncs
 * them to the platform. A future option runs the IDE in-browser (cloud replica).
 */
export default function IdeSyncStep({ progress }) {
  const theme = useTheme();
  const tint = theme.palette.primary.main;

  return (
    <StepShell
      topic="IDE"
      title="IDE Synchronization"
      done={progress.ideSync.done}
      description="Sync your editor's installed addons and settings to the platform, then use them from the interface."
    >
      <Stack spacing={2}>
        <Box
          sx={{
            p: 2,
            borderRadius: 2,
            border: '1px solid',
            borderColor: alpha(tint, 0.2),
            bgcolor: alpha(tint, 0.04),
          }}
        >
          <Chip size="small" label="Coming soon" sx={{ fontWeight: 700, mb: 1 }} />
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
            No extension per editor. A small local companion (e.g.{' '}
            <Box component="code" sx={{ fontFamily: 'monospace' }}>
              npx orchestratori-sync
            </Box>
            ) reads your extensions and settings from disk and syncs them here - working across VS
            Code, Cursor, Windsurf and JetBrains. A later option lets you run the IDE in-browser with
            your settings replicated in the cloud.
          </Typography>
        </Box>
      </Stack>
    </StepShell>
  );
}
