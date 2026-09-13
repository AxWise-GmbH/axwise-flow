/**
 * GoalSetupDrawer — what the next goal runs on, opened from the sliders icon
 * next to the composer's paperclip.
 *
 * Four decisions about one goal, not a wizard, so every section starts open -
 * that is the one place this differs from Assistant setup, which is a sequence
 * you work through. Everything else - the drawer frame, the sections, the rows -
 * is Common/Setup*, shared with that panel. This file used to be a fork of it.
 *
 * ExecutorPicker (Goals/ExecutorPicker.jsx) covers the same four executor types
 * for the advanced Goal dialog, but as a cascading "pick a type, then pick one"
 * pair of selects. Simple mode wants the roster on screen, so this lists it.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Chip,
  FormControl,
  InputAdornment,
  Link,
  MenuItem,
  Select,
  Switch,
  TextField,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import CorporateFareOutlinedIcon from '@mui/icons-material/CorporateFareOutlined';
import AppIcon from '../../icons/AppIcon';
import SetupPanel from '../../Common/SetupPanel';
import SetupSection from '../../Common/SetupSection';
import SetupRow from '../../Common/SetupRow';
import useSetupSections from '../../Common/useSetupSections';
import { panelSurfaceTokens } from '../../../theme/panelSurface';
import { listOrganizations } from '../../../services/organizationService';
import { getAllConcilium } from '../../../services/conciliumService';
import { pickDefaultOrgId } from '../../../utils/defaultOrganization';
import { useOrgRoster } from '../../../hooks/useOrgRoster';
import { useAxwise } from '../../../hooks/useAxwise';
import { GOAL_SETUP_SECTIONS } from './goalSetupSections';
import { buildRosterGroups, countRosterRows, ROSTER_SEARCH_THRESHOLD } from './rosterGroups';
import {
  getGoalSetup,
  setGoalSetupOrg,
  setGoalSetupTarget,
  useGoalSetup,
} from '../../../hooks/useGoalSetup';

const TARGET_ICONS = {
  team: GroupsOutlinedIcon,
  team_lead: SmartToyOutlinedIcon,
  agent: SmartToyOutlinedIcon,
  consilium: GavelOutlinedIcon,
  organization: CorporateFareOutlinedIcon,
};

function EmptyNote({ children }) {
  const tokens = panelSurfaceTokens(useTheme());
  return (
    <Typography variant="caption" sx={{ color: tokens.textFaint, display: 'block', mb: 1 }}>
      {children}
    </Typography>
  );
}

export default function GoalSetupDrawer({ open, onClose, onOpenEntity }) {
  const theme = useTheme();
  const tokens = panelSurfaceTokens(theme);
  const { orgId, target } = useGoalSetup();
  const axwise = useAxwise();

  const [orgs, setOrgs] = useState([]);
  const [boards, setBoards] = useState([]);
  const [orgsLoaded, setOrgsLoaded] = useState(false);
  const [rosterQuery, setRosterQuery] = useState('');
  // All four open: these are decisions to see at once, not steps to walk.
  const { isExpanded, toggle } = useSetupSections({ mode: 'multi' });

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    (async () => {
      const [orgResult, boardResult] = await Promise.all([
        listOrganizations().catch(() => []),
        getAllConcilium().catch(() => []),
      ]);
      if (!alive) return;
      const list = Array.isArray(orgResult)
        ? orgResult
        : orgResult?.organizations || orgResult?.data || [];
      const active = list.filter((org) => org?.id && org.is_active !== false);
      setOrgs(active);
      setBoards(Array.isArray(boardResult) ? boardResult : []);
      setOrgsLoaded(true);
      // Same default the goal dialog resolves to, so opening the drawer never
      // silently moves the goal to a different workspace than the one it would
      // have run on.
      // Read the store rather than closing over it: depending on orgId here
      // would refetch the whole list every time the workspace is switched.
      const current = getGoalSetup().orgId;
      if (!active.some((org) => org.id === current))
        setGoalSetupOrg(pickDefaultOrgId(active) || '');
    })();
    return () => {
      alive = false;
    };
  }, [open]);

  const { roster, loading: rosterLoading } = useOrgRoster(open ? orgId : '', orgs);

  const governingBoardId = orgs.find((org) => org.id === orgId)?.consilium_id || null;
  const boardTargets = useMemo(() => {
    const rows = boards.map((board) => ({
      target: { type: 'consilium', id: board.id, label: board.name || board.id },
      governs: board.id === governingBoardId,
    }));
    // A board assigned to this workspace but missing from the list still names a
    // real assignment, so it is shown by id rather than dropped.
    if (governingBoardId && !rows.some((row) => row.governs)) {
      rows.unshift({
        target: { type: 'consilium', id: governingBoardId, label: governingBoardId },
        governs: true,
      });
    }
    return rows.sort((a, b) => Number(b.governs) - Number(a.governs));
  }, [boards, governingBoardId]);

  const workforceTargets = useMemo(
    () => roster.targets.filter((t) => t.type !== 'organization' && t.type !== 'consilium'),
    [roster.targets]
  );
  const allRosterGroups = useMemo(() => buildRosterGroups(workforceTargets), [workforceTargets]);
  const rosterGroups = useMemo(
    () => buildRosterGroups(workforceTargets, { query: rosterQuery }),
    [workforceTargets, rosterQuery]
  );
  const rosterTotal = countRosterRows(allRosterGroups);

  const isSelected = (candidate) =>
    target?.type === candidate.type && String(target?.id) === String(candidate.id);

  const selectTarget = (candidate) => {
    setGoalSetupTarget(isSelected(candidate) ? null : candidate);
  };

  const axwiseBlockedReason = !axwise.loaded
    ? 'Checking…'
    : !axwise.serverEnabled
      ? 'Turned off on this server (AXWISE_ENABLE)'
      : '';

  const doneCtx = { orgId, orgs, target, axwise };

  const sectionBody = {
    org: (
      <>
        <FormControl fullWidth size="small">
          <Select
            displayEmpty
            value={orgs.some((org) => org.id === orgId) ? orgId : ''}
            onChange={(event) => setGoalSetupOrg(event.target.value)}
            inputProps={{ 'aria-label': 'Organization' }}
            MenuProps={{ slotProps: tokens.menuSlotProps }}
            sx={tokens.fieldSx}
          >
            <MenuItem value="" disabled>
              Choose a workspace
            </MenuItem>
            {orgs.map((org) => (
              <MenuItem key={org.id} value={org.id}>
                {org.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        {orgsLoaded && orgs.length === 0 && (
          <Typography
            variant="caption"
            sx={{ color: theme.palette.warning.light, display: 'block', mt: 0.75 }}
          >
            No active workspace yet. Create one in Organizations, or choose New Business in the
            goal's Destination step.
          </Typography>
        )}
        {target && (
          <Link
            component="button"
            onClick={() => setGoalSetupTarget(null)}
            sx={{
              color: theme.palette.primary.light,
              fontSize: '0.72rem',
              mt: 0.75,
              display: 'inline-block',
            }}
          >
            Hand it to the whole workspace instead
          </Link>
        )}
      </>
    ),

    board: (
      <Box role="radiogroup" aria-label="Consilium">
        {boardTargets.length === 0 ? (
          <EmptyNote>No boards yet. Create one on the Consilium page.</EmptyNote>
        ) : (
          boardTargets.map(({ target: boardTarget, governs }) => (
            <SetupRow
              key={boardTarget.id}
              icon={TARGET_ICONS.consilium}
              title={boardTarget.label}
              subtitle={governs ? 'Governs this workspace' : undefined}
              selected={isSelected(boardTarget)}
              onSelect={() => selectTarget(boardTarget)}
              role="radio"
            />
          ))
        )}
      </Box>
    ),

    workforce: (
      <>
        {/* A search box over three rows is noise; past a screenful it is the
            only way to find anything. */}
        {rosterTotal > ROSTER_SEARCH_THRESHOLD && (
          <TextField
            fullWidth
            size="small"
            value={rosterQuery}
            onChange={(event) => setRosterQuery(event.target.value)}
            placeholder="Search teams and agents"
            inputProps={{ 'aria-label': 'Search teams and agents' }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <AppIcon
                    name="SearchRounded"
                    fallback={SearchRoundedIcon}
                    sx={{ fontSize: 17, color: tokens.textFaint }}
                  />
                </InputAdornment>
              ),
            }}
            sx={{ mb: 1, ...tokens.fieldSx }}
          />
        )}
        <Box
          role="radiogroup"
          aria-label="Saved teams and agents"
          sx={
            rosterTotal > 12
              ? { maxHeight: { xs: '45dvh', sm: 260 }, overflowY: 'auto', pr: 0.5 }
              : undefined
          }
        >
          {rosterLoading ? (
            <EmptyNote>Loading this workspace&apos;s roster…</EmptyNote>
          ) : rosterTotal === 0 ? (
            <EmptyNote>
              No teams or agents are assigned to this workspace yet.{' '}
              {onOpenEntity ? (
                <>
                  <Link
                    component="button"
                    onClick={() => onOpenEntity({ route: '/organizations' })}
                    sx={{ color: theme.palette.primary.light, fontSize: 'inherit' }}
                  >
                    Assign some
                  </Link>
                  .
                </>
              ) : (
                'Assign them in Organizations.'
              )}
            </EmptyNote>
          ) : rosterGroups.length === 0 ? (
            <EmptyNote>Nothing matches &quot;{rosterQuery.trim()}&quot;.</EmptyNote>
          ) : (
            rosterGroups.map((group) => (
              <Box key={group.key} sx={{ mb: 1 }}>
                {/* Presentational, not a nested group: one radiogroup owns the
                    whole exclusive choice, and ARIA forbids a group inside it. */}
                <Typography
                  role="presentation"
                  variant="caption"
                  sx={{ ...tokens.labelSx, display: 'block', mb: 0.5 }}
                >
                  {group.title} · {group.rows.length}
                </Typography>
                {group.rows.map((row) => (
                  <SetupRow
                    key={row.key}
                    icon={TARGET_ICONS[row.target.type] || SmartToyOutlinedIcon}
                    title={row.name}
                    subtitle={row.note}
                    selected={isSelected(row.target)}
                    onSelect={() => selectTarget(row.target)}
                    role="radio"
                  />
                ))}
              </Box>
            ))
          )}
        </Box>
      </>
    ),

    axwise: (
      <>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" sx={{ color: tokens.textMuted }}>
              Cognitive overlay
            </Typography>
            <Typography variant="caption" sx={{ color: tokens.textDim }}>
              {axwiseBlockedReason ||
                (axwise.enforce === 'shadow'
                  ? 'On: observes and records, does not decide (shadow)'
                  : 'On: evaluates and can steer goal decisions')}
            </Typography>
          </Box>
          <Switch
            size="small"
            checked={axwise.isAxwiseEnabled}
            disabled={Boolean(axwiseBlockedReason)}
            onChange={(event) => {
              // Rejects (and reverts the store itself) when the pref cannot be
              // saved; nothing further to show here beyond the switch flipping back.
              axwise.setUserEnabled(event.target.checked).catch(() => {});
            }}
            slotProps={{ input: { 'aria-label': 'AxWise cognitive overlay' } }}
          />
        </Box>
        {axwise.serverEnabled && (
          <Chip
            size="small"
            label={`Enforcement: ${axwise.enforce}`}
            sx={{
              mt: 0.75,
              height: 20,
              bgcolor: alpha(tokens.fg, 0.08),
              color: alpha(tokens.fg, 0.7),
              fontSize: '0.66rem',
            }}
          />
        )}
      </>
    ),
  };

  return (
    <SetupPanel
      open={open}
      onClose={onClose}
      title="Goal setup"
      closeLabel="Close goal setup"
      subtitle={target?.label ? `Runs on: ${target.label}` : 'Runs on: the whole workspace'}
    >
      {GOAL_SETUP_SECTIONS.map((section, i) => (
        <SetupSection
          key={section.key}
          sectionKey={section.key}
          index={i}
          title={section.title}
          icon={section.icon}
          description={section.desc}
          required={section.required}
          done={section.done(doneCtx)}
          expanded={isExpanded(section.key)}
          onToggle={toggle}
          // A collapsed roster must not throw away a search the user typed.
          keepContentMounted
        >
          {sectionBody[section.key]}
        </SetupSection>
      ))}
    </SetupPanel>
  );
}
