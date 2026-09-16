import { useRef, useState } from 'react';
import {
  Box,
  ClickAwayListener,
  Paper,
  Popper,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import KeyboardArrowUpRoundedIcon from '@mui/icons-material/KeyboardArrowUpRounded';
import AssistantChat from '../../../components/Assistant/AssistantChat';
import BentoCard from '../../../components/Common/BentoCard';
import {
  DEFAULT_ASSISTANT_MODEL,
  DEFAULT_ASSISTANT_PROVIDER,
} from '../../../config/assistantBrain';

/**
 * Compact entry point for the Assistant Console.
 *
 * The conversation itself is intentionally owned by the shared AssistantChat
 * component. That keeps every Assistant surface on the same agentic Copilot
 * backend, including live reads, AxWise grounding, structured blocks, file
 * ingestion, and confirmation-gated actions.
 */
export default function AssistantChatCard({ config = {} }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const anchorRef = useRef(null);

  const provider = config?.provider || DEFAULT_ASSISTANT_PROVIDER;
  const model = config?.model || DEFAULT_ASSISTANT_MODEL;
  const personality = config?.tone || config?.personality || 'professional';
  const orgId = config?.orgId || config?.organizationId || null;

  return (
    <>
      <Box ref={anchorRef} sx={{ height: '100%' }}>
        <BentoCard noHeader sx={{ justifyContent: 'center' }}>
          <Box
            role="button"
            tabIndex={0}
            aria-expanded={open}
            aria-label="Open assistant chat"
            onClick={() => setOpen((current) => !current)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setOpen(true);
              }
            }}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.25,
              width: '100%',
              height: '100%',
              px: 1.5,
              borderRadius: 3,
              border: '1px solid',
              borderColor: open
                ? theme.palette.primary.main
                : alpha(theme.palette.text.primary, 0.12),
              bgcolor: alpha(theme.palette.text.primary, 0.03),
              cursor: 'pointer',
              transition: 'border-color 0.2s, background 0.2s',
              '&:hover': {
                borderColor: theme.palette.primary.main,
                bgcolor: alpha(theme.palette.primary.main, 0.04),
              },
            }}
          >
            <Box
              sx={{
                width: 30,
                height: 30,
                borderRadius: '50%',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: theme.palette.primary.main,
                bgcolor: alpha(theme.palette.primary.main, 0.12),
              }}
            >
              <AutoAwesomeRoundedIcon sx={{ fontSize: 18 }} />
            </Box>
            <Typography
              variant="body2"
              noWrap
              sx={{ flex: 1, minWidth: 0, color: 'text.secondary', fontWeight: 500 }}
            >
              Ask your assistant…
            </Typography>
            <KeyboardArrowUpRoundedIcon
              sx={{
                fontSize: 20,
                color: 'text.disabled',
                flexShrink: 0,
                transform: open ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.2s',
              }}
            />
          </Box>
        </BentoCard>
      </Box>

      <Popper
        open={open}
        anchorEl={anchorRef.current}
        placement="bottom-start"
        keepMounted
        modifiers={[
          { name: 'offset', options: { offset: [0, 8] } },
          { name: 'preventOverflow', options: { padding: 8 } },
        ]}
        style={{
          zIndex: theme.zIndex.modal - 1,
          width: anchorRef.current?.clientWidth || 'auto',
        }}
      >
        <ClickAwayListener
          mouseEvent="onMouseDown"
          touchEvent="onTouchStart"
          onClickAway={() => setOpen(false)}
        >
          <Paper
            elevation={8}
            sx={{
              height: 'min(520px, 72vh)',
              display: 'flex',
              flexDirection: 'column',
              borderRadius: 3,
              border: '1px solid',
              borderColor: 'divider',
              overflow: 'hidden',
            }}
          >
            <AssistantChat
              variant="compact"
              orgId={orgId}
              provider={provider}
              model={model}
              personality={personality}
              pageContext={{ surface: 'assistant-console', location: 'assistant-card' }}
              emptyTitle="How can I help?"
              emptySubtitle="Ask about your workspace or request an action."
            />
          </Paper>
        </ClickAwayListener>
      </Popper>
    </>
  );
}
