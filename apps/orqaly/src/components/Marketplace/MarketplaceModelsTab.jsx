import { useState, useMemo } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Chip,
  Button,
  TextField,
  Slider,
  IconButton,
  Snackbar,
  Alert,
  Tooltip,
  useTheme,
  alpha,
} from '@mui/material';
import MemoryOutlinedIcon from '@mui/icons-material/MemoryOutlined';
import DnsOutlinedIcon from '@mui/icons-material/DnsOutlined';
import SpeedOutlinedIcon from '@mui/icons-material/SpeedOutlined';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import PersonOutlineOutlinedIcon from '@mui/icons-material/PersonOutlineOutlined';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import Rating from '@mui/material/Rating';
import FormDialog from '../Common/FormDialog';
import EmptyState from '../Common/EmptyState';
import Pagination from '../Common/Pagination';
import MarketplaceToolbar from './MarketplaceToolbar';
import PillTabStrip from '../Common/PillTabStrip';
import MarketplaceDownloadModels from './MarketplaceDownloadModels';
import ModelBrandIcon from './ModelBrandIcon';
import useMarketplaceSearch from '../../hooks/useMarketplaceSearch';
import useImportedLibraries from '../../hooks/useImportedLibraries';
import { ImportFromButton } from './ImportLibraryDialog';
import usePagination from '../../hooks/usePagination';
import { deriveFacetOptions } from '../../utils/facetOptions';
import { createHoverGlowShadow } from '../../theme/hoverGlow';
import { RENTABLE_MODELS } from '../../config/rentableModels';

import AppIcon from '../icons/AppIcon';

const STATUS_COLORS = {
  online: { bg: 'rgba(34,197,94,0.1)', color: '#4ADE80', border: 'rgba(34,197,94,0.2)' },
  busy: { bg: 'rgba(234,179,8,0.1)', color: '#FACC15', border: 'rgba(234,179,8,0.2)' },
  offline: { bg: 'rgba(148,163,184,0.1)', color: '#94A3B8', border: 'rgba(148,163,184,0.2)' },
};

const CATEGORIES = [
  { value: 'sm', label: 'Small (< 13B)' },
  { value: 'md', label: 'Medium (13B - 34B)' },
  { value: 'lg', label: 'Large (34B - 72B)' },
  { value: 'xl', label: 'Extra Large (72B+)' },
];

const FACETS = [
  { key: 'provider', label: 'Provider', field: 'provider' },
  { key: 'status', label: 'Status', field: 'status' },
];

const SORT_OPTIONS = [
  { value: 'name', label: 'Name A-Z' },
  { value: 'cost', label: 'Price: Low to High' },
  { value: 'rating', label: 'Highest Rated' },
];

const MODES = [
  { key: 'rent', label: 'Rent', icon: BoltOutlinedIcon },
  { key: 'download', label: 'Download', icon: DownloadOutlinedIcon },
];

