/**
 * MarketplaceImport - dedicated page to request a live external provider
 * catalog (Composio tools, OpenRouter / Hugging Face models), search it, tick
 * the items you want, and import them into the matching Marketplace tab via the
 * same useImportedLibraries().importItems flow used by the curated dialog.
 */
import { useEffect, useMemo, useState, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  TextField,
  MenuItem,
  Checkbox,
  Button,
  Skeleton,
  Alert,
  Chip,
  Snackbar,
  InputAdornment,
  CircularProgress,
  Tooltip,
  useTheme,
  alpha,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import SearchOffOutlinedIcon from '@mui/icons-material/SearchOffOutlined';
import CloudDownloadOutlinedIcon from '@mui/icons-material/CloudDownloadOutlined';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import PageLayout from '../../components/Common/PageLayout';
import EmptyState from '../../components/Common/EmptyState';
import Pagination from '../../components/Common/Pagination';
import useProviderCatalogSearch from '../../hooks/useProviderCatalogSearch';
import useImportedLibraries from '../../hooks/useImportedLibraries';
import usePagination from '../../hooks/usePagination';
import { getProvidersForCategory } from '../../config/liveCatalogProviders';
import { itemKey } from '../../config/marketplaceImportSources';
import { createHoverGlowShadow } from '../../theme/hoverGlow';
import ImportLibraryDialog from '../../components/Marketplace/ImportLibraryDialog';
import { PERSONAL_CATALOG_LABEL } from '../../config/catalogUi';

const CATEGORY_LABELS = {
  orgs: 'Organizations',
  teams: 'Consilium',
  agents: 'Agents',
  models: 'Models',
  tools: 'Tools',
  skills: 'Skills',
};
const CATEGORY_IDS = Object.keys(CATEGORY_LABELS);

function formatCount(n) {
  const num = Number(n) || 0;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(num);
}

function ctxLabel(n) {
  const num = Number(n) || 0;
  if (num >= 1000) return `${Math.round(num / 1000)}k ctx`;
  return num ? `${num} ctx` : null;
}

function ItemChips({ item }) {
  const chips = [];
  if (item.pipelineTag) chips.push({ label: item.pipelineTag });
  if (item.category && item.category !== item.pipelineTag) chips.push({ label: item.category });
  if (item.downloads != null && item.downloads > 0)
    chips.push({ label: `${formatCount(item.downloads)}`, icon: DownloadOutlinedIcon });
  if (item.likes != null && item.likes > 0)
    chips.push({ label: `${formatCount(item.likes)}`, icon: FavoriteBorderIcon });
  const ctx = ctxLabel(item.contextLength);
  if (ctx) chips.push({ label: ctx });
  return (
    <Box sx={{ display: 'flex', gap: 0.5, mt: 0.4, flexWrap: 'wrap' }}>
      {chips.map((c, i) => (
        <Chip
          key={`${c.label}-${i}`}
          label={c.label}
          size="small"
          variant="outlined"
          icon={c.icon ? <c.icon sx={{ fontSize: '0.7rem !important' }} /> : undefined}
          sx={{ height: 18, fontSize: '0.6rem', '& .MuiChip-icon': { ml: 0.4 } }}
        />
      ))}
    </Box>
  );
}

function ResultRow({ item, selected, imported, onToggle, theme }) {
  return (
    <Box
      onClick={() => !imported && onToggle(item)}
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1,
        py: 1,
        px: 1.25,
        borderBottom: '1px solid',
        borderColor: 'divider',
        cursor: imported ? 'default' : 'pointer',
        transition: 'background-color 0.15s ease',
        bgcolor: selected ? alpha(theme.palette.primary.main, 0.06) : 'transparent',
        opacity: imported ? 0.65 : 1,
        '&:last-of-type': { borderBottom: 'none' },
        '&:hover': imported ? {} : { bgcolor: alpha(theme.palette.primary.main, 0.04) },
      }}
    >
      <Checkbox
        size="small"
        checked={imported || selected}
        disabled={imported}
        onClick={(e) => e.stopPropagation()}
        onChange={() => onToggle(item)}
        sx={{ p: 0.5, mt: 0.1 }}
        inputProps={{ 'aria-label': `Select ${item.name}` }}
      />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
          <Tooltip title={item.name} enterDelay={600}>
            <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 0 }} noWrap>
              {item.name}
            </Typography>
          </Tooltip>
          {imported && (
            <Chip
              label="Imported"
              size="small"
              color="success"
              variant="outlined"
              sx={{ height: 16, fontSize: '0.56rem', flexShrink: 0 }}
            />
          )}
        </Box>
        <ItemChips item={item} />
      </Box>
    </Box>
  );
}

