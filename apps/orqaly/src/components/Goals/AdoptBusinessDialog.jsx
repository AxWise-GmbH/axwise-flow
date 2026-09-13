/**
 * [module: frontend]
 * AdoptBusinessDialog — Create a new business (organization) from a goal.
 * Quick flow: pre-fills from goal, creates org + unit + links goal.
 */
import { useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  CircularProgress,
  Alert,
  useTheme,
  alpha,
} from '@mui/material';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import FormDialog, { FORM_FIELD_SX } from '../Common/FormDialog';
import { adoptBusiness } from '../../services/goalUnitService';

import AppIcon from '../icons/AppIcon';

const ORG_TYPES = [
  { value: 'holding', label: 'Holding Company' },
  { value: 'subsidiary', label: 'Subsidiary' },
  { value: 'division', label: 'Division' },
  { value: 'department', label: 'Department' },
];

export default function AdoptBusinessDialog({ open, onClose, goal, onSuccess }) {
  const theme = useTheme();
  const [form, setForm] = useState({
    orgName: goal?.title || '',
    orgType: 'holding',
    industry: goal?.parsed_category || '',
    description: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  function handleChange(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    if (!form.orgName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const data = await adoptBusiness(goal.id, form);
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
    setForm({ orgName: goal?.title || '', orgType: 'holding', industry: '', description: '' });
    onClose();
  }

  return (
    <FormDialog
      open={open}
      onClose={handleClose}
      title="Adopt for New Business"
      icon={BusinessOutlinedIcon}
      actions={
        <>
          <Button onClick={handleClose} sx={{ borderRadius: 2, textTransform: 'none' }}>
            {result ? 'Done' : 'Cancel'}
          </Button>
          {!result && (
            <Button
              variant="contained"
              onClick={handleSubmit}
              disabled={saving || !form.orgName.trim()}
              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
            >
              {saving ? <CircularProgress size={18} sx={{ mr: 1 }} /> : null}
              {saving ? 'Creating...' : 'Create Business'}
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
            Business Created!
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            <b>{result.org?.name}</b> is set up with your goal linked.
          </Typography>
          <Typography variant="caption" color="text.disabled">
            Unit: {result.unit?.name} — Goal is now running under this organization.
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
            Create a new organization and link your goal <b>"{goal?.title}"</b> to it.
          </Typography>

          <TextField
            label="Business Name"
            size="small"
            fullWidth
            required
            value={form.orgName}
            onChange={(e) => handleChange('orgName', e.target.value)}
            sx={FORM_FIELD_SX}
          />

          <FormControl size="small" fullWidth>
            <InputLabel>Organization Type</InputLabel>
            <Select
              value={form.orgType}
              label="Organization Type"
              onChange={(e) => handleChange('orgType', e.target.value)}
              sx={{ borderRadius: 2 }}
            >
              {ORG_TYPES.map((t) => (
                <MenuItem key={t.value} value={t.value}>
                  {t.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            label="Industry"
            size="small"
            fullWidth
            value={form.industry}
            onChange={(e) => handleChange('industry', e.target.value)}
            placeholder="e.g. E-commerce, SaaS, Marketing"
            sx={FORM_FIELD_SX}
          />

          <TextField
            label="Description"
            size="small"
            fullWidth
            multiline
            rows={2}
            value={form.description}
            onChange={(e) => handleChange('description', e.target.value)}
            placeholder="Brief description of the business..."
            sx={FORM_FIELD_SX}
          />

          {error && (
            <Alert severity="error" sx={{ borderRadius: 2 }}>
              {error}
            </Alert>
          )}
        </Box>
      )}
    </FormDialog>
  );
}
