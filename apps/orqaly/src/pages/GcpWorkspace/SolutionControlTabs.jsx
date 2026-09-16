import { Box, Button } from '@mui/material';
import { useTheme } from '@mui/material/styles';

const LABELS = ['Workflow', 'Run', 'History', 'Settings'];

/** Fixed, manual-activation tabs: arrow keys move focus; Enter/Space selects. */
export default function SolutionControlTabs({ value, onChange }) {
  const { direction } = useTheme();
  return (
    <Box
      role="tablist"
      aria-label="Solution controls"
      aria-orientation="horizontal"
      onKeyDown={(event) => {
        const tabs = Array.from(event.currentTarget.querySelectorAll('[role="tab"]'));
        const current = tabs.indexOf(event.target);
        if (current < 0) return;
        const forward = direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
        const backward = direction === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
        let next;
        if (event.key === forward) next = (current + 1) % tabs.length;
        else if (event.key === backward) next = (current + tabs.length - 1) % tabs.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = tabs.length - 1;
        else return;
        event.preventDefault();
        tabs[next].focus();
        tabs[next].scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      }}
      sx={{
        display: 'flex',
        minWidth: 0,
        maxWidth: '100%',
        overflowX: 'auto',
        overscrollBehaviorX: 'contain',
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      {LABELS.map((label, index) => (
        <Button
          key={label}
          role="tab"
          id={`solution-tab-${index}`}
          aria-controls={`solution-panel-${index}`}
          aria-selected={value === index}
          tabIndex={value === index ? 0 : -1}
          onClick={() => onChange(index)}
          sx={{
            flexShrink: 0,
            minHeight: 48,
            borderRadius: 0,
            borderBottom: '2px solid',
            borderColor: value === index ? 'primary.main' : 'transparent',
            color: value === index ? 'primary.main' : 'text.secondary',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </Button>
      ))}
    </Box>
  );
}