export default function MarketplaceImport() {
  const theme = useTheme();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const category = CATEGORY_IDS.includes(searchParams.get('category'))
    ? searchParams.get('category')
    : 'models';

  const providers = useMemo(() => getProvidersForCategory(category), [category]);
  const { provider, setProvider, query, setQuery, items, loading, error } =
    useProviderCatalogSearch(category, providers[0]?.id || '');
  const { importedItems = [], importItems } = useImportedLibraries(category);

  const [selected, setSelected] = useState({});
  const [busy, setBusy] = useState(false);
  const [curatedOpen, setCuratedOpen] = useState(false);
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });

  const pagination = usePagination(items, {
    surfaceId: 'marketplace.provider-catalog',
    defaultRowsPerPage: 12,
    rowsPerPageOptions: [12, 24, 48],
    resetOn: [provider, category, query],
  });

  // Reset provider + selection when the category changes.
  useEffect(() => {
    setProvider(providers[0]?.id || '');
    setSelected({});
  }, [category, providers, setProvider]);

  // Clear selection when switching provider (different item set).
  useEffect(() => {
    setSelected({});
  }, [provider]);

  const importedKeys = useMemo(
    () => new Set(importedItems.map((it) => itemKey(it))),
    [importedItems]
  );
  const providerLabel = providers.find((p) => p.id === provider)?.label || provider;

  const toggleItem = useCallback((item) => {
    const key = itemKey(item);
    setSelected((prev) => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = item;
      return next;
    });
  }, []);

  const selectedCount = Object.keys(selected).length;

  // Select-all-on-page state over the current page's selectable (non-imported) items.
  const pageItems = pagination.paginatedData;
  const pageSelectable = pageItems.filter((it) => !importedKeys.has(itemKey(it)));
  const pageAllSelected =
    pageSelectable.length > 0 && pageSelectable.every((it) => selected[itemKey(it)]);
  const pageSomeSelected = !pageAllSelected && pageSelectable.some((it) => selected[itemKey(it)]);

  const toggleSelectAllOnPage = useCallback(() => {
    setSelected((prev) => {
      const next = { ...prev };
      if (pageAllSelected) {
        pageSelectable.forEach((it) => delete next[itemKey(it)]);
      } else {
        pageSelectable.forEach((it) => {
          next[itemKey(it)] = it;
        });
      }
      return next;
    });
  }, [pageAllSelected, pageSelectable]);

  const handleCategoryChange = (e) => {
    const next = e.target.value;
    setSearchParams(next === 'models' ? {} : { category: next });
  };

  const handleImport = useCallback(async () => {
    const chosen = Object.values(selected);
    if (chosen.length === 0) return;
    setBusy(true);
    try {
      const lib = {
        id: `${provider}-live`,
        name: providerLabel,
        description: `Imported live from ${providerLabel}`,
        author: providerLabel,
        url: null,
        custom: false,
        items: chosen,
      };
      await importItems(lib, chosen);
      setToast({
        open: true,
        message: `${chosen.length} imported from ${providerLabel}`,
        severity: 'success',
      });
      setSelected({});
    } catch (err) {
      setToast({ open: true, message: err.message || 'Import failed', severity: 'error' });
    } finally {
      setBusy(false);
    }
  }, [selected, provider, providerLabel, importItems]);

  const hasResults = items.length > 0;

  return (
    <PageLayout
      title="Import from a provider"
      subtitle="Request a provider's live catalog, pick what you need, and import it into your marketplace"
      action={
        <Button
          size="small"
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/marketplace/browse')}
          sx={{ textTransform: 'none', fontWeight: 600 }}
        >
          {PERSONAL_CATALOG_LABEL}
        </Button>
      }
    >
      <Paper
        elevation={0}
        sx={{ p: 2, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}
      >
        {/* Category + provider selectors */}
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 2 }}>
          <TextField
            select
            size="small"
            label="Category"
            value={category}
            onChange={handleCategoryChange}
            sx={{ minWidth: 180, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          >
            {CATEGORY_IDS.map((id) => (
              <MenuItem key={id} value={id}>
                {CATEGORY_LABELS[id]}
              </MenuItem>
            ))}
          </TextField>

          {providers.length > 0 && (
            <TextField
              select
              size="small"
              label="Provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              sx={{ minWidth: 180, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              inputProps={{ 'aria-label': 'Provider' }}
            >
              {providers.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.label}
                </MenuItem>
              ))}
            </TextField>
          )}
        </Box>

        {providers.length === 0 ? (
          <Alert
            severity="info"
            action={
              <Button
                color="inherit"
                size="small"
                onClick={() => setCuratedOpen(true)}
                sx={{ textTransform: 'none', fontWeight: 600 }}
              >
                Curated import
              </Button>
            }
          >
            No live catalog for {CATEGORY_LABELS[category]} yet. Use the curated libraries instead.
          </Alert>
        ) : (
          <>
            <TextField
              fullWidth
              size="small"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${providerLabel} catalog...`}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ fontSize: 18, color: 'text.disabled' }} />
                  </InputAdornment>
                ),
                endAdornment: loading ? (
                  <InputAdornment position="end">
                    <CircularProgress size={16} />
                  </InputAdornment>
                ) : null,
              }}
              inputProps={{ 'aria-label': 'Search catalog' }}
              sx={{ mb: 1.5, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />

            {error && (
              <Alert severity="error" sx={{ mb: 1.5 }}>
                {error}
              </Alert>
            )}

            {loading ? (
              <Box>
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} variant="rounded" height={48} sx={{ mb: 0.75 }} />
                ))}
              </Box>
            ) : !hasResults ? (
              <EmptyState
                icon={SearchOffOutlinedIcon}
                title={error ? 'Could not load the catalog' : 'No results'}
                description={
                  error
                    ? 'The provider request failed. Try again in a moment.'
                    : `No items match your search in the ${providerLabel} catalog. Try a different term.`
                }
                sx={{ py: 5 }}
              />
            ) : (
              <Box
                sx={{
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 2.5,
                  overflow: 'hidden',
                }}
              >
                {/* Results header: count + select all on page */}
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    px: 1.25,
                    py: 0.75,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    bgcolor: alpha(theme.palette.primary.main, 0.03),
                  }}
                >
                  <Checkbox
                    size="small"
                    checked={pageAllSelected}
                    indeterminate={pageSomeSelected}
                    disabled={pageSelectable.length === 0}
                    onChange={toggleSelectAllOnPage}
                    sx={{ p: 0.5 }}
                    inputProps={{ 'aria-label': 'Select all on this page' }}
                  />
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                    Showing {pagination.startIndex + 1}-{pagination.endIndex} of{' '}
                    {pagination.totalCount} from {providerLabel}
                  </Typography>
                </Box>

                {pageItems.map((item) => (
                  <ResultRow
                    key={item.id || itemKey(item)}
                    item={item}
                    theme={theme}
                    selected={!!selected[itemKey(item)]}
                    imported={importedKeys.has(itemKey(item))}
                    onToggle={toggleItem}
                  />
                ))}

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
                  label="items"
                  dense
                />
              </Box>
            )}

            {selectedCount > 0 && (
              <Box
                sx={{
                  position: 'sticky',
                  bottom: 12,
                  mt: 1.5,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  px: 2,
                  py: 1.25,
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: alpha(theme.palette.primary.main, 0.4),
                  bgcolor: theme.palette.background.paper,
                  boxShadow: createHoverGlowShadow(theme),
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>
                  Selected: {selectedCount}
                </Typography>
                <Button
                  size="small"
                  onClick={() => setSelected({})}
                  sx={{ textTransform: 'none', color: 'text.secondary' }}
                >
                  Clear
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  disableElevation
                  onClick={handleImport}
                  disabled={busy}
                  startIcon={
                    busy ? (
                      <CircularProgress size={14} color="inherit" />
                    ) : (
                      <CloudDownloadOutlinedIcon />
                    )
                  }
                  sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
                >
                  Import selected ({selectedCount})
                </Button>
              </Box>
            )}
          </>
        )}
      </Paper>

      <ImportLibraryDialog
        open={curatedOpen}
        onClose={() => setCuratedOpen(false)}
        category={category}
      />

      <Snackbar
        open={toast.open}
        autoHideDuration={3500}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={toast.severity}
          variant="filled"
          onClose={() => setToast((t) => ({ ...t, open: false }))}
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </PageLayout>
  );
}
