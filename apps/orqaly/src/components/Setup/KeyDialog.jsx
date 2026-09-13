import { useState, useEffect } from 'react';
import {
  TextField,
  Button,
  IconButton,
  InputAdornment,
  Typography,
  Box,
  Alert,
  CircularProgress,
  Link,
} from '@mui/material';
import VpnKeyOutlinedIcon from '@mui/icons-material/VpnKeyOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import OpenInNewOutlinedIcon from '@mui/icons-material/OpenInNewOutlined';
import FormDialog, { FORM_FIELD_SX } from '../Common/FormDialog';
import { saveUserKey, testUserKey } from '../../services/userKeysService';

import AppIcon from '../icons/AppIcon';

/**
 * Set/Replace dialog. Mandatory test-before-save: Save button stays disabled
 * until a probe returns { ok: true }.
 *
 * `provider` shape: { id, label, docUrl?, placeholder? } from providerCatalog.
 */
export default function KeyDialog({ open, provider, onClose, onSaved }) {
  const [apiKey, setApiKey] = useState('');
  const [show, setShow] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [probe, setProbe] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) {
      setApiKey('');
      setShow(false);
      setTesting(false);
      setSaving(false);
      setProbe(null);
      setError(null);
    }
  }, [open]);

  if (!provider) return null;

  const canTest = apiKey.trim().length >= 8 && !testing && !saving;
  const canSave = probe?.ok && !saving;

  const handleTest = async () => {
    setTesting(true);
    setProbe(null);
    setError(null);
    try {
      const result = await testUserKey({ provider: provider.id, apiKey: apiKey.trim() });
      setProbe(result);
      if (!result.ok) setError(result.message || `Test failed (${result.code})`);
    } catch (err) {
      setError(err.message || 'Test failed');
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveUserKey({ provider: provider.id, apiKey: apiKey.trim() });
      setApiKey('');
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title={`Set key: ${provider.label}`}
      icon={VpnKeyOutlinedIcon}
      primaryLabel={saving ? 'Saving...' : 'Save'}
      onPrimary={handleSave}
      primaryDisabled={!canSave}
      primaryLoading={saving}
      footerLeft={
        <Button
          variant="outlined"
          size="small"
          onClick={handleTest}
          disabled={!canTest}
          startIcon={testing ? <CircularProgress size={14} /> : null}
        >
          {testing ? 'Testing...' : 'Test connection'}
        </Button>
      }
      footerJustify="space-between"
    >
      {provider.docUrl && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
          Get your key at{' '}
          <Link href={provider.docUrl} target="_blank" rel="noopener noreferrer">
            {provider.docUrl.replace(/^https?:\/\//, '')}
            <AppIcon
              name="OpenInNewOutlined"
              fallback={OpenInNewOutlinedIcon}
              sx={{ fontSize: 12, ml: 0.25, verticalAlign: 'middle' }}
            />
          </Link>
        </Typography>
      )}
      <TextField
        label="API key"
        fullWidth
        autoFocus
        autoComplete="off"
        spellCheck={false}
        inputProps={{ 'data-1p-ignore': true, 'data-lpignore': true }}
        type={show ? 'text' : 'password'}
        placeholder={provider.placeholder || 'Paste the key you copied from the provider'}
        value={apiKey}
        onChange={(e) => {
          setApiKey(e.target.value);
          setProbe(null);
        }}
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              <IconButton size="small" onClick={() => setShow((v) => !v)}>
                {show ? (
                  <AppIcon
                    name="VisibilityOffOutlined"
                    fallback={VisibilityOffOutlinedIcon}
                    fontSize="small"
                  />
                ) : (
                  <AppIcon
                    name="VisibilityOutlined"
                    fallback={VisibilityOutlinedIcon}
                    fontSize="small"
                  />
                )}
              </IconButton>
            </InputAdornment>
          ),
        }}
        sx={{ mb: 1.5, ...FORM_FIELD_SX }}
      />
      {probe?.ok && (
        <Typography variant="caption" color="success.main" sx={{ display: 'block', mb: 1 }}>
          Connected {probe.latencyMs != null ? `(${probe.latencyMs}ms)` : ''}
        </Typography>
      )}
      {error && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {error}
        </Alert>
      )}
      <Alert severity="info" sx={{ mt: 1.5 }}>
        Your key is encrypted at rest with AES-256-GCM before it reaches the database. Testing must
        succeed before save - prevents typo'd keys from sitting in storage.
      </Alert>
    </FormDialog>
  );
}
