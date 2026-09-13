/**
 * CriteriaPanel — Evaluation criteria config with weight sliders and rubric editor.
 */
import { useState, useMemo } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  Slider,
  IconButton,
  Tooltip,
  Paper,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  alpha,
  Chip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SaveIcon from '@mui/icons-material/Save';
import EmptyState from '../Common/EmptyState';
import TuneIcon from '@mui/icons-material/Tune';
import { useConciliumCriteria } from '../../hooks/useConciliumCriteria';
import { createHoverGlowShadow } from '../../theme/hoverGlow';

import AppIcon from '../icons/AppIcon';

export default function CriteriaPanel({ concilium, theme, isDark }) {
  const [selectedBoard, setSelectedBoard] = useState('');
  const boardId = selectedBoard || (concilium.length > 0 ? concilium[0].id : '');
  const { criteria, loading, addCriterion, editCriterion, removeCriterion } =
    useConciliumCriteria(boardId);

  const [editDraft, setEditDraft] = useState(null); // { id, name, weight, rubric }
  const [newDraft, setNewDraft] = useState(null);

  const totalWeight = useMemo(() => criteria.reduce((s, c) => s + (c.weight || 0), 0), [criteria]);

  const startNew = () =>
    setNewDraft({ name: '', weight: 0.25, rubric: '', sortOrder: criteria.length });
  const saveNew = async () => {
    if (!newDraft?.name.trim()) return;
    await addCriterion({ ...newDraft, conciliumId: boardId });
    setNewDraft(null);
  };

  const saveEdit = async () => {
    if (!editDraft) return;
    await editCriterion(editDraft.id, {
      name: editDraft.name,
      weight: editDraft.weight,
      rubric: editDraft.rubric,
    });
    setEditDraft(null);
  };

  return (
    <Box sx={{ p: { xs: 1.5, sm: 2 } }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: { xs: 1, sm: 1.5 },
          mb: 2,
          flexWrap: 'wrap',
        }}
      >
        <FormControl
          size="small"
          sx={{ minWidth: { xs: 0 }, flex: { xs: 1, sm: 'none' }, width: { sm: 200 } }}
        >
          <InputLabel>Board</InputLabel>
          <Select
            value={boardId}
            label="Board"
            onChange={(e) => {
              setSelectedBoard(e.target.value);
              setEditDraft(null);
              setNewDraft(null);
            }}
            sx={{ borderRadius: 2 }}
          >
            {concilium.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Chip
          label={`Total Weight: ${(totalWeight * 100).toFixed(0)}%`}
          size="small"
          color={Math.abs(totalWeight - 1) < 0.01 ? 'success' : 'warning'}
          sx={{ fontWeight: 700 }}
        />
        <Box sx={{ flex: 1, display: { xs: 'none', sm: 'block' } }} />
        <Button
          variant="outlined"
          size="small"
          startIcon={<AppIcon name="Add" fallback={AddIcon} />}
          onClick={startNew}
          disabled={!boardId || !!newDraft}
          sx={{
            borderRadius: 2,
            textTransform: 'none',
            fontWeight: 600,
            width: { xs: '100%', sm: 'auto' },
          }}
        >
          Add Criterion
        </Button>
      </Box>
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress size={32} />
        </Box>
      ) : criteria.length === 0 && !newDraft ? (
        <EmptyState
          icon={TuneIcon}
          title="No criteria"
          description="Add evaluation criteria for this board."
          actionLabel="Add Criterion"
          onAction={startNew}
        />
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {criteria.map((c) => {
            const isEditing = editDraft?.id === c.id;
            const item = isEditing ? editDraft : c;
            return (
              <Paper
                key={c.id}
                elevation={0}
                sx={{
                  p: 2,
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: isEditing ? 'primary.main' : 'divider',
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                  '&:hover': {
                    borderColor: 'primary.main',
                    boxShadow: createHoverGlowShadow(theme),
                  },
                }}
              >
                {isEditing ? (
                  <Box>
                    <TextField
                      fullWidth
                      size="small"
                      label="Name"
                      value={item.name}
                      onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                      sx={{ mb: 1.5, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                    />
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      Weight: {Math.round(item.weight * 100)}%
                    </Typography>
                    <Slider
                      value={item.weight}
                      onChange={(_, v) => setEditDraft((d) => ({ ...d, weight: v }))}
                      min={0}
                      max={1}
                      step={0.05}
                      size="small"
                      sx={{ mb: 1 }}
                    />
                    <TextField
                      fullWidth
                      size="small"
                      label="Rubric"
                      multiline
                      rows={2}
                      value={item.rubric || ''}
                      onChange={(e) => setEditDraft((d) => ({ ...d, rubric: e.target.value }))}
                      sx={{ mb: 1, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                    />
                    <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                      <Button
                        size="small"
                        onClick={() => setEditDraft(null)}
                        sx={{ textTransform: 'none' }}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={<AppIcon name="Save" fallback={SaveIcon} />}
                        onClick={saveEdit}
                        sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
                      >
                        Save
                      </Button>
                    </Box>
                  </Box>
                ) : (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box sx={{ flex: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25 }}>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {c.name}
                        </Typography>
                        <Chip
                          label={`${Math.round(c.weight * 100)}%`}
                          size="small"
                          sx={{ height: 20, fontWeight: 700, fontSize: '0.65rem' }}
                        />
                        <Chip
                          label={`v${c.version || 1}`}
                          size="small"
                          variant="outlined"
                          sx={{ height: 20, fontSize: '0.6rem' }}
                        />
                      </Box>
                      {c.rubric && (
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          {c.rubric}
                        </Typography>
                      )}
                    </Box>
                    <Tooltip title="Edit">
                      <IconButton
                        size="small"
                        onClick={() =>
                          setEditDraft({
                            id: c.id,
                            name: c.name,
                            weight: c.weight,
                            rubric: c.rubric || '',
                          })
                        }
                      >
                        <AppIcon name="Save" fallback={SaveIcon} sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton size="small" onClick={() => removeCriterion(c.id)} color="error">
                        <AppIcon
                          name="DeleteOutline"
                          fallback={DeleteOutlineIcon}
                          sx={{ fontSize: 16 }}
                        />
                      </IconButton>
                    </Tooltip>
                  </Box>
                )}
              </Paper>
            );
          })}

          {newDraft && (
            <Paper
              elevation={0}
              sx={{ p: 2, borderRadius: 2, border: '1px dashed', borderColor: 'primary.main' }}
            >
              <TextField
                fullWidth
                size="small"
                label="Name"
                value={newDraft.name}
                onChange={(e) => setNewDraft((d) => ({ ...d, name: e.target.value }))}
                sx={{ mb: 1.5, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Weight: {Math.round(newDraft.weight * 100)}%
              </Typography>
              <Slider
                value={newDraft.weight}
                onChange={(_, v) => setNewDraft((d) => ({ ...d, weight: v }))}
                min={0}
                max={1}
                step={0.05}
                size="small"
                sx={{ mb: 1 }}
              />
              <TextField
                fullWidth
                size="small"
                label="Rubric"
                multiline
                rows={2}
                value={newDraft.rubric}
                onChange={(e) => setNewDraft((d) => ({ ...d, rubric: e.target.value }))}
                sx={{ mb: 1, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
              <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                <Button
                  size="small"
                  onClick={() => setNewDraft(null)}
                  sx={{ textTransform: 'none' }}
                >
                  Cancel
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  onClick={saveNew}
                  disabled={!newDraft.name.trim()}
                  sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
                >
                  Add
                </Button>
              </Box>
            </Paper>
          )}
        </Box>
      )}
    </Box>
  );
}
