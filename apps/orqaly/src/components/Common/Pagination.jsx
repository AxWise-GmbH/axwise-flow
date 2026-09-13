import { useMemo, useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import {
  Box,
  ButtonBase,
  Button,
  IconButton,
  Menu,
  MenuItem,
  TextField,
  Typography,
  useTheme,
  useMediaQuery,
  alpha,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import { createHoverGlowShadow } from '../../theme/hoverGlow';
import { getPageWindow } from './paginationUtils';

import AppIcon from '../icons/AppIcon';

function PageButton({ active, disabled, onClick, children, ariaLabel }) {
  const theme = useTheme();
  const baseSx = {
    width: 32,
    height: 32,
    minWidth: 32,
    borderRadius: '50%',
    typography: 'body2',
    fontWeight: 600,
    lineHeight: 1,
    color: 'text.primary',
    transition: 'background-color 0.2s, border-color 0.2s, box-shadow 0.2s, color 0.2s',
    border: '1.5px solid transparent',
    '&:hover': {
      borderColor: alpha(theme.palette.primary.main, 0.25),
      boxShadow: createHoverGlowShadow(theme),
    },
    '&:focus-visible': {
      outline: `2px solid ${alpha(theme.palette.primary.main, 0.55)}`,
      outlineOffset: 2,
    },
    '&.Mui-disabled': { opacity: 0.4 },
  };
  const activeSx = active
    ? {
        bgcolor: alpha(theme.palette.primary.main, 0.08),
        borderColor: 'primary.main',
        color: 'primary.main',
        boxShadow: createHoverGlowShadow(theme),
      }
    : null;

  return (
    <ButtonBase
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-current={active ? 'page' : undefined}
      sx={active ? { ...baseSx, ...activeSx } : baseSx}
    >
      {children}
    </ButtonBase>
  );
}

PageButton.propTypes = {
  active: PropTypes.bool,
  disabled: PropTypes.bool,
  onClick: PropTypes.func,
  children: PropTypes.node,
  ariaLabel: PropTypes.string,
};

/**
 * Unified Pagination control for tables and card grids.
 *
 * Layout (≥ md):
 *   [ 10 / page ▾ ]  LOAD ALL         ‹ 1 2 ❸ 4 5 … 100 ›         Go to ( ) Page
 *
 * Controlled: parent (usually via `usePagination`) owns page + rowsPerPage.
 */
export default function Pagination({
  count = 0,
  page = 0,
  rowsPerPage = 10,
  rowsPerPageOptions = [10, 25, 50],
  onPageChange,
  onRowsPerPageChange,
  onLoadAll,
  onCollapseAll,
  allMode = false,
  maxLoadAll = 500,
  maxVisiblePages = 6,
  showGoTo = true,
  label,
  dense = false,
}) {
  const theme = useTheme();
  const belowMd = useMediaQuery(theme.breakpoints.down('md'));
  const belowSm = useMediaQuery(theme.breakpoints.down('sm'));

  const [rowsAnchor, setRowsAnchor] = useState(null);
  const [goToValue, setGoToValue] = useState('');

  const pageCount = Math.max(1, Math.ceil(count / Math.max(rowsPerPage, 1)));
  const tokens = useMemo(
    () => getPageWindow(pageCount, page, maxVisiblePages),
    [pageCount, page, maxVisiblePages]
  );

  const goToPage = useCallback(
    (oneBasedValue) => {
      const n = Number.parseInt(oneBasedValue, 10);
      if (!Number.isFinite(n)) return;
      const clamped = Math.min(pageCount, Math.max(1, n));
      onPageChange?.(clamped - 1);
    },
    [pageCount, onPageChange]
  );

  const handleGoToSubmit = useCallback(() => {
    if (goToValue === '') return;
    goToPage(goToValue);
    setGoToValue('');
  }, [goToValue, goToPage]);

  // ── Hide conditions ──────────────────────────────────────
  if (count === 0) return null;

  const showPager = count > rowsPerPage;
  const showLoadAll =
    typeof onLoadAll === 'function' && !allMode && count > rowsPerPage * 2 && count <= maxLoadAll;
  const showGoToResolved =
    showGoTo && showPager && pageCount > maxVisiblePages && !belowMd && !allMode;

  // ── Load-all collapsed state ─────────────────────────────
  if (allMode) {
    return (
      <Box
        role="navigation"
        aria-label="pagination"
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          px: 2.5,
          py: dense ? 1.25 : 1.75,
          borderTop: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Typography variant="caption" sx={{ color: 'text.secondary', letterSpacing: '0.04em' }}>
          Showing all {count}
          {label ? ` ${label}` : ''}
        </Typography>
        <Button
          size="small"
          onClick={onCollapseAll}
          sx={{
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            fontWeight: 700,
            color: 'text.secondary',
            px: 1.25,
            '&:hover': {
              color: 'primary.main',
              boxShadow: createHoverGlowShadow(theme),
              bgcolor: alpha(theme.palette.primary.main, 0.04),
            },
          }}
        >
          Collapse
        </Button>
      </Box>
    );
  }

  // ── Regular footer ───────────────────────────────────────
  return (
    <Box
      role="navigation"
      aria-label="pagination"
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 2,
        px: 2.5,
        py: dense ? 1.25 : 1.75,
        borderTop: '1px solid',
        borderColor: 'divider',
        flexWrap: 'wrap',
      }}
    >
      {/* ── LEFT: rows-per-page + load all ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        <Button
          variant="outlined"
          size="small"
          endIcon={<AppIcon name="ArrowDropDown" fallback={ArrowDropDownIcon} />}
          onClick={(e) => setRowsAnchor(e.currentTarget)}
          aria-haspopup="listbox"
          aria-expanded={Boolean(rowsAnchor)}
          sx={{
            borderRadius: 999,
            borderColor: alpha(theme.palette.primary.main, 0.35),
            color: 'primary.main',
            fontWeight: 500,
            px: 2,
            py: 0.25,
            textTransform: 'none',
            '&:hover': {
              borderColor: 'primary.main',
              bgcolor: alpha(theme.palette.primary.main, 0.06),
              boxShadow: createHoverGlowShadow(theme),
            },
          }}
        >
          {rowsPerPage} / page
        </Button>
        <Menu
          anchorEl={rowsAnchor}
          open={Boolean(rowsAnchor)}
          onClose={() => setRowsAnchor(null)}
          slotProps={{ paper: { sx: { minWidth: 120 } } }}
        >
          {rowsPerPageOptions.map((opt) => (
            <MenuItem
              key={opt}
              selected={opt === rowsPerPage}
              onClick={() => {
                onRowsPerPageChange?.(opt);
                setRowsAnchor(null);
              }}
              sx={{
                fontSize: '0.85rem',
                fontWeight: opt === rowsPerPage ? 700 : 500,
                color: opt === rowsPerPage ? 'primary.main' : 'text.primary',
                '&.Mui-selected': { bgcolor: alpha(theme.palette.primary.main, 0.08) },
                '&.Mui-selected:hover': { bgcolor: alpha(theme.palette.primary.main, 0.14) },
              }}
            >
              {opt} / page
            </MenuItem>
          ))}
        </Menu>

        {showLoadAll && (
          <Button
            size="small"
            onClick={onLoadAll}
            sx={{
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontWeight: 700,
              color: 'text.secondary',
              px: 1.25,
              '&:hover': {
                color: 'primary.main',
                bgcolor: alpha(theme.palette.primary.main, 0.04),
                boxShadow: createHoverGlowShadow(theme),
              },
            }}
          >
            Load all
          </Button>
        )}
      </Box>
      {/* ── CENTER: pager ── */}
      {showPager && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            flex: { xs: '1 1 100%', md: '0 1 auto' },
            justifyContent: 'center',
            order: { xs: 3, md: 0 },
          }}
        >
          <IconButton
            size="small"
            disabled={page === 0}
            onClick={() => onPageChange?.(page - 1)}
            aria-label="Previous page"
            sx={{
              borderRadius: 999,
              color: 'text.secondary',
              '&:hover': {
                color: 'primary.main',
                boxShadow: createHoverGlowShadow(theme),
                bgcolor: alpha(theme.palette.primary.main, 0.04),
              },
              '&.Mui-disabled': { color: 'text.disabled' },
            }}
          >
            <AppIcon name="ChevronLeft" fallback={ChevronLeftIcon} fontSize="small" />
          </IconButton>

          {belowSm ? (
            <Typography
              variant="body2"
              sx={{ mx: 1.25, fontWeight: 600, color: 'text.secondary', letterSpacing: '0.02em' }}
            >
              {page + 1} / {pageCount}
            </Typography>
          ) : (
            tokens.map((token, idx) =>
              token === '…' ? (
                // Ellipses carry no unique data; a tokens-array index is a
                // stable, correct key here because tokens are re-derived
                // from (pageCount, page) on every render.
                // eslint-disable-next-line react/no-array-index-key
                <Box
                  key={`ellipsis-${idx}`}
                  sx={{
                    width: 28,
                    textAlign: 'center',
                    color: 'text.disabled',
                    typography: 'body2',
                    fontWeight: 600,
                    userSelect: 'none',
                  }}
                >
                  …
                </Box>
              ) : (
                <PageButton
                  key={token}
                  active={token - 1 === page}
                  onClick={() => onPageChange?.(token - 1)}
                  ariaLabel={`Go to page ${token}`}
                >
                  {token}
                </PageButton>
              )
            )
          )}

          <IconButton
            size="small"
            disabled={page >= pageCount - 1}
            onClick={() => onPageChange?.(page + 1)}
            aria-label="Next page"
            sx={{
              borderRadius: 999,
              color: 'text.secondary',
              '&:hover': {
                color: 'primary.main',
                boxShadow: createHoverGlowShadow(theme),
                bgcolor: alpha(theme.palette.primary.main, 0.04),
              },
              '&.Mui-disabled': { color: 'text.disabled' },
            }}
          >
            <AppIcon name="ChevronRight" fallback={ChevronRightIcon} fontSize="small" />
          </IconButton>
        </Box>
      )}
      {/* ── RIGHT: go-to ── */}
      {showGoToResolved && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', letterSpacing: '0.02em' }}>
            Go to
          </Typography>
          <TextField
            size="small"
            type="number"
            inputMode="numeric"
            value={goToValue}
            placeholder=""
            onChange={(e) => setGoToValue(e.target.value.replaceAll(/\D/g, ''))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleGoToSubmit();
              }
            }}
            onBlur={handleGoToSubmit}
            slotProps={{
              htmlInput: {
                min: 1,
                max: pageCount,
                'aria-label': 'Go to page',
                style: { textAlign: 'center', padding: '4px 8px', MozAppearance: 'textfield' },
              },
            }}
            sx={{
              width: 72,
              '& .MuiOutlinedInput-root': {
                borderRadius: 999,
                height: 32,
              },
              '& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button': {
                WebkitAppearance: 'none',
                margin: 0,
              },
            }}
          />
          <Typography variant="caption" sx={{ color: 'text.secondary', letterSpacing: '0.02em' }}>
            Page
          </Typography>
        </Box>
      )}
    </Box>
  );
}

Pagination.propTypes = {
  count: PropTypes.number.isRequired,
  page: PropTypes.number.isRequired,
  rowsPerPage: PropTypes.number.isRequired,
  rowsPerPageOptions: PropTypes.arrayOf(PropTypes.number),
  onPageChange: PropTypes.func.isRequired,
  onRowsPerPageChange: PropTypes.func.isRequired,
  onLoadAll: PropTypes.func,
  onCollapseAll: PropTypes.func,
  allMode: PropTypes.bool,
  maxLoadAll: PropTypes.number,
  maxVisiblePages: PropTypes.number,
  showGoTo: PropTypes.bool,
  label: PropTypes.string,
  dense: PropTypes.bool,
};
