/**
 * [module: frontend]
 * ReplaceUnitDialog — Replace goals in an existing org unit.
 * Flow: pick organization → pick unit → choose replace mode.
 */
import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Alert,
  Chip,
  RadioGroup,
  FormControlLabel,
  Radio,
  List,
  ListItemButton,
  ListItemText,
  useTheme,
  alpha,
} from '@mui/material';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import FormDialog from '../Common/FormDialog';
import OrgPickerList from './OrgPickerList';
import { listUnits, replaceUnit } from '../../services/goalUnitService';
import { listOrganizations } from '../../services/organizationService';
import { supabase, hasSupabase } from '../../lib/supabase';

import AppIcon from '../icons/AppIcon';

export default function ReplaceUnitDialog({ open, onClose, goal, onSuccess }) {
  const theme = useTheme();
  const [orgs, setOrgs] = useState([]);
  const [units, setUnits] = useState([]);
  const [loadingOrgs, setLoadingOrgs] = useState(true);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [unitGoals, setUnitGoals] = useState([]);
  const [mode, setMode] = useState('add');
  const [replaceGoalId, setReplaceGoalId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!open) return;
    setLoadingOrgs(true);
    listOrganizations()
      .then((data) => setOrgs(Array.isArray(data) ? data : data?.organizations || []))
      .catch(() => setOrgs([]))
      .finally(() => setLoadingOrgs(false));
  }, [open]);

  useEffect(() => {
    if (!selectedOrg) {
      setUnits([]);
      return;
    }
    setLoadingUnits(true);
    listUnits(selectedOrg.id)
      .then((data) => setUnits(Array.isArray(data) ? data : []))
      .catch(() => setUnits([]))
      .finally(() => setLoadingUnits(false));
  }, [selectedOrg]);

  useEffect(() => {
    if (!selectedUnit || !hasSupabase()) {
      setUnitGoals([]);
      return;
    }
    supabase
      .from('goal_unit_members')
      .select('goal_id')
      .eq('unit_id', selectedUnit.id)
      .then(async ({ data: members }) => {
        if (!members?.length) {
          setUnitGoals([]);
          return;
        }
        const ids = members.map((m) => m.goal_id);
        const { data: goals } = await supabase
          .from('goals')
          .select('id, title, status, budget_usd')
          .in('id', ids);
        setUnitGoals(goals || []);
      })
      .catch(() => setUnitGoals([]));
  }, [selectedUnit]);

  async function handleSubmit() {
    if (!selectedUnit) return;
    setSaving(true);
    setError(null);
    try {
      await replaceUnit(goal.id, selectedUnit.id, mode, replaceGoalId);
      setResult(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function handleClose() {
    if (result) onSuccess?.();
    setResult(null);
    setError(null);
    setSelectedOrg(null);
    setSelectedUnit(null);
    setMode('add');
    setReplaceGoalId(null);
    onClose();
  }

  const step = !selectedOrg ? 'org' : !selectedUnit ? 'unit' : 'mode';
  const STATUS_COLOR = {
    active: 'success',
    completed: 'success',
    planning: 'info',
    paused: 'warning',
    failed: 'error',
    cancelled: 'default',
    feasibility: 'info',
  };

  const title = result
    ? 'Done!'
    : step === 'org'
      ? 'Select Organization'
      : step === 'unit'
        ? `Units in ${selectedOrg?.name}`
        : `Unit: ${selectedUnit?.name}`;

  return (
    <FormDialog
      open={open}
      onClose={handleClose}
      title={title}
      icon={SwapHorizIcon}
      iconVariant="warning"
      actions={
        <>
          {step !== 'org' && !result && (
            <Button
              onClick={() => {
                if (step === 'mode') {
                  setSelectedUnit(null);
                  setMode('add');
                  setReplaceGoalId(null);
                } else setSelectedOrg(null);
              }}
              sx={{ borderRadius: 2, textTransform: 'none' }}
            >
              Back
            </Button>
          )}
          <Button onClick={handleClose} sx={{ borderRadius: 2, textTransform: 'none' }}>
            {result ? 'Done' : 'Cancel'}
          </Button>
          {step === 'mode' && !result && (
            <Button
              variant="contained"
              onClick={handleSubmit}
              disabled={saving || (mode === 'replace_goal' && !replaceGoalId)}
              color={mode === 'add' ? 'primary' : 'warning'}
              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
            >
              {saving ? <CircularProgress size={18} sx={{ mr: 1 }} /> : null}
              {saving ? 'Processing...' : mode === 'add' ? 'Add to Unit' : 'Replace'}
            </Button>
          )}
        </>
      }
    >
      {result ? (
        <Box sx={{ textAlign: 'center', py: 3 }}>
          <AppIcon
            name="CheckCircleOutline"
            fallback={CheckCircleOutlineIcon}
            sx={{ fontSize: 48, color: 'success.main', mb: 1 }}
          />
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Done!
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Goal has been {mode === 'add' ? 'added to' : 'replaced in'} the unit.
          </Typography>
        </Box>
      ) : step === 'org' ? (
        <OrgPickerList
          orgs={orgs}
          loading={loadingOrgs}
          goalTitle={goal?.title}
          onSelect={(org) => {
            setSelectedOrg(org);
            setSelectedUnit(null);
          }}
        />
      ) : step === 'unit' ? (
        loadingUnits ? (
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <CircularProgress size={28} />
          </Box>
        ) : (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Select a unit in <b>{selectedOrg.name}</b> for goal <b>&quot;{goal?.title}&quot;</b>:
            </Typography>
            {units.length === 0 ? (
              <Typography
                variant="body2"
                color="text.disabled"
                sx={{ fontStyle: 'italic', textAlign: 'center', py: 3 }}
              >
                No units in this organization. Use &quot;Implement in Existing&quot; to create one
                first.
              </Typography>
            ) : (
              <List sx={{ p: 0 }}>
                {units.map((u) => (
                  <ListItemButton
                    key={u.id}
                    onClick={() => setSelectedUnit(u)}
                    sx={{ borderRadius: 2, mb: 0.5, border: '1px solid', borderColor: 'divider' }}
                  >
                    <AppIcon
                      name="FolderOutlined"
                      fallback={FolderOutlinedIcon}
                      sx={{ fontSize: 18, color: 'text.secondary', mr: 1 }}
                    />
                    <ListItemText
                      primary={u.name}
                      secondary={`${u.goalCount || 0} goals · ${u.unit_type} · ${u.status}`}
                      primaryTypographyProps={{ fontWeight: 600, fontSize: '0.85rem' }}
                      secondaryTypographyProps={{ fontSize: '0.7rem' }}
                    />
                    <Chip
                      label={u.unit_type}
                      size="small"
                      variant="outlined"
                      sx={{ fontSize: '0.6rem', height: 20 }}
                    />
                  </ListItemButton>
                ))}
              </List>
            )}
          </Box>
        )
      ) : (
        <Box>
          <RadioGroup
            value={mode}
            onChange={(e) => {
              setMode(e.target.value);
              setReplaceGoalId(null);
            }}
          >
            <FormControlLabel
              value="add"
              control={<Radio size="small" />}
              label={
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Add alongside existing goals
                </Typography>
              }
            />
            <FormControlLabel
              value="replace_all"
              control={<Radio size="small" />}
              label={
                <Typography variant="body2" sx={{ fontWeight: 600, color: 'error.main' }}>
                  Replace all goals in this unit
                </Typography>
              }
            />
            {unitGoals.length > 0 && (
              <FormControlLabel
                value="replace_goal"
                control={<Radio size="small" />}
                label={
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    Replace a specific goal
                  </Typography>
                }
              />
            )}
          </RadioGroup>

          {mode === 'replace_goal' && unitGoals.length > 0 && (
            <Box sx={{ mt: 1, ml: 3 }}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mb: 0.5, display: 'block' }}
              >
                Select goal to replace:
              </Typography>
              {unitGoals.map((g) => (
                <Box
                  key={g.id}
                  onClick={() => setReplaceGoalId(g.id)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    py: 0.5,
                    px: 1,
                    borderRadius: 1.5,
                    cursor: 'pointer',
                    border: '1px solid',
                    borderColor: replaceGoalId === g.id ? 'primary.main' : 'divider',
                    bgcolor:
                      replaceGoalId === g.id
                        ? alpha(theme.palette.primary.main, 0.06)
                        : 'transparent',
                    mb: 0.5,
                  }}
                >
                  <Typography variant="body2" sx={{ flex: 1, fontSize: '0.78rem' }} noWrap>
                    {g.title}
                  </Typography>
                  <Chip
                    label={g.status}
                    size="small"
                    color={STATUS_COLOR[g.status] || 'default'}
                    variant="outlined"
                    sx={{ height: 18, fontSize: '0.55rem' }}
                  />
                </Box>
              ))}
            </Box>
          )}

          {mode === 'replace_all' && unitGoals.length > 0 && (
            <Alert severity="warning" sx={{ mt: 1, borderRadius: 2 }}>
              This will cancel{' '}
              {
                unitGoals.filter((g) => !['completed', 'failed', 'cancelled'].includes(g.status))
                  .length
              }{' '}
              active goal(s) in this unit.
            </Alert>
          )}

          {error && (
            <Alert severity="error" sx={{ mt: 1, borderRadius: 2 }}>
              {error}
            </Alert>
          )}
        </Box>
      )}
    </FormDialog>
  );
}
