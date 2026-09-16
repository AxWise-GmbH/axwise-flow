import { useMemo, useState } from 'react';
import {
  Box,
  Checkbox,
  IconButton,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Chip,
  Button,
  CircularProgress,
  Tooltip,
} from '@mui/material';
import PlayArrowOutlinedIcon from '@mui/icons-material/PlayArrowOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { PROVIDERS } from '../providerCatalog';
import { testUserKey } from '../../../../services/userKeysService';

import AppIcon from '../../../../components/icons/AppIcon';

/**
 * Preview + per-row config. Parent passes the rows from the preview response;
 * this component tracks per-row `include` + `providerOverride` + test results.
 */
export default function ImportPreviewTable({ rows, onSelectionsChange }) {
  const [state, setState] = useState(() =>
    rows.map((r) => ({
      ...r,
      include: !!r.matched,
      providerOverride: r.provider, // null if unknown
      testing: false,
      testResult: null,
    }))
  );

  const providerOptions = useMemo(() => PROVIDERS, []);

  const updateRow = (idx, patch) => {
    setState((cur) => {
      const next = cur.map((r) => (r.idx === idx ? { ...r, ...patch } : r));
      onSelectionsChange?.(
        next
          .filter((r) => r.include && r.providerOverride)
          .map((r) => ({ idx: r.idx, provider: r.providerOverride }))
      );
      return next;
    });
  };

  const handleTest = async (row) => {
    // Test needs the actual value - which the UI doesn't have (masked only).
    // For preview rows the "Test" is informational - we don't have the plaintext
    // until apply. So disable Test here, or surface it as "will test on apply".
    // We keep the button disabled for now and rely on per-row apply-time probe.
    // (Kept here for future expansion - e.g., signed test endpoint that uses importId+idx.)
    updateRow(row.idx, { testing: false, testResult: { ok: true, message: 'Validated on apply' } });
  };

  const selectAllMatched = () => {
    setState((cur) => {
      const next = cur.map((r) => ({ ...r, include: !!r.matched && !!r.providerOverride }));
      onSelectionsChange?.(
        next
          .filter((r) => r.include && r.providerOverride)
          .map((r) => ({ idx: r.idx, provider: r.providerOverride }))
      );
      return next;
    });
  };

  const clearAll = () => {
    setState((cur) => {
      const next = cur.map((r) => ({ ...r, include: false }));
      onSelectionsChange?.([]);
      return next;
    });
  };

  const matchedCount = state.filter((r) => r.matched).length;
  const selectedCount = state.filter((r) => r.include && r.providerOverride).length;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
        <Typography variant="body2" color="text.secondary">
          Found <strong>{rows.length}</strong> entries · <strong>{matchedCount}</strong> matched ·{' '}
          <strong>{selectedCount}</strong> selected
        </Typography>
        <Box>
          <Button size="small" onClick={selectAllMatched}>
            Select all matched
          </Button>
          <Button size="small" onClick={clearAll}>
            Clear
          </Button>
        </Box>
      </Box>
      <TableContainer
        sx={{ maxHeight: 400, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}
      >
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox" />
              <TableCell>Name</TableCell>
              <TableCell>Provider</TableCell>
              <TableCell>Value</TableCell>
              <TableCell align="center">Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {state.map((row) => (
              <TableRow key={row.idx} hover>
                <TableCell padding="checkbox">
                  <Checkbox
                    size="small"
                    checked={row.include}
                    onChange={(e) => updateRow(row.idx, { include: e.target.checked })}
                    disabled={!row.providerOverride}
                  />
                </TableCell>
                <TableCell>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                    {row.name}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Select
                    size="small"
                    value={row.providerOverride || ''}
                    onChange={(e) =>
                      updateRow(row.idx, { providerOverride: e.target.value || null })
                    }
                    displayEmpty
                    sx={{ minWidth: 180, fontSize: '0.8rem' }}
                  >
                    <MenuItem value="">
                      <em>- Skip -</em>
                    </MenuItem>
                    {providerOptions.map((p) => (
                      <MenuItem key={p.id} value={p.id}>
                        {p.label}
                      </MenuItem>
                    ))}
                  </Select>
                </TableCell>
                <TableCell>
                  <Typography
                    variant="caption"
                    sx={{ fontFamily: 'monospace', color: 'text.secondary' }}
                  >
                    {row.maskedPreview}
                  </Typography>
                </TableCell>
                <TableCell align="center">
                  {row.matched ? (
                    <Chip
                      size="small"
                      icon={<AppIcon name="CheckCircleOutline" fallback={CheckCircleOutlineIcon} />}
                      label="matched"
                      color="success"
                      variant="outlined"
                      sx={{ height: 20 }}
                    />
                  ) : (
                    <Chip
                      size="small"
                      icon={<AppIcon name="ErrorOutline" fallback={ErrorOutlineIcon} />}
                      label="unknown"
                      color="default"
                      variant="outlined"
                      sx={{ height: 20 }}
                    />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
