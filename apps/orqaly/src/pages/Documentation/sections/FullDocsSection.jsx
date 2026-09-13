import { useEffect } from 'react';
import { Box, Stack, Typography, Button, CircularProgress, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import OpenInNewOutlinedIcon from '@mui/icons-material/OpenInNewOutlined';
import BentoCard from '../../../components/Common/BentoCard';
import { useNotionDoc } from '../hooks/useNotionDoc';

export default function FullDocsSection() {
  const theme = useTheme();
  const p = theme.palette;
  const isDark = p.mode === 'dark';
  const { content, loading, load } = useNotionDoc();

  // Lazy: this section only mounts when the Full Docs tab is opened.
  useEffect(() => {
    load();
  }, [load]);

  return (
    <BentoCard
      title="Full documentation"
      subtitle="Long-form Markdown"
      icon={DescriptionOutlinedIcon}
      iconColor={p.primary.main}
      minHeight={100}
      action={
        <Button
          size="small"
          variant="outlined"
          href="/documentation/notion.md"
          target="_blank"
          rel="noopener noreferrer"
          startIcon={<OpenInNewOutlinedIcon sx={{ fontSize: 16 }} />}
          sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
        >
          Open raw
        </Button>
      }
    >
      {loading ? (
        <Box sx={{ py: 6, textAlign: 'center' }}>
          <CircularProgress size={24} />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
            Loading documentation…
          </Typography>
        </Box>
      ) : (
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
            The complete project documentation is below. For the authoritative source docs (design
            system, BYOK security, agent connection guide), see the <code>docs/</code> directory in the
            repository.
          </Typography>
          <Box
            sx={{
              p: 2,
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: isDark ? alpha(p.background.default, 0.6) : alpha(p.background.default, 0.5),
              fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              fontSize: '0.75rem',
              whiteSpace: 'pre-wrap',
              lineHeight: 1.7,
              maxHeight: 560,
              overflowY: 'auto',
            }}
          >
            {content || 'No documentation content available.'}
          </Box>
        </Stack>
      )}
    </BentoCard>
  );
}
