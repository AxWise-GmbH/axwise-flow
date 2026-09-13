import { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Tabs,
  Tab,
  Paper,
  Button,
  Stack,
  useTheme,
  alpha,
  Chip,
  Skeleton,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import ChatBubbleOutlineOutlinedIcon from '@mui/icons-material/ChatBubbleOutlineOutlined';
import TimelineOutlinedIcon from '@mui/icons-material/TimelineOutlined';
import NoteOutlinedIcon from '@mui/icons-material/NoteOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import StarOutlineOutlinedIcon from '@mui/icons-material/StarOutlineOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import AssignmentIcon from '@mui/icons-material/Assignment';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import {
  getHistory,
  HISTORY_TABS,
  seedHistoryIfEmpty,
} from '../../../services/partnerHistoryService';
import { getRecommendations, getLastAnalyzedAt } from '../../../services/aiRecommendationsService';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';

import AppIcon from '../../../components/icons/AppIcon';

const AI_RECOMMENDATIONS_TAB = {
  id: 'recommendations',
  label: 'AI Recommendations',
  noCount: true,
};
const ALL_TABS = [HISTORY_TABS[0], AI_RECOMMENDATIONS_TAB];
const HISTORY_VISIBLE_CARDS_HEIGHT = 420; // approx. 3 cards visible

const ICONS_BY_TYPE = {
  note: NoteOutlinedIcon,
  conversation: ChatBubbleOutlineOutlinedIcon,
  interaction: TimelineOutlinedIcon,
  reminder: ScheduleOutlinedIcon,
  rating: StarOutlineOutlinedIcon,
  file: FolderOutlinedIcon,
  change: EditOutlinedIcon,
};

function formatRelativeTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now - d;
  const diffM = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMs / 3600000);
  const diffD = Math.floor(diffMs / 86400000);
  if (diffM < 1) return 'Just now';
  if (diffM < 60) return `${diffM} min ago`;
  if (diffH < 24) return `${diffH} hour${diffH !== 1 ? 's' : ''} ago`;
  if (diffD < 7) return `${diffD} day${diffD !== 1 ? 's' : ''} ago`;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function HistoryBlock({
  partnerId,
  partnerName,
  partner = null,
  meetingsCount = 0,
  financeDebt = 0,
  onOpenMeeting,
  onOpenTaskManager,
  refreshKey = 0,
}) {
  const theme = useTheme();
  const [activeTab, setActiveTab] = useState('all');
  const [allEntries, setAllEntries] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [lastAnalyzed, setLastAnalyzed] = useState(null);

  useEffect(() => {
    if (!partnerId) return;
    (async () => {
      await seedHistoryIfEmpty(partnerId, partnerName);
      const entries = await getHistory(partnerId, null);
      setAllEntries(entries);
    })();
  }, [partnerId, partnerName, refreshKey]);

  useEffect(() => {
    if (activeTab !== 'recommendations' || !partner) return;
    setRecommendationsLoading(true);
    const hasRecentMeeting = false;
    Promise.all([
      getRecommendations(partner, { meetingsCount, hasRecentMeeting, financeDebt }),
      getLastAnalyzedAt(partner.id),
    ])
      .then(([recs, analyzedAt]) => {
        setRecommendations(recs);
        setLastAnalyzed(analyzedAt);
      })
      .catch(() => {
        setRecommendations([]);
        setLastAnalyzed(null);
      })
      .finally(() => setRecommendationsLoading(false));
  }, [activeTab, partner, meetingsCount, financeDebt]);

  const counts = useMemo(() => {
    const byType = { all: allEntries.length };
    HISTORY_TABS.forEach((t) => {
      if (t.id !== 'all') byType[t.id] = allEntries.filter((e) => e.type === t.id).length;
    });
    byType.recommendations = 0;
    return byType;
  }, [allEntries]);

  const displayEntries = useMemo(() => {
    if (activeTab === 'all') return allEntries;
    if (activeTab === 'recommendations') return [];
    return allEntries.filter((e) => e.type === activeTab);
  }, [allEntries, activeTab]);

  if (!partnerId) return null;

  return (
    <Box>
      <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.1rem', mb: 2 }}>
        History
      </Typography>
      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{
          mb: 2,
          minHeight: 40,
          '& .MuiTab-root': {
            minHeight: 40,
            textTransform: 'none',
            fontWeight: 600,
            fontSize: '0.8rem',
          },
          '& .Mui-selected': { color: 'primary.main' },
          '& .MuiTabs-indicator': { display: 'none' },
        }}
      >
        {ALL_TABS.map((tab) => (
          <Tab
            key={tab.id}
            value={tab.id}
            label={tab.noCount ? tab.label : `${tab.label} (${counts[tab.id] ?? 0})`}
            sx={{
              '&.Mui-selected': {
                bgcolor: alpha(theme.palette.primary.main, 0.08),
                borderRadius: 2,
              },
            }}
          />
        ))}
      </Tabs>
      {activeTab === 'recommendations' ? (
        <RecommendationsPanel
          recommendations={recommendations}
          loading={recommendationsLoading}
          partnerName={partnerName}
          theme={theme}
          lastAnalyzed={lastAnalyzed}
        />
      ) : (
        <Box
          sx={{
            position: 'relative',
            pl: 3,
            maxHeight: HISTORY_VISIBLE_CARDS_HEIGHT,
            overflowY: 'auto',
            pr: 0.5,
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            '&::-webkit-scrollbar': { width: 0, height: 0 },
            '&:hover': {
              scrollbarWidth: 'thin',
              '&::-webkit-scrollbar': { width: 8 },
              '&::-webkit-scrollbar-thumb': {
                borderRadius: 8,
                backgroundColor: alpha(theme.palette.primary.main, 0.28),
              },
              '&::-webkit-scrollbar-track': {
                borderRadius: 8,
                backgroundColor: alpha(theme.palette.primary.main, 0.08),
              },
            },
          }}
        >
          {/* Vertical timeline line */}
          <Box
            sx={{
              position: 'absolute',
              left: 11,
              top: 8,
              bottom: 8,
              width: 2,
              bgcolor: alpha(theme.palette.primary.main, 0.2),
              borderRadius: 1,
            }}
          />

          {displayEntries.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 3 }}>
              No history for this filter.
            </Typography>
          ) : (
            displayEntries.map((entry) => {
              const Icon = ICONS_BY_TYPE[entry.type] || NoteOutlinedIcon;
              const relativeTime = entry.relativeTime || formatRelativeTime(entry.createdAt);
              return (
                <Box
                  key={entry.id}
                  sx={{
                    position: 'relative',
                    display: 'flex',
                    gap: 2,
                    mb: 2,
                  }}
                >
                  <Box
                    sx={{
                      position: 'absolute',
                      left: -24,
                      top: 20,
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      border: '2px solid',
                      borderColor: alpha(theme.palette.primary.main, 0.4),
                      bgcolor: theme.palette.background.paper,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 1,
                    }}
                  >
                    <AppIcon fallback={Icon} sx={{ fontSize: 14, color: 'primary.main' }} />
                  </Box>
                  <Paper
                    elevation={0}
                    sx={{
                      flex: 1,
                      p: 2,
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: 'divider',
                      bgcolor: alpha(theme.palette.grey[500], 0.04),
                    }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: 1,
                        mb: 0.5,
                      }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>
                        {entry.title}
                        {entry.body && (
                          <>
                            {' '}
                            <Typography
                              component="span"
                              variant="body2"
                              sx={{
                                fontWeight: 700,
                                color: entry.bodyHighlight ? 'warning.main' : 'text.primary',
                              }}
                            >
                              {entry.body}
                            </Typography>
                            {entry.type === 'file' && (
                              <AppIcon
                                name="InfoOutlined"
                                fallback={InfoOutlinedIcon}
                                sx={{
                                  fontSize: 14,
                                  verticalAlign: 'middle',
                                  ml: 0.25,
                                  color: 'text.secondary',
                                }}
                              />
                            )}
                          </>
                        )}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ whiteSpace: 'nowrap' }}
                      >
                        {relativeTime}
                      </Typography>
                    </Box>
                    {entry.meta?.tag && (
                      <Chip
                        label={entry.meta.tag}
                        size="small"
                        sx={{
                          height: 20,
                          fontSize: '0.7rem',
                          bgcolor: entry.meta.tagColor
                            ? alpha(entry.meta.tagColor, 0.15)
                            : alpha(theme.palette.primary.main, 0.1),
                          color: entry.meta.tagColor || 'primary.main',
                          mb: 0.5,
                        }}
                      />
                    )}
                    {entry.detail && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: 'block', mt: 0.5 }}
                      >
                        {entry.detail}
                      </Typography>
                    )}
                    {entry.type === 'change' && entry.meta?.changedFields?.length > 0 && (
                      <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        {entry.meta.changedFields.map((cf, cfIdx) => (
                          <Box
                            key={cfIdx}
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 0.75,
                              px: 1.25,
                              py: 0.5,
                              borderRadius: 1.5,
                              bgcolor: alpha(theme.palette.grey[500], 0.06),
                              border: '1px solid',
                              borderColor: alpha(theme.palette.divider, 0.5),
                            }}
                          >
                            <Typography
                              variant="caption"
                              sx={{
                                fontWeight: 700,
                                color: 'text.secondary',
                                minWidth: 60,
                                textTransform: 'capitalize',
                              }}
                            >
                              {cf.field}
                            </Typography>
                            <Typography
                              variant="caption"
                              sx={{
                                color: 'error.main',
                                fontWeight: 500,
                                textDecoration: 'line-through',
                                maxWidth: 120,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {cf.from || '(empty)'}
                            </Typography>
                            <AppIcon
                              name="ArrowForward"
                              fallback={ArrowForwardIcon}
                              sx={{ fontSize: 12, color: 'text.disabled' }}
                            />
                            <Typography
                              variant="caption"
                              sx={{
                                color: 'success.main',
                                fontWeight: 600,
                                maxWidth: 120,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {cf.to || '(empty)'}
                            </Typography>
                          </Box>
                        ))}
                      </Box>
                    )}
                    {entry.meta?.meetingId && (onOpenMeeting || onOpenTaskManager) && (
                      <Stack direction="row" spacing={1} sx={{ mt: 1 }} flexWrap="wrap">
                        {onOpenMeeting && (
                          <Button
                            size="small"
                            variant="text"
                            startIcon={
                              <AppIcon
                                name="OpenInNew"
                                fallback={OpenInNewIcon}
                                sx={{ fontSize: 14 }}
                              />
                            }
                            onClick={() => onOpenMeeting(entry.meta.meetingId)}
                            sx={{ textTransform: 'none', fontSize: '0.75rem', minWidth: 0, p: 0.5 }}
                          >
                            View transcript
                          </Button>
                        )}
                        {onOpenTaskManager && (
                          <Button
                            size="small"
                            variant="text"
                            startIcon={
                              <AppIcon
                                name="Assignment"
                                fallback={AssignmentIcon}
                                sx={{ fontSize: 14 }}
                              />
                            }
                            onClick={() => onOpenTaskManager()}
                            sx={{ textTransform: 'none', fontSize: '0.75rem', minWidth: 0, p: 0.5 }}
                          >
                            View tasks
                          </Button>
                        )}
                      </Stack>
                    )}
                  </Paper>
                </Box>
              );
            })
          )}
        </Box>
      )}
    </Box>
  );
}

