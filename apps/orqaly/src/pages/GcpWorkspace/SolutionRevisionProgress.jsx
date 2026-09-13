import { Box, Chip, Paper, Stack, Typography } from '@mui/material';

function revisionNextStep(
  revision,
  { editing = false, sessionReady = false, outcomeUnknown = false, setup = null } = {}
) {
  if (editing)
    return {
      stage: 'Editing draft',
      instruction: sessionReady
        ? 'Finish your native edits and wait for n8n to show Saved. Then check this exact draft.'
        : 'The native editor is not ready to save. Reconnect it before checking changes.',
    };
  if (outcomeUnknown)
    return {
      stage: 'Result needs verification',
      instruction:
        'A request for this candidate is unfinished or unconfirmed. Check its recorded result before another test or repair; no request is replayed automatically.',
    };
  if (setup?.ready === false && setup.requirements?.length)
    return {
      stage: 'Needs you: connection setup',
      instruction:
        setup.reason ||
        'Set up the exact service connection securely, then review this candidate. Do not paste credentials into chat.',
    };
  switch (revision.status) {
    case 'draft':
      return {
        stage: revision.review?.valid === false ? 'Changes need correction' : 'Check changes',
        instruction:
          revision.review?.valid === false
            ? 'Correct the listed issues in this draft, then check it again. It cannot be approved yet.'
            : 'Review this candidate’s saved changes. Checking does not deploy or run it.',
      };
    case 'reviewed':
      return {
        stage: 'Approve test version',
        instruction:
          'Approve this exact reviewed candidate before preparing its isolated test version. The live version stays unchanged.',
      };
    case 'approved':
      return {
        stage: 'Prepare test version',
        instruction:
          'Prepare the approved candidate for testing. This does not replace the live version or send test requests.',
      };
    case 'deploying':
      return {
        stage: 'Preparing test version',
        instruction:
          'Waiting for verified deployment. Do not create another version to retry this operation.',
      };
    case 'deployment_unknown':
      return {
        stage: 'Verify deployment',
        instruction:
          'The deployment outcome is unconfirmed. Verify this same candidate before testing or activation.',
      };
    case 'ready':
      return revision.testedAt
        ? {
            stage: 'Ready to activate',
            instruction:
              'The required tests are recorded for this exact candidate. Activate it only when you want it to replace the live version.',
          }
        : {
            stage: 'Test this candidate',
            instruction:
              'Run the agreed cases for this candidate—not the current live version. Connected-service tests need a separate explicit authorization.',
          };
    case 'active':
      return {
        stage: 'Live version',
        instruction: 'This is the active version. Further changes belong in a new draft.',
      };
    case 'rejected':
      return {
        stage: 'Rejected candidate',
        instruction:
          'This version was not activated. Fix this version to carry its saved changes into a new unapproved draft.',
      };
    case 'superseded':
      return {
        stage: 'Previous version',
        instruction:
          'This saved version is no longer active. A new draft can preserve its changes without modifying this record.',
      };
    default:
      return {
        stage: 'Check saved status',
        instruction: 'Refresh the saved candidate before taking another action.',
      };
  }
}

export default function SolutionRevisionProgress({
  revision,
  liveVersion,
  editing,
  sessionReady,
  outcomeUnknown,
  busy,
  setup,
  children,
}) {
  const next = revisionNextStep(revision, { editing, sessionReady, outcomeUnknown, setup });
  return (
    <Paper
      component="section"
      aria-label={`Next step for candidate v${revision.version}`}
      variant="outlined"
      sx={{
        position: { xs: 'static', md: 'sticky' },
        top: 0,
        zIndex: 2,
        p: 1.5,
        borderRadius: 1.5,
        bgcolor: 'background.paper',
      }}
    >
      <Stack gap={1}>
        <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
          <Typography component="h3" variant="subtitle2">
            Candidate v{revision.version}
          </Typography>
          <Chip size="small" label={busy ? 'Confirming request…' : next.stage} />
          <Typography variant="caption" color="text.secondary">
            {revision.status === 'active'
              ? `Live v${liveVersion}`
              : `Live v${liveVersion} unchanged`}
          </Typography>
        </Stack>
        <Typography variant="body2">{next.instruction}</Typography>
        {revision.bundleHash ? (
          <Typography variant="caption" color="text.secondary">
            Changes include the main workflow and its linked error handler.
          </Typography>
        ) : null}
        {revision.review?.changes?.length ? (
          <Box component="ul" sx={{ m: 0, pl: 2 }} aria-label="Summary of saved candidate changes">
            {revision.review.changes.slice(0, 3).map((change, index) => (
              <Typography component="li" variant="body2" key={index}>
                {change.message}
              </Typography>
            ))}
          </Box>
        ) : null}
        {children}
      </Stack>
    </Paper>
  );
}
