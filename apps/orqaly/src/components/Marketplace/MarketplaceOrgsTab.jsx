import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Chip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Snackbar,
  Alert,
  CircularProgress,
  useTheme,
  useMediaQuery,
  alpha,
} from '@mui/material';
import CorporateFareOutlinedIcon from '@mui/icons-material/CorporateFareOutlined';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import CloseIcon from '@mui/icons-material/Close';
import EmptyState from '../Common/EmptyState';
import Pagination from '../Common/Pagination';
import MarketplaceToolbar from './MarketplaceToolbar';
import RatingCommentDialog from './RatingCommentDialog';
import SwitchToRealWizard from './SwitchToRealWizard';
import useMarketplaceSearch from '../../hooks/useMarketplaceSearch';
import useImportedLibraries from '../../hooks/useImportedLibraries';
import { ImportFromButton } from './ImportLibraryDialog';
import usePagination from '../../hooks/usePagination';
import {
  getAllRatings,
  saveRating,
  syncRatingsFromDB,
} from '../../services/marketplaceRatingService';
import { createHoverGlowShadow } from '../../theme/hoverGlow';
import { ORG_TEMPLATES } from '../../config/orgTemplates';
import { createOrganization } from '../../services/organizationService';

import AppIcon from '../icons/AppIcon';

const TYPE_COLORS = {
  holding: '#7C3AED',
  subsidiary: '#2563EB',
  division: '#059669',
  department: '#D97706',
};

const SECTOR_COLORS = {
  gambling: '#E53935',
  ecommerce: '#2563EB',
  fintech: '#F59E0B',
  affiliate: '#7C3AED',
};

const TYPE_LABELS = {
  holding: 'Holding',
  subsidiary: 'Subsidiary',
  division: 'Division',
  department: 'Department',
};

const CATEGORIES = Object.entries(TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
  color: TYPE_COLORS[value],
}));

const SORT_OPTIONS = [
  { value: 'name', label: 'Name A-Z' },
  { value: 'cost', label: 'Complexity (entities)' },
];

