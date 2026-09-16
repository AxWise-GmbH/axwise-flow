/**
 * [module: frontend]
 * ImplementDialog — Link a goal to an existing organization and unit.
 */
import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  CircularProgress,
  Alert,
  List,
  ListItemButton,
  ListItemText,
  Chip,
  useTheme,
  alpha,
} from '@mui/material';
import IntegrationInstructionsOutlinedIcon from '@mui/icons-material/IntegrationInstructionsOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import AddIcon from '@mui/icons-material/Add';
import FormDialog, { FORM_FIELD_SX } from '../Common/FormDialog';
import OrgPickerList from './OrgPickerList';
import { implementExisting, listUnits } from '../../services/goalUnitService';
import { listOrganizations } from '../../services/organizationService';

import AppIcon from '../icons/AppIcon';

export default function ImplementDialog({ open, onClose, goal, onSuccess, initialOrganization }) {
  const theme = useTheme();
  const [orgs, setOrgs] = useState([]);
  const [units, setUnits] = useState([]);
  const [loadingOrgs, setLoadingOrgs] = useState(true);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [createNewUnit, setCreateNewUnit] = useState(false);
  const [newUnitName, setNewUnitName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!open) return;
    if (initialOrganization?.id) {
      setSelectedOrg(initialOrganization);
      setSelectedUnit(null);
      setCreateNewUnit(false);
      setNewUnitName(`${initialOrganization.name || 'Organization'} — Operations`);
    }
    setLoadingOrgs(true);
    listOrganizations()
      .then((data) => setOrgs(Array.isArray(data) ? data : data?.organizations || []))
      .catch(() => setOrgs([]))
      .finally(() => setLoadingOrgs(false));
  }, [open, initialOrganization]);

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

  function handleSelectOrg(org) {
    setSelectedOrg(org);
    setSelectedUnit(null);
    setCreateNewUnit(false);
    setNewUnitName(`${org.name} — Operations`);
    setError(null);
  }

  async function handleSubmit() {
    if (!selectedOrg) return;
    if (!createNewUnit && !selectedUnit) return;
    if (createNewUnit && !newUnitName.trim()) return;

    setSaving(true);
    setError(null);
    try {
      const payload = {
        orgId: selectedOrg.id,
        ...(createNewUnit ? { unitName: newUnitName.trim() } : { unitId: selectedUnit.id }),
      };
      const data = await implementExisting(goal.id, payload);
      setResult(data);
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
    setCreateNewUnit(false);
    setNewUnitName('');
    onClose();
  }

  const step = !selectedOrg ? 'org' : 'unit';
  const canSubmit = selectedOrg && (createNewUnit ? newUnitName.trim() : selectedUnit);

  return (
    <FormDialog
      open={open}
      onClose={handleClose}
      title={
        result
          ? 'Linked!'
          : step === 'org'
            ? 'Implement in Existing'
            : `Unit in ${selectedOrg?.name}`
      }
      icon={IntegrationInstructionsOutlinedIcon}
      iconVariant="info"
      actions={
        <>
          {step === 'unit' && !result && !initialOrganization?.id && (
            <Button
              onClick={() => {
                setSelectedOrg(null);
                setSelectedUnit(null);
                setCreateNewUnit(false);
              }}
              sx={{ borderRadius: 2, textTransform: 'none' }}
            >
              Back
            </Button>
          )}
          <Button onClick={handleClose} sx={{ borderRadius: 2, textTransform: 'none' }}>
            {result ? 'Done' : 'Cancel'}
          </Button>
          {step === 'unit' && !result && (
            <Button
              variant="contained"
              onClick={handleSubmit}
              disabled={saving || !canSubmit}
              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
            >
              {saving ? <CircularProgress size={18} sx={{ mr: 1 }} /> : null}
              {saving ? 'Linking...' : 'Link Goal'}
            </Button>
          )}
        </>
      }
    >
      {result ? (
        <Box sx={{ textAlign: 'center', py: 3 }}>
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              mx: 'auto',
              mb: 2,
              bgcolor: alpha(theme.palette.success.main, 0.12),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AppIcon
              name="CheckCircleOutline"
              fallback={CheckCircleOutlineIcon}
              sx={{ fontSize: 30, color: 'success.main' }}
            />
          </Box>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
            Goal Linked!
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Goal is now linked to <b>{result.org?.name || selectedOrg?.name}</b>
            {result.unit?.name ? ` → ${result.unit.name}` : ''}.
          </Typography>
        </Box>
      ) : step === 'org' ? (
        <OrgPickerList
          orgs={orgs}
          loading={loadingOrgs}
          goalTitle={goal?.title}
          onSelect={handleSelectOrg}
        />
      ) : loadingUnits ? (
        <Box sx={{ py: 4, textAlign: 'center' }}>
          <CircularProgress size={28} />
        </Box>
      ) : (
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Select a unit within <b>{selectedOrg.name}</b> or create a new one:
          </Typography>
          <List sx={{ p: 0, mb: 1 }}>
            {units.map((u) => (
              <ListItemButton
                key={u.id}
                selected={!createNewUnit && selectedUnit?.id === u.id}
                onClick={() => {
                  setSelectedUnit(u);
                  setCreateNewUnit(false);
                }}
                sx={{ borderRadius: 2, mb: 0.5, border: '1px solid', borderColor: 'divider' }}
              >
                <AppIcon
                  name="FolderOutlined"
                  fallback={FolderOutlinedIcon}
                  sx={{ fontSize: 18, color: 'text.secondary', mr: 1 }}
                />
                <ListItemText
                  primary={u.name}
                  secondary={`${u.goalCount || 0} goals · ${u.unit_type}`}
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
            <ListItemButton
              selected={createNewUnit}
              onClick={() => {
                setCreateNewUnit(true);
                setSelectedUnit(null);
              }}
              sx={{
                borderRadius: 2,
                mb: 0.5,
                border: '1px dashed',
                borderColor: createNewUnit ? 'primary.main' : 'divider',
              }}
            >
              <AppIcon
                name="Add"
                fallback={AddIcon}
                sx={{ fontSize: 18, color: 'primary.main', mr: 1 }}
              />
              <ListItemText
                primary="Create new unit"
                primaryTypographyProps={{
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  color: 'primary.main',
                }}
              />
            </ListItemButton>
          </List>
          {createNewUnit && (
            <TextField
              label="Unit name"
              size="small"
              fullWidth
              value={newUnitName}
              onChange={(e) => setNewUnitName(e.target.value)}
              sx={FORM_FIELD_SX}
            />
          )}
          {error && (
            <Alert severity="error" sx={{ mt: 1.5, borderRadius: 2 }}>
              {error}
            </Alert>
          )}
        </Box>
      )}
    </FormDialog>
  );
}
