/**
 * ConsensusRulesPanel — Consensus config UI per board.
 */
import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Slider,
  Button,
  CircularProgress,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import { supabase, hasSupabase } from '../../lib/supabase';

import AppIcon from '../icons/AppIcon';

const CONSENSUS_TYPES = ['unanimous', 'majority', 'weighted', 'custom'];
const SPLIT_STRATEGIES = ['chairman_decides', 'reject', 'escalate_to_human', 're_evaluate'];

export default function ConsensusRulesPanel({ concilium, theme, isDark }) {
  const [selectedBoard, setSelectedBoard] = useState('');
  const [rules, setRules] = useState({
    consensusType: 'majority',
    quorum: 2,
    approvalThreshold: 0.5,
    splitDecisionStrategy: 'reject',
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const boardId = selectedBoard || (concilium.length > 0 ? concilium[0].id : '');

  useEffect(() => {
    if (!boardId || !hasSupabase()) return;
    setLoading(true);
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
          .from('concilium_consensus_rules')
          .select('*')
          .eq('concilium_id', boardId)
          .eq('user_id', user.id)
          .single();
        if (data) {
          setRules({
            consensusType: data.consensus_type || 'majority',
            quorum: data.quorum || 2,
            approvalThreshold: Number.parseFloat(data.approval_threshold) || 0.5,
            splitDecisionStrategy: data.split_decision_strategy || 'reject',
          });
        }
      } catch {
        /* no rules yet, keep defaults */
      } finally {
        setLoading(false);
      }
    })();
  }, [boardId]);

  const handleSave = async () => {
    if (!boardId || !hasSupabase()) return;
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('concilium_consensus_rules').upsert(
        {
          concilium_id: boardId,
          user_id: user.id,
          consensus_type: rules.consensusType,
          quorum: rules.quorum,
          approval_threshold: rules.approvalThreshold,
          split_decision_strategy: rules.splitDecisionStrategy,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'concilium_id' }
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Board</InputLabel>
          <Select
            value={boardId}
            label="Board"
            onChange={(e) => setSelectedBoard(e.target.value)}
            sx={{ borderRadius: 2 }}
          >
            {concilium.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress size={32} />
        </Box>
      ) : (
        <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, maxWidth: 500 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2 }}>
            Consensus Rules
          </Typography>

          <FormControl size="small" fullWidth sx={{ mb: 2 }}>
            <InputLabel>Consensus Type</InputLabel>
            <Select
              value={rules.consensusType}
              label="Consensus Type"
              onChange={(e) => setRules((r) => ({ ...r, consensusType: e.target.value }))}
              sx={{ borderRadius: 2 }}
            >
              {CONSENSUS_TYPES.map((t) => (
                <MenuItem key={t} value={t} sx={{ textTransform: 'capitalize' }}>
                  {t}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            fullWidth
            size="small"
            label="Quorum (min voters)"
            type="number"
            value={rules.quorum}
            onChange={(e) =>
              setRules((r) => ({ ...r, quorum: Number.parseInt(e.target.value, 10) || 1 }))
            }
            inputProps={{ min: 1, max: 20 }}
            sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />

          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>
            Approval Threshold: {Math.round(rules.approvalThreshold * 100)}%
          </Typography>
          <Slider
            value={rules.approvalThreshold}
            onChange={(_, v) => setRules((r) => ({ ...r, approvalThreshold: v }))}
            min={0}
            max={1}
            step={0.05}
            size="small"
            sx={{ mb: 2 }}
          />

          <FormControl size="small" fullWidth sx={{ mb: 3 }}>
            <InputLabel>Split Decision Strategy</InputLabel>
            <Select
              value={rules.splitDecisionStrategy}
              label="Split Decision Strategy"
              onChange={(e) => setRules((r) => ({ ...r, splitDecisionStrategy: e.target.value }))}
              sx={{ borderRadius: 2 }}
            >
              {SPLIT_STRATEGIES.map((s) => (
                <MenuItem key={s} value={s}>
                  {s.replace(/_/g, ' ')}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Button
            variant="contained"
            startIcon={
              saving ? <CircularProgress size={16} /> : <AppIcon name="Save" fallback={SaveIcon} />
            }
            onClick={handleSave}
            disabled={saving || !boardId}
            sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
          >
            Save Rules
          </Button>
        </Paper>
      )}
    </Box>
  );
}
