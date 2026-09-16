import { Alert, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';

export function BuildChatNotice({ controller }) {
  return (
    <Stack gap={1} sx={{ pb: 1 }}>
      {controller.mode === 'answer' && controller.questions.length > 1 ? (
        <TextField
          select
          size="small"
          label="Which question are you answering?"
          value={controller.questionId}
          disabled={controller.busy}
          onChange={(event) => controller.setQuestionId(event.target.value)}
        >
          {controller.questions.map((question) => (
            <MenuItem key={question.id} value={question.id}>
              {question.prompt}
            </MenuItem>
          ))}
        </TextField>
      ) : (
        <Typography variant="body2">
          {controller.currentQuestion && controller.mode === 'answer'
            ? controller.currentQuestion.prompt
            : controller.mode === 'repair'
              ? 'Describe what to change in this draft. Nothing goes live automatically.'
              : 'This message belongs to the saved build. Choose its next action below.'}
        </Typography>
      )}
      <Stack direction="row" gap={1}>
        {controller.questions.length && controller.mode !== 'answer' ? (
          <Button
            size="small"
            disabled={controller.busy}
            onClick={() => controller.setMode('answer')}
          >
            Answer a question
          </Button>
        ) : null}
        {controller.canRepair && controller.mode !== 'repair' ? (
          <Button
            size="small"
            disabled={controller.busy}
            onClick={() => controller.setMode('repair')}
          >
            Describe a change
          </Button>
        ) : null}
      </Stack>
      {controller.error ? (
        <Alert severity="warning">
          {typeof controller.error === 'string' ? controller.error : controller.error.message}
        </Alert>
      ) : null}
    </Stack>
  );
}

export function BuildChatActions({ controller }) {
  return (
    <Stack direction="row" justifyContent="flex-end">
      <Button
        variant="contained"
        disabled={controller.actionDisabled}
        onClick={() => controller.send()}
      >
        {controller.busy ? 'Saving…' : controller.mode === 'answer' ? 'Send answer' : 'Send'}
      </Button>
    </Stack>
  );
}
