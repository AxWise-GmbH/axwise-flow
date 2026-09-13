import { useState } from 'react';
import {
  Box,
  Typography,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import RocketLaunchOutlinedIcon from '@mui/icons-material/RocketLaunchOutlined';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import LinkIcon from '@mui/icons-material/Link';
import LanguageOutlinedIcon from '@mui/icons-material/LanguageOutlined';
import OrgMetricTile from './OrgMetricTile';
import { ORG_TAB, buildOrgDeepLink } from './orgDrawerConstants';
import { formatCompact } from './orgDrawerUtils';

import AppIcon from '../../icons/AppIcon';

export default function OrgOverviewTab({
  org,
  parentOrg,
  consiliumBoard,
  finances,
  counts,
  teamsCount,
  loadingFinances,
  onTabChange,
  concilium = [],
  onAttachConsilium,
}) {
  const navigate = useNavigate();
  const orgId = org?.id;
  const f = finances || {};
  const [savingConsilium, setSavingConsilium] = useState(false);

  const handleAttach = async (value) => {
    if (!onAttachConsilium) return;
    setSavingConsilium(true);
    try {
      await onAttachConsilium(value || null);
    } finally {
      setSavingConsilium(false);
    }
  };

  return (
    <>
      {org.description && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {org.description}
        </Typography>
      )}
      <Typography
        variant="caption"
        sx={{ fontWeight: 700, color: 'text.secondary', mb: 1, display: 'block' }}
      >
        At a glance
      </Typography>
      {loadingFinances ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
          <CircularProgress size={24} />
        </Box>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1, mb: 2.5 }}>
          <OrgMetricTile
            label="Teams"
            value={teamsCount}
            color="#059669"
            icon={GroupsOutlinedIcon}
            onClick={() => onTabChange(ORG_TAB.TEAMS)}
          />
          <OrgMetricTile
            label="Active goals"
            value={counts.active_goals ?? counts.tasks ?? 0}
            color="#5B8DEF"
            icon={AssignmentOutlinedIcon}
            onClick={() => navigate(buildOrgDeepLink('/job-pool', orgId, { tab: 'goals' }))}
          />
          <OrgMetricTile
            label="Completed results"
            value={counts.completed_goals ?? 0}
            color="#10B981"
            icon={RocketLaunchOutlinedIcon}
            onClick={() => onTabChange(ORG_TAB.RESULTS)}
          />
          <OrgMetricTile
            label="Net profit"
            value={formatCompact(f.net_profit)}
            color={f.net_profit >= 0 ? '#10B981' : '#EF4444'}
            icon={AttachMoneyIcon}
            onClick={() => onTabChange(ORG_TAB.FINANCES)}
          />
          <OrgMetricTile
            label="Workflows"
            value={counts.workflows ?? 0}
            color="#8B5CF6"
            icon={AccountTreeOutlinedIcon}
            onClick={() => onTabChange(ORG_TAB.OPERATIONS)}
          />
        </Box>
      )}
      {onAttachConsilium && (
        <Box sx={{ mb: 2 }}>
          <FormControl fullWidth size="small" disabled={savingConsilium}>
            <InputLabel id="org-overview-consilium">Consilium board</InputLabel>
            <Select
              labelId="org-overview-consilium"
              label="Consilium board"
              value={org.consilium_id || ''}
              onChange={(e) => handleAttach(e.target.value)}
            >
              <MenuItem value="">None</MenuItem>
              {(concilium || []).map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name || c.id}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            Attach a Consilium board to govern this organization (shows in Home → Consilium
            Activity).
          </Typography>
        </Box>
      )}
      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
        {parentOrg && (
          <Chip
            icon={
              <AppIcon
                name="AccountTreeOutlined"
                fallback={AccountTreeOutlinedIcon}
                sx={{ fontSize: '12px !important' }}
              />
            }
            label={parentOrg.name}
            size="small"
            variant="outlined"
            sx={{ fontSize: '0.65rem' }}
          />
        )}
        {consiliumBoard && (
          <Chip
            icon={<AppIcon name="Link" fallback={LinkIcon} sx={{ fontSize: '12px !important' }} />}
            label={consiliumBoard.name}
            size="small"
            variant="outlined"
            sx={{ fontSize: '0.65rem' }}
          />
        )}
        {org.website && (
          <Chip
            icon={
              <AppIcon
                name="LanguageOutlined"
                fallback={LanguageOutlinedIcon}
                sx={{ fontSize: '12px !important' }}
              />
            }
            label="Website"
            size="small"
            variant="outlined"
            sx={{ fontSize: '0.65rem', cursor: 'pointer' }}
            onClick={() => window.open(org.website, '_blank', 'noopener')}
          />
        )}
        <Chip
          label={`Created ${new Date(org.created_at).toLocaleDateString()}`}
          size="small"
          variant="outlined"
          sx={{ fontSize: '0.65rem' }}
        />
      </Box>
    </>
  );
}
