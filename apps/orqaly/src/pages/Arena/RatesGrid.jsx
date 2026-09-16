import {
  Box,
  Typography,
  TextField,
  MenuItem,
  IconButton,
  Button,
  Autocomplete,
} from '@mui/material';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import AppIcon from '../../components/icons/AppIcon';

const CURRENCIES = ['EUR', 'USD', 'GBP'];
const SCOPES = [
  { value: 'person', label: 'Person' },
  { value: 'role', label: 'Role' },
  { value: 'department', label: 'Department' },
];

/**
 * The rates grid — what the people cost, by person, role or department.
 * Controlled: state lives in the caller (the guide's Rates step).
 *
 * "Who" offers the names already on the roster, the roles in play and the
 * departments the company runs, so a first pass is a few numbers, not a form.
 * A person rate beats a role rate, which beats a department rate; a per-job
 * price wins over an hourly one, because it is what was actually paid.
 *
 * @param {{ rows, currency, onPatchRow, onAddRow, onRemoveRow, onCurrencyChange,
 *           peopleOptions?: string[], roleOptions?: string[],
 *           departmentOptions?: Array<{id: string, label: string}> }} props
 */
export default function RatesGrid({
  rows,
  currency,
  onPatchRow,
  onAddRow,
  onRemoveRow,
  onCurrencyChange,
  peopleOptions = [],
  roleOptions = [],
  departmentOptions = [],
}) {
  const deptLabel = (id) => departmentOptions.find((d) => d.id === id)?.label || id;

  return (
    <Box>
      <TextField
        select
        size="small"
        label="Currency"
        value={currency}
        onChange={(e) => onCurrencyChange(e.target.value)}
        sx={{ mb: 2, width: 140 }}
      >
        {CURRENCIES.map((c) => (
          <MenuItem key={c} value={c}>
            {c}
          </MenuItem>
        ))}
      </TextField>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: '130px 1fr 110px 110px 40px',
          gap: 1,
          alignItems: 'center',
        }}
      >
        <Typography variant="caption" color="text.disabled" sx={{ fontWeight: 700 }}>
          for
        </Typography>
        <Typography variant="caption" color="text.disabled" sx={{ fontWeight: 700 }}>
          who
        </Typography>
        <Typography variant="caption" color="text.disabled" sx={{ fontWeight: 700 }}>
          per hour
        </Typography>
        <Typography variant="caption" color="text.disabled" sx={{ fontWeight: 700 }}>
          per job
        </Typography>
        <Box />

        {rows.map((r, i) => (
          <Box key={i} sx={{ display: 'contents' }}>
            <TextField
              select
              size="small"
              value={r.scope}
              onChange={(e) => onPatchRow(i, { scope: e.target.value, key: '' })}
              inputProps={{ 'aria-label': `Rate ${i + 1} scope` }}
            >
              {SCOPES.map((s) => (
                <MenuItem key={s.value} value={s.value}>
                  {s.label}
                </MenuItem>
              ))}
            </TextField>

            {r.scope === 'department' ? (
              <TextField
                select
                size="small"
                value={r.key}
                onChange={(e) => onPatchRow(i, { key: e.target.value })}
                inputProps={{ 'aria-label': `Rate ${i + 1} who` }}
                SelectProps={{
                  displayEmpty: true,
                  renderValue: (v) => (v ? deptLabel(v) : <em>Pick a department</em>),
                }}
              >
                {departmentOptions.map((d) => (
                  <MenuItem key={d.id} value={d.id}>
                    {d.label}
                  </MenuItem>
                ))}
              </TextField>
            ) : (
              <Autocomplete
                freeSolo
                size="small"
                options={r.scope === 'person' ? peopleOptions : roleOptions}
                inputValue={r.key}
                onInputChange={(_, value) => onPatchRow(i, { key: value })}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    size="small"
                    placeholder={r.scope === 'person' ? 'e.g. Marta K.' : 'e.g. Lawyer'}
                    inputProps={{ ...params.inputProps, 'aria-label': `Rate ${i + 1} who` }}
                  />
                )}
              />
            )}

            <TextField
              size="small"
              type="number"
              value={r.hourly_rate}
              onChange={(e) => onPatchRow(i, { hourly_rate: e.target.value })}
              inputProps={{ 'aria-label': `Rate ${i + 1} per hour`, min: 0 }}
            />
            <TextField
              size="small"
              type="number"
              value={r.per_job_cost}
              onChange={(e) => onPatchRow(i, { per_job_cost: e.target.value })}
              inputProps={{ 'aria-label': `Rate ${i + 1} per job`, min: 0 }}
            />
            <IconButton
              size="small"
              onClick={() => onRemoveRow(i)}
              aria-label={`Remove rate ${i + 1}`}
            >
              <AppIcon
                name="DeleteOutlineOutlined"
                fallback={DeleteOutlineOutlinedIcon}
                sx={{ fontSize: 18 }}
              />
            </IconButton>
          </Box>
        ))}
      </Box>

      <Button
        size="small"
        onClick={onAddRow}
        startIcon={<AppIcon name="AddRounded" fallback={AddRoundedIcon} />}
        sx={{ textTransform: 'none', fontWeight: 700, mt: 1.5 }}
      >
        Add another
      </Button>
    </Box>
  );
}