export default function MarketplaceModelsTab() {
  const theme = useTheme();
  const [mode, setMode] = useState('rent');
  const [models] = useState(() =>
    RENTABLE_MODELS.map((m) => ({
      ...m,
      // Map properties for useMarketplaceSearch compatibility
      cost_per_task: m.pricePerHour,
      rating_avg: m.rating,
    }))
  );

  const [rentModel, setRentModel] = useState(null);
  const [rentHours, setRentHours] = useState(12);
  const [connectionDetails, setConnectionDetails] = useState(null);
  const [renting, setRenting] = useState(false);
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });

  const { importedItems } = useImportedLibraries('models');
  const mergedItems = useMemo(
    () => [
      ...models,
      ...importedItems.map((m) => ({ ...m, cost_per_task: m.pricePerHour, rating_avg: m.rating })),
    ],
    [models, importedItems]
  );

  const searchOptions = useMemo(() => ({ facets: FACETS }), []);
  const facetOptions = useMemo(
    () => ({
      provider: deriveFacetOptions(mergedItems, 'provider'),
      status: deriveFacetOptions(mergedItems, 'status'),
    }),
    [mergedItems]
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
    mergedItems,
    ['name', 'description', 'exactModel', 'hardware', 'provider'],
    'sizeClass',
    searchOptions
  );

  const pagination = usePagination(filteredItems, {
    surfaceId: 'marketplace.models',
    defaultRowsPerPage: 12,
    resetOn: [searchQuery, categoryFilter, sortBy, facetKey],
  });

  const handleOpenRent = (model) => {
    setRentModel(model);
    setRentHours(12);
    setConnectionDetails(null);
    setRenting(false);
  };

  const handleCopyText = (text, label) => {
    navigator.clipboard.writeText(text);
    setToast({ open: true, message: `${label} copied to clipboard`, severity: 'success' });
  };

  const handleActivateRent = () => {
    if (!rentModel) return;
    setRenting(true);
    setTimeout(() => {
      setRenting(false);
      setConnectionDetails({
        apiKey: `sk-rent-${rentModel.id}-${Math.random().toString(36).substring(2, 12)}`,
        endpoint: `${window.location.origin}/api/v1/models/${rentModel.id}`,
      });
      setToast({
        open: true,
        message: `Successfully rented ${rentModel.name}!`,
        severity: 'success',
      });
    }, 1200);
  };

  return (
    <Box>
      <PillTabStrip role="tablist" aria-label="Models mode" sx={{ px: 0, pt: 0, pb: 2 }}>
        {MODES.map((m) => {
          const isActive = mode === m.key;
          const Icon = m.icon;
          return (
            <Button
              key={m.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => setMode(m.key)}
              startIcon={<Icon sx={{ fontSize: 16 }} />}
              sx={{
                textTransform: 'none',
                fontWeight: isActive ? 700 : 600,
                borderRadius: 2.5,
                minHeight: 36,
                px: 1.75,
                color: isActive ? 'primary.main' : 'text.secondary',
                bgcolor: isActive ? alpha(theme.palette.primary.main, 0.1) : 'transparent',
                boxShadow: isActive ? `0 2px 4px ${alpha(theme.palette.primary.main, 0.1)}` : 'none',
                '&:hover': {
                  bgcolor: isActive
                    ? alpha(theme.palette.primary.main, 0.14)
                    : alpha(theme.palette.text.primary, 0.06),
                },
              }}
            >
              {m.label}
            </Button>
          );
        })}
      </PillTabStrip>
      {mode === 'download' ? (
        <MarketplaceDownloadModels />
      ) : (
        <>
          <MarketplaceToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        categories={CATEGORIES}
        categoryFilter={categoryFilter}
        onCategoryChange={setCategoryFilter}
        sortBy={sortBy}
        onSortChange={setSortBy}
        sortOptions={SORT_OPTIONS}
        placeholder="Search models..."
        resultCount={resultCount}
        totalCount={mergedItems.length}
        facets={facets}
        facetFilters={facetFilters}
        facetOptions={facetOptions}
        onToggleFacet={toggleFacetValue}
        onClearFacets={clearAllFacets}
        actionButton={<ImportFromButton category="models" />}
      />
      {filteredItems.length === 0 ? (
        <EmptyState
          icon={DnsOutlinedIcon}
          title="No models found"
          description="Try modifying your search query or filters."
        />
      ) : (
        <>
          <Grid container spacing={2}>
            {pagination.paginatedData.map((model, idx) => {
              const sc = STATUS_COLORS[model.status] || STATUS_COLORS.offline;
              return (
                <Grid
                  key={model._imported ? `${model._sourceId}:${model.id}` : model.id || idx}
                  size={{ xs: 12, sm: 6, md: 6, lg: 4 }}
                >
                  <Paper
                    elevation={0}
                    sx={{
                      p: 2.25,
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      borderRadius: 3,
                      position: 'relative',
                      border: '1px solid',
                      borderColor: alpha(theme.palette.primary.main, 0.12),
                      background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.03)} 0%, ${alpha(theme.palette.background.paper, 0.98)} 70%)`,
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
                    {model._imported && (
                      <Chip
                        label="Imported"
                        size="small"
                        sx={{
                          position: 'absolute',
                          top: 8,
                          right: 8,
                          zIndex: 1,
                          height: 18,
                          fontSize: '0.58rem',
                          fontWeight: 600,
                          bgcolor: alpha(theme.palette.secondary.main, 0.16),
                          color: 'secondary.main',
                        }}
                      />
                    )}
                    {/* Header */}
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 1.25 }}>
                      <Box
                        sx={{
                          width: 42,
                          height: 42,
                          borderRadius: 2.5,
                          bgcolor: alpha(theme.palette.primary.main, 0.1),
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <ModelBrandIcon model={model} size={22} />
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography
                          variant="body1"
                          sx={{ fontWeight: 800, lineHeight: 1.2, color: 'text.primary' }}
                          noWrap
                        >
                          {model.name}
                        </Typography>
                        <Box
                          sx={{
                            display: 'flex',
                            gap: 0.5,
                            mt: 0.5,
                            flexWrap: 'wrap',
                            alignItems: 'center',
                          }}
                        >
                          <Chip
                            label={model.exactModel.split('-').pop() || model.exactModel}
                            size="small"
                            variant="outlined"
                            sx={{ height: 18, fontSize: '0.62rem', opacity: 0.8 }}
                          />
                          <Chip
                            label={model.status.toUpperCase()}
                            size="small"
                            sx={{
                              height: 18,
                              fontSize: '0.6rem',
                              fontWeight: 700,
                              bgcolor: sc.bg,
                              color: sc.color,
                              border: `1px solid ${sc.border}`,
                            }}
                          />
                        </Box>
                      </Box>
                    </Box>

                    {/* Description */}
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{
                        mb: 2,
                        fontSize: '0.82rem',
                        lineHeight: 1.4,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {model.description}
                    </Typography>

                    {/* Specs Grid */}
                    <Box
                      sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1,
                        mb: 2.5,
                        flexGrow: 1,
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <AppIcon
                          name="MemoryOutlined"
                          fallback={MemoryOutlinedIcon}
                          sx={{ fontSize: 16, color: 'text.secondary', opacity: 0.7 }}
                        />
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          noWrap
                          sx={{ fontWeight: 500 }}
                        >
                          Hardware:{' '}
                          <b>
                            {model.hardware} ({model.ram})
                          </b>
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <AppIcon
                          name="SpeedOutlined"
                          fallback={SpeedOutlinedIcon}
                          sx={{ fontSize: 16, color: 'text.secondary', opacity: 0.7 }}
                        />
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontWeight: 500 }}
                        >
                          Speed: <b>{model.tokensPerSecond} tokens/sec</b>
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <AppIcon
                          name="PersonOutlineOutlined"
                          fallback={PersonOutlineOutlinedIcon}
                          sx={{ fontSize: 16, color: 'text.secondary', opacity: 0.7 }}
                        />
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontWeight: 500 }}
                        >
                          Owner: <span style={{ color: 'var(--neon)' }}>{model.provider}</span>
                        </Typography>
                      </Box>
                    </Box>

                    {/* Rating Bar */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 2 }}>
                      <Rating
                        value={model.rating}
                        precision={0.1}
                        size="small"
                        readOnly
                        sx={{ '& .MuiRating-iconFilled': { color: '#F59E0B' } }}
                      />
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                        {model.rating} ({model.reviewsCount} reviews)
                      </Typography>
                    </Box>

                    {/* Bottom Pricing & Rent Action */}
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        pt: 1.5,
                        borderTop: '1px solid',
                        borderColor: 'divider',
                      }}
                    >
                      <Box>
                        <Typography
                          variant="h6"
                          sx={{ fontWeight: 800, lineHeight: 1.1, color: 'text.primary' }}
                        >
                          ${model.pricePerHour.toFixed(2)}
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 600 }}
                        >
                          per hour
                        </Typography>
                      </Box>
                      <Button
                        variant={model.status === 'offline' ? 'outlined' : 'contained'}
                        disabled={model.status === 'offline'}
                        size="small"
                        startIcon={<AppIcon name="BoltOutlined" fallback={BoltOutlinedIcon} />}
                        onClick={() => handleOpenRent(model)}
                        sx={{
                          textTransform: 'none',
                          fontWeight: 700,
                          borderRadius: 2,
                          px: 2,
                          py: 0.5,
                        }}
                      >
                        Rent
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
            label="models"
            dense
          />
        </>
      )}
      {/* Rent Dialog */}
      {rentModel && (
        <FormDialog
          open
          onClose={() => setRentModel(null)}
          title={`Rent ${rentModel.name}`}
          icon={BoltOutlinedIcon}
          maxWidth="sm"
          contentDividers={false}
          actions={
            !connectionDetails ? (
              <>
                <Button onClick={() => setRentModel(null)} sx={{ textTransform: 'none' }}>
                  Cancel
                </Button>
                <Button
                  variant="contained"
                  onClick={handleActivateRent}
                  disabled={renting}
                  sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
                >
                  {renting ? 'Processing...' : 'Activate Rent'}
                </Button>
              </>
            ) : (
              <Button
                variant="contained"
                onClick={() => setRentModel(null)}
                sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
              >
                Done
              </Button>
            )
          }
        >
          {!connectionDetails ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, py: 1 }}>
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Configure rental settings for this instance. The host machine is online and ready
                  to spin up.
                </Typography>
              </Box>

              <Paper
                variant="outlined"
                sx={{ p: 2, borderRadius: 2.5, bgcolor: 'background.default' }}
              >
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontWeight: 700, display: 'block', mb: 1, textTransform: 'uppercase' }}
                >
                  Configuration Overview
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="text.secondary">
                      Model Quantization
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {rentModel.exactModel}
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="text.secondary">
                      Hardware Spec
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {rentModel.hardware} ({rentModel.ram})
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="text.secondary">
                      Speed (est.)
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {rentModel.tokensPerSecond} t/s
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="text.secondary">
                      Context Window
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {rentModel.contextLength.toLocaleString()} tokens
                    </Typography>
                  </Grid>
                </Grid>
              </Paper>

              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  Duration: {rentHours} hours
                </Typography>
                <Slider
                  value={rentHours}
                  onChange={(_, val) => setRentHours(val)}
                  min={1}
                  max={72}
                  valueLabelDisplay="auto"
                  sx={{ color: 'primary.main' }}
                />
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: -0.5 }}>
                  <Typography variant="caption" color="text.secondary">
                    1 hr
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    72 hrs
                  </Typography>
                </Box>
              </Box>

              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderTop: '1px solid',
                  borderColor: 'divider',
                  pt: 2,
                }}
              >
                <Box>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ textTransform: 'uppercase', fontWeight: 600 }}
                  >
                    Estimated Total Cost
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 800, color: 'text.primary' }}>
                    ${(rentModel.pricePerHour * rentHours).toFixed(2)}
                  </Typography>
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    Your wallet balance
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: 'success.main' }}>
                    $24.50
                  </Typography>
                </Box>
              </Box>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, py: 1 }}>
              <Alert severity="success" variant="filled">
                Model rental activated successfully. Connection is active.
              </Alert>

              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                  Endpoint Connection URL
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <TextField
                    fullWidth
                    size="small"
                    readOnly
                    value={connectionDetails.endpoint}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        borderRadius: 2,
                        fontFamily: 'monospace',
                        fontSize: '0.8rem',
                      },
                    }}
                  />
                  <IconButton
                    onClick={() => handleCopyText(connectionDetails.endpoint, 'Endpoint URL')}
                    sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
                  >
                    <AppIcon name="ContentCopy" fallback={ContentCopyIcon} size="small" />
                  </IconButton>
                </Box>
              </Box>

              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                  API Key
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <TextField
                    fullWidth
                    size="small"
                    type="password"
                    readOnly
                    value={connectionDetails.apiKey}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        borderRadius: 2,
                        fontFamily: 'monospace',
                        fontSize: '0.8rem',
                      },
                    }}
                  />
                  <IconButton
                    onClick={() => handleCopyText(connectionDetails.apiKey, 'API Key')}
                    sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
                  >
                    <AppIcon name="ContentCopy" fallback={ContentCopyIcon} size="small" />
                  </IconButton>
                </Box>
              </Box>

              <Paper
                variant="outlined"
                sx={{ p: 2, borderRadius: 2.5, bgcolor: 'background.default' }}
              >
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontWeight: 700, display: 'block', mb: 1, textTransform: 'uppercase' }}
                >
                  cURL Integration Example
                </Typography>
                <Box
                  sx={{
                    fontFamily: 'monospace',
                    fontSize: '0.75rem',
                    bgcolor: 'rgba(0,0,0,0.2)',
                    p: 1.5,
                    borderRadius: 2,
                    overflowX: 'auto',
                    whiteSpace: 'pre',
                    color: 'text.secondary',
                  }}
                >
                  {`curl ${connectionDetails.endpoint}/v1/chat/completions \\
  -H "Authorization: Bearer ${connectionDetails.apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"messages": [{"role": "user", "content": "Hello"}]}'`}
                </Box>
              </Paper>
            </Box>
          )}
        </FormDialog>
      )}
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
        </>
      )}
    </Box>
  );
}
