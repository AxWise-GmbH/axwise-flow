import { useState, useCallback } from 'react';
import { Box, Button, Tooltip, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import AppIcon from '../../../components/icons/AppIcon';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';

/**
 * A code block with a copy-to-clipboard button. `code` is rendered verbatim with
 * a monospace, wrapping style tinted by `color` (defaults to the primary accent).
 */
export default function DocCodeBlock({ code, color, label, sx }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const c = color || theme.palette.primary.main;
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard?.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  return (
    <Box sx={{ position: 'relative', ...sx }}>
      <Tooltip title={copied ? 'Copied!' : 'Copy to clipboard'} arrow placement="top">
        <Button
          size="small"
          onClick={handleCopy}
          aria-label="Copy code"
          startIcon={
            copied ? (
              <AppIcon name="CheckCircleOutline" fallback={CheckCircleOutlineIcon} sx={{ fontSize: 13 }} />
            ) : (
              <AppIcon name="ContentCopyOutlined" fallback={ContentCopyOutlinedIcon} sx={{ fontSize: 13 }} />
            )
          }
          sx={{
            position: 'absolute',
            top: 6,
            right: 6,
            zIndex: 1,
            textTransform: 'none',
            fontSize: '0.68rem',
            minWidth: 0,
            px: 0.75,
            py: 0.25,
            borderRadius: 1.5,
            bgcolor: alpha(theme.palette.background.paper, 0.85),
            backdropFilter: 'blur(6px)',
            color: copied ? 'success.main' : 'text.secondary',
            '&:hover': { bgcolor: alpha(theme.palette.background.paper, 0.95) },
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </Tooltip>
      {label && (
        <Box
          sx={{
            position: 'absolute',
            top: 6,
            left: 10,
            zIndex: 1,
            fontSize: '0.62rem',
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: alpha(c, 0.8),
          }}
        >
          {label}
        </Box>
      )}
      <Box
        sx={{
          p: 1.5,
          pt: label ? 3 : 1.5,
          borderRadius: 2,
          border: '1px solid',
          borderColor: alpha(c, 0.25),
          bgcolor: isDark ? alpha(c, 0.08) : alpha(c, 0.03),
          fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          fontSize: '0.73rem',
          whiteSpace: 'pre-wrap',
          lineHeight: 1.6,
          overflowX: 'auto',
        }}
      >
        {code}
      </Box>
    </Box>
  );
}
