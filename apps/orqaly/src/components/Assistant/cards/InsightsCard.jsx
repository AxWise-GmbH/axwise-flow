/**
 * InsightsCard — Step 7. The assistant "acts like a real person": it reads the
 * company brief + everything connected and writes a concrete "first 30 days"
 * plan, then asks for more to go deeper. The plan is saved to the Knowledge
 * Base as organisational memory.
 */
import { useState } from 'react';
import { Box, Button, Typography, CircularProgress } from '@mui/material';
import InsightsRoundedIcon from '@mui/icons-material/InsightsRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import { firstSteps } from '../../../services/assistantIngestService';
import SetupCardShell from './SetupCardShell';

import AppIcon from '../../icons/AppIcon';

export default function InsightsCard({ onComplete, onSkip, embedded }) {
  const [narrative, setNarrative] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  const generate = async () => {
    setError(null);
    setGenerating(true);
    try {
      const { narrative: text } = await firstSteps();
      setNarrative(text || '');
    } catch (err) {
      setError(err.message || 'Could not generate the plan.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <SetupCardShell
      title="Insights & first steps"
      icon={InsightsRoundedIcon}
      embedded={embedded}
      primaryLabel={narrative ? 'Finish setup' : 'Skip insights'}
      onPrimary={() => onComplete({ config: { insights: { generated: Boolean(narrative) } } })}
      onSkip={onSkip}
      error={error}
    >
      {!narrative && (
        <Typography variant="body2" color="text.secondary">
          When you're ready, I'll review what you've shared and lay out the first 30 days.
        </Typography>
      )}
      {narrative ? (
        <Box
          sx={{
            whiteSpace: 'pre-wrap',
            fontSize: '0.88rem',
            lineHeight: 1.5,
            p: 1.25,
            borderRadius: 2,
            bgcolor: 'action.hover',
          }}
        >
          {narrative}
        </Box>
      ) : (
        <Button
          size="small"
          variant="contained"
          onClick={generate}
          disabled={generating}
          startIcon={
            generating ? (
              <CircularProgress size={14} color="inherit" />
            ) : (
              <AppIcon name="AutoAwesomeRounded" fallback={AutoAwesomeRoundedIcon} />
            )
          }
          sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2, alignSelf: 'flex-start' }}
        >
          {generating ? 'Thinking…' : 'Generate my first-steps plan'}
        </Button>
      )}
    </SetupCardShell>
  );
}
