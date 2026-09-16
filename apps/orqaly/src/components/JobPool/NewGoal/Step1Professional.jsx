import { Box, InputAdornment, TextField, Typography } from '@mui/material';
import SetupSwitch from './blocks/SetupSwitch';
import HumanApproveSwitch from './blocks/HumanApproveSwitch';
import Step1Blocks from './Step1Blocks';
import { INTAKE_QUESTIONS } from './newGoalConstants';

/**
 * Step 1 in Professional mode.
 *
 * The single description box is replaced by four intake questions. They are
 * stitched into one prompt on submit, so the model still receives one brief
 * rather than four disconnected fields.
 */
export default function Step1Professional({ form, renderMic, children }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Typography
        variant="caption"
        sx={{
          fontWeight: 700,
          letterSpacing: '0.04em',
          color: 'text.secondary',
          textTransform: 'uppercase',
          fontSize: '0.68rem',
        }}
      >
        1 · Brief
      </Typography>

      <Box
        sx={{
          display: 'grid',
          gap: 1.25,
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
        }}
      >
        {INTAKE_QUESTIONS.map((question, index) => (
          <Box
            key={question.key}
            sx={{
              minWidth: 0,
              // The goal and the challenges deserve the full width; timeline
              // and preferences are short enough to sit side by side.
              gridColumn: index < 2 ? { xs: 'auto', sm: '1 / -1' } : 'auto',
            }}
          >
            <TextField
              fullWidth
              multiline={index < 2}
              minRows={index < 2 ? 2 : 1}
              maxRows={index < 2 ? 6 : 3}
              label={question.label}
              required={question.required}
              placeholder={question.placeholder}
              value={form.answers[question.key] || ''}
              onChange={(event) => form.onAnswerChange(question.key, event.target.value)}
              onFocus={() => form.onFocusField(question.key)}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              slotProps={{
                input: {
                  endAdornment: renderMic ? (
                    <InputAdornment position="end" sx={{ alignSelf: 'flex-start', mt: 1 }}>
                      {renderMic(question.key)}
                    </InputAdornment>
                  ) : undefined,
                },
              }}
            />
          </Box>
        ))}
      </Box>

      <SetupSwitch manual={form.setupManual} onChange={form.onSetupManualChange} />

      <Step1Blocks manual={form.setupManual} form={form} layout="row" />

      <HumanApproveSwitch enabled={form.humanApprove} onChange={form.onHumanApproveChange} />

      {children}
    </Box>
  );
}
