import { useState, useEffect, useCallback, useMemo } from 'react';
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
  Checkbox,
  FormControlLabel,
  FormGroup,
  CircularProgress,
  Snackbar,
  Alert,
  Skeleton,
  useTheme,
  alpha,
} from '@mui/material';
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';
import CodeOutlinedIcon from '@mui/icons-material/CodeOutlined';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import AnalyticsOutlinedIcon from '@mui/icons-material/AnalyticsOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import ExtensionOutlinedIcon from '@mui/icons-material/ExtensionOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import CloseIcon from '@mui/icons-material/Close';
import Rating from '@mui/material/Rating';
import EmptyState from '../Common/EmptyState';
import Pagination from '../Common/Pagination';
import MarketplaceToolbar from './MarketplaceToolbar';
import RatingCommentDialog from './RatingCommentDialog';
import useMarketplaceSearch from '../../hooks/useMarketplaceSearch';
import useImportedLibraries from '../../hooks/useImportedLibraries';
import { ImportFromButton } from './ImportLibraryDialog';
import usePagination from '../../hooks/usePagination';
import { deriveFacetOptions } from '../../utils/facetOptions';
import { listSkills, installSkill } from '../../services/agentSkillsService';
import { createHoverGlowShadow } from '../../theme/hoverGlow';
import { getAgents } from '../../services/agentHubService';
import { SKILL_CATEGORIES } from '../../config/bundledSkills';
import {
  getAllRatings,
  saveRating,
  syncRatingsFromDB,
} from '../../services/marketplaceRatingService';

import AppIcon from '../icons/AppIcon';

const ICON_MAP = {
  psychology: PsychologyOutlinedIcon,
  code: CodeOutlinedIcon,
  business: BusinessOutlinedIcon,
  article: ArticleOutlinedIcon,
  analytics: AnalyticsOutlinedIcon,
  settings: SettingsOutlinedIcon,
  lightbulb: LightbulbOutlinedIcon,
  extension: ExtensionOutlinedIcon,
};

function SkillIcon({ icon, sx }) {
  const Icon = ICON_MAP[icon] || ExtensionOutlinedIcon;
  return <AppIcon fallback={Icon} sx={sx} />;
}

function getCategoryColor(cat) {
  return SKILL_CATEGORIES.find((c) => c.value === cat)?.color || '#888';
}
function getCategoryLabel(cat) {
  return SKILL_CATEGORIES.find((c) => c.value === cat)?.label || cat;
}

const SORT_OPTIONS = [
  { value: 'installs', label: 'Most Installed' },
  { value: 'rating', label: 'Highest Rated' },
  { value: 'name', label: 'Name A-Z' },
  { value: 'newest', label: 'Newest' },
];

const FACETS = [
  { key: 'tags', label: 'Tags', field: 'tags', array: true },
  { key: 'compatible_roles', label: 'Roles', field: 'compatible_roles', array: true },
];

