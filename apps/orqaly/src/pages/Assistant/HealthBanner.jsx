import { Box, Alert, Button, Stack } from '@mui/material';

/**
 * Surfaces problems that need action, computed from the loaded console data.
 * Renders nothing when everything is healthy. Each alert's action opens the
 * setup wizard at the relevant step (onFix) or navigates out (onGoChannels).
 */
export default function HealthBanner({ data, onFix }) {
  const alerts = [];

  if (!data.assistant?.activated) {
    alerts.push({
      id: 'activate',
      severity: 'warning',
      text: 'Your assistant is not activated yet. Set its brain to finish.',
      step: 'keys',
      action: 'Finish setup',
    });
  }
  const downChannel = (data.channels || []).find((c) => c.status && c.status !== 'connected');
  if (downChannel) {
    alerts.push({
      id: 'channel',
      severity: 'error',
      text: `Channel "${downChannel.handle}" is not connected.`,
      step: 'channel',
      action: 'Reconnect',
    });
  }
  if (data.brief?.status && data.brief.status !== 'complete') {
    alerts.push({
      id: 'brief',
      severity: 'info',
      text: 'Your company brief is incomplete. Answer a few questions so the assistant knows your business.',
      step: 'brief',
      action: 'Continue brief',
    });
  }
  if (data.voice?.provider === 'voicebox' && data.voice?.status === 'unreachable') {
    alerts.push({
      id: 'voice',
      severity: 'warning',
      text: 'Voicebox is unreachable. Start it or switch to the built-in voice.',
      step: 'voice',
      action: 'Fix voice',
    });
  }

  if (alerts.length === 0) return null;

  return (
    <Box sx={{ mb: '10px' }}>
      <Stack spacing={1}>
        {alerts.map((a) => (
          <Alert
            key={a.id}
            severity={a.severity}
            variant="outlined"
            action={
              <Button
                color="inherit"
                size="small"
                onClick={() => onFix && onFix(a.step)}
                sx={{ textTransform: 'none', fontWeight: 700 }}
              >
                {a.action}
              </Button>
            }
            sx={{ borderRadius: 2, alignItems: 'center' }}
          >
            {a.text}
          </Alert>
        ))}
      </Stack>
    </Box>
  );
}