function RecommendationsPanel({ recommendations, loading, partnerName, theme, lastAnalyzed }) {
  if (loading) {
    return (
      <Box sx={{ py: 2 }}>
        <Skeleton variant="text" width="80%" sx={{ mb: 1 }} />
        <Skeleton variant="rounded" height={80} sx={{ mb: 1.5 }} />
        <Skeleton variant="rounded" height={80} sx={{ mb: 1.5 }} />
        <Skeleton variant="rounded" height={60} />
      </Box>
    );
  }
  if (!recommendations.length) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 3 }}>
        No AI recommendations yet. Analysis runs automatically every 24 hours.
      </Typography>
    );
  }
  const isAI = recommendations[0]?.isAI;
  const priorityColors = { high: '#DC2626', medium: '#D97706', low: '#059669' };
  const categoryColors = {
    engagement: '#3B82F6',
    growth: '#10B981',
    risk: '#EF4444',
    optimization: '#8B5CF6',
    general: '#6B7280',
  };
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Suggested next actions for {partnerName}
          </Typography>
          {isAI && (
            <Chip
              icon={
                <AppIcon
                  name="AutoAwesomeOutlined"
                  fallback={AutoAwesomeOutlinedIcon}
                  sx={{ fontSize: 14 }}
                />
              }
              label="AI Generated"
              size="small"
              sx={{
                height: 22,
                fontSize: '0.65rem',
                bgcolor: alpha(theme.palette.info.main, 0.1),
                color: 'info.main',
                '& .MuiChip-icon': { color: 'info.main' },
              }}
            />
          )}
        </Box>
        {lastAnalyzed && (
          <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.7rem' }}>
            Last analyzed:{' '}
            {new Date(lastAnalyzed).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Typography>
        )}
      </Box>
      {recommendations.map((rec) => (
        <Paper
          key={rec.id}
          elevation={0}
          sx={{
            p: 2,
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: alpha(theme.palette.primary.main, 0.03),
            borderLeft: '4px solid',
            borderLeftColor: priorityColors[rec.priority] || 'divider',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 1,
              mb: rec.steps?.length ? 1.5 : 0,
            }}
          >
            <AppIcon
              name="LightbulbOutlined"
              fallback={LightbulbOutlinedIcon}
              sx={{ fontSize: 20, color: 'primary.main', mt: 0.25 }}
            />
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                {rec.title}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                {rec.description}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', flexShrink: 0 }}>
              {rec.category && (
                <Chip
                  label={rec.category}
                  size="small"
                  sx={{
                    height: 20,
                    fontSize: '0.6rem',
                    textTransform: 'capitalize',
                    bgcolor: alpha(categoryColors[rec.category] || '#888', 0.1),
                    color: categoryColors[rec.category] || 'text.secondary',
                  }}
                />
              )}
              <Chip
                label={rec.priority}
                size="small"
                sx={{
                  height: 20,
                  fontSize: '0.65rem',
                  textTransform: 'capitalize',
                  bgcolor: alpha(priorityColors[rec.priority] || '#888', 0.12),
                  color: priorityColors[rec.priority] || 'text.secondary',
                }}
              />
            </Box>
          </Box>
          {rec.steps?.length > 0 && (
            <List dense disablePadding sx={{ pl: 4 }}>
              {rec.steps.map((step, idx) => (
                <ListItem
                  key={idx}
                  disableGutters
                  disablePadding
                  sx={{ py: 0.25, alignItems: 'flex-start' }}
                >
                  <ListItemIcon sx={{ minWidth: 20, mt: 0.2 }}>
                    <Typography variant="caption" color="primary.main" fontWeight={700}>
                      {idx + 1}.
                    </Typography>
                  </ListItemIcon>
                  <ListItemText
                    primary={step}
                    primaryTypographyProps={{ variant: 'caption', color: 'text.secondary' }}
                  />
                </ListItem>
              ))}
            </List>
          )}
        </Paper>
      ))}
    </Box>
  );
}
