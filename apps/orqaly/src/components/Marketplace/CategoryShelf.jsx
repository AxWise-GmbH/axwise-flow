import { useState, useEffect, useRef } from 'react';
import { Box, Typography, Button, Skeleton, alpha, useTheme } from '@mui/material';
import ChevronRightOutlinedIcon from '@mui/icons-material/ChevronRightOutlined';
import AppIcon from '../icons/AppIcon';
import DnsOutlinedIcon from '@mui/icons-material/DnsOutlined';
import DownloadModelCard from './DownloadModelCard';
import {
  searchHuggingFaceModels,
  resolveCuratedModels,
} from '../../services/huggingfaceModelsService';

// Module-level cache so re-mounting a shelf (Rent <-> Download toggles, focus in
// and back out) never refetches a category. Shared with the focused grid.
export const SHELF_CACHE = new Map();

const SHELF_LIMIT = 20; // top-N pulled per category (so "Show all" needs no refetch)
const PREVIEW_COUNT = 6; // cards shown inline in the horizontal row
const CARD_WIDTH = 300;

/**
 * One horizontal shelf of the top-downloaded HF models for a single category.
 * Lazily fetches on mount, shows a preview row of cards + a "Show all" affordance
 * that hands the full category off to the parent's focused grid.
 */
export default function CategoryShelf({ category, onOpenDownload, onShowAll }) {
  const theme = useTheme();
  const cached = SHELF_CACHE.get(category.value);
  const [models, setModels] = useState(cached || []);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState(null);
  const reqRef = useRef(0);

  useEffect(() => {
    // Cache hits are already seeded via the useState initializer above; a shelf's
    // category never changes, so nothing more to do.
    // loading already starts true on a cache miss (useState initializer) and
    // error starts null, so no synchronous setState is needed before the fetch.
    if (SHELF_CACHE.has(category.value)) return undefined;
    const reqId = ++reqRef.current;
    let cancelled = false;
    // Curated categories (e.g. Uncensored) resolve a pinned, rank-ordered list;
    // task-tag categories pull the top-N by downloads from the backend.
    const load = category.curated
      ? resolveCuratedModels(category.curated)
      : searchHuggingFaceModels('', { limit: SHELF_LIMIT, category: category.value });
    load
      .then((list) => {
        if (cancelled || reqRef.current !== reqId) return;
        SHELF_CACHE.set(category.value, list);
        setModels(list);
      })
      .catch((e) => {
        if (!cancelled && reqRef.current === reqId) setError(e.message || 'Failed to load');
      })
      .finally(() => {
        if (!cancelled && reqRef.current === reqId) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [category.value, category.curated]);

  // A category that genuinely has no models contributes nothing - hide the shelf.
  if (!loading && !error && models.length === 0) return null;

  const preview = models.slice(0, PREVIEW_COUNT);

  return (
    <Box sx={{ mb: 3 }}>
      {/* Shelf header: icon + label + Show all */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.25 }}>
        <AppIcon
          name={category.icon}
          fallback={DnsOutlinedIcon}
          sx={{ fontSize: 20, color: 'primary.main' }}
        />
        <Typography variant="subtitle1" sx={{ fontWeight: 800, color: 'text.primary' }}>
          {category.label}
        </Typography>
        <Box sx={{ flex: 1 }} />
        {models.length > 0 && (
          <Button
            size="small"
            onClick={() => onShowAll?.(category)}
            endIcon={<ChevronRightOutlinedIcon sx={{ fontSize: 16 }} />}
            sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
          >
            Show all
          </Button>
        )}
      </Box>

      {error ? (
        <Typography variant="caption" color="text.secondary">
          Could not load {category.label} models.
        </Typography>
      ) : (
        <Box
          sx={{
            display: 'flex',
            gap: 2,
            overflowX: 'auto',
            pb: 1,
            scrollSnapType: 'x proximity',
            // slim scrollbar
            '&::-webkit-scrollbar': { height: 6 },
            '&::-webkit-scrollbar-thumb': {
              borderRadius: 3,
              bgcolor: alpha(theme.palette.text.primary, 0.15),
            },
          }}
        >
          {loading
            ? Array.from({ length: PREVIEW_COUNT }).map((_, i) => (
                <Box key={i} sx={{ flex: `0 0 ${CARD_WIDTH}px`, scrollSnapAlign: 'start' }}>
                  <Skeleton variant="rounded" height={210} sx={{ borderRadius: 3 }} />
                </Box>
              ))
            : preview.map((model, i) => (
                <Box
                  key={model.id || i}
                  sx={{ flex: `0 0 ${CARD_WIDTH}px`, scrollSnapAlign: 'start' }}
                >
                  <DownloadModelCard model={model} onDownload={onOpenDownload} idx={i} />
                </Box>
              ))}

          {/* Trailing "Show all" tile */}
          {!loading && models.length > preview.length && (
            <Box sx={{ flex: '0 0 160px', scrollSnapAlign: 'start' }}>
              <Button
                onClick={() => onShowAll?.(category)}
                sx={{
                  width: '100%',
                  height: '100%',
                  minHeight: 210,
                  borderRadius: 3,
                  border: '1px dashed',
                  borderColor: alpha(theme.palette.primary.main, 0.4),
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1,
                  textTransform: 'none',
                  fontWeight: 700,
                  color: 'primary.main',
                }}
              >
                <ChevronRightOutlinedIcon />
                Show all
                <Typography variant="caption" color="text.secondary">
                  {models.length} models
                </Typography>
              </Button>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
