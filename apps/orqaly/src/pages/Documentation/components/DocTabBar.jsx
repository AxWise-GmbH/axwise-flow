import { Button, useMediaQuery, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import PillTabStrip from '../../../components/Common/PillTabStrip';
import AppIcon from '../../../components/icons/AppIcon';

/**
 * Pill-style tab bar (per DESIGN_SYSTEM.md: Button pills in a strip, not MUI Tabs).
 *   tabs     - [{ key, label, icon }]
 *   active   - current tab key
 *   onChange - (key) => void
 */
export default function DocTabBar({ tabs, active, onChange }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const primary = theme.palette.primary.main;

  return (
    <PillTabStrip role="tablist" aria-label="Documentation sections">
      {tabs.map((tab) => {
        const selected = active === tab.key;
        return (
          <Button
            key={tab.key}
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.key)}
            startIcon={
              isMobile ? undefined : <AppIcon fallback={tab.icon} sx={{ fontSize: 16 }} />
            }
            sx={{
              textTransform: 'none',
              fontWeight: selected ? 700 : 600,
              fontSize: '0.8rem',
              borderRadius: 2.5,
              minHeight: 36,
              px: 1.75,
              whiteSpace: 'nowrap',
              color: selected ? 'primary.main' : 'text.secondary',
              bgcolor: selected ? alpha(primary, 0.1) : 'transparent',
              boxShadow: selected ? `0 2px 4px ${alpha(primary, 0.1)}` : 'none',
              transition: 'all 0.2s',
              '& .MuiButton-startIcon': { mr: 0.75 },
              '&:hover': {
                bgcolor: selected ? alpha(primary, 0.14) : alpha(theme.palette.text.primary, 0.06),
              },
            }}
          >
            {tab.label}
          </Button>
        );
      })}
    </PillTabStrip>
  );
}
