import { useState } from 'react';
import { Box, Typography, Chip, Paper, Button, useTheme, alpha } from '@mui/material';
import FormDialog from '../Common/FormDialog';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';

import AppIcon from '../icons/AppIcon';

const CATEGORY_COLORS = {
  'goal-plan': 'info',
  'goal-output': 'success',
  'goal-report': 'warning',
  'goal-retrospective': 'secondary',
};

const CATEGORY_LABELS = {
  'goal-plan': 'Plan',
  'goal-output': 'Output',
  'goal-report': 'Report',
  'goal-retrospective': 'Retro',
};

function timeAgo(date) {
  if (!date) return '';
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function GoalDocuments({ documents = [], compact = false }) {
  const theme = useTheme();
  const [selectedDoc, setSelectedDoc] = useState(null);

  if (documents.length === 0) {
    return (
      <Box sx={{ py: 2, textAlign: 'center' }}>
        <AppIcon
          name="DescriptionOutlined"
          fallback={DescriptionOutlinedIcon}
          sx={{ fontSize: 28, color: 'text.disabled', mb: 0.5 }}
        />
        <Typography
          variant="caption"
          sx={{ color: 'text.disabled', display: 'block', fontSize: '0.68rem' }}
        >
          No documents yet
        </Typography>
      </Box>
    );
  }

  return (
    <>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {documents.map((doc) => (
          <Paper
            key={doc.id}
            elevation={0}
            onClick={() => setSelectedDoc(doc)}
            sx={{
              p: compact ? 0.75 : 1,
              borderRadius: 1.5,
              cursor: 'pointer',
              border: '1px solid',
              borderColor: 'divider',
              '&:hover': {
                borderColor: 'primary.main',
                bgcolor: alpha(theme.palette.primary.main, 0.03),
              },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
              <AppIcon
                name="DescriptionOutlined"
                fallback={DescriptionOutlinedIcon}
                sx={{ fontSize: 14, color: 'text.secondary' }}
              />
              <Typography
                variant="caption"
                sx={{ fontWeight: 600, fontSize: compact ? '0.6rem' : '0.7rem', flex: 1 }}
                noWrap
              >
                {doc.title}
              </Typography>
              <Chip
                label={CATEGORY_LABELS[doc.category] || doc.category}
                size="small"
                color={CATEGORY_COLORS[doc.category] || 'default'}
                sx={{ fontSize: '0.5rem', height: 16 }}
              />
            </Box>
            {!compact && doc.content && (
              <Typography
                variant="caption"
                sx={{ fontSize: '0.6rem', color: 'text.disabled', lineHeight: 1.3 }}
                noWrap
              >
                {doc.content.slice(0, 120)}...
              </Typography>
            )}
            <Typography
              variant="caption"
              sx={{ fontSize: '0.5rem', color: 'text.disabled', display: 'block', mt: 0.25 }}
            >
              {timeAgo(doc.created_at)}
            </Typography>
          </Paper>
        ))}
      </Box>
      <FormDialog
        open={!!selectedDoc}
        onClose={() => setSelectedDoc(null)}
        title={selectedDoc?.title}
        maxWidth="md"
        hideCancel
        primaryLabel="Close"
        onPrimary={() => setSelectedDoc(null)}
      >
        <Chip
          label={CATEGORY_LABELS[selectedDoc?.category] || selectedDoc?.category}
          size="small"
          color={CATEGORY_COLORS[selectedDoc?.category] || 'default'}
          sx={{ mb: 1.5, fontSize: '0.65rem' }}
        />
        <Typography
          variant="body2"
          sx={{ fontSize: '0.8rem', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}
        >
          {selectedDoc?.content}
        </Typography>
      </FormDialog>
    </>
  );
}