// ── Mini Org Tree Visualization ───────────────────────────────────────────────
function OrgTreePreview({ entities, typeColor, compact = true }) {
  const rootEntities = entities.find((e) => e.level === 0);
  const level1Entities = entities.filter((e) => e.level === 1);
  const maxChildren = compact ? 3 : 4;
  const visibleChildren = level1Entities.slice(0, maxChildren);
  const hiddenCount = level1Entities.length - visibleChildren.length;

  const nodeStyle = {
    px: compact ? 1 : 1.5,
    py: compact ? 0.35 : 0.5,
    borderRadius: 1.5,
    border: '1px solid',
    borderColor: alpha(typeColor, 0.25),
    display: 'inline-flex',
    alignItems: 'center',
    maxWidth: compact ? 90 : 120,
  };

  const rootNode = rootEntities;

  return (
    <Box
      sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0, width: '100%' }}
    >
      {/* Root node */}
      {rootNode && (
        <Box sx={{ ...nodeStyle, bgcolor: alpha(typeColor, 0.16), maxWidth: compact ? 110 : 140 }}>
          <Typography
            sx={{
              fontSize: compact ? '0.65rem' : '0.75rem',
              fontWeight: 700,
              color: typeColor,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              lineHeight: 1.2,
            }}
          >
            {rootNode.name}
          </Typography>
        </Box>
      )}

      {/* Vertical stem */}
      {visibleChildren.length > 0 && (
        <Box
          sx={{ width: 2, height: compact ? 8 : 12, bgcolor: alpha(typeColor, 0.3), flexShrink: 0 }}
        />
      )}

      {/* Children row with horizontal bar */}
      {visibleChildren.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
          {/* Horizontal connector bar */}
          {visibleChildren.length > 1 && (
            <Box
              sx={{
                height: 2,
                bgcolor: alpha(typeColor, 0.3),
                width: `${Math.min(visibleChildren.length * (compact ? 28 : 32), 88)}%`,
                alignSelf: 'center',
                mb: 0,
              }}
            />
          )}
          {/* Children nodes */}
          <Box sx={{ display: 'flex', gap: compact ? 0.5 : 0.75, justifyContent: 'center', mt: 0 }}>
            {visibleChildren.map((child) => {
              const childColor =
                SECTOR_COLORS[child.sectorType] || TYPE_COLORS[child.role] || typeColor;
              return (
                <Box
                  key={child.name}
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 0,
                  }}
                >
                  {/* Vertical drop from horizontal bar */}
                  <Box
                    sx={{
                      width: 2,
                      height: compact ? 6 : 8,
                      bgcolor: alpha(typeColor, 0.3),
                      flexShrink: 0,
                    }}
                  />
                  <Box
                    sx={{
                      ...nodeStyle,
                      bgcolor: alpha(childColor, 0.1),
                      borderColor: alpha(childColor, 0.2),
                      maxWidth: compact ? 80 : 110,
                    }}
                  >
                    <Typography
                      sx={{
                        fontSize: compact ? '0.58rem' : '0.68rem',
                        fontWeight: 600,
                        color: childColor,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        lineHeight: 1.2,
                      }}
                    >
                      {child.name}
                    </Typography>
                  </Box>
                </Box>
              );
            })}
            {hiddenCount > 0 && (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <Box sx={{ width: 2, height: compact ? 6 : 8, bgcolor: alpha(typeColor, 0.3) }} />
                <Box sx={{ ...nodeStyle, bgcolor: alpha(typeColor, 0.06), borderStyle: 'dashed' }}>
                  <Typography
                    sx={{
                      fontSize: compact ? '0.58rem' : '0.65rem',
                      fontWeight: 700,
                      color: typeColor,
                    }}
                  >
                    +{hiddenCount}
                  </Typography>
                </Box>
              </Box>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
}

// ── Entity Breakdown List (for Preview dialog) ────────────────────────────────
function EntityBreakdown({ entities, typeColor }) {
  // Group by level
  const byLevel = {};
  for (const e of entities) {
    if (!byLevel[e.level]) byLevel[e.level] = [];
    byLevel[e.level].push(e);
  }

  return (
    <Box>
      <Typography
        variant="caption"
        sx={{
          fontWeight: 700,
          mb: 1,
          display: 'block',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          fontSize: '0.62rem',
          color: 'text.secondary',
        }}
      >
        Entity Breakdown
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {Object.entries(byLevel).map(([level, levelEntities]) => (
          <Box key={level} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            <Typography
              variant="caption"
              sx={{
                fontSize: '0.65rem',
                color: 'text.disabled',
                whiteSpace: 'nowrap',
                minWidth: 50,
                pt: 0.1,
              }}
            >
              Level {level}
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {levelEntities.map((e) => {
                const roleColor = TYPE_COLORS[e.role] || '#888';
                return (
                  <Box key={e.name} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Box
                      sx={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        bgcolor: roleColor,
                        flexShrink: 0,
                      }}
                    />
                    <Typography
                      variant="caption"
                      sx={{ fontSize: '0.7rem', fontWeight: level === '0' ? 700 : 400 }}
                    >
                      {e.name}
                    </Typography>
                    <Chip
                      label={TYPE_LABELS[e.role] || e.role}
                      size="small"
                      sx={{
                        height: 16,
                        fontSize: '0.55rem',
                        bgcolor: alpha(roleColor, 0.1),
                        color: roleColor,
                        fontWeight: 600,
                      }}
                    />
                  </Box>
                );
              })}
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function MarketplaceOrgsTab() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [previewTpl, setPreviewTpl] = useState(null);
  const [cloning, setCloning] = useState(null);
  const [ratings, setRatings] = useState(() => getAllRatings());
  const [ratingDialog, setRatingDialog] = useState({ open: false, id: '', name: '' });
  const [switchToRealOpen, setSwitchToRealOpen] = useState(false);
  const [switchToRealSector, setSwitchToRealSector] = useState(null);

  useEffect(() => {
    syncRatingsFromDB().then((synced) => setRatings(synced));
  }, []);
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });

  const { importedItems } = useImportedLibraries('orgs');
  const mergedItems = useMemo(() => [...ORG_TEMPLATES, ...importedItems], [importedItems]);

  const {
    filteredItems,
    searchQuery,
    setSearchQuery,
    categoryFilter,
    setCategoryFilter,
    sortBy,
    setSortBy,
    resultCount,
  } = useMarketplaceSearch(mergedItems, ['name', 'description', 'industry'], 'type');

  const pagination = usePagination(filteredItems, {
    surfaceId: 'marketplace.orgs',
    defaultRowsPerPage: 12,
    resetOn: [searchQuery, categoryFilter, sortBy],
  });

  const handleUseTemplate = useCallback(async (tpl) => {
    setCloning(tpl.id);
    try {
      // Create all entities level-by-level so parents exist before children
      const nameToId = {};
      const sorted = [...tpl.entities].sort((a, b) => a.level - b.level);

      for (const entity of sorted) {
        const parentId = entity.parentId ? (nameToId[entity.parentId] ?? null) : null;
        const created = await createOrganization({
          name: entity.name,
          description: entity.level === 0 ? tpl.description : null,
          org_type: entity.role,
          industry: tpl.industry,
          parent_id: parentId,
        });
        nameToId[entity.name] = created.id;
      }

      setToast({
        open: true,
        message: `"${tpl.name}" applied — ${tpl.entities.length} organization${tpl.entities.length === 1 ? '' : 's'} created`,
        severity: 'success',
      });
    } catch (err) {
      setToast({ open: true, message: err.message, severity: 'error' });
    } finally {
      setCloning(null);
    }
  }, []);

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
        placeholder="Search organization templates..."
        resultCount={resultCount}
        totalCount={mergedItems.length}
        actionButton={<ImportFromButton category="orgs" />}
      />
      {filteredItems.length === 0 ? (
        <EmptyState
          icon={CorporateFareOutlinedIcon}
          title="No templates found"
          description="Adjust your filters to see available organization templates."
        />
      ) : (
        <>
          <Grid container spacing={2}>
            {pagination.paginatedData.map((tpl, idx) => {
              const typeColor = TYPE_COLORS[tpl.type] || '#888';
              const myRating = ratings[tpl.id];
              const isCloning = cloning === tpl.id;

              return (
                <Grid
                  key={tpl._imported ? `${tpl._sourceId}:${tpl.id}` : tpl.id}
                  size={{ xs: 12, sm: 6, md: 6, lg: 4 }}
                >
                  <Paper
                    elevation={0}
                    sx={{
                      height: '100%',
                      minHeight: 320,
                      display: 'flex',
                      flexDirection: 'column',
                      borderRadius: 2.5,
                      border: '1px solid',
                      borderColor: alpha(typeColor, 0.18),
                      overflow: 'hidden',
                      transition: 'all 0.2s ease-in-out',
                      position: 'relative',
                      '&:hover': {
                        borderColor: 'primary.main',
                        transform: 'translateY(-2px)',
                        boxShadow: createHoverGlowShadow(theme),
                      },
                      '& .rate-trigger': { opacity: 0, transition: 'opacity 0.15s' },
                      '&:hover .rate-trigger': { opacity: 1 },
                      animation: theme.animations?.fadeInUp,
                      animationDelay: `${Math.min(idx * 50, 400)}ms`,
                      animationFillMode: 'both',
                    }}
                  >
                    {tpl._imported && (
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
                    {/* ── Org tree header ── */}
                    <Box
                      sx={{
                        height: 92,
                        bgcolor: alpha(typeColor, 0.05),
                        borderBottom: '1px solid',
                        borderColor: alpha(typeColor, 0.1),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        px: 2,
                        py: 1,
                      }}
                    >
                      <OrgTreePreview entities={tpl.entities} typeColor={typeColor} compact />
                    </Box>

                    {/* ── Card body ── */}
                    <Box sx={{ p: 2, flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {/* Name */}
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 700, fontSize: '0.88rem', lineHeight: 1.3 }}
                      >
                        {tpl.name}
                      </Typography>

                      {/* Chips row */}
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        <Chip
                          label={TYPE_LABELS[tpl.type] || tpl.type}
                          size="small"
                          sx={{
                            height: 20,
                            fontSize: '0.68rem',
                            fontWeight: 600,
                            bgcolor: alpha(typeColor, 0.12),
                            color: typeColor,
                          }}
                        />
                        <Chip
                          label={tpl.industry}
                          size="small"
                          variant="outlined"
                          sx={{ height: 20, fontSize: '0.68rem' }}
                        />
                        {tpl.isBusiness && (
                          <Chip
                            label="Business Bundle"
                            size="small"
                            color="secondary"
                            sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700 }}
                          />
                        )}
                      </Box>

                      {/* Description */}
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{
                          flex: 1,
                          display: '-webkit-box',
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          fontSize: '0.8rem',
                          lineHeight: 1.5,
                        }}
                      >
                        {tpl.description}
                      </Typography>

                      {/* Rating (conditional, shown if rated) */}
                      {myRating?.rating && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                          <AppIcon
                            name="StarRounded"
                            fallback={StarRoundedIcon}
                            sx={{ fontSize: 14, color: '#F59E0B' }}
                          />
                          <Typography
                            variant="caption"
                            sx={{ fontSize: '0.65rem', fontWeight: 700, color: 'text.secondary' }}
                          >
                            {myRating.rating}/5
                          </Typography>
                          {myRating.comment && (
                            <Typography
                              variant="caption"
                              sx={{
                                fontSize: '0.62rem',
                                color: 'text.disabled',
                                fontStyle: 'italic',
                              }}
                              noWrap
                            >
                              "{myRating.comment.slice(0, 30)}
                              {myRating.comment.length > 30 ? '…' : ''}"
                            </Typography>
                          )}
                        </Box>
                      )}

                      {/* Actions */}
                      <Box
                        sx={{
                          display: 'flex',
                          gap: 1,
                          mt: 'auto',
                          pt: 0.5,
                          flexDirection: { xs: 'column', sm: 'row' },
                          alignItems: { xs: 'stretch', sm: 'center' },
                        }}
                      >
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => setPreviewTpl(tpl)}
                          fullWidth={isMobile}
                          sx={{
                            fontSize: '0.75rem',
                            textTransform: 'none',
                            minHeight: 34,
                            borderRadius: 2,
                            flex: { sm: 1 },
                          }}
                        >
                          Preview
                        </Button>
                        <Button
                          size="small"
                          variant="contained"
                          startIcon={
                            isCloning ? null : (
                              <AppIcon
                                name="AddCircleOutline"
                                fallback={AddCircleOutlineIcon}
                                sx={{ fontSize: 15 }}
                              />
                            )
                          }
                          onClick={() => handleUseTemplate(tpl)}
                          disabled={isCloning}
                          fullWidth={isMobile}
                          sx={{
                            fontSize: '0.75rem',
                            textTransform: 'none',
                            minHeight: 34,
                            borderRadius: 2,
                            flex: { sm: 1 },
                            minWidth: 120,
                          }}
                        >
                          {isCloning ? <CircularProgress size={14} color="inherit" /> : 'Use'}
                        </Button>

                        {/* Rate — visible on hover only */}
                        <Typography
                          className="rate-trigger"
                          variant="caption"
                          onClick={() =>
                            setRatingDialog({ open: true, id: tpl.id, name: tpl.name })
                          }
                          sx={{
                            fontSize: '0.65rem',
                            color: myRating?.rating ? '#F59E0B' : 'text.disabled',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.25,
                            flexShrink: 0,
                            alignSelf: 'center',
                            '&:hover': { color: '#F59E0B' },
                          }}
                        >
                          <AppIcon
                            name="StarRounded"
                            fallback={StarRoundedIcon}
                            sx={{ fontSize: 13 }}
                          />
                          Rate
                        </Typography>
                      </Box>
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
            label="orgs"
            dense
          />
        </>
      )}
      {/* ── Preview Dialog ─────────────────────────────────────────── */}
      <Dialog
        open={!!previewTpl}
        onClose={() => setPreviewTpl(null)}
        maxWidth="md"
        fullWidth
        fullScreen={isMobile}
        slotProps={{ paper: { sx: { borderRadius: isMobile ? 0 : 3 } } }}
      >
        {previewTpl &&
          (() => {
            const typeColor = TYPE_COLORS[previewTpl.type] || '#888';
            return (
              <>
                <DialogTitle
                  sx={{
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    pr: 6,
                    pb: 1,
                  }}
                >
                  <Box
                    sx={{
                      width: 32,
                      height: 32,
                      borderRadius: 1.5,
                      bgcolor: alpha(typeColor, 0.14),
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <AppIcon
                      name="AccountTreeOutlined"
                      fallback={AccountTreeOutlinedIcon}
                      sx={{ fontSize: 18, color: typeColor }}
                    />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="h6"
                      sx={{ fontWeight: 700, fontSize: '1rem', lineHeight: 1.2 }}
                    >
                      {previewTpl.name}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{ color: 'text.secondary', fontSize: '0.72rem' }}
                    >
                      {previewTpl.industry} · {TYPE_LABELS[previewTpl.type]}
                    </Typography>
                  </Box>
                  <IconButton
                    onClick={() => setPreviewTpl(null)}
                    size="small"
                    sx={{ position: 'absolute', right: 12, top: 12 }}
                  >
                    <AppIcon name="Close" fallback={CloseIcon} sx={{ fontSize: 20 }} />
                  </IconButton>
                </DialogTitle>
                <DialogContent
                  sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: '12px !important' }}
                >
                  {/* Chips */}
                  <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                    <Chip
                      label={TYPE_LABELS[previewTpl.type]}
                      size="small"
                      sx={{
                        height: 22,
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        bgcolor: alpha(typeColor, 0.12),
                        color: typeColor,
                      }}
                    />
                    <Chip
                      label={previewTpl.industry}
                      size="small"
                      variant="outlined"
                      sx={{ height: 22, fontSize: '0.7rem' }}
                    />
                    <Chip
                      label={`${previewTpl.entityCount} entities`}
                      size="small"
                      variant="outlined"
                      sx={{ height: 22, fontSize: '0.7rem' }}
                    />
                    <Chip
                      label={`${previewTpl.levels} level${previewTpl.levels === 1 ? '' : 's'}`}
                      size="small"
                      variant="outlined"
                      sx={{ height: 22, fontSize: '0.7rem' }}
                    />
                  </Box>

                  {/* Full description */}
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ lineHeight: 1.6, fontSize: '0.85rem' }}
                  >
                    {previewTpl.description}
                  </Typography>

                  {/* Larger org tree */}
                  <Box>
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 700,
                        mb: 1.25,
                        display: 'block',
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        fontSize: '0.62rem',
                        color: 'text.secondary',
                      }}
                    >
                      Structure Preview
                    </Typography>
                    <Box
                      sx={{
                        p: 2.5,
                        borderRadius: 2,
                        bgcolor: alpha(typeColor, 0.04),
                        border: '1px solid',
                        borderColor: alpha(typeColor, 0.12),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minHeight: 120,
                      }}
                    >
                      <OrgTreePreview
                        entities={previewTpl.entities}
                        typeColor={typeColor}
                        compact={false}
                      />
                    </Box>
                  </Box>

                  {/* Entity breakdown */}
                  <EntityBreakdown entities={previewTpl.entities} typeColor={typeColor} />

                  {/* Switch to Real — business holding only */}
                  {previewTpl.isBusiness && (
                    <Box>
                      <Typography
                        variant="caption"
                        sx={{
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: 0.5,
                          fontSize: '0.62rem',
                          color: 'text.secondary',
                          display: 'block',
                          mb: 0.5,
                        }}
                      >
                        Switch to Real
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: 'block', mb: 1, fontSize: '0.75rem' }}
                      >
                        Each subsidiary has a guided path to incorporate, bank, and license in the
                        real world.
                      </Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                        {previewTpl.entities
                          .filter((e) => e.sectorType)
                          .map((e) => (
                            <Button
                              key={e.name}
                              size="small"
                              variant="outlined"
                              sx={{
                                fontSize: '0.72rem',
                                textTransform: 'none',
                                borderRadius: 1.5,
                                borderColor: SECTOR_COLORS[e.sectorType],
                                color: SECTOR_COLORS[e.sectorType],
                                '&:hover': {
                                  bgcolor: alpha(SECTOR_COLORS[e.sectorType], 0.06),
                                  borderColor: SECTOR_COLORS[e.sectorType],
                                },
                              }}
                              onClick={() => {
                                setSwitchToRealSector(e.sectorType);
                                setSwitchToRealOpen(true);
                              }}
                            >
                              {e.name} →
                            </Button>
                          ))}
                      </Box>
                    </Box>
                  )}
                </DialogContent>
                <DialogActions
                  sx={{ px: 3, pb: 2.5, gap: 1, flexDirection: { xs: 'column', sm: 'row' } }}
                >
                  <Button
                    onClick={() => setPreviewTpl(null)}
                    sx={{ textTransform: 'none', order: { xs: 2, sm: 1 } }}
                    fullWidth={isMobile}
                  >
                    Close
                  </Button>
                  <Button
                    variant="contained"
                    startIcon={
                      cloning === previewTpl.id ? null : (
                        <AppIcon name="AddCircleOutline" fallback={AddCircleOutlineIcon} />
                      )
                    }
                    disabled={cloning === previewTpl.id}
                    onClick={() => {
                      handleUseTemplate(previewTpl);
                      setPreviewTpl(null);
                    }}
                    fullWidth={isMobile}
                    sx={{
                      textTransform: 'none',
                      fontWeight: 600,
                      borderRadius: 2,
                      minWidth: 140,
                      order: { xs: 1, sm: 2 },
                    }}
                  >
                    {cloning === previewTpl.id ? (
                      <CircularProgress size={16} color="inherit" />
                    ) : (
                      'Use'
                    )}
                  </Button>
                </DialogActions>
              </>
            );
          })()}
      </Dialog>
      <RatingCommentDialog
        open={ratingDialog.open}
        onClose={() => setRatingDialog({ open: false, id: '', name: '' })}
        itemName={ratingDialog.name}
        currentRating={ratings[ratingDialog.id]?.rating}
        currentComment={ratings[ratingDialog.id]?.comment}
        onSave={(r, c) => {
          saveRating(ratingDialog.id, r, c, 'org_template');
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
      <SwitchToRealWizard
        open={switchToRealOpen}
        onClose={() => setSwitchToRealOpen(false)}
        sectorType={switchToRealSector}
      />
    </Box>
  );
}
