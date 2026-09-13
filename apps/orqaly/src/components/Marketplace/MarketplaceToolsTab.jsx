import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Chip,
  Button,
  TextField,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  IconButton,
  Snackbar,
  Alert,
  Skeleton,
  useTheme,
  alpha,
} from '@mui/material';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import CloseIcon from '@mui/icons-material/Close';
import Rating from '@mui/material/Rating';
import FormDialog from '../Common/FormDialog';
import EmptyState from '../Common/EmptyState';
import Pagination from '../Common/Pagination';
import MarketplaceToolbar from './MarketplaceToolbar';
import RatingCommentDialog from './RatingCommentDialog';
import McpToolDetail from '../Tools/McpToolDetail';
import ToolIcon from '../icons/ToolIcon';
import useMarketplaceSearch from '../../hooks/useMarketplaceSearch';
import useImportedLibraries from '../../hooks/useImportedLibraries';
import { ImportFromButton } from './ImportLibraryDialog';
import usePagination from '../../hooks/usePagination';
import { deriveFacetOptions } from '../../utils/facetOptions';
import { createHoverGlowShadow } from '../../theme/hoverGlow';
import { getAllTools, createTool, TOOL_CONNECTION_TYPES } from '../../services/toolService';
import { loadPredefinedTools } from '../../services/predefinedToolService';
import {
  getAllRatings,
  saveRating,
  syncRatingsFromDB,
} from '../../services/marketplaceRatingService';
import { fetchComposioConnections } from '../../services/composioService';
import { getMcpAppById } from '../../config/mcpToolCatalog';

import AppIcon from '../icons/AppIcon';

const STATUS_COLORS = {
  active: { bg: '#D1FAE5', color: '#059669', border: '#A7F3D0' },
  blocked: { bg: '#FEF3C7', color: '#D97706', border: '#FDE68A' },
  inactive: { bg: '#F1F5F9', color: '#64748B', border: '#E2E8F0' },
};
const STATUS_COLORS_DARK = {
  active: { bg: 'rgba(34,197,94,0.1)', color: '#4ADE80', border: 'rgba(34,197,94,0.2)' },
  blocked: { bg: 'rgba(234,179,8,0.1)', color: '#FACC15', border: 'rgba(234,179,8,0.2)' },
  inactive: { bg: 'rgba(148,163,184,0.1)', color: '#94A3B8', border: 'rgba(148,163,184,0.2)' },
};

const CONNECTION_LABELS = {
  api: 'REST API',
  internal: 'Internal',
  webhook: 'Webhook',
  sdk: 'SDK',
  composio: 'Composio',
};

const CATEGORIES = TOOL_CONNECTION_TYPES.map((t) => ({
  value: t,
  label: CONNECTION_LABELS[t] || t,
}));

const FACETS = [{ key: 'status', label: 'Status', field: 'status' }];

const SORT_OPTIONS = [
  { value: 'name', label: 'Name A-Z' },
  { value: 'newest', label: 'Newest' },
];

const EMPTY_FORM = {
  name: '',
  description: '',
  status: 'active',
  connectionType: 'api',
  category: '',
  url: '',
  apiKey: '',
  apiMethod: 'POST',
};

