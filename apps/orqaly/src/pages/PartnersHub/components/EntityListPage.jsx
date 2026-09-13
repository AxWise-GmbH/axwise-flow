import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  InputAdornment,
  Button,
  IconButton,
  Menu,
  MenuItem,
  Chip,
  Collapse,
  Autocomplete,
  Snackbar,
  Alert,
  Tooltip,
  ToggleButtonGroup,
  ToggleButton,
  CircularProgress,
  Typography,
  useTheme,
  alpha,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SwapHorizOutlinedIcon from '@mui/icons-material/SwapHorizOutlined';
import TuneIcon from '@mui/icons-material/Tune';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import ViewListIcon from '@mui/icons-material/ViewList';
import BentoCard from '../../../components/Common/BentoCard';
import StatCard from '../../../components/Common/StatCard';
import MetricsToggleButton from '../../../components/Common/MetricsToggleButton';
import { useShowMetrics } from '../../../hooks/useShowMetrics';
import EmptyState from '../../../components/Common/EmptyState';
import Pagination from '../../../components/Common/Pagination';
import usePagination from '../../../hooks/usePagination';
import EntityFormDialog from './EntityFormDialog';
import EntityCard from './EntityCard';
import { formatFieldValue, formatMetricValue, COUNTRY_OPTIONS, formatCountry } from '../utils/fieldFormat';
import { entityTypeIcon, metricIcon } from '../utils/entityIcons';
import {
  listEntities,
  createEntity,
  updateEntity,
  deleteEntity,
  transformEntity,
} from '../../../services/partnerEntityService';

/**
 * Generic, config-driven entity list for one type — styled to match the
 * /projects page (BentoCard header + metrics eye-toggle + stat-card row +
 * toolbar with grid/list view toggle). Metrics, filters, table columns and the
 * add/edit form are all derived from the type config, so every entity type
 * reuses this one page. No demo data: metrics reflect real records only.
 */
