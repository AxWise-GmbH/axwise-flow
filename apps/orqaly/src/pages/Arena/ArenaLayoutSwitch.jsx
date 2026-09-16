import { ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material';
import ViewColumnOutlinedIcon from '@mui/icons-material/ViewColumnOutlined';
import ViewStreamOutlinedIcon from '@mui/icons-material/ViewStreamOutlined';
import GlassIcon from '../../components/icons/GlassIcon';
import useArenaLayout from './useArenaLayout';

const CHOICES = [
  {
    value: 'split',
    label: 'Split',
    icon: 'ViewColumnOutlined',
    fallback: ViewColumnOutlinedIcon,
    hint: 'Your people on the left, the agents on the right.',
  },
  {
    value: 'stacked',
    label: 'Stacked',
    icon: 'ViewStreamOutlined',
    fallback: ViewStreamOutlinedIcon,
    hint: 'One block under the other, for narrow screens.',
  },
];

/**
 * Pick whether the two corners of a job sit side by side or stacked.
 *
 * When the page has forced stacking — a narrow viewport, or Simple mode, whose
 * 920px column cannot hold two real panels — the switch disables itself and
 * says why, rather than pretending to control something it does not.
 */
export default function ArenaLayoutSwitch({ size = 'small', forcedStacked = false, forcedReason }) {
  const { layout, setLayout } = useArenaLayout();
  const value = forcedStacked ? 'stacked' : layout;

  const group = (
    <ToggleButtonGroup
      exclusive
      size={size}
      value={value}
      disabled={forcedStacked}
      onChange={(_, next) => next && setLayout(next)}
      aria-label="How to show each job"
      sx={{
        '& .MuiToggleButton-root': {
          textTransform: 'none',
          fontSize: '0.7rem',
          fontWeight: 600,
          px: 1.25,
          py: 0.4,
          gap: 0.6,
          borderRadius: '8px !important',
          border: '1px solid !important',
        },
      }}
    >
      {CHOICES.map((choice) => (
        <ToggleButton key={choice.value} value={choice.value} aria-label={choice.label}>
          <Tooltip title={forcedStacked ? '' : choice.hint}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <GlassIcon name={choice.icon} fallback={choice.fallback} size={14} />
              {choice.label}
            </span>
          </Tooltip>
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );

  if (!forcedStacked) return group;

  return (
    <Tooltip title={forcedReason || 'This screen is too narrow for two corners side by side.'}>
      <span>{group}</span>
    </Tooltip>
  );
}

export { CHOICES as ARENA_LAYOUT_CHOICES };
