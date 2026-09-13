import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Chip,
  CircularProgress,
  useTheme,
  alpha,
} from '@mui/material';
import CompareArrowsOutlinedIcon from '@mui/icons-material/CompareArrowsOutlined';
import { listDocumentVersions } from '../../services/knowledgeBaseService';
import { formatDateTime } from '../../utils/formatters';

import AppIcon from '../../components/icons/AppIcon';

/** Compact LCS line diff -> array of { type: 'same' | 'add' | 'remove', text }. */
function lineDiff(oldStr, newStr) {
  const a = String(oldStr || '').split('\n');
  const b = String(newStr || '').split('\n');
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      out.push({ type: 'same', text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: 'remove', text: a[i] });
      i++;
    } else {
      out.push({ type: 'add', text: b[j] });
      j++;
    }
  }
  while (i < m) out.push({ type: 'remove', text: a[i++] });
  while (j < n) out.push({ type: 'add', text: b[j++] });
  return out;
}

/**
 * Review changes: lists a document's version snapshots and shows the
 * before/after content diff between the selected version and its predecessor.
 */
export default function KBVersionDiffDialog({ open, doc, onClose }) {
  const theme = useTheme();
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState(0); // index into versions (0 = newest)

  useEffect(() => {
    if (!open || !doc?.id) return;
    let cancelled = false;
    setLoading(true);
    setSel(0);
    listDocumentVersions(doc.id)
      .then((res) => {
        if (!cancelled) setVersions(Array.isArray(res?.versions) ? res.versions : []);
      })
      .catch(() => {
        if (!cancelled) setVersions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, doc?.id]);

  const after = versions[sel] || null;
  const before = versions[sel + 1] || null; // next-older version
  const diff = useMemo(
    () => (after ? lineDiff(before?.content, after.content) : []),
    [before, after]
  );

  const colorFor = (type) =>
    type === 'add'
      ? alpha(theme.palette.success.main, 0.16)
      : type === 'remove'
        ? alpha(theme.palette.error.main, 0.16)
        : 'transparent';
  const signFor = (type) => (type === 'add' ? '+' : type === 'remove' ? '-' : ' ');

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <AppIcon
          name="CompareArrowsOutlined"
          fallback={CompareArrowsOutlinedIcon}
          sx={{ color: 'primary.main' }}
        />
        Review changes
        <Typography variant="body2" color="text.secondary" sx={{ ml: 0.5 }} noWrap>
          {doc?.title || 'Untitled'}
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        ) : versions.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
            No version history yet. Edits made from now on will be tracked here.
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <FormControl size="small" sx={{ maxWidth: 360 }}>
              <InputLabel id="kb-version-sel">Version</InputLabel>
              <Select
                labelId="kb-version-sel"
                label="Version"
                value={sel}
                onChange={(e) => setSel(Number(e.target.value))}
              >
                {versions.map((v, idx) => (
                  <MenuItem key={v.id} value={idx}>
                    v{v.version_no} · {v.change_type} · {formatDateTime(v.created_at)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {after && before && after.title !== before.title && (
              <Box sx={{ fontSize: '0.85rem' }}>
                <Typography variant="caption" color="text.secondary">
                  Title
                </Typography>
                <Box>
                  <Box
                    component="span"
                    sx={{ bgcolor: colorFor('remove'), textDecoration: 'line-through', px: 0.5 }}
                  >
                    {before.title}
                  </Box>
                  {' → '}
                  <Box component="span" sx={{ bgcolor: colorFor('add'), px: 0.5 }}>
                    {after.title}
                  </Box>
                </Box>
              </Box>
            )}

            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Typography variant="caption" color="text.secondary">
                  Content
                </Typography>
                <Chip
                  size="small"
                  label={before ? `vs v${before.version_no}` : 'initial version'}
                  sx={{ height: 18, fontSize: '0.62rem' }}
                />
              </Box>
              <Box
                sx={{
                  fontFamily: 'monospace',
                  fontSize: '0.78rem',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1.5,
                  maxHeight: 360,
                  overflow: 'auto',
                  p: 1,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {diff.map((line, idx) => (
                  <Box key={idx} sx={{ bgcolor: colorFor(line.type), px: 0.5 }}>
                    <Box component="span" sx={{ opacity: 0.5, userSelect: 'none', mr: 1 }}>
                      {signFor(line.type)}
                    </Box>
                    {line.text || ' '}
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
