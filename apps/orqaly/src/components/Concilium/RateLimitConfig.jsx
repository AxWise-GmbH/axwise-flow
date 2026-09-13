/**
 * RateLimitConfig — Rate limit configuration per entity.
 */
import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import { supabase, hasSupabase } from '../../lib/supabase';

import AppIcon from '../icons/AppIcon';

const ENTITY_TYPES = ['user', 'agent', 'board', 'team'];

const DEFAULT_LIMITS = {
  maxRequestsPerHour: 100,
  maxRequestsPerDay: 1000,
  maxTokensPerDay: 500000,
  maxCostPerDayUsd: 10,
  maxCostPerMonthUsd: 100,
};

export default function RateLimitConfig({ theme, isDark }) {
  const [entityType, setEntityType] = useState('user');
  const [entityId, setEntityId] = useState('');
  const [limits, setLimits] = useState({ ...DEFAULT_LIMITS });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadLimits = async () => {
    if (!entityId || !hasSupabase()) return;
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('concilium_rate_limits')
        .select('*')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .eq('user_id', user.id)
        .single();
      if (data) {
        setLimits({
          maxRequestsPerHour: data.max_requests_per_hour || 100,
          maxRequestsPerDay: data.max_requests_per_day || 1000,
          maxTokensPerDay: data.max_tokens_per_day || 500000,
          maxCostPerDayUsd: Number.parseFloat(data.max_cost_per_day_usd) || 10,
          maxCostPerMonthUsd: Number.parseFloat(data.max_cost_per_month_usd) || 100,
        });
      }
    } catch {
      /* no limits configured, use defaults */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLimits();
  }, [entityType, entityId]);

  const handleSave = async () => {
    if (!entityId || !hasSupabase()) return;
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('concilium_rate_limits').upsert(
        {
          entity_type: entityType,
          entity_id: entityId,
          user_id: user.id,
          max_requests_per_hour: limits.maxRequestsPerHour,
          max_requests_per_day: limits.maxRequestsPerDay,
          max_tokens_per_day: limits.maxTokensPerDay,
          max_cost_per_day_usd: limits.maxCostPerDayUsd,
          max_cost_per_month_usd: limits.maxCostPerMonthUsd,
        },
        { onConflict: 'entity_type,entity_id' }
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
        Rate Limit Configuration
      </Typography>
      <Box sx={{ display: 'flex', gap: 1.5, mb: 3 }}>
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>Entity Type</InputLabel>
          <Select
            value={entityType}
            label="Entity Type"
            onChange={(e) => setEntityType(e.target.value)}
            sx={{ borderRadius: 2 }}
          >
            {ENTITY_TYPES.map((t) => (
              <MenuItem key={t} value={t} sx={{ textTransform: 'capitalize' }}>
                {t}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          size="small"
          label="Entity ID"
          value={entityId}
          onChange={(e) => setEntityId(e.target.value)}
          sx={{ minWidth: 250, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
        />
      </Box>
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={32} />
        </Box>
      ) : (
        <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, maxWidth: 500 }}>
          <TextField
            fullWidth
            size="small"
            label="Max Requests / Hour"
            type="number"
            value={limits.maxRequestsPerHour}
            onChange={(e) =>
              setLimits((l) => ({
                ...l,
                maxRequestsPerHour: Number.parseInt(e.target.value, 10) || 0,
              }))
            }
            sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />
          <TextField
            fullWidth
            size="small"
            label="Max Requests / Day"
            type="number"
            value={limits.maxRequestsPerDay}
            onChange={(e) =>
              setLimits((l) => ({
                ...l,
                maxRequestsPerDay: Number.parseInt(e.target.value, 10) || 0,
              }))
            }
            sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />
          <TextField
            fullWidth
            size="small"
            label="Max Tokens / Day"
            type="number"
            value={limits.maxTokensPerDay}
            onChange={(e) =>
              setLimits((l) => ({
                ...l,
                maxTokensPerDay: Number.parseInt(e.target.value, 10) || 0,
              }))
            }
            sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />
          <TextField
            fullWidth
            size="small"
            label="Max Cost / Day (USD)"
            type="number"
            value={limits.maxCostPerDayUsd}
            onChange={(e) =>
              setLimits((l) => ({ ...l, maxCostPerDayUsd: Number.parseFloat(e.target.value) || 0 }))
            }
            sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />
          <TextField
            fullWidth
            size="small"
            label="Max Cost / Month (USD)"
            type="number"
            value={limits.maxCostPerMonthUsd}
            onChange={(e) =>
              setLimits((l) => ({
                ...l,
                maxCostPerMonthUsd: Number.parseFloat(e.target.value) || 0,
              }))
            }
            sx={{ mb: 3, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />
          <Button
            variant="contained"
            startIcon={
              saving ? <CircularProgress size={16} /> : <AppIcon name="Save" fallback={SaveIcon} />
            }
            onClick={handleSave}
            disabled={saving || !entityId}
            sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
          >
            Save Limits
          </Button>
        </Paper>
      )}
    </Box>
  );
}
