import { useEffect, useState } from 'react';
import { Box, Button, Dialog, Typography, alpha, useTheme } from '@mui/material';
import AiOrb from '../VoiceControl/AiOrb';
import { stepEntranceSx } from '../../theme/wizardGlow';
import { listOrganizations } from '../../services/organizationService';
import { buildAssistantWelcome } from './assistantWelcome';

/**
 * The assistant you just switched to, introducing itself.
 *
 * Picking from "My Assistants" used to swap the config underneath the setup
 * wizard in silence - the header subtitle changed and that was the whole
 * acknowledgement. Now the setup popup closes and the new assistant says who it
 * is, what it is there for and that it will do its best, so a switch is
 * something that happened rather than something you have to notice.
 *
 * One button on purpose: this is an introduction, not another step.
 */

/** The list endpoint has been seen returning all three of these shapes. */
function toOrgList(result) {
  if (Array.isArray(result)) return result;
  return result?.organizations || result?.data || [];
}

export default function AssistantWelcomeDialog({ open, assistant, onClose }) {
  const theme = useTheme();
  const [orgName, setOrgName] = useState('');
  const [mounted, setMounted] = useState(false);
  const organizationId = assistant?.organizationId || null;

  // The name is a nicety, so it is fetched after the dialog is already on
  // screen and simply left out when it cannot be resolved.
  useEffect(() => {
    if (!open || !organizationId) {
      setOrgName('');
      return undefined;
    }
    let alive = true;
    listOrganizations()
      .then((result) => {
        if (!alive) return;
        const match = toOrgList(result).find((org) => org?.id === organizationId);
        if (match?.name) setOrgName(match.name);
      })
      .catch(() => {
        /* no org line, rather than no dialog */
      });
    return () => {
      alive = false;
    };
  }, [open, organizationId]);

  // The lines settle in after the dialog has finished scaling in; animating
  // them on top of its own arrival reads as a glitch rather than as motion.
  useEffect(() => {
    if (!open) {
      setMounted(false);
      return undefined;
    }
    const timer = setTimeout(() => setMounted(true), theme.transitions.duration.enteringScreen);
    return () => clearTimeout(timer);
  }, [open, theme.transitions.duration.enteringScreen]);

  if (!assistant) return null;

  const { title, lines, footnote } = buildAssistantWelcome({ assistant, orgName });

  return (
    <Dialog
      open={Boolean(open)}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      aria-labelledby="assistant-welcome-title"
      slotProps={{
        paper: {
          sx: {
            borderRadius: 4,
            px: 3,
            py: 3.5,
            textAlign: 'center',
            border: '1px solid',
            borderColor: alpha(theme.palette.primary.main, 0.25),
            overflow: 'hidden',
          },
        },
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1.5 }}>
        <AiOrb size={116} />
      </Box>

      <Typography
        id="assistant-welcome-title"
        variant="h6"
        sx={{ fontWeight: 800, mb: 1, ...stepEntranceSx(mounted, 0) }}
      >
        {title}
      </Typography>

      {lines.map((line, index) => (
        <Typography
          key={line}
          variant="body2"
          color="text.secondary"
          sx={{ mb: 0.75, ...stepEntranceSx(mounted, index + 1) }}
        >
          {line}
        </Typography>
      ))}

      {footnote && (
        <Typography
          variant="caption"
          sx={{
            display: 'block',
            mt: 1.5,
            color: alpha(theme.palette.text.primary, 0.45),
            ...stepEntranceSx(mounted, lines.length + 1),
          }}
        >
          {footnote}
        </Typography>
      )}

      <Button
        variant="contained"
        onClick={onClose}
        sx={{
          mt: 2.5,
          px: 4,
          borderRadius: 2,
          textTransform: 'none',
          fontWeight: 700,
          ...stepEntranceSx(mounted, lines.length + 2),
        }}
      >
        Let&apos;s go
      </Button>
    </Dialog>
  );
}
