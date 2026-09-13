/**
 * [module: frontend]
 * Shared schedule fields for pulse creation dialogs.
 */
import {
  Box,
  TextField,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
  InputAdornment,
} from '@mui/material';
import EventRepeatOutlinedIcon from '@mui/icons-material/EventRepeatOutlined';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import ScheduleIcon from '@mui/icons-material/Schedule';
import {
  FormDialogSection,
  FORM_FIELD_SX,
  FORM_LABEL_PROPS,
  FORM_INPUT_FONT,
} from '../Common/FormDialog';
import { SCHEDULE_KINDS, WEEKDAY_OPTIONS } from '../../utils/pulseSchedule';

import AppIcon from '../icons/AppIcon';

const fieldSx = FORM_FIELD_SX;
const labelProps = FORM_LABEL_PROPS;
const inputFont = FORM_INPUT_FONT;

export default function PulseScheduleFields({
  scheduleKind,
  onScheduleKindChange,
  runAt,
  onRunAtChange,
  timeOfDay,
  onTimeOfDayChange,
  weekday,
  onWeekdayChange,
  dayOfMonth,
  onDayOfMonthChange,
}) {
  return (
    <FormDialogSection title="Schedule" icon={EventRepeatOutlinedIcon}>
      <FormControl fullWidth size="small" sx={fieldSx}>
        <InputLabel shrink id="pulse-frequency-label" sx={labelProps.sx}>
          Frequency
        </InputLabel>
        <Select
          labelId="pulse-frequency-label"
          value={scheduleKind}
          label="Frequency"
          onChange={(e) => onScheduleKindChange(e.target.value)}
          sx={inputFont}
        >
          {SCHEDULE_KINDS.map((s) => (
            <MenuItem key={s.value} value={s.value}>
              {s.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2.5 }}>
        {scheduleKind === 'once' && (
          <TextField
            label="Date & time"
            type="datetime-local"
            fullWidth
            size="small"
            value={runAt}
            onChange={(e) => onRunAtChange(e.target.value)}
            InputLabelProps={labelProps}
            InputProps={{
              sx: inputFont,
              startAdornment: (
                <InputAdornment position="start" sx={{ color: 'text.secondary', mr: 0 }}>
                  <AppIcon
                    name="CalendarToday"
                    fallback={CalendarTodayIcon}
                    sx={{ fontSize: 18 }}
                  />
                </InputAdornment>
              ),
            }}
            sx={{ ...fieldSx, gridColumn: '1 / -1' }}
          />
        )}
        {scheduleKind !== 'once' && (
          <TextField
            label="Time"
            type="time"
            fullWidth
            size="small"
            value={timeOfDay}
            onChange={(e) => onTimeOfDayChange(e.target.value)}
            InputLabelProps={labelProps}
            InputProps={{
              sx: inputFont,
              startAdornment: (
                <InputAdornment position="start" sx={{ color: 'text.secondary', mr: 0 }}>
                  <AppIcon name="Schedule" fallback={ScheduleIcon} sx={{ fontSize: 18 }} />
                </InputAdornment>
              ),
            }}
            sx={fieldSx}
          />
        )}
        {scheduleKind === 'weekly' && (
          <FormControl fullWidth size="small" sx={fieldSx}>
            <InputLabel shrink id="pulse-weekday-label" sx={labelProps.sx}>
              Day of week
            </InputLabel>
            <Select
              labelId="pulse-weekday-label"
              value={weekday}
              label="Day of week"
              onChange={(e) => onWeekdayChange(Number(e.target.value))}
              sx={inputFont}
            >
              {WEEKDAY_OPTIONS.map((w) => (
                <MenuItem key={w.value} value={w.value}>
                  {w.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
        {scheduleKind === 'monthly' && (
          <TextField
            label="Day of month"
            type="number"
            fullWidth
            size="small"
            value={dayOfMonth}
            onChange={(e) =>
              onDayOfMonthChange(Math.min(28, Math.max(1, Number(e.target.value) || 1)))
            }
            inputProps={{ min: 1, max: 28 }}
            InputLabelProps={labelProps}
            helperText="1–28"
            sx={fieldSx}
          />
        )}
      </Box>
    </FormDialogSection>
  );
}

// Re-export FormDialogSection for consumers that only need the fields wrapper
export { FormDialogSection };
