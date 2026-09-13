import { useState } from 'react';
import {
  Box,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  IconButton,
  Popover,
  FormControlLabel,
  Checkbox,
  InputAdornment,
  Typography,
  Divider,
  Stack,
  Tooltip,
  useTheme,
  useMediaQuery,
  alpha,
  Badge,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/SearchOutlined';
import TuneIcon from '@mui/icons-material/Tune';
import AddIcon from '@mui/icons-material/Add';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import FilterListIcon from '@mui/icons-material/FilterList';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import {
  GROUP_TYPES,
  TRAFFIC_SOURCES,
  FUNNEL_STATUSES,
  AGREEMENT_TYPES,
} from '../../../utils/constants';
import { parseMonthYear } from '../utils/periodMetrics';

import AppIcon from '../../../components/icons/AppIcon';

const months = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

export default function PartnersToolbar({
  search,
  onSearchChange,
  filters,
  onFilterChange,
  columnVisibility,
  onColumnVisibilityChange,
  allColumns,
  onAddPartner,
  onResetControls,
  onExportCsv,
  period,
  onPeriodChange,
  existingTeams = [],
  existingGeos = [],
  inline = false,
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [filterAnchorEl, setFilterAnchorEl] = useState(null);

  const iconButtonSx = {
    bgcolor: 'background.paper',
    border: '1px solid',
    borderColor: 'divider',
    borderRadius: 2,
    flexShrink: 0,
    '&:hover': {
      bgcolor: alpha(theme.palette.primary.main, 0.06),
      borderColor: 'primary.main',
    },
  };

  const parsedPeriod = parseMonthYear(period) || {
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
  };
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 11 }, (_, i) => currentYear - 5 + i);

  const periodLabel = period
    ? `${months.find((m) => m.value === parsedPeriod.month)?.label || parsedPeriod.month} ${parsedPeriod.year}`
    : 'Period';

  const hasActiveFilters =
    (filters.group && filters.group !== 'All') ||
    (filters.team && filters.team !== 'All') ||
    (filters.trafficSource && filters.trafficSource !== 'All') ||
    (filters.geo && filters.geo !== 'All') ||
    (filters.funnelStatus && filters.funnelStatus !== 'All') ||
    (filters.agreement && filters.agreement !== 'All');
  const hasHiddenColumns = allColumns.some((col) => columnVisibility[col.id] === false);
  const showBadge = hasActiveFilters || hasHiddenColumns;

  const handlePeriodUpdate = (key, value) => {
    const newMonth = key === 'month' ? value : parsedPeriod.month;
    const newYear = key === 'year' ? value : parsedPeriod.year;
    const formatted = `${String(newMonth).padStart(2, '0')}/${newYear}`;
    onPeriodChange(formatted);
  };

  const handleReset = () => {
    onResetControls();
  };

  const popoverContent = (
    <Popover
      open={Boolean(filterAnchorEl)}
      anchorEl={filterAnchorEl}
      onClose={() => setFilterAnchorEl(null)}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      slotProps={{
        paper: {
          sx: {
            mt: 1.5,
            p: 0,
            borderRadius: 3,
            minWidth: 340,
            maxWidth: 380,
            maxHeight: 'calc(100vh - 120px)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 12px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
          },
        },
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          px: 2.5,
          py: 2,
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: alpha(theme.palette.primary.main, 0.04),
        }}
      >
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: alpha(theme.palette.primary.main, 0.12),
            color: 'primary.main',
          }}
        >
          <AppIcon name="FilterList" fallback={FilterListIcon} sx={{ fontSize: 22 }} />
        </Box>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'text.primary' }}>
            Page controls
          </Typography>
          <Typography
            variant="caption"
            sx={{ color: 'text.secondary', mt: 0.25, display: 'block' }}
          >
            Period, filters & column visibility
          </Typography>
        </Box>
      </Box>

      <Box sx={{ overflow: 'auto', flex: 1 }}>
        {/* Search - inside filter popover for all viewports */}
        <Box sx={{ px: 2.5, py: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1.5 }}>
            <AppIcon
              name="SearchOutlined"
              fallback={SearchIcon}
              sx={{ fontSize: 18, color: 'text.secondary' }}
            />
            <Typography
              variant="overline"
              sx={{
                fontWeight: 700,
                color: 'text.secondary',
                letterSpacing: '0.08em',
                fontSize: '0.7rem',
              }}
            >
              Search
            </Typography>
          </Box>
          <TextField
            size="small"
            placeholder="Search partners..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            fullWidth
            sx={{ '& .MuiInputBase-root': { borderRadius: 2 } }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <AppIcon
                    name="SearchOutlined"
                    fallback={SearchIcon}
                    sx={{ fontSize: 18, color: 'text.secondary' }}
                  />
                </InputAdornment>
              ),
            }}
          />
        </Box>
        <Divider />

        {/* Section: Select period */}
        <Box sx={{ px: 2.5, py: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1.5 }}>
            <AppIcon
              name="CalendarMonth"
              fallback={CalendarMonthIcon}
              sx={{ fontSize: 18, color: 'text.secondary' }}
            />
            <Typography
              variant="overline"
              sx={{
                fontWeight: 700,
                color: 'text.secondary',
                letterSpacing: '0.08em',
                fontSize: '0.7rem',
              }}
            >
              Select period
            </Typography>
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
            <FormControl size="small" fullWidth>
              <InputLabel>Month</InputLabel>
              <Select
                value={parsedPeriod.month}
                label="Month"
                onChange={(e) => handlePeriodUpdate('month', e.target.value)}
                sx={{ borderRadius: 2, fontWeight: 600 }}
              >
                {months.map((m) => (
                  <MenuItem key={m.value} value={m.value}>
                    {m.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" fullWidth>
              <InputLabel>Year</InputLabel>
              <Select
                value={parsedPeriod.year}
                label="Year"
                onChange={(e) => handlePeriodUpdate('year', e.target.value)}
                sx={{ borderRadius: 2, fontWeight: 600 }}
              >
                {years.map((y) => (
                  <MenuItem key={y} value={y}>
                    {y}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </Box>

        <Divider />

        {/* Section: Filters */}
        <Box sx={{ px: 2.5, py: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1.5 }}>
            <AppIcon
              name="FilterList"
              fallback={FilterListIcon}
              sx={{ fontSize: 18, color: 'text.secondary' }}
            />
            <Typography
              variant="overline"
              sx={{
                fontWeight: 700,
                color: 'text.secondary',
                letterSpacing: '0.08em',
                fontSize: '0.7rem',
              }}
            >
              Filters
            </Typography>
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
            <FormControl size="small" fullWidth>
              <InputLabel>Group</InputLabel>
              <Select
                value={filters.group}
                label="Group"
                onChange={(e) => onFilterChange('group', e.target.value)}
                sx={{ borderRadius: 2, fontWeight: 600, fontSize: '0.82rem' }}
              >
                <MenuItem value="All">All</MenuItem>
                {GROUP_TYPES.map((g) => (
                  <MenuItem key={g} value={g}>
                    {g}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" fullWidth>
              <InputLabel>Team</InputLabel>
              <Select
                value={filters.team || 'All'}
                label="Team"
                onChange={(e) => onFilterChange('team', e.target.value)}
                sx={{ borderRadius: 2, fontWeight: 600, fontSize: '0.82rem' }}
              >
                <MenuItem value="All">All</MenuItem>
                {existingTeams.map((t) => (
                  <MenuItem key={t} value={t}>
                    {t}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" fullWidth>
              <InputLabel>Traffic</InputLabel>
              <Select
                value={filters.trafficSource}
                label="Traffic"
                onChange={(e) => onFilterChange('trafficSource', e.target.value)}
                sx={{ borderRadius: 2, fontWeight: 600, fontSize: '0.82rem' }}
              >
                <MenuItem value="All">All</MenuItem>
                {TRAFFIC_SOURCES.map((s) => (
                  <MenuItem key={s} value={s}>
                    {s}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" fullWidth>
              <InputLabel>Geo</InputLabel>
              <Select
                value={filters.geo || 'All'}
                label="Geo"
                onChange={(e) => onFilterChange('geo', e.target.value)}
                sx={{ borderRadius: 2, fontWeight: 600, fontSize: '0.82rem' }}
              >
                <MenuItem value="All">All</MenuItem>
                {existingGeos.map((g) => (
                  <MenuItem key={g} value={g}>
                    {g}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" fullWidth>
              <InputLabel>Funnel</InputLabel>
              <Select
                value={filters.funnelStatus}
                label="Funnel"
                onChange={(e) => onFilterChange('funnelStatus', e.target.value)}
                sx={{ borderRadius: 2, fontWeight: 600, fontSize: '0.82rem' }}
              >
                <MenuItem value="All">All</MenuItem>
                {FUNNEL_STATUSES.map((s) => (
                  <MenuItem key={s} value={s}>
                    {s}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" fullWidth>
              <InputLabel>Agreement</InputLabel>
              <Select
                value={filters.agreement}
                label="Agreement"
                onChange={(e) => onFilterChange('agreement', e.target.value)}
                sx={{ borderRadius: 2, fontWeight: 600, fontSize: '0.82rem' }}
              >
                <MenuItem value="All">All</MenuItem>
                {AGREEMENT_TYPES.map((a) => (
                  <MenuItem key={a} value={a}>
                    {a}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </Box>

        <Divider />

        {/* Section: Show columns */}
        <Box sx={{ px: 2.5, py: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1.5 }}>
            <AppIcon
              name="ViewColumn"
              fallback={ViewColumnIcon}
              sx={{ fontSize: 18, color: 'text.secondary' }}
            />
            <Typography
              variant="overline"
              sx={{
                fontWeight: 700,
                color: 'text.secondary',
                letterSpacing: '0.08em',
                fontSize: '0.7rem',
              }}
            >
              Show columns
            </Typography>
          </Box>
          <Stack sx={{ gap: 0.25, maxHeight: 180, overflow: 'auto' }}>
            {allColumns.map((col) => (
              <FormControlLabel
                key={col.id}
                control={
                  <Checkbox
                    size="small"
                    checked={columnVisibility[col.id] !== false}
                    onChange={(e) => onColumnVisibilityChange(col.id, e.target.checked)}
                    sx={{ py: 0.25 }}
                  />
                }
                label={col.label}
                sx={{ '& .MuiFormControlLabel-label': { fontSize: '0.875rem', fontWeight: 500 } }}
              />
            ))}
          </Stack>
        </Box>
      </Box>

      <Divider />
      <Box
        sx={{
          px: 2.5,
          py: 1.5,
          bgcolor:
            theme.palette.mode === 'dark'
              ? alpha(theme.palette.grey[800], 0.6)
              : alpha(theme.palette.grey[50], 0.8),
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'stretch',
          gap: 1,
          flexWrap: 'wrap',
        }}
      >
        {onExportCsv && (
          <Button
            variant="outlined"
            size="small"
            startIcon={
              <AppIcon
                name="FileDownloadOutlined"
                fallback={FileDownloadOutlinedIcon}
                sx={{ fontSize: 18 }}
              />
            }
            onClick={() => {
              onExportCsv();
              setFilterAnchorEl(null);
            }}
            sx={{
              flex: '0 1 auto',
              minWidth: 0,
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 700,
              fontSize: '0.8rem',
              px: 1.5,
              py: 0.75,
              color: 'primary.main',
              borderColor: alpha(theme.palette.primary.main, 0.5),
              bgcolor: alpha(
                theme.palette.primary.main,
                theme.palette.mode === 'dark' ? 0.16 : 0.08
              ),
              '&:hover': {
                borderColor: 'primary.main',
                bgcolor: alpha(
                  theme.palette.primary.main,
                  theme.palette.mode === 'dark' ? 0.24 : 0.12
                ),
              },
            }}
          >
            Export CSV
          </Button>
        )}
        <Button
          size="small"
          onClick={handleReset}
          sx={{
            flex: isMobile ? 1 : '0 0 auto',
            minWidth: 0,
            borderRadius: 2,
            textTransform: 'none',
            fontWeight: 600,
            color: 'primary.contrastText',
            bgcolor: 'primary.main',
            '&:hover': { bgcolor: 'primary.dark' },
            px: 2,
            py: 0.75,
          }}
        >
          Reset all
        </Button>
      </Box>
    </Popover>
  );

  // In inline mode, only render the filter icon + popover (search/buttons are in parent)
  if (inline) {
    return (
      <>
        <Badge
          variant="dot"
          color="primary"
          invisible={!showBadge}
          sx={{ '& .MuiBadge-dot': { right: 6, top: 6 } }}
        >
          <Tooltip title="Filters, period & columns" placement="bottom" arrow>
            <IconButton
              onClick={(e) => setFilterAnchorEl(e.currentTarget)}
              sx={iconButtonSx}
              aria-label="Page controls"
            >
              <AppIcon
                name="Tune"
                fallback={TuneIcon}
                sx={{ fontSize: 20, color: 'text.secondary' }}
              />
            </IconButton>
          </Tooltip>
        </Badge>
        {popoverContent}
      </>
    );
  }

  return (
    <Box sx={{ mb: 2 }}>
      <Stack direction="column" spacing={1.5} sx={{ width: '100%' }}>
        {/* Row 1: search, period, filter */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <TextField
            size="small"
            placeholder="Search partners..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            sx={{
              flex: { xs: '1 1 100%', sm: '1 1 auto' },
              minWidth: { xs: 0, sm: 200 },
              maxWidth: { md: 280 },
              '& .MuiInputBase-root': { fontSize: '0.85rem' },
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <AppIcon
                    name="SearchOutlined"
                    fallback={SearchIcon}
                    sx={{ fontSize: 18, color: 'text.secondary' }}
                  />
                </InputAdornment>
              ),
            }}
          />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
            <AppIcon
              name="CalendarMonth"
              fallback={CalendarMonthIcon}
              sx={{ fontSize: 20, color: 'text.secondary' }}
            />
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
              {periodLabel}
            </Typography>
          </Box>
          <Badge
            variant="dot"
            color="primary"
            invisible={!showBadge}
            sx={{ '& .MuiBadge-dot': { right: 6, top: 6 } }}
          >
            <IconButton
              onClick={(e) => setFilterAnchorEl(e.currentTarget)}
              sx={iconButtonSx}
              aria-label="Page controls"
            >
              <AppIcon
                name="Tune"
                fallback={TuneIcon}
                sx={{ fontSize: 20, color: 'text.secondary' }}
              />
            </IconButton>
          </Badge>
          {/* Mobile: Export + Add as icon buttons (same row as filter, like header) */}
          {isMobile && (
            <>
              {onExportCsv && (
                <Tooltip title="Export CSV" placement="bottom" arrow>
                  <IconButton onClick={onExportCsv} sx={iconButtonSx} aria-label="Export CSV">
                    <AppIcon
                      name="FileDownloadOutlined"
                      fallback={FileDownloadOutlinedIcon}
                      sx={{ fontSize: 20, color: 'text.secondary' }}
                    />
                  </IconButton>
                </Tooltip>
              )}
              {onAddPartner && (
                <Tooltip title="Add Partner" placement="bottom" arrow>
                  <IconButton
                    onClick={onAddPartner}
                    sx={{
                      ...iconButtonSx,
                      bgcolor: alpha(theme.palette.primary.main, 0.12),
                      borderColor: theme.palette.primary.main,
                      color: 'primary.main',
                      '&:hover': {
                        bgcolor: alpha(theme.palette.primary.main, 0.2),
                        borderColor: 'primary.dark',
                      },
                    }}
                    aria-label="Add Partner"
                  >
                    <AppIcon name="Add" fallback={AddIcon} sx={{ fontSize: 20 }} />
                  </IconButton>
                </Tooltip>
              )}
            </>
          )}
          <Box sx={{ display: { xs: 'none', md: 'block' }, flex: 1 }} />
        </Box>

        {/* Desktop/tablet: full Export + Add Partner buttons */}
        <Box
          sx={{
            display: { xs: 'none', sm: 'flex' },
            alignItems: 'center',
            gap: 1,
            flexWrap: 'wrap',
            width: 'auto',
            justifyContent: 'flex-end',
          }}
        >
          {onExportCsv && (
            <Button
              variant="outlined"
              size="small"
              startIcon={
                <AppIcon name="FileDownloadOutlined" fallback={FileDownloadOutlinedIcon} />
              }
              onClick={onExportCsv}
              sx={{
                borderRadius: 2,
                whiteSpace: 'nowrap',
                textTransform: 'none',
              }}
            >
              Export CSV
            </Button>
          )}
          {onAddPartner && (
            <Button
              variant="contained"
              size="small"
              startIcon={<AppIcon name="Add" fallback={AddIcon} />}
              onClick={onAddPartner}
              sx={{
                px: 2,
                borderRadius: 2,
                fontWeight: 600,
                textTransform: 'none',
                whiteSpace: 'nowrap',
                bgcolor: 'primary.main',
                '&:hover': {
                  bgcolor: 'primary.dark',
                },
              }}
            >
              Add
            </Button>
          )}
        </Box>
      </Stack>
      {popoverContent}
    </Box>
  );
}
