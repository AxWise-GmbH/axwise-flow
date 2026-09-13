import { Fragment, useEffect, useState } from 'react';
import {
  TextField,
  MenuItem,
  Autocomplete,
  Switch,
  FormControlLabel,
  Stack,
} from '@mui/material';
import FormDialog from '../../../components/Common/FormDialog';
import { COUNTRY_OPTIONS, formatCountry } from '../utils/fieldFormat';

/**
 * Add/Edit dialog whose fields are generated from a type config's `fields`.
 * Values live in `data`; `name` is the one always-present top-level field.
 */
export default function EntityFormDialog({ open, onClose, type, entity, onSubmit, saving }) {
  const fields = type?.fields || [];
  const [name, setName] = useState('');
  const [data, setData] = useState({});

  useEffect(() => {
    if (!open) return;
    setName(entity?.name || '');
    setData(entity?.data ? { ...entity.data } : {});
  }, [open, entity]);

  const setField = (key, value) => setData((d) => ({ ...d, [key]: value }));

  const handleSubmit = () => {
    if (!name.trim()) return;
    onSubmit({ name: name.trim(), data });
  };

  const renderControl = (field) => {
    const value = data[field.key];
    const common = {
      label: field.label,
      fullWidth: true,
      size: 'small',
      value: value ?? '',
      onChange: (e) => setField(field.key, e.target.value),
    };

    switch (field.type) {
      case 'number':
      case 'currency':
      case 'percent':
        return (
          <TextField
            {...common}
            type="number"
            value={value ?? ''}
            onChange={(e) =>
              setField(field.key, e.target.value === '' ? '' : Number(e.target.value))
            }
          />
        );
      case 'select':
        return (
          <TextField {...common} select>
            <MenuItem value="">
              <em>None</em>
            </MenuItem>
            {(field.options || []).map((opt) => (
              <MenuItem key={opt} value={opt}>
                {opt}
              </MenuItem>
            ))}
          </TextField>
        );
      case 'multiselect':
      case 'tags':
        return (
          <Autocomplete
            key={field.key}
            multiple
            freeSolo={field.type === 'tags'}
            size="small"
            options={field.options || []}
            value={Array.isArray(value) ? value : []}
            onChange={(_e, val) => setField(field.key, val)}
            renderInput={(params) => <TextField {...params} label={field.label} />}
          />
        );
      case 'country':
        return (
          <Autocomplete
            key={field.key}
            size="small"
            options={COUNTRY_OPTIONS}
            getOptionLabel={(o) => formatCountry(o)}
            value={value || null}
            onChange={(_e, val) => setField(field.key, val || '')}
            renderInput={(params) => <TextField {...params} label={field.label} />}
          />
        );
      case 'boolean':
        return (
          <FormControlLabel
            key={field.key}
            control={
              <Switch
                checked={!!value}
                onChange={(e) => setField(field.key, e.target.checked)}
              />
            }
            label={field.label}
          />
        );
      case 'date':
        return (
          <TextField
            {...common}
            type="date"
            InputLabelProps={{ shrink: true }}
          />
        );
      case 'email':
        return <TextField {...common} type="email" />;
      default:
        return <TextField {...common} />;
    }
  };

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title={entity ? `Edit ${type?.label || 'record'}` : `Add ${type?.label || 'record'}`}
      primaryLabel={entity ? 'Save' : 'Create'}
      onPrimary={handleSubmit}
      primaryDisabled={!name.trim()}
      primaryLoading={saving}
      maxWidth="sm"
    >
      <Stack spacing={2} sx={{ pt: 1 }}>
        <TextField
          label="Name"
          fullWidth
          size="small"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        {fields.map((field) => (
          <Fragment key={field.key}>{renderControl(field)}</Fragment>
        ))}
      </Stack>
    </FormDialog>
  );
}
