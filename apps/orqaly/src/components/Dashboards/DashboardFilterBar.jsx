import { useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Collapse,
  IconButton,
  Menu,
  MenuItem,
  TextField,
  Stack,
  Typography,
  alpha,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import RefreshIcon from '@mui/icons-material/Refresh';

import AppIcon from '../icons/AppIcon';

const TIME_PRESETS = [
  { label: 'Last 7 days', kind: 'last_n_days', value: 7 },
  { label: 'Last 30 days', kind: 'last_n_days', value: 30 },
  { label: 'Last 90 days', kind: 'last_n_days', value: 90 },
  { label: 'Last 12 months', kind: 'last_n_days', value: 365 },
  { label: 'All time', kind: null, value: null },
];

function timeLabel(tr) {
  if (!tr) return 'All time';
  if (tr.kind === 'last_n_days') {
    const n = tr.value;
    if (n === 7) return 'Last 7 days';
    if (n === 30) return 'Last 30 days';
    if (n === 90) return 'Last 90 days';
    if (n === 365) return 'Last 12 months';
    return `Last ${n} days`;
  }
  return 'Custom';
}

/**
 * Global dashboard filter bar — desktop shows chips inline, mobile collapses
 * everything behind a "Filters (n)" button.
 */
export default function DashboardFilterBar({
  filters,
  onChange,
  onRefresh,
  activeCrossFilter,
  onClearCrossFilter,
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [open, setOpen] = useState(false);
  const [timeMenuAnchor, setTimeMenuAnchor] = useState(null);

  const handleTimeRange = (preset) => {
    setTimeMenuAnchor(null);
    if (preset.kind === null) {
      const { time_range: _tr, ...rest } = filters;
      onChange(rest);
    } else {
      onChange({
        ...filters,
        time_range: { kind: preset.kind, value: preset.value },
      });
    }
  };

  const filterCount = (filters.time_range ? 1 : 0) + (activeCrossFilter ? 1 : 0);

  const chips = (
    <Stack direction="row" gap={0.75} flexWrap="wrap" alignItems="center" sx={{ flex: 1 }}>
      <Chip
        size="small"
        icon={<AppIcon name="ExpandMore" fallback={ExpandMoreIcon} sx={{ fontSize: 14 }} />}
        label={timeLabel(filters.time_range)}
        onClick={(e) => setTimeMenuAnchor(e.currentTarget)}
        clickable
        sx={{
          fontWeight: 600,
          fontSize: '0.7rem',
          height: 28,
          bgcolor: alpha(theme.palette.primary.main, 0.08),
          color: 'primary.main',
          border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
        }}
      />
      <Menu
        anchorEl={timeMenuAnchor}
        open={Boolean(timeMenuAnchor)}
        onClose={() => setTimeMenuAnchor(null)}
      >
        {TIME_PRESETS.map((p) => (
          <MenuItem key={p.label} onClick={() => handleTimeRange(p)}>
            {p.label}
          </MenuItem>
        ))}
      </Menu>
      {activeCrossFilter && (
        <Chip
          size="small"
          label={`${activeCrossFilter.dim} = ${activeCrossFilter.value}`}
          onDelete={onClearCrossFilter}
          deleteIcon={<AppIcon name="Close" fallback={CloseIcon} sx={{ fontSize: 14 }} />}
          sx={{
            fontWeight: 600,
            fontSize: '0.7rem',
            height: 28,
            bgcolor: alpha(theme.palette.secondary.main, 0.12),
            color: 'secondary.main',
            border: `1px solid ${alpha(theme.palette.secondary.main, 0.3)}`,
          }}
        />
      )}
    </Stack>
  );

  if (isMobile) {
    return (
      <Box>
        <Button
          variant="outlined"
          startIcon={<AppIcon name="TuneRounded" fallback={TuneRoundedIcon} fontSize="small" />}
          onClick={() => setOpen((o) => !o)}
          fullWidth
          sx={{
            textTransform: 'none',
            fontWeight: 600,
            borderRadius: 2,
            justifyContent: 'space-between',
            py: 1,
          }}
          endIcon={
            <Chip
              size="small"
              label={filterCount}
              sx={{
                height: 20,
                fontWeight: 700,
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                fontSize: '0.65rem',
              }}
            />
          }
        >
          Filters
        </Button>
        <Collapse in={open}>
          <Box
            sx={{
              mt: 1,
              p: 1.5,
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.paper',
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
            }}
          >
            {chips}
            <Box
              sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}
            >
              <Typography variant="caption" color="text.secondary">
                Tap chip to change
              </Typography>
              {onRefresh && (
                <Button
                  size="small"
                  startIcon={<AppIcon name="Refresh" fallback={RefreshIcon} />}
                  onClick={onRefresh}
                >
                  Refresh
                </Button>
              )}
            </Box>
          </Box>
        </Collapse>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        p: 1,
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      {chips}
      {onRefresh && (
        <IconButton size="small" onClick={onRefresh} aria-label="refresh">
          <AppIcon name="Refresh" fallback={RefreshIcon} fontSize="small" />
        </IconButton>
      )}
    </Box>
  );
}
