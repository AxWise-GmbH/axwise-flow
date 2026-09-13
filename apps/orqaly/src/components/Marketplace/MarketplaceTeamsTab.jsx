import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Chip,
  Button,
  TextField,
  IconButton,
  CircularProgress,
  Divider,
  Snackbar,
  Alert,
  Skeleton,
  useTheme,
  alpha,
} from '@mui/material';
import FormDialog from '../Common/FormDialog';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import Diversity3OutlinedIcon from '@mui/icons-material/Diversity3Outlined';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import CloseIcon from '@mui/icons-material/Close';
import Rating from '@mui/material/Rating';
import EmptyState from '../Common/EmptyState';
import Pagination from '../Common/Pagination';
import MarketplaceToolbar from './MarketplaceToolbar';
import RatingCommentDialog from './RatingCommentDialog';
import IndustryIcon from './IndustryIcon';
import { resolveIndustryIcon } from '../../config/industryIcons';
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
import { useConciliumTeams } from '../../hooks/useConciliumTeams';
import { CONSILIUM_TEMPLATES } from '../../config/consiliumTemplates';
import { getAllConcilium } from '../../services/conciliumService';
import { addMember } from '../../services/conciliumMembersService';
import { addMemberToTeam } from '../../services/conciliumTeamsService';

import AppIcon from '../icons/AppIcon';

const INDUSTRY_CATEGORIES = [...new Set(CONSILIUM_TEMPLATES.map((t) => t.industry))].map((ind) => ({
  value: ind,
  label: ind,
  color: CONSILIUM_TEMPLATES.find((t) => t.industry === ind)?.color,
}));

const SORT_OPTIONS = [
  { value: 'name', label: 'Name A-Z' },
  { value: 'newest', label: 'Newest' },
];

const ROLE_LABELS = {
  chairman: 'Chairman',
  evaluator: 'Evaluator',
  auditor: 'Auditor',
  specialist: 'Specialist',
  observer: 'Observer',
};

const PROVIDER_LABELS = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  groq: 'Groq',
  deepseek: 'DeepSeek',
  glm: 'GLM',
};

