import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Chip,
  Button,
  TextField,
  InputAdornment,
  CircularProgress,
  Snackbar,
  Alert,
  Link,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import OpenInNewOutlinedIcon from '@mui/icons-material/OpenInNewOutlined';
import ArrowBackOutlinedIcon from '@mui/icons-material/ArrowBackOutlined';
import EmptyState from '../Common/EmptyState';
import FormDialog from '../Common/FormDialog';
import AppIcon from '../icons/AppIcon';
import DownloadModelCard from './DownloadModelCard';
import CategoryShelf, { SHELF_CACHE } from './CategoryShelf';
import {
  searchHuggingFaceModels,
  resolveCuratedModels,
  listModelFiles,
} from '../../services/huggingfaceModelsService';
import { MODEL_CATEGORIES } from '../../config/modelCategories';

function formatBytes(n) {
  if (!n) return '';
  const gb = n / 1e9;
  if (gb >= 1) return `${gb.toFixed(gb >= 10 ? 0 : 1)} GB`;
  return `${Math.max(1, Math.round(n / 1e6))} MB`;
}

export default function MarketplaceDownloadModels() {
  const [query, setQuery] = useState('');

  // Focused category: when set, the shelves are replaced by that category's
  // full top-20 grid. `null` shows the stacked shelves (default view).
  const [focused, setFocused] = useState(null);

  // Search results (flat grid) - only used while `query` is non-empty.
  const [searchModels, setSearchModels] = useState([]);
  // Focused-category grid models.
  const [focusModels, setFocusModels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });
  const reqRef = useRef(0);

  // Download dialog: the model being inspected + its listed weight files.
  const [dlModel, setDlModel] = useState(null);
  const [files, setFiles] = useState([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState(null);

  const searching = query.trim().length > 0;

  // Debounced flat search over all HF models (shelves/focus hidden while typing).
  useEffect(() => {
    const q = query.trim();
    if (!q) return undefined;
    const reqId = ++reqRef.current;
    setLoading(true);
    setError(null);
    const t = setTimeout(() => {
      searchHuggingFaceModels(q, { limit: 24 })
        .then((list) => {
          if (reqRef.current === reqId) setSearchModels(list);
        })
        .catch((e) => {
          if (reqRef.current === reqId) setError(e.message || 'Search failed');
        })
        .finally(() => {
          if (reqRef.current === reqId) setLoading(false);
        });
    }, 400);
    return () => clearTimeout(t);
  }, [query]);

  // Load the focused category's full top-20 (reusing the shelf cache).
  useEffect(() => {
    if (!focused) return undefined;
    const cached = SHELF_CACHE.get(focused.value);
    if (cached) {
      setFocusModels(cached);
      setLoading(false);
      setError(null);
      return undefined;
    }
    const reqId = ++reqRef.current;
    setLoading(true);
    setError(null);
    let cancelled = false;
    const load = focused.curated
      ? resolveCuratedModels(focused.curated)
      : searchHuggingFaceModels('', { limit: 20, category: focused.value });
    load
      .then((list) => {
        if (cancelled || reqRef.current !== reqId) return;
        SHELF_CACHE.set(focused.value, list);
        setFocusModels(list);
      })
      .catch((e) => {
        if (!cancelled && reqRef.current === reqId) setError(e.message || 'Failed to load models');
      })
      .finally(() => {
        if (!cancelled && reqRef.current === reqId) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [focused]);

  // Open the download dialog and lazily list the repo's weight files (quants).
  const openDownload = useCallback(async (model) => {
    setDlModel(model);
    setFiles([]);
    setFilesError(null);
    setFilesLoading(true);
    try {
      const list = await listModelFiles(model.repoId);
      setFiles(list);
    } catch (e) {
      setFilesError(e.message || 'Could not list files');
    } finally {
      setFilesLoading(false);
    }
  }, []);

  // Trigger a real browser download of the chosen file straight from HF's CDN.
  const triggerDownload = useCallback((file) => {
    const a = document.createElement('a');
    a.href = file.url;
    a.rel = 'noopener';
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setToast({ open: true, message: `Downloading ${file.name}`, severity: 'success' });
  }, []);

  const gridModels = searching ? searchModels : focusModels;

  return (
    <Box>
      {/* Toolbar: search + context caption */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
        {focused && !searching && (
          <Button
            size="small"
            onClick={() => setFocused(null)}
            startIcon={<ArrowBackOutlinedIcon sx={{ fontSize: 16 }} />}
            sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
          >
            Back
          </Button>
        )}
        <TextField
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Hugging Face models..."
          size="small"
          sx={{ flex: 1, minWidth: 240 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
              </InputAdornment>
            ),
          }}
        />
        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
          {searching
            ? `${searchModels.length} result${searchModels.length === 1 ? '' : 's'}`
            : focused
              ? focused.curated
                ? `${focused.label} · curated top ${focused.curated.length}`
                : `${focused.label} · top 20 by downloads`
              : 'Browse by category · powered by Hugging Face'}
        </Typography>
      </Box>

      {/* Default view: one shelf per category */}
      {!searching && !focused && (
        <Box>
          {MODEL_CATEGORIES.map((category) => (
            <CategoryShelf
              key={category.value}
              category={category}
              onOpenDownload={openDownload}
              onShowAll={setFocused}
            />
          ))}
        </Box>
      )}

      {/* Search results OR focused-category grid */}
      {(searching || focused) &&
        (loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress size={32} />
          </Box>
        ) : error ? (
          <EmptyState
            icon={DownloadOutlinedIcon}
            title="Could not reach Hugging Face"
            description={error}
          />
        ) : gridModels.length === 0 ? (
          <EmptyState
            icon={DownloadOutlinedIcon}
            title="No models found"
            description={searching ? 'Try a different search query.' : 'This category is empty.'}
          />
        ) : (
          <Grid container spacing={2}>
            {gridModels.map((model, idx) => (
              <Grid key={model.id || idx} size={{ xs: 12, sm: 6, md: 6, lg: 4 }}>
                <DownloadModelCard model={model} onDownload={openDownload} idx={idx} />
              </Grid>
            ))}
          </Grid>
        ))}

      {dlModel && (
        <FormDialog
          open
          onClose={() => setDlModel(null)}
          title={`Download ${dlModel.displayName || dlModel.name}`}
          icon={DownloadOutlinedIcon}
          maxWidth="sm"
          actions={
            <Button onClick={() => setDlModel(null)} sx={{ textTransform: 'none' }}>
              Close
            </Button>
          }
        >
          <Box sx={{ py: 1 }}>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mb: 1.5, fontFamily: 'monospace', fontSize: '0.8rem', wordBreak: 'break-all' }}
            >
              {dlModel.repoId}
            </Typography>

            {dlModel.gated && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                This model is gated. Accept its license on{' '}
                <Link href={dlModel.url} target="_blank" rel="noopener noreferrer">
                  Hugging Face
                </Link>{' '}
                first, then downloads will work.
              </Alert>
            )}

            {filesLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress size={26} />
              </Box>
            ) : filesError ? (
              <Alert severity="error">{filesError}</Alert>
            ) : files.length === 0 ? (
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                  No direct weight files found in this repo. Open it on Hugging Face to browse.
                </Typography>
                <Button
                  component={Link}
                  href={dlModel.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="outlined"
                  endIcon={<OpenInNewOutlinedIcon />}
                  sx={{ textTransform: 'none' }}
                >
                  View on Hugging Face
                </Button>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>
                  {files.length} file{files.length === 1 ? '' : 's'} · choose a quantization to
                  download
                </Typography>
                {files.map((f) => (
                  <Paper
                    key={f.path}
                    variant="outlined"
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      p: 1,
                      borderRadius: 2,
                    }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '0.75rem' }}
                        noWrap
                      >
                        {f.name}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 0.75, mt: 0.25, alignItems: 'center' }}>
                        {f.quant && (
                          <Chip
                            label={f.quant}
                            size="small"
                            variant="outlined"
                            sx={{ height: 16, fontSize: '0.58rem' }}
                          />
                        )}
                        <Typography variant="caption" color="text.secondary">
                          {formatBytes(f.size)}
                        </Typography>
                      </Box>
                    </Box>
                    <Button
                      size="small"
                      variant="contained"
                      startIcon={<AppIcon name="DownloadOutlined" fallback={DownloadOutlinedIcon} />}
                      onClick={() => triggerDownload(f)}
                      sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2, flexShrink: 0 }}
                    >
                      Get
                    </Button>
                  </Paper>
                ))}
              </Box>
            )}
          </Box>
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
    </Box>
  );
}