export default function MarketplaceSkillsTab() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState([]);
  const [previewSkill, setPreviewSkill] = useState(null);
  const [installOpen, setInstallOpen] = useState(false);
  const [installSkillData, setInstallSkillData] = useState(null);
  const [selectedAgents, setSelectedAgents] = useState([]);
  const [installing, setInstalling] = useState(false);
  const [ratings, setRatings] = useState(() => getAllRatings());
  const [ratingDialog, setRatingDialog] = useState({ open: false, id: '', name: '' });
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });

  useEffect(() => {
    syncRatingsFromDB().then((synced) => setRatings(synced));
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [skillList, agentList] = await Promise.all([
        listSkills(),
        Promise.resolve(getAgents()),
      ]);
      setSkills(skillList || []);
      setAgents(agentList || []);
    } catch {
      setSkills([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const { importedItems } = useImportedLibraries('skills');
  const importedSlugs = useMemo(
    () => new Set(importedItems.map((i) => i.slug || i.id).filter(Boolean)),
    [importedItems]
  );
  const displaySkills = useMemo(
    () => skills.map((s) => (importedSlugs.has(s.slug) ? { ...s, _imported: true } : s)),
    [skills, importedSlugs]
  );

  const categories = SKILL_CATEGORIES.map((c) => ({
    value: c.value,
    label: c.label,
    color: c.color,
  }));

  const searchOptions = useMemo(() => ({ facets: FACETS }), []);
  const facetOptions = useMemo(
    () => ({
      tags: deriveFacetOptions(displaySkills, 'tags', { array: true }),
      compatible_roles: deriveFacetOptions(displaySkills, 'compatible_roles', { array: true }),
    }),
    [displaySkills]
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
  } = useMarketplaceSearch(displaySkills, ['name', 'description', 'tags'], 'category', searchOptions);

  const pagination = usePagination(filteredItems, {
    surfaceId: 'marketplace.skills',
    defaultRowsPerPage: 12,
    resetOn: [searchQuery, categoryFilter, sortBy, facetKey],
  });

  const openInstall = useCallback((skill) => {
    setInstallSkillData(skill);
    setSelectedAgents([]);
    setInstallOpen(true);
  }, []);

  const handleInstall = useCallback(async () => {
    if (!installSkillData || selectedAgents.length === 0) return;
    setInstalling(true);
    try {
      for (const agentId of selectedAgents) {
        await installSkill(agentId, installSkillData.id);
      }
      setToast({
        open: true,
        message: `${installSkillData.name} installed on ${selectedAgents.length} agent(s)`,
        severity: 'success',
      });
      setInstallOpen(false);
    } catch (err) {
      setToast({ open: true, message: err.message, severity: 'error' });
    } finally {
      setInstalling(false);
    }
  }, [installSkillData, selectedAgents]);

  if (loading) {
    return (
      <Box>
        <Skeleton variant="rounded" height={40} sx={{ mb: 3, borderRadius: 2 }} />
        <Grid container spacing={2}>
          {Array.from({ length: 8 }).map((_, i) => (
            <Grid key={i} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
              <Skeleton variant="rounded" height={200} sx={{ borderRadius: 2 }} />
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
        categories={categories}
        categoryFilter={categoryFilter}
        onCategoryChange={setCategoryFilter}
        sortBy={sortBy}
        onSortChange={setSortBy}
        sortOptions={SORT_OPTIONS}
        placeholder="Search skills..."
        resultCount={resultCount}
        totalCount={skills.length}
        facets={facets}
        facetFilters={facetFilters}
        facetOptions={facetOptions}
        onToggleFacet={toggleFacetValue}
        onClearFacets={clearAllFacets}
        actionButton={<ImportFromButton category="skills" onImported={loadData} />}
      />
      {filteredItems.length === 0 ? (
        <EmptyState
          icon={ExtensionOutlinedIcon}
          title="No skills found"
          description="Try different keywords or clear your filters."
        />
      ) : (
        <>
          <Grid container spacing={2}>
            {pagination.paginatedData.map((skill, idx) => {
              const catColor = getCategoryColor(skill.category);
              return (
                <Grid key={skill.id || idx} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 2.5,
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      borderRadius: 2,
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
                    {/* Icon */}
                    <Box
                      sx={{
                        width: 40,
                        height: 40,
                        borderRadius: 1.5,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        bgcolor: alpha(catColor, 0.12),
                        mb: 1,
                      }}
                    >
                      <SkillIcon icon={skill.icon} sx={{ fontSize: 20, color: catColor }} />
                    </Box>

                    {/* Name & Category */}
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: 700, mb: 0.5, lineHeight: 1.3 }}
                      noWrap
                    >
                      {skill.name}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1 }}>
                      <Chip
                        label={getCategoryLabel(skill.category)}
                        size="small"
                        sx={{
                          bgcolor: alpha(catColor, 0.12),
                          color: catColor,
                          fontWeight: 600,
                          fontSize: '0.7rem',
                          width: 'fit-content',
                        }}
                      />
                      {skill._imported && (
                        <Chip
                          label="Imported"
                          size="small"
                          sx={{
                            fontWeight: 600,
                            fontSize: '0.62rem',
                            height: 22,
                            bgcolor: alpha(theme.palette.secondary.main, 0.14),
                            color: 'secondary.main',
                          }}
                        />
                      )}
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
                        fontSize: '0.8rem',
                      }}
                    >
                      {skill.description}
                    </Typography>

                    {/* Tags */}
                    {skill.tags?.length > 0 && (
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1.5 }}>
                        {skill.tags.slice(0, 2).map((tag) => (
                          <Chip
                            key={tag}
                            label={tag}
                            size="small"
                            variant="outlined"
                            sx={{ fontSize: '0.7rem' }}
                          />
                        ))}
                      </Box>
                    )}

                    {/* Rating row */}
                    {ratings[skill.id]?.rating && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                        <Rating
                          value={ratings[skill.id].rating}
                          size="small"
                          readOnly
                          sx={{ '& .MuiRating-iconFilled': { color: '#F59E0B' } }}
                        />
                        {ratings[skill.id].comment && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ fontStyle: 'italic' }}
                            noWrap
                          >
                            "{ratings[skill.id].comment}"
                          </Typography>
                        )}
                      </Box>
                    )}

                    {/* Stats & Actions */}
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        mt: 'auto',
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {skill.install_count > 0 && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ display: 'flex', alignItems: 'center', gap: 0.3 }}
                          >
                            <AppIcon
                              name="DownloadOutlined"
                              fallback={DownloadOutlinedIcon}
                              sx={{ fontSize: 14 }}
                            />
                            {skill.install_count >= 1000
                              ? `${(skill.install_count / 1000).toFixed(1)}k`
                              : skill.install_count}
                          </Typography>
                        )}
                        <IconButton
                          size="small"
                          onClick={() =>
                            setRatingDialog({ open: true, id: skill.id, name: skill.name })
                          }
                          sx={{ p: 0.25 }}
                        >
                          <AppIcon
                            name="StarRounded"
                            fallback={StarRoundedIcon}
                            sx={{
                              fontSize: 16,
                              color: ratings[skill.id]?.rating ? '#F59E0B' : 'text.disabled',
                            }}
                          />
                        </IconButton>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <IconButton
                          size="small"
                          onClick={() => setPreviewSkill(skill)}
                          sx={{ p: 0.5 }}
                        >
                          <AppIcon
                            name="VisibilityOutlined"
                            fallback={VisibilityOutlinedIcon}
                            sx={{ fontSize: 18 }}
                          />
                        </IconButton>
                        <Button
                          size="small"
                          variant="contained"
                          onClick={() => openInstall(skill)}
                          sx={{
                            fontSize: '0.72rem',
                            textTransform: 'none',
                            minWidth: 'auto',
                            px: 1.5,
                            borderRadius: 2,
                          }}
                        >
                          Install
                        </Button>
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
            label="skills"
            dense
          />
        </>
      )}
      {/* Preview Dialog */}
      <Dialog
        open={!!previewSkill}
        onClose={() => setPreviewSkill(null)}
        maxWidth="md"
        fullWidth
        slotProps={{ paper: { sx: { borderRadius: 3 } } }}
      >
        {previewSkill && (
          <>
            <DialogTitle
              sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1, pr: 5 }}
            >
              <SkillIcon
                icon={previewSkill.icon}
                sx={{ color: getCategoryColor(previewSkill.category) }}
              />
              {previewSkill.name}
              <IconButton
                onClick={() => setPreviewSkill(null)}
                sx={{ position: 'absolute', right: 8, top: 8 }}
              >
                <AppIcon name="Close" fallback={CloseIcon} />
              </IconButton>
            </DialogTitle>
            <DialogContent>
              <Box sx={{ display: 'flex', gap: 0.5, mb: 2, flexWrap: 'wrap' }}>
                <Chip
                  label={getCategoryLabel(previewSkill.category)}
                  size="small"
                  sx={{
                    bgcolor: alpha(getCategoryColor(previewSkill.category), 0.12),
                    color: getCategoryColor(previewSkill.category),
                    fontWeight: 600,
                  }}
                />
                {previewSkill.tags?.map((tag) => (
                  <Chip key={tag} label={tag} size="small" variant="outlined" />
                ))}
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {previewSkill.description}
              </Typography>
              {previewSkill.content && (
                <Box
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    bgcolor: isDark ? 'grey.900' : 'grey.50',
                    border: '1px solid',
                    borderColor: 'divider',
                    maxHeight: 400,
                    overflow: 'auto',
                    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                    fontSize: '0.78rem',
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {previewSkill.content}
                </Box>
              )}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
              <Button onClick={() => setPreviewSkill(null)} sx={{ textTransform: 'none' }}>
                Close
              </Button>
              <Button
                variant="contained"
                onClick={() => {
                  openInstall(previewSkill);
                  setPreviewSkill(null);
                }}
                sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
              >
                Install on Agent
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
      {/* Install Dialog — pick agents */}
      <Dialog
        open={installOpen}
        onClose={() => setInstallOpen(false)}
        maxWidth="xs"
        fullWidth
        slotProps={{ paper: { sx: { borderRadius: 3 } } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>
          Install {installSkillData?.name}
          <IconButton
            onClick={() => setInstallOpen(false)}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <AppIcon name="Close" fallback={CloseIcon} />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: '8px !important' }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Select agents to install this skill on:
          </Typography>
          <FormGroup>
            {agents.map((ag) => (
              <FormControlLabel
                key={ag.id || ag.agent_id}
                control={
                  <Checkbox
                    checked={selectedAgents.includes(ag.id || ag.agent_id)}
                    onChange={(e) => {
                      const id = ag.id || ag.agent_id;
                      setSelectedAgents((prev) =>
                        e.target.checked ? [...prev, id] : prev.filter((x) => x !== id)
                      );
                    }}
                    size="small"
                  />
                }
                label={
                  <Typography variant="body2">
                    {ag.role || ag.name || 'Agent'}{' '}
                    <Typography component="span" variant="caption" color="text.secondary">
                      {ag.category}
                    </Typography>
                  </Typography>
                }
              />
            ))}
            {agents.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                No agents in workspace. Add agents first from the Agents tab.
              </Typography>
            )}
          </FormGroup>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setInstallOpen(false)} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleInstall}
            disabled={installing || selectedAgents.length === 0}
            sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
          >
            {installing ? (
              <CircularProgress size={18} />
            ) : (
              `Install on ${selectedAgents.length} agent(s)`
            )}
          </Button>
        </DialogActions>
      </Dialog>
      {/* Rating Dialog */}
      <RatingCommentDialog
        open={ratingDialog.open}
        onClose={() => setRatingDialog({ open: false, id: '', name: '' })}
        itemName={ratingDialog.name}
        currentRating={ratings[ratingDialog.id]?.rating}
        currentComment={ratings[ratingDialog.id]?.comment}
        onSave={(r, c) => {
          saveRating(ratingDialog.id, r, c, 'skill');
          setRatings(getAllRatings());
          setToast({ open: true, message: 'Rating saved', severity: 'success' });
        }}
      />
      {/* Toast */}
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
