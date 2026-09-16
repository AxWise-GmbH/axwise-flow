import { useState } from 'react';
import { Paper, Box, Typography, IconButton, Stack, Collapse } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

import AppIcon from '../../../components/icons/AppIcon';

export default function KeyCategorySection({
  category,
  countSet,
  countTotal,
  defaultExpanded = false,
  children,
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        overflow: 'hidden',
        mb: 1.5,
      }}
    >
      <Box
        onClick={() => setExpanded((v) => !v)}
        sx={{
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          p: 1.5,
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        <IconButton size="small" sx={{ p: 0.25 }}>
          {expanded ? (
            <AppIcon name="ExpandMore" fallback={ExpandMoreIcon} fontSize="small" />
          ) : (
            <AppIcon name="ChevronRight" fallback={ChevronRightIcon} fontSize="small" />
          )}
        </IconButton>
        <Stack sx={{ flex: 1 }}>
          <Typography variant="subtitle1" fontWeight={700}>
            {category.label}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {category.description}
          </Typography>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ fontFeatureSettings: '"tnum"' }}>
          {countSet}/{countTotal} configured
        </Typography>
      </Box>
      <Collapse in={expanded} unmountOnExit>
        <Box sx={{ px: 1.5, pb: 1.5, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {children}
        </Box>
      </Collapse>
    </Paper>
  );
}
