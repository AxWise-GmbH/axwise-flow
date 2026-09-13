import { TextField, Typography, Box } from '@mui/material';

export default function ImportPasteTab({ value, onChange, disabled }) {
  return (
    <Box>
      <TextField
        fullWidth
        multiline
        minRows={10}
        maxRows={18}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={`# Paste your .env, JSON, or CSV content here
OPENAI_API_KEY=sk-proj-...
ANTHROPIC_API_KEY=sk-ant-...

# Or JSON:
# { "OPENAI_API_KEY": "sk-...", "GROQ_API_KEY": "gsk_..." }`}
        spellCheck={false}
        autoComplete="off"
        inputProps={{ 'data-1p-ignore': true, 'data-lpignore': true }}
        InputProps={{ sx: { fontFamily: 'monospace', fontSize: '0.85rem' } }}
      />
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        Format auto-detected (env → JSON fallback). VirusTotal scan is only applied to uploaded
        files.
      </Typography>
    </Box>
  );
}
