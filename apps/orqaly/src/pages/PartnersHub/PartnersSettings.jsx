import { useState } from 'react';
import { Box, Stack, Snackbar, Alert } from '@mui/material';
import TypeConfigEditor from './components/TypeConfigEditor';
import { upsertEntityType } from '../../services/partnerEntityService';

/**
 * Settings: personalize each entity type's parameters (fields → filters).
 * Persists via the types-upsert endpoint.
 */
export default function PartnersSettings({ types = [], onChange }) {
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });

  const handleSave = async (config) => {
    setSaving(true);
    try {
      await upsertEntityType({
        type_key: config.type_key,
        label: config.label,
        icon: config.icon,
        color: config.color,
        description: config.description,
        sort_order: config.sort_order,
        fields: config.fields,
        filters: config.filters,
        metrics: config.metrics,
      });
      setToast({ open: true, message: `${config.label} updated`, severity: 'success' });
      onChange?.();
    } catch (err) {
      setToast({ open: true, message: err.message || 'Save failed', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ px: { xs: 1.25, sm: 1.5 }, py: 1 }}>
      <Stack spacing={2}>
        {types.map((t) => (
          <TypeConfigEditor key={t.type_key} type={t} onSave={handleSave} saving={saving} />
        ))}
      </Stack>
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
