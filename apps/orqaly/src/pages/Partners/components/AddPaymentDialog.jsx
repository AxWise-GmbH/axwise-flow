import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  InputAdornment,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SaveIcon from '@mui/icons-material/Save';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import NotesOutlinedIcon from '@mui/icons-material/NotesOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import FingerprintIcon from '@mui/icons-material/Fingerprint';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import FormDialog from '../../../components/Common/FormDialog';
import { logAction } from '../../../services/auditLogBackend';

import AppIcon from '../../../components/icons/AppIcon';

const FINANCE_CATEGORIES = ['Partners', 'Personal', 'Team', 'Projects', 'Agents'];

const defaultForm = {
  datetime: '',
  description: '',
  category: '',
  type: 'crypto',
  method: 'USDT (TRC20)',
  amount: '',
  hashOrStatement: '',
  affiliateNetwork: 'ClickDealer',
};

const toDatetimeLocal = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {function} props.onClose
 * @param {object} props.partner
 * @param {function} props.onSubmit  - (partnerId, payloadWithoutId) for add, (partnerId, payloadWithId) for edit
 * @param {function} [props.onDelete] - (partnerId, paymentId) for delete
 * @param {object|null} [props.payment] - existing payment to edit; null = add mode
 */
export default function AddPaymentDialog({
  open,
  onClose,
  partner,
  onSubmit,
  onDelete,
  payment = null,
}) {
  const isEdit = Boolean(payment);
  const [form, setForm] = useState(defaultForm);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (open && payment) {
      setForm({
        datetime: toDatetimeLocal(payment.datetime),
        description: payment.description || '',
        category: payment.category || '',
        type: payment.type || 'crypto',
        method: payment.method || (payment.type === 'crypto' ? 'USDT (TRC20)' : 'Wire transfer'),
        amount: payment.amount != null ? String(payment.amount) : '',
        hashOrStatement: payment.hash || payment.statement || '',
        affiliateNetwork: payment.affiliateNetwork || 'ClickDealer',
      });
      setConfirmDelete(false);
    } else if (open && !payment) {
      setForm(defaultForm);
      setConfirmDelete(false);
    }
  }, [open, payment]);

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleClose = () => {
    setForm(defaultForm);
    setConfirmDelete(false);
    onClose();
  };

  const handleSubmit = async () => {
    if (!form.description.trim() || !form.amount || !partner?.id) return;
    const amount = Number(form.amount);
    if (Number.isNaN(amount)) return;

    setSubmitting(true);
    try {
      const payload = {
        ...(isEdit && payment?.id ? { id: payment.id } : {}),
        datetime: form.datetime ? new Date(form.datetime).getTime() : Date.now(),
        description: form.description.trim(),
        category: form.category || '',
        type: form.type,
        method:
          (form.method || '').trim() || (form.type === 'crypto' ? 'USDT (TRC20)' : 'Wire transfer'),
        amount,
        affiliateNetwork: form.affiliateNetwork || 'ClickDealer',
        ...(form.type === 'crypto'
          ? { hash: (form.hashOrStatement || '').trim() || 'pending-hash' }
          : { statement: (form.hashOrStatement || '').trim() || 'statement_uploaded.pdf' }),
      };
      await onSubmit(partner.id, payload);
      await logAction({
        action: isEdit ? 'Payment updated' : 'Payment added',
        entity: 'Partner',
        entityId: partner.id,
        details: `${form.description.trim()} · ${form.amount} ${form.type === 'crypto' ? 'crypto' : 'fiat'}${form.category ? ` · ${form.category}` : ''}`,
      });
      handleClose();
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!partner?.id || !payment?.id || !onDelete) return;
    setSubmitting(true);
    try {
      await onDelete(partner.id, payment.id);
      await logAction({
        action: 'Payment deleted',
        entity: 'Partner',
        entityId: partner.id,
        details: `${payment.description || 'Payment'} · ${payment.amount}`,
      });
      handleClose();
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = form.description.trim() && form.amount && !submitting;

  return (
    <FormDialog
      open={open}
      onClose={handleClose}
      title={isEdit ? 'Edit payment' : 'Add payment'}
      subtitle={partner?.name}
      icon={PaymentsOutlinedIcon}
      iconVariant="success"
      actions={
        <>
          {isEdit &&
            onDelete &&
            (confirmDelete ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mr: 'auto' }}>
                <Typography variant="caption" color="error" sx={{ fontWeight: 600 }}>
                  Delete this payment?
                </Typography>
                <Button
                  size="small"
                  onClick={() => setConfirmDelete(false)}
                  sx={{ textTransform: 'none', fontSize: '0.75rem', minWidth: 0 }}
                >
                  No
                </Button>
                <Button
                  size="small"
                  color="error"
                  variant="contained"
                  disableElevation
                  onClick={handleDelete}
                  disabled={submitting}
                  sx={{ textTransform: 'none', fontSize: '0.75rem', minWidth: 0 }}
                >
                  {submitting ? 'Deleting…' : 'Yes, delete'}
                </Button>
              </Box>
            ) : (
              <Button
                onClick={() => setConfirmDelete(true)}
                startIcon={<AppIcon name="DeleteOutline" fallback={DeleteOutlineIcon} />}
                sx={{
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: 'error.main',
                  textTransform: 'none',
                  mr: 'auto',
                }}
              >
                Delete
              </Button>
            ))}
          <Button
            onClick={handleClose}
            sx={{
              fontSize: '0.875rem',
              fontWeight: 600,
              color: 'text.secondary',
              textTransform: 'none',
            }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            disableElevation
            disabled={!canSubmit}
            onClick={handleSubmit}
            startIcon={
              isEdit ? (
                <AppIcon name="Save" fallback={SaveIcon} />
              ) : (
                <AppIcon name="Add" fallback={AddIcon} />
              )
            }
            sx={{
              fontSize: '0.875rem',
              fontWeight: 600,
              px: 3,
              py: 1,
              borderRadius: 2,
              textTransform: 'none',
              bgcolor: 'success.main',
              '&:hover': { bgcolor: 'success.dark' },
              '&.Mui-disabled': { bgcolor: 'action.disabledBackground', color: 'action.disabled' },
            }}
          >
            {submitting
              ? isEdit
                ? 'Saving…'
                : 'Adding…'
              : isEdit
                ? 'Save changes'
                : 'Add payment'}
          </Button>
        </>
      }
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <TextField
          label="Date & time"
          type="datetime-local"
          fullWidth
          size="small"
          value={form.datetime}
          onChange={(e) => updateField('datetime', e.target.value)}
          InputLabelProps={{ shrink: true, sx: { fontSize: '0.8125rem', fontWeight: 600 } }}
          InputProps={{
            sx: { fontSize: '0.9375rem' },
            startAdornment: (
              <InputAdornment position="start" sx={{ color: 'text.secondary', mr: 0 }}>
                <AppIcon name="CalendarToday" fallback={CalendarTodayIcon} sx={{ fontSize: 18 }} />
              </InputAdornment>
            ),
          }}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
        />

        <TextField
          label="Description"
          fullWidth
          size="small"
          required
          value={form.description}
          onChange={(e) => updateField('description', e.target.value)}
          placeholder="e.g. Campaign payout - weekly settlement"
          InputLabelProps={{ shrink: true, sx: { fontSize: '0.8125rem', fontWeight: 600 } }}
          InputProps={{
            sx: { fontSize: '0.9375rem' },
            startAdornment: (
              <InputAdornment position="start" sx={{ color: 'text.secondary', mr: 0 }}>
                <AppIcon name="NotesOutlined" fallback={NotesOutlinedIcon} sx={{ fontSize: 18 }} />
              </InputAdornment>
            ),
          }}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
        />

        <FormControl
          fullWidth
          size="small"
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
        >
          <InputLabel
            id="add-payment-category-label"
            sx={{ fontSize: '0.8125rem', fontWeight: 600 }}
          >
            Category
          </InputLabel>
          <Select
            labelId="add-payment-category-label"
            value={form.category}
            label="Category"
            onChange={(e) => updateField('category', e.target.value)}
            startAdornment={
              <InputAdornment position="start" sx={{ color: 'text.secondary', mr: 0 }}>
                <AppIcon
                  name="CategoryOutlined"
                  fallback={CategoryOutlinedIcon}
                  sx={{ fontSize: 18 }}
                />
              </InputAdornment>
            }
            sx={{ fontSize: '0.9375rem' }}
          >
            <MenuItem value="">
              <em>None</em>
            </MenuItem>
            {FINANCE_CATEGORIES.map((cat) => (
              <MenuItem key={cat} value={cat}>
                {cat}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl
          fullWidth
          size="small"
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
        >
          <InputLabel
            id="add-payment-network-label"
            sx={{ fontSize: '0.8125rem', fontWeight: 600 }}
          >
            Affiliate Network
          </InputLabel>
          <Select
            labelId="add-payment-network-label"
            value={form.affiliateNetwork}
            label="Affiliate Network"
            onChange={(e) => updateField('affiliateNetwork', e.target.value)}
            startAdornment={
              <InputAdornment position="start" sx={{ color: 'text.secondary', mr: 0 }}>
                <AppIcon
                  name="PaymentsOutlined"
                  fallback={PaymentsOutlinedIcon}
                  sx={{ fontSize: 18 }}
                />
              </InputAdornment>
            }
            sx={{ fontSize: '0.9375rem' }}
          >
            {['ClickDealer', 'Mobidea', 'MaxBounty', 'AdCombo'].map((net) => (
              <MenuItem key={net} value={net}>
                {net}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
          <FormControl
            fullWidth
            size="small"
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          >
            <InputLabel id="add-payment-type-label" sx={{ fontSize: '0.8125rem', fontWeight: 600 }}>
              Type
            </InputLabel>
            <Select
              labelId="add-payment-type-label"
              value={form.type}
              label="Type"
              onChange={(e) => {
                updateField('type', e.target.value);
                if (e.target.value === 'crypto') updateField('method', 'USDT (TRC20)');
                else updateField('method', 'Wire transfer');
              }}
              sx={{ fontSize: '0.9375rem' }}
            >
              <MenuItem value="crypto">Crypto</MenuItem>
              <MenuItem value="fiat">Fiat</MenuItem>
            </Select>
          </FormControl>

          <TextField
            label="Method"
            fullWidth
            size="small"
            value={form.method}
            onChange={(e) => updateField('method', e.target.value)}
            placeholder={form.type === 'crypto' ? 'USDT (TRC20)' : 'Wire transfer'}
            InputLabelProps={{ shrink: true, sx: { fontSize: '0.8125rem', fontWeight: 600 } }}
            InputProps={{
              sx: { fontSize: '0.9375rem' },
              startAdornment: (
                <InputAdornment position="start" sx={{ color: 'text.secondary', mr: 0 }}>
                  <AppIcon
                    name="PaymentsOutlined"
                    fallback={PaymentsOutlinedIcon}
                    sx={{ fontSize: 18 }}
                  />
                </InputAdornment>
              ),
            }}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />
        </Box>

        <TextField
          label="Amount"
          fullWidth
          size="small"
          required
          type="number"
          value={form.amount}
          onChange={(e) => updateField('amount', e.target.value)}
          placeholder={form.type === 'crypto' ? '0.000000' : '0.00'}
          inputProps={{ step: form.type === 'crypto' ? 0.000001 : 0.01, min: 0 }}
          InputLabelProps={{ shrink: true, sx: { fontSize: '0.8125rem', fontWeight: 600 } }}
          InputProps={{
            sx: { fontSize: '0.9375rem' },
            startAdornment: (
              <InputAdornment position="start" sx={{ color: 'text.secondary', mr: 0 }}>
                <AppIcon name="AttachMoney" fallback={AttachMoneyIcon} sx={{ fontSize: 18 }} />
              </InputAdornment>
            ),
          }}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
        />

        <TextField
          label={form.type === 'crypto' ? 'Transaction hash' : 'Statement / reference'}
          fullWidth
          size="small"
          value={form.hashOrStatement}
          onChange={(e) => updateField('hashOrStatement', e.target.value)}
          placeholder={form.type === 'crypto' ? '0x...' : 'e.g. statement_2026_02.pdf'}
          InputLabelProps={{ shrink: true, sx: { fontSize: '0.8125rem', fontWeight: 600 } }}
          InputProps={{
            sx: { fontSize: '0.9375rem' },
            startAdornment: (
              <InputAdornment position="start" sx={{ color: 'text.secondary', mr: 0 }}>
                <AppIcon name="Fingerprint" fallback={FingerprintIcon} sx={{ fontSize: 18 }} />
              </InputAdornment>
            ),
          }}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
        />
      </Box>
    </FormDialog>
  );
}
