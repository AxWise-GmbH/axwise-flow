/**
 * PaymentMethodsSection — manage payment cards in Settings.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Chip,
  Button,
  TextField,
  Table,
  TableBody,
  TableRow,
  TableCell,
  IconButton,
  Tooltip,
  MenuItem,
  Select,
  useTheme,
  alpha,
  CircularProgress,
} from '@mui/material';
import FormDialog from '../Common/FormDialog';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import StarIcon from '@mui/icons-material/Star';

import { supabase, hasSupabase } from '../../lib/supabase';

import AppIcon from '../icons/AppIcon';

async function getHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (hasSupabase()) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  }
  return headers;
}

function getBase() {
  return typeof window !== 'undefined' ? window.location.origin : '';
}

async function apiCall(op, method = 'GET', body = null) {
  const opts = { method, headers: await getHeaders() };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${getBase()}/api/app?path=stripe-connect&op=${op}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Stripe ${op} failed`);
  return data;
}

const BRAND_ICONS = {
  visa: '💳 Visa',
  mastercard: '💳 Mastercard',
  amex: '💳 Amex',
  discover: '💳 Discover',
};

export default function PaymentMethodsSection() {
  const theme = useTheme();
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ brand: 'visa', last4: '', exp: '', label: '' });

  const loadCards = useCallback(async () => {
    try {
      const data = await apiCall('list-cards');
      setCards(Array.isArray(data) ? data.filter((c) => c.type === 'card') : []);
    } catch {
      setCards([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadCards();
  }, [loadCards]);

  const handleAdd = async () => {
    if (!form.last4 || form.last4.length !== 4) return;
    setSaving(true);
    try {
      await apiCall('save-card', 'POST', {
        card_brand: form.brand,
        card_last4: form.last4,
        card_exp: form.exp,
        label: form.label || `${form.brand.toUpperCase()} •••• ${form.last4}`,
      });
      setAddOpen(false);
      setForm({ brand: 'visa', last4: '', exp: '', label: '' });
      await loadCards();
    } catch (err) {
      console.error('Save card failed:', err);
    }
    setSaving(false);
  };

  const handleRemove = async (id) => {
    try {
      await apiCall('remove-card', 'POST', { id });
      setCards((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      console.error('Remove card failed:', err);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AppIcon
            name="CreditCard"
            fallback={CreditCardIcon}
            sx={{ fontSize: 20, color: 'primary.main' }}
          />
          <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.85rem' }}>
            Payment Methods
          </Typography>
        </Box>
        <Button
          size="small"
          startIcon={<AppIcon name="Add" fallback={AddIcon} />}
          variant="outlined"
          onClick={() => setAddOpen(true)}
          sx={{ textTransform: 'none', fontSize: '0.72rem', borderRadius: 2 }}
        >
          Add Card
        </Button>
      </Box>
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
          <CircularProgress size={24} />
        </Box>
      ) : cards.length === 0 ? (
        <Box
          sx={{
            py: 3,
            textAlign: 'center',
            border: '1px dashed',
            borderColor: 'divider',
            borderRadius: 2,
          }}
        >
          <AppIcon
            name="CreditCard"
            fallback={CreditCardIcon}
            sx={{ fontSize: 32, color: 'text.disabled', mb: 1 }}
          />
          <Typography variant="body2" sx={{ color: 'text.disabled', fontSize: '0.78rem' }}>
            No payment methods added
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.disabled' }}>
            Add a card for operational expenses
          </Typography>
        </Box>
      ) : (
        <Table size="small">
          <TableBody>
            {cards.map((card) => (
              <TableRow key={card.id} hover>
                <TableCell sx={{ py: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <AppIcon
                      name="CreditCard"
                      fallback={CreditCardIcon}
                      sx={{ fontSize: 18, color: 'primary.main' }}
                    />
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.78rem' }}>
                        {card.card_brand?.toUpperCase() || 'CARD'} •••• {card.card_last4}
                      </Typography>
                      {card.card_exp && (
                        <Typography
                          variant="caption"
                          sx={{ color: 'text.disabled', fontSize: '0.65rem' }}
                        >
                          Exp: {card.card_exp}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                </TableCell>
                <TableCell align="center" sx={{ py: 1 }}>
                  {card.is_default && (
                    <Chip
                      icon={
                        <AppIcon
                          name="Star"
                          fallback={StarIcon}
                          sx={{ fontSize: '12px !important' }}
                        />
                      }
                      label="Default"
                      size="small"
                      color="primary"
                      variant="outlined"
                      sx={{ height: 20, fontSize: '0.6rem' }}
                    />
                  )}
                </TableCell>
                <TableCell align="right" sx={{ py: 1 }}>
                  <Tooltip title="Remove">
                    <IconButton size="small" color="error" onClick={() => handleRemove(card.id)}>
                      <AppIcon
                        name="DeleteOutline"
                        fallback={DeleteOutlineIcon}
                        sx={{ fontSize: 16 }}
                      />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <FormDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add Payment Card"
        icon={CreditCardIcon}
        maxWidth="xs"
        primaryLabel={saving ? 'Saving…' : 'Save Card'}
        onPrimary={handleAdd}
        primaryDisabled={saving || form.last4.length !== 4}
        primaryLoading={saving}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Select
            size="small"
            value={form.brand}
            onChange={(e) => setForm({ ...form, brand: e.target.value })}
            sx={{ fontSize: '0.82rem' }}
          >
            <MenuItem value="visa">Visa</MenuItem>
            <MenuItem value="mastercard">Mastercard</MenuItem>
            <MenuItem value="amex">American Express</MenuItem>
            <MenuItem value="discover">Discover</MenuItem>
          </Select>
          <TextField
            size="small"
            label="Last 4 digits"
            value={form.last4}
            onChange={(e) =>
              setForm({ ...form, last4: e.target.value.replace(/\D/g, '').slice(0, 4) })
            }
            inputProps={{ maxLength: 4, inputMode: 'numeric' }}
            placeholder="1234"
          />
          <TextField
            size="small"
            label="Expiration"
            value={form.exp}
            onChange={(e) => setForm({ ...form, exp: e.target.value })}
            placeholder="MM/YY"
          />
          <TextField
            size="small"
            label="Label (optional)"
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            placeholder="My business card"
          />
        </Box>
        <Typography
          variant="caption"
          sx={{ color: 'text.disabled', mt: 2, display: 'block', fontSize: '0.65rem' }}
        >
          Card details are stored securely. Full Stripe checkout integration coming soon.
        </Typography>
      </FormDialog>
    </Box>
  );
}