export default function MarketplaceTeamsTab() {
  const theme = useTheme();
  const { teams, loading, addTeam } = useConciliumTeams();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [previewTpl, setPreviewTpl] = useState(null);
  const [previewTeam, setPreviewTeam] = useState(null);
  const [applying, setApplying] = useState(null);
  const [ratings, setRatings] = useState(() => getAllRatings());
  const [ratingDialog, setRatingDialog] = useState({ open: false, id: '', name: '' });
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });

  useEffect(() => {
    syncRatingsFromDB().then((synced) => setRatings(synced));
  }, []);

  // Track which templates have been applied (by team name match)
  const appliedNames = useMemo(() => new Set(teams.map((t) => t.name)), [teams]);

  const { importedItems } = useImportedLibraries('teams');
  const mergedItems = useMemo(() => [...CONSILIUM_TEMPLATES, ...importedItems], [importedItems]);

  // Search/filter on templates
  const {
    filteredItems: filteredTemplates,
    searchQuery,
    setSearchQuery,
    categoryFilter,
    setCategoryFilter,
    sortBy,
    setSortBy,
    resultCount,
  } = useMarketplaceSearch(mergedItems, ['name', 'description', 'industry'], 'industry');

  const pagination = usePagination(filteredTemplates, {
    surfaceId: 'marketplace.teams',
    defaultRowsPerPage: 12,
    resetOn: [searchQuery, categoryFilter, sortBy],
  });

  // Apply template: create team + members + link
  const handleApplyTemplate = useCallback(
    async (tpl) => {
      setApplying(tpl.id);
      try {
        // 1. Ensure user has a consilium board
        const boards = await getAllConcilium();
        const boardId = boards[0]?.id;
        if (!boardId) throw new Error('No consilium board found. Visit the Consilium page first.');

        // 2. Create the team
        const team = await addTeam({ name: tpl.name, description: tpl.description });
        if (!team) throw new Error('Failed to create team');

        // 3. Create members and link to team
        for (const m of tpl.members) {
          const member = await addMember(boardId, {
            name: m.name,
            role: m.role,
            provider: m.provider,
            model: m.model,
            temperature: m.temperature,
            maxTokens: m.maxTokens,
            resume: m.resume,
            skills: m.skills,
          });
          if (member?.id) {
            try {
              await addMemberToTeam(team.id, member.id);
            } catch {
              // Junction insert may fail if table not migrated — team still created
            }
          }
        }

        setToast({
          open: true,
          message: `"${tpl.name}" applied — ${tpl.members.length} members created. Check Consilium page.`,
          severity: 'success',
        });
      } catch (err) {
        setToast({ open: true, message: err.message, severity: 'error' });
      } finally {
        setApplying(null);
      }
    },
    [addTeam]
  );

  const handleCreate = useCallback(async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await addTeam({ name: form.name, description: form.description });
      setCreateOpen(false);
      setForm({ name: '', description: '' });
      setToast({ open: true, message: `Team "${form.name}" created`, severity: 'success' });
    } catch (err) {
      setToast({ open: true, message: err.message, severity: 'error' });
    } finally {
      setSaving(false);
    }
  }, [form, addTeam]);

  if (loading) {
    return (
      <Box>
        <Skeleton variant="rounded" height={40} sx={{ mb: 3, borderRadius: 2 }} />
        <Grid container spacing={2}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Grid key={i} size={{ xs: 12, sm: 6, md: 6, lg: 4 }}>
              <Skeleton variant="rounded" height={220} sx={{ borderRadius: 2.5 }} />
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
        categories={INDUSTRY_CATEGORIES}
        categoryFilter={categoryFilter}
        onCategoryChange={setCategoryFilter}
        sortBy={sortBy}
        onSortChange={setSortBy}
        sortOptions={SORT_OPTIONS}
        placeholder="Search consilium templates..."
        resultCount={resultCount}
        totalCount={mergedItems.length}
        actionButton={
          <Box sx={{ display: 'flex', gap: 1 }}>
            <ImportFromButton category="teams" />
            <Button
              variant="outlined"
              size="small"
              startIcon={<AppIcon name="AddCircleOutline" fallback={AddCircleOutlineIcon} />}
              onClick={() => setCreateOpen(true)}
              sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
            >
              Custom
            </Button>
          </Box>
        }
      />
      {/* ── Industry Templates ──────────────────────────────────────── */}
      <Typography variant="caption" color="text.secondary" sx={{ mb: 1.5, display: 'block' }}>
        {resultCount} industry template{resultCount !== 1 ? 's' : ''}
      </Typography>
      {filteredTemplates.length === 0 ? (
        <EmptyState
          icon={Diversity3OutlinedIcon}
          title="No templates found"
          description="Adjust your filters to see available consilium templates."
        />
      ) : (
        <>
          <Grid container spacing={2}>
            {pagination.paginatedData.map((tpl, idx) => {
              const tplColor = tpl.color || theme.palette.warning.main;
              const isApplied = appliedNames.has(tpl.name);

              return (
                <Grid
                  key={tpl._imported ? `${tpl._sourceId}:${tpl.id}` : tpl.id}
                  size={{ xs: 12, sm: 6, md: 6, lg: 4 }}
                >
                  <Paper
                    elevation={0}
                    sx={{
                      p: 2,
                      height: '100%',
                      position: 'relative',
                      display: 'flex',
                      flexDirection: 'column',
                      borderRadius: 2.5,
                      border: '1px solid',
                      borderColor: alpha(tplColor, 0.18),
                      background: `linear-gradient(135deg, ${alpha(tplColor, 0.06)} 0%, ${alpha(theme.palette.background.paper, 0.98)} 70%)`,
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
                    {/* Header */}
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 1 }}>
                      <Box
                        sx={{
                          width: 40,
                          height: 40,
                          borderRadius: 2,
                          bgcolor: alpha(tplColor, 0.14),
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <IndustryIcon
                          industry={tpl.industry}
                          icon={tpl.icon}
                          color={tplColor}
                          size={20}
                        />
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: 700, lineHeight: 1.2 }}
                          noWrap
                        >
                          {tpl.name}
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                          <Chip
                            label={tpl.industry}
                            size="small"
                            sx={{
                              height: 18,
                              fontSize: '0.65rem',
                              fontWeight: 600,
                              bgcolor: alpha(tplColor, 0.12),
                              color: tplColor,
                            }}
                          />
                          <Chip
                            label={`${tpl.members.length} members`}
                            size="small"
                            variant="outlined"
                            sx={{ height: 18, fontSize: '0.65rem' }}
                          />
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
                      {tpl.description}
                    </Typography>

                    {/* Members preview */}
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1.5 }}>
                      {tpl.members.map((m) => (
                        <Chip
                          key={m.name}
                          icon={
                            <AppIcon
                              name="PersonOutlined"
                              fallback={PersonOutlinedIcon}
                              sx={{ fontSize: '14px !important' }}
                            />
                          }
                          label={`${m.name} (${ROLE_LABELS[m.role] || m.role})`}
                          size="small"
                          sx={{
                            fontSize: '0.62rem',
                            height: 22,
                            bgcolor: alpha(theme.palette.text.primary, 0.05),
                          }}
                        />
                      ))}
                    </Box>

                    {/* Criteria preview */}
                    {tpl.criteria && (
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1.5 }}>
                        {tpl.criteria.slice(0, 3).map((c) => (
                          <Chip
                            key={c.name}
                            label={`${c.name} ${Math.round(c.weight * 100)}%`}
                            size="small"
                            variant="outlined"
                            sx={{ fontSize: '0.6rem', height: 18 }}
                          />
                        ))}
                        {tpl.criteria.length > 3 && (
                          <Chip
                            label={`+${tpl.criteria.length - 3}`}
                            size="small"
                            variant="outlined"
                            sx={{ fontSize: '0.6rem', height: 18 }}
                          />
                        )}
                      </Box>
                    )}

                    {/* Rating */}
                    {ratings[tpl.id]?.rating && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                        <Rating
                          value={ratings[tpl.id].rating}
                          size="small"
                          readOnly
                          sx={{ '& .MuiRating-iconFilled': { color: '#F59E0B' } }}
                        />
                        {ratings[tpl.id].comment && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ fontStyle: 'italic' }}
                            noWrap
                          >
                            "{ratings[tpl.id].comment}"
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
                        gap: 0.5,
                        mt: 'auto',
                      }}
                    >
                      {isApplied && (
                        <IconButton
                          size="small"
                          onClick={() =>
                            setRatingDialog({ open: true, id: tpl.id, name: tpl.name })
                          }
                          sx={{ p: 0.25 }}
                        >
                          <AppIcon
                            name="StarRounded"
                            fallback={StarRoundedIcon}
                            sx={{
                              fontSize: 16,
                              color: ratings[tpl.id]?.rating ? '#F59E0B' : 'text.disabled',
                            }}
                          />
                        </IconButton>
                      )}
                      <Box sx={{ flex: 1 }} />
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => setPreviewTpl(tpl)}
                        sx={{
                          fontSize: '0.72rem',
                          textTransform: 'none',
                          minWidth: 'auto',
                          px: 1.5,
                          borderRadius: 2,
                        }}
                      >
                        Preview
                      </Button>
                      {isApplied ? (
                        <Chip
                          icon={
                            <AppIcon
                              name="CheckCircleOutline"
                              fallback={CheckCircleOutlineIcon}
                              sx={{ fontSize: 14 }}
                            />
                          }
                          label="Applied"
                          size="small"
                          color="success"
                          sx={{ height: 30, fontWeight: 600, fontSize: '0.72rem' }}
                        />
                      ) : (
                        <Button
                          size="small"
                          variant="contained"
                          startIcon={
                            <AppIcon
                              name="AddCircleOutline"
                              fallback={AddCircleOutlineIcon}
                              sx={{ fontSize: 14 }}
                            />
                          }
                          onClick={() => handleApplyTemplate(tpl)}
                          disabled={applying === tpl.id}
                          sx={{
                            fontSize: '0.72rem',
                            textTransform: 'none',
                            minWidth: 'auto',
                            px: 1.5,
                            borderRadius: 2,
                          }}
                        >
                          {applying === tpl.id ? 'Applying...' : 'Use Template'}
                        </Button>
                      )}
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
            label="teams"
            dense
          />
        </>
      )}
      {/* ── Your Teams ──────────────────────────────────────────────── */}
      {teams.length > 0 && (
        <Box sx={{ mt: 4 }}>
          <Divider sx={{ mb: 2 }} />
          <Typography
            variant="h6"
            sx={{
              fontWeight: 700,
              fontSize: '0.85rem',
              mb: 1.5,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            Your Teams ({teams.length})
          </Typography>
          <Grid container spacing={2}>
            {teams.map((team, idx) => (
              <Grid key={team.id || idx} size={{ xs: 12, sm: 6, md: 6, lg: 4 }}>
                <Paper
                  elevation={0}
                  sx={{
                    p: 2,
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    borderRadius: 2.5,
                    border: '1px solid',
                    borderColor: alpha(theme.palette.primary.main, 0.15),
                    transition: 'all 0.2s ease-in-out',
                    '&:hover': {
                      borderColor: alpha(theme.palette.primary.main, 0.3),
                      boxShadow: createHoverGlowShadow(theme),
                    },
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                    <Box
                      sx={{
                        width: 36,
                        height: 36,
                        borderRadius: 2,
                        bgcolor: alpha(theme.palette.primary.main, 0.1),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <AppIcon
                        name="GroupsOutlined"
                        fallback={GroupsOutlinedIcon}
                        sx={{ fontSize: 18, color: 'primary.main' }}
                      />
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.2 }} noWrap>
                        {team.name}
                      </Typography>
                    </Box>
                    <Chip
                      label={team.isActive !== false ? 'Active' : 'Inactive'}
                      size="small"
                      color={team.isActive !== false ? 'success' : 'default'}
                      sx={{ height: 18, fontSize: '0.6rem', fontWeight: 600 }}
                    />
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
                    {team.description || 'No description'}
                  </Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}
      {/* ── Template Preview Dialog ─────────────────────────────────── */}
      {previewTpl && (
        <FormDialog
          open
          onClose={() => setPreviewTpl(null)}
          title={previewTpl.name}
          icon={
            resolveIndustryIcon(previewTpl.industry, previewTpl.icon)?.fallback ||
            GroupsOutlinedIcon
          }
          maxWidth="sm"
          contentDividers={false}
          contentSx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
          actions={
            <>
              <Button onClick={() => setPreviewTpl(null)} sx={{ textTransform: 'none' }}>
                Close
              </Button>
              {!appliedNames.has(previewTpl.name) && (
                <Button
                  variant="contained"
                  startIcon={<AppIcon name="AddCircleOutline" fallback={AddCircleOutlineIcon} />}
                  onClick={() => {
                    handleApplyTemplate(previewTpl);
                    setPreviewTpl(null);
                  }}
                  sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
                >
                  Use Template
                </Button>
              )}
            </>
          }
        >
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            <Chip
              label={previewTpl.industry}
              size="small"
              sx={{
                bgcolor: alpha(previewTpl.color, 0.12),
                color: previewTpl.color,
                fontWeight: 600,
              }}
            />
            <Chip label={`${previewTpl.members.length} members`} size="small" variant="outlined" />
          </Box>

          <Typography variant="body2" color="text.secondary">
            {previewTpl.description}
          </Typography>

          {/* Members detail */}
          <Box>
            <Typography
              variant="caption"
              sx={{
                fontWeight: 700,
                mb: 1,
                display: 'block',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              Board Members
            </Typography>
            {previewTpl.members.map((m) => (
              <Paper key={m.name} variant="outlined" sx={{ p: 1.5, mb: 1, borderRadius: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {m.name}
                  </Typography>
                  <Chip
                    label={ROLE_LABELS[m.role] || m.role}
                    size="small"
                    sx={{ height: 18, fontSize: '0.6rem', fontWeight: 600 }}
                  />
                  <Chip
                    label={PROVIDER_LABELS[m.provider] || m.provider}
                    size="small"
                    variant="outlined"
                    sx={{ height: 18, fontSize: '0.6rem' }}
                  />
                  <Chip
                    label={m.model}
                    size="small"
                    variant="outlined"
                    sx={{ height: 18, fontSize: '0.6rem' }}
                  />
                </Box>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ fontSize: '0.8rem', mb: 0.5 }}
                >
                  {m.resume}
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {m.skills.map((s) => (
                    <Chip
                      key={s}
                      label={s}
                      size="small"
                      sx={{
                        fontSize: '0.62rem',
                        height: 18,
                        bgcolor: alpha(theme.palette.text.primary, 0.05),
                      }}
                    />
                  ))}
                </Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ mt: 0.5, display: 'block' }}
                >
                  Temperature: {m.temperature} | Max tokens: {m.maxTokens}
                </Typography>
              </Paper>
            ))}
          </Box>

          {/* Criteria */}
          {previewTpl.criteria && (
            <Box>
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 700,
                  mb: 0.5,
                  display: 'block',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                Evaluation Criteria
              </Typography>
              {previewTpl.criteria.map((c) => (
                <Box key={c.name} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.25 }}>
                  <Typography variant="body2" sx={{ flex: 1, fontSize: '0.82rem' }}>
                    {c.name}
                  </Typography>
                  <Chip
                    label={`${Math.round(c.weight * 100)}%`}
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      bgcolor: alpha(previewTpl.color, 0.12),
                      color: previewTpl.color,
                    }}
                  />
                </Box>
              ))}
            </Box>
          )}
        </FormDialog>
      )}
      {/* ── User Team Preview Dialog ────────────────────────────────── */}
      {previewTeam && (
        <FormDialog
          open
          onClose={() => setPreviewTeam(null)}
          title={previewTeam.name}
          icon={GroupsOutlinedIcon}
          maxWidth="xs"
          contentDividers={false}
          contentSx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}
          primaryLabel="Close"
          onPrimary={() => setPreviewTeam(null)}
          hideCancel
        >
          <Chip
            label={previewTeam.isActive !== false ? 'Active' : 'Inactive'}
            size="small"
            color={previewTeam.isActive !== false ? 'success' : 'default'}
            sx={{ fontWeight: 600, width: 'fit-content' }}
          />
          <Typography variant="body2" color="text.secondary">
            {previewTeam.description || 'No description provided.'}
          </Typography>
        </FormDialog>
      )}
      {/* ── Create Custom Team Dialog ───────────────────────────────── */}
      <FormDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Custom Team"
        icon={Diversity3OutlinedIcon}
        iconVariant="warning"
        maxWidth="xs"
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
              {saving ? <CircularProgress size={18} /> : 'Create'}
            </Button>
          </>
        }
      >
        <TextField
          label="Team Name"
          size="small"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
        />
        <TextField
          label="Description"
          size="small"
          multiline
          rows={3}
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
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
          saveRating(ratingDialog.id, r, c, 'team');
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