export default function EntityListPage({ type, allTypes = [] }) {
  const theme = useTheme();
  const [rows, setRows] = useState([]);
  const [metrics, setMetrics] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({});
  const [showFilters, setShowFilters] = useState(false);
  const [dialog, setDialog] = useState({ open: false, entity: null });
  const [saving, setSaving] = useState(false);
  const [menu, setMenu] = useState({ anchor: null, row: null });
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });

  const typeKey = type?.type_key;
  const color = type?.color || theme.palette.primary.main;
  const TypeIcon = entityTypeIcon(type?.icon);

  const [showMetrics, setShowMetrics] = useShowMetrics(`partnersHub.${typeKey}`);
  const VIEW_KEY = `orch_partnersHub_${typeKey}_view`;
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === 'card' ? 'card' : 'list';
    } catch {
      return 'list';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, viewMode);
    } catch {
      /* ignore */
    }
  }, [VIEW_KEY, viewMode]);

  const tableFields = useMemo(
    () => (type?.fields || []).filter((f) => f.showInTable),
    [type]
  );
  const filterDefs = type?.filters || [];
  const activeFilterCount = Object.values(filters).filter((v) =>
    Array.isArray(v) ? v.length : v
  ).length;

  const load = useCallback(async () => {
    if (!typeKey) return;
    setLoading(true);
    try {
      const res = await listEntities(typeKey, { search, filters });
      setRows(res.rows || []);
      setMetrics(res.metrics || []);
      setTotal(res.total ?? (res.rows || []).length);
    } catch (err) {
      setToast({ open: true, message: err.message || 'Failed to load', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, [typeKey, search, filters]);

  useEffect(() => {
    const t = setTimeout(load, 200); // debounce search/filter changes
    return () => clearTimeout(t);
  }, [load]);

  const pagination = usePagination(rows, {
    surfaceId: `partnersHub.${typeKey}.${viewMode}`,
    defaultRowsPerPage: viewMode === 'card' ? 9 : 12,
    resetOn: [typeKey, search, JSON.stringify(filters), viewMode],
  });

  const handleSubmit = async ({ name, data }) => {
    setSaving(true);
    try {
      if (dialog.entity) {
        await updateEntity(dialog.entity.id, { name, data });
      } else {
        await createEntity({ entity_type_key: typeKey, name, data });
      }
      setDialog({ open: false, entity: null });
      setToast({ open: true, message: `${type.label} saved`, severity: 'success' });
      load();
    } catch (err) {
      setToast({ open: true, message: err.message || 'Save failed', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row) => {
    setMenu({ anchor: null, row: null });
    try {
      await deleteEntity(row.id);
      setToast({ open: true, message: 'Deleted', severity: 'info' });
      load();
    } catch (err) {
      setToast({ open: true, message: err.message || 'Delete failed', severity: 'error' });
    }
  };

  const handleTransform = async (row, targetKey) => {
    setMenu({ anchor: null, row: null });
    try {
      await transformEntity(row.id, targetKey);
      const label = allTypes.find((t) => t.type_key === targetKey)?.label || targetKey;
      setToast({ open: true, message: `Transformed into ${label}`, severity: 'success' });
    } catch (err) {
      setToast({ open: true, message: err.message || 'Transform failed', severity: 'error' });
    }
  };

  const setFilterValue = (key, value) => setFilters((f) => ({ ...f, [key]: value }));
  const openMenu = (anchor, row) => setMenu({ anchor, row });
  const singular = type?.label?.replace(/s$/, '') || 'record';

  return (
    <BentoCard
      title={type?.label || 'Records'}
      subtitle={showMetrics ? `${total} ${(type?.label || 'records').toLowerCase()}` : undefined}
      icon={TypeIcon}
      iconColor={color}
      noPadding
      plainHeader
      action={
        <MetricsToggleButton showMetrics={showMetrics} onToggle={() => setShowMetrics((v) => !v)} />
      }
    >
      {/* Metrics strip — real data only */}
      <Collapse in={showMetrics}>
        <Box sx={{ px: { xs: 1.25, sm: 1.5 }, pt: 1.25, pb: 1.25 }}>
          <Box
            sx={{
              display: 'grid',
              gap: 1.25,
              gridTemplateColumns: {
                xs: 'repeat(2, minmax(0, 1fr))',
                sm: 'repeat(2, minmax(0, 1fr))',
                md: 'repeat(4, minmax(0, 1fr))',
                lg: `repeat(${Math.min(metrics.length || 1, 5)}, minmax(0, 1fr))`,
              },
            }}
          >
            {metrics.map((m) => (
              <StatCard
                key={m.key}
                label={m.label}
                value={formatMetricValue(m.format, m.value)}
                helper={m.helper}
                color={color}
                icon={metricIcon(m, TypeIcon)}
              />
            ))}
          </Box>
        </Box>
      </Collapse>

      {/* Toolbar */}
      <Box
        sx={{
          p: 1.5,
          display: 'flex',
          alignItems: 'center',
          gap: 1.25,
          flexWrap: 'wrap',
          borderTop: '1px solid',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        {filterDefs.length > 0 && (
          <Tooltip title="Filters" arrow>
            <IconButton
              onClick={() => setShowFilters((s) => !s)}
              sx={{
                bgcolor: 'background.paper',
                border: '1px solid',
                borderColor: showFilters || activeFilterCount ? 'primary.main' : 'divider',
                borderRadius: 2,
                color: showFilters || activeFilterCount ? 'primary.main' : 'text.secondary',
                '&:hover': { borderColor: 'primary.main' },
              }}
              aria-label="Filters"
            >
              <TuneIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>
        )}
        <ToggleButtonGroup
          value={viewMode}
          exclusive
          onChange={(_, v) => v != null && setViewMode(v)}
          size="small"
          sx={{
            bgcolor: alpha(theme.palette.background.default, 0.8),
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
            '& .MuiToggleButton-root': {
              px: 1.25,
              py: 0.75,
              border: 'none',
              color: 'text.secondary',
              '&.Mui-selected': {
                bgcolor: alpha(theme.palette.primary.main, 0.15),
                color: 'primary.main',
                '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.22) },
              },
            },
          }}
        >
          <ToggleButton value="card" aria-label="Card view">
            <ViewModuleIcon sx={{ fontSize: 20 }} />
          </ToggleButton>
          <ToggleButton value="list" aria-label="List view">
            <ViewListIcon sx={{ fontSize: 20 }} />
          </ToggleButton>
        </ToggleButtonGroup>

        <TextField
          size="small"
          placeholder={`Search ${(type?.label || 'records').toLowerCase()}...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ flex: 1, minWidth: 180 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ fontSize: 18, color: 'text.disabled' }} />
              </InputAdornment>
            ),
          }}
        />

        <Button
          variant="contained"
          size="small"
          startIcon={<AddIcon />}
          onClick={() => setDialog({ open: true, entity: null })}
          sx={{ textTransform: 'none', borderRadius: 2, bgcolor: color, '&:hover': { bgcolor: color } }}
        >
          Add {singular}
        </Button>
      </Box>

      {/* Filter bar */}
      {filterDefs.length > 0 && (
        <Collapse in={showFilters}>
          <Box
            sx={{
              display: 'flex',
              gap: 1.5,
              flexWrap: 'wrap',
              p: 1.5,
              borderBottom: '1px solid',
              borderColor: 'divider',
            }}
          >
            {filterDefs.map((def) => {
              const opts =
                def.kind === 'country'
                  ? COUNTRY_OPTIONS
                  : type.fields.find((f) => f.key === def.field)?.options || [];
              return (
                <Autocomplete
                  key={def.key}
                  multiple
                  size="small"
                  options={opts}
                  getOptionLabel={(o) => (def.kind === 'country' ? formatCountry(o) : String(o))}
                  value={filters[def.field] || []}
                  onChange={(_e, val) => setFilterValue(def.field, val)}
                  sx={{ minWidth: 220 }}
                  renderInput={(params) => <TextField {...params} label={def.label} />}
                />
              );
            })}
          </Box>
        </Collapse>
      )}

      {/* Body */}
      <Box sx={{ p: 1.5 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress size={28} />
          </Box>
        ) : rows.length === 0 ? (
          <EmptyState
            title={`No ${(type?.label || 'records').toLowerCase()} yet`}
            description={
              search || activeFilterCount
                ? 'Try adjusting your search or filters.'
                : `Add your first ${singular.toLowerCase()} to get started.`
            }
            actionLabel={`Add ${singular}`}
            onAction={() => setDialog({ open: true, entity: null })}
          />
        ) : (
          <>
            <Typography
              variant="overline"
              sx={{ color: 'text.secondary', fontWeight: 700, letterSpacing: '0.06em', display: 'block', mb: 1 }}
            >
              {type?.label} list
            </Typography>

            {viewMode === 'card' ? (
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
                  gap: 1.5,
                }}
              >
                {pagination.paginatedData.map((row) => (
                  <EntityCard key={row.id} entity={row} fields={tableFields} color={color} onMenu={openMenu} />
                ))}
              </Box>
            ) : (
              <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
                      {tableFields.map((f) => (
                        <TableCell key={f.key} sx={{ fontWeight: 700 }}>
                          {f.label}
                        </TableCell>
                      ))}
                      <TableCell align="right" sx={{ fontWeight: 700 }}>
                        Actions
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pagination.paginatedData.map((row) => (
                      <TableRow key={row.id} hover>
                        <TableCell sx={{ fontWeight: 600 }}>{row.name}</TableCell>
                        {tableFields.map((f) => (
                          <TableCell key={f.key}>{formatFieldValue(f, row.data?.[f.key])}</TableCell>
                        ))}
                        <TableCell align="right">
                          <IconButton
                            size="small"
                            onClick={(e) => openMenu(e.currentTarget, row)}
                            aria-label="Row actions"
                          >
                            <MoreVertIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            <Pagination
              count={pagination.totalCount}
              page={pagination.page}
              rowsPerPage={pagination.rowsPerPage}
              rowsPerPageOptions={pagination.rowsPerPageOptions}
              onPageChange={pagination.setPage}
              onRowsPerPageChange={pagination.setRowsPerPage}
              onLoadAll={pagination.loadAll}
              onCollapseAll={pagination.collapseAll}
              allMode={pagination.allMode}
              label={(type?.label || 'records').toLowerCase()}
              dense
            />
          </>
        )}
      </Box>

      {/* Row action menu */}
      <Menu anchorEl={menu.anchor} open={!!menu.anchor} onClose={() => setMenu({ anchor: null, row: null })}>
        <MenuItem
          onClick={() => {
            setDialog({ open: true, entity: menu.row });
            setMenu({ anchor: null, row: null });
          }}
        >
          <EditOutlinedIcon fontSize="small" sx={{ mr: 1 }} /> Edit
        </MenuItem>
        {allTypes
          .filter((t) => t.type_key !== typeKey)
          .map((t) => (
            <MenuItem key={t.type_key} onClick={() => handleTransform(menu.row, t.type_key)}>
              <SwapHorizOutlinedIcon fontSize="small" sx={{ mr: 1 }} /> Transform to {t.label}
            </MenuItem>
          ))}
        <MenuItem onClick={() => handleDelete(menu.row)} sx={{ color: 'error.main' }}>
          <DeleteOutlineIcon fontSize="small" sx={{ mr: 1 }} /> Delete
        </MenuItem>
      </Menu>

      <EntityFormDialog
        open={dialog.open}
        onClose={() => setDialog({ open: false, entity: null })}
        type={type}
        entity={dialog.entity}
        onSubmit={handleSubmit}
        saving={saving}
      />

      <Snackbar
        open={toast.open}
        autoHideDuration={4000}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={toast.severity}
          onClose={() => setToast((t) => ({ ...t, open: false }))}
          variant="filled"
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </BentoCard>
  );
}
