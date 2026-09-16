import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Stack,
  Alert,
} from '@mui/material';
import { addContact } from '../../services/contactsService';

const ATTITUDES = ['vip', 'friendly', 'neutral', 'cold_lead', 'hostile'];

/**
 * Add a mail or phone contact (real write to contactsService), optionally marked
 * to an organization. Calls onAdded() so the page can refetch.
 */
export default function AddContactDialog({
  open,
  type = 'phone',
  organizations = [],
  onClose,
  onAdded,
}) {
  const isMail = type === 'mail';
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [attitude, setAttitude] = useState('neutral');
  const [orgId, setOrgId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setName('');
      setValue('');
      setAttitude('neutral');
      setOrgId('');
      setError(null);
      setBusy(false);
    }
  }, [open, type]);

  const submit = async () => {
    setError(null);
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    setBusy(true);
    try {
      await addContact({
        name: name.trim(),
        contact_type: type,
        attitude,
        organization_id: orgId || null,
        ...(isMail ? { email: value.trim() } : { phone: value.trim() }),
      });
      onAdded && onAdded();
      onClose && onClose();
    } catch (err) {
      setError(err.message || 'Could not add contact');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 800 }}>Add {isMail ? 'mail' : 'phone'} contact</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          {error && (
            <Alert severity="error" sx={{ py: 0 }}>
              {error}
            </Alert>
          )}
          <TextField
            size="small"
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            fullWidth
          />
          <TextField
            size="small"
            label={isMail ? 'Email' : 'Phone'}
            type={isMail ? 'email' : 'tel'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            fullWidth
          />
          <FormControl size="small" fullWidth>
            <InputLabel>Attitude</InputLabel>
            <Select label="Attitude" value={attitude} onChange={(e) => setAttitude(e.target.value)}>
              {ATTITUDES.map((a) => (
                <MenuItem key={a} value={a} sx={{ textTransform: 'capitalize' }}>
                  {a.replace('_', ' ')}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" fullWidth>
            <InputLabel>Organization</InputLabel>
            <Select label="Organization" value={orgId} onChange={(e) => setOrgId(e.target.value)}>
              <MenuItem value="">
                <em>None</em>
              </MenuItem>
              {organizations.map((o) => (
                <MenuItem key={o.id} value={o.id}>
                  {o.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} sx={{ textTransform: 'none' }}>
          Cancel
        </Button>
        <Button
          onClick={submit}
          disabled={busy}
          variant="contained"
          disableElevation
          sx={{ textTransform: 'none', fontWeight: 700 }}
        >
          Add contact
        </Button>
      </DialogActions>
    </Dialog>
  );
}