export default function MarketplaceToolsTab() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [previewTool, setPreviewTool] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [ratings, setRatings] = useState(() => getAllRatings());
  const [ratingDialog, setRatingDialog] = useState({ open: false, id: '', name: '' });
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });
  const [composioConnections, setComposioConnections] = useState([]);

  const loadTools = useCallback(async () => {
    try {
      // Seed any predefined/MCP catalog tools not yet in the DB before reading,
      // so newly-added catalog entries show up when the marketplace is the first
      // page opened (the Tools page seeds too, but a user may never visit it).
      // Self-heals: only inserts entries missing from the DB, else returns fast.
      await loadPredefinedTools().catch(() => {});
      const list = await getAllTools();
      setTools(list || []);
    } catch {
      setTools([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTools();
    syncRatingsFromDB().then((synced) => setRatings(synced));
    fetchComposioConnections()
      .then(setComposioConnections)
      .catch(() => {});
  }, [loadTools]);

  const { importedItems } = useImportedLibraries('tools');
  const importedToolIds = useMemo(
    () => new Set(importedItems.map((i) => i.id).filter(Boolean)),
    [importedItems]
  );
  const displayTools = useMemo(
    () => tools.map((t) => (importedToolIds.has(t.id) ? { ...t, _imported: true } : t)),
    [tools, importedToolIds]
  );

  const searchOptions = useMemo(() => ({ facets: FACETS }), []);
  const facetOptions = useMemo(
    () => ({ status: deriveFacetOptions(displayTools, 'status') }),
    [displayTools]
  );

  const {
    filteredItems,
    searchQuery,
    setSearchQuery,
    categoryFilter,
    setCategoryFilter,
    sortBy,
    setSortBy,
    resultCount,
    facets,
    facetFilters,
    toggleFacetValue,
    clearAllFacets,
    facetKey,
  } = useMarketplaceSearch(
    displayTools,
    ['name', 'description', 'category'],
    'connectionType',
    searchOptions
  );

  const pagination = usePagination(filteredItems, {
    surfaceId: 'marketplace.tools',
    defaultRowsPerPage: 12,
    resetOn: [searchQuery, categoryFilter, sortBy, facetKey],
  });

  const handleCreate = useCallback(async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await createTool(form);
      await loadTools();
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      setToast({ open: true, message: `${form.name} created`, severity: 'success' });
    } catch (err) {
      setToast({ open: true, message: err.message, severity: 'error' });
    } finally {
      setSaving(false);
    }
  }, [form, loadTools]);

  const getStatusColor = (status) =>
    (isDark ? STATUS_COLORS_DARK : STATUS_COLORS)[status] || STATUS_COLORS.inactive;

  if (loading) {
    return (
      <Box>
        <Skeleton variant="rounded" height={40} sx={{ mb: 3, borderRadius: 2 }} />
        <Grid container spacing={2}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Grid key={i} size={{ xs: 12, sm: 6, md: 6, lg: 4 }}>
              <Skeleton variant="rounded" height={180} sx={{ borderRadius: 2.5 }} />
            </Grid>
          ))}
        </Grid>
      </Box>
    );
  }

  return (
    <Box>
      <MarketplaceToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        categories={CATEGORIES}
        categoryFilter={categoryFilter}
        onCategoryChange={setCategoryFilter}
        sortBy={sortBy}
        onSortChange={setSortBy}
        sortOptions={SORT_OPTIONS}
        placeholder="Search tools..."
        resultCount={resultCount}
        totalCount={tools.length}
        facets={facets}
        facetFilters={facetFilters}
        facetOptions={facetOptions}
        onToggleFacet={toggleFacetValue}
        onClearFacets={clearAllFacets}
        actionButton={
          <Box sx={{ display: 'flex', gap: 1 }}>
            <ImportFromButton category="tools" onImported={loadTools} />
            <Button
              variant="outlined"
              size="small"
              onClick={() => setCreateOpen(true)}
              aria-label="Add tool"
              sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2, minWidth: 'auto' }}
            >
              (+)
            </Button>
          </Box>
        }
      />
      {filteredItems.length === 0 ? (
        <EmptyState
          icon={BuildOutlinedIcon}
          title="No tools found"
          description="Add your first tool or adjust your filters."
          actionLabel="Add Tool"
          onAction={() => setCreateOpen(true)}
        />
      ) : (
        <>
          <Grid container spacing={2}>
            {pagination.paginatedData.map((tool, idx) => {
              const sc = getStatusColor(tool.status);
              return (
                <Grid key={tool.id || idx} size={{ xs: 12, sm: 6, md: 6, lg: 4 }}>
                  <Paper
                    elevation={0}
                    sx={{
                      p: 2,
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      borderRadius: 2.5,
                      border: '1px solid',
                      borderColor: alpha(theme.palette.info.main, 0.18),
                      background: `linear-gradient(135deg, ${alpha(theme.palette.info.main, 0.04)} 0%, ${alpha(theme.palette.background.paper, 0.98)} 70%)`,
                      transition: 'all 0.2s ease-in-out',
                      '&:hover': {
                        borderColor: 'primary.main',
                        transform: 'translateY(-2px)',
                        boxShadow: createHoverGlowShadow(theme),
                      },
                      animation: theme.animations?.fadeInUp,
                      animationDelay: `${Math.min(idx * 50, 400)}ms`,
                      animationFillMode: 'both',
                    }}
                  >
                    {/* Header */}
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 1 }}>
                      <ToolIcon
                        tool={getMcpAppById(tool.id) || tool}
                        tileSize={40}
                        size={20}
                        subColor={theme.palette.info.main}
                      />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: 700, lineHeight: 1.2 }}
                          noWrap
                        >
                          {tool.name}
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                          <Chip
                            label={CONNECTION_LABELS[tool.connectionType] || tool.connectionType}
                            size="small"
                            variant="outlined"
                            sx={{ height: 18, fontSize: '0.65rem' }}
                          />
                          <Chip
                            label={tool.status}
                            size="small"
                            sx={{
                              height: 18,
                              fontSize: '0.6rem',
                              fontWeight: 600,
                              bgcolor: sc.bg,
                              color: sc.color,
                              border: `1px solid ${sc.border}`,
                            }}
                          />
                          {tool._imported && (
                            <Chip
                              label="Imported"
                              size="small"
                              sx={{
                                height: 18,
                                fontSize: '0.6rem',
                                fontWeight: 600,
                                bgcolor: alpha(theme.palette.secondary.main, 0.14),
                                color: 'secondary.main',
                              }}
                            />
                          )}
                        </Box>
                      </Box>
                    </Box>

                    {/* Description */}
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{
                        mb: 1.5,
                        flex: 1,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        fontSize: '0.82rem',
                      }}
                    >
                      {tool.description || 'No description'}
                    </Typography>

                    {/* Used by */}
                    {tool.usedBy?.length > 0 && (
                      <Typography variant="caption" color="text.secondary" sx={{ mb: 1 }}>
                        Used by {tool.usedBy.length} agent{tool.usedBy.length !== 1 ? 's' : ''}
                      </Typography>
                    )}

                    {/* Rating */}
                    {ratings[tool.id]?.rating && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                        <Rating
                          value={ratings[tool.id].rating}
                          size="small"
                          readOnly
                          sx={{ '& .MuiRating-iconFilled': { color: '#F59E0B' } }}
                        />
                        {ratings[tool.id].comment && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ fontStyle: 'italic' }}
                            noWrap
                          >
                            "{ratings[tool.id].comment}"
                          </Typography>
                        )}
                      </Box>
                    )}

                    {/* Actions */}
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        mt: 'auto',
                      }}
                    >
                      <IconButton
                        size="small"
                        onClick={() =>
                          setRatingDialog({ open: true, id: tool.id, name: tool.name })
                        }
                        sx={{ p: 0.25 }}
                      >
                        <AppIcon
                          name="StarRounded"
                          fallback={StarRoundedIcon}
                          sx={{
                            fontSize: 16,
                            color: ratings[tool.id]?.rating ? '#F59E0B' : 'text.disabled',
                          }}
                        />
                      </IconButton>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => setPreviewTool(tool)}
                        sx={{
                          fontSize: '0.72rem',
                          textTransform: 'none',
                          minWidth: 'auto',
                          px: 1.5,
                          borderRadius: 2,
                        }}
                      >
                        Details
                      </Button>
                    </Box>
                  </Paper>
                </Grid>
              );
            })}
          </Grid>
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
            label="tools"
            dense
          />
        </>
      )}
      {/* MCP/Composio Tool Detail — full tabbed dialog */}
      <McpToolDetail
        open={!!previewTool && !!getMcpAppById(previewTool?.id)}
        onClose={() => setPreviewTool(null)}
        tool={previewTool}
        catalogEntry={previewTool ? getMcpAppById(previewTool.id) : null}
        connections={composioConnections}
        onToolUpdated={() => {
          loadTools();
          fetchComposioConnections()
            .then(setComposioConnections)
            .catch(() => {});
        }}
      />
      {/* Simple Preview Dialog — for non-MCP tools */}
      {previewTool && !getMcpAppById(previewTool?.id) && (
        <FormDialog
          open
          onClose={() => setPreviewTool(null)}
          title={previewTool.name}
          icon={BuildOutlinedIcon}
          maxWidth="sm"
          contentDividers={false}
          contentSx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}
          primaryLabel="Close"
          onPrimary={() => setPreviewTool(null)}
          hideCancel
        >
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            <Chip
              label={CONNECTION_LABELS[previewTool.connectionType] || previewTool.connectionType}
              size="small"
              variant="outlined"
            />
            <Chip
              label={previewTool.status}
              size="small"
              sx={{
                bgcolor: getStatusColor(previewTool.status).bg,
                color: getStatusColor(previewTool.status).color,
                fontWeight: 600,
              }}
            />
            {previewTool.category && (
              <Chip label={previewTool.category} size="small" variant="outlined" />
            )}
            {previewTool.subcategory && (
              <Chip label={previewTool.subcategory} size="small" variant="outlined" />
            )}
          </Box>
          <Typography variant="body2" color="text.secondary">
            {previewTool.description || 'No description'}
          </Typography>
          {previewTool.url && (
            <Box>
              <Typography
                variant="caption"
                sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}
              >
                Endpoint
              </Typography>
              <Typography
                variant="body2"
                sx={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'text.secondary' }}
              >
                {previewTool.apiMethod || 'POST'} {previewTool.url}
              </Typography>
            </Box>
          )}
          {previewTool.usedBy?.length > 0 && (
            <Typography variant="body2" color="text.secondary">
              Used by {previewTool.usedBy.length} agent(s)
            </Typography>
          )}
          {previewTool.actions?.length > 0 && (
            <Box>
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  display: 'block',
                  mb: 0.5,
                }}
              >
                Actions ({previewTool.actions.length})
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {previewTool.actions.map((a) => (
                  <Chip
                    key={a}
                    label={a}
                    size="small"
                    variant="outlined"
                    sx={{ fontSize: '0.65rem', fontFamily: 'monospace' }}
                  />
                ))}
              </Box>
            </Box>
          )}
        </FormDialog>
      )}
      {/* Create Tool Dialog */}
      <FormDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add New Tool"
        icon={AddCircleOutlineIcon}
        maxWidth="sm"
        contentDividers={false}
        contentSx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
        actions={
          <>
            <Button onClick={() => setCreateOpen(false)} sx={{ textTransform: 'none' }}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleCreate}
              disabled={saving || !form.name.trim()}
              sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
            >
              {saving ? 'Creating...' : 'Create Tool'}
            </Button>
          </>
        }
      >
        <TextField
          label="Name"
          size="small"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
        />
        <TextField
          label="Description"
          size="small"
          multiline
          rows={2}
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
        />
        <FormControl size="small">
          <InputLabel>Connection Type</InputLabel>
          <Select
            value={form.connectionType}
            label="Connection Type"
            onChange={(e) => setForm((f) => ({ ...f, connectionType: e.target.value }))}
            sx={{ borderRadius: 2 }}
          >
            {TOOL_CONNECTION_TYPES.map((t) => (
              <MenuItem key={t} value={t}>
                {CONNECTION_LABELS[t] || t}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          label="URL / Endpoint"
          size="small"
          value={form.url}
          onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
        />
      </FormDialog>
      <RatingCommentDialog
        open={ratingDialog.open}
        onClose={() => setRatingDialog({ open: false, id: '', name: '' })}
        itemName={ratingDialog.name}
        currentRating={ratings[ratingDialog.id]?.rating}
        currentComment={ratings[ratingDialog.id]?.comment}
        onSave={(r, c) => {
          saveRating(ratingDialog.id, r, c, 'tool');
          setRatings(getAllRatings());
          setToast({ open: true, message: 'Rating saved', severity: 'success' });
        }}
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
    </Box>
  );
}
