import { useMemo } from 'react';
import { Box, Button, Stack, Typography, alpha, useTheme } from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import AppIcon from '../../components/icons/AppIcon';
import { useHiddenPages } from '../../hooks/useHiddenPages';
import {
  NAV_GROUPS,
  CONSUMER_NAV_ITEMS,
  ALL_BOTTOM_NAV_ITEMS,
} from '../../components/Layout/Sidebar';

// Home is the landing page and is always visible - it cannot be hidden.
const HOME_PATH = '/home';

// A single, de-duplicated catalog of every sidebar-reachable page, grouped the
// same way the sidebar presents them. Built once from the sidebar's own nav
// constants so this control never drifts from what actually renders.
function buildCatalog() {
  const seen = new Set();
  const sections = [];
  const addSection = (label, items) => {
    const deduped = [];
    for (const item of items) {
      if (!item?.path || seen.has(item.path)) continue;
      seen.add(item.path);
      deduped.push(item);
    }
    if (deduped.length) sections.push({ label, items: deduped });
  };
  NAV_GROUPS.forEach((group) => addSection(group.label, group.items));
  addSection('MORE', ALL_BOTTOM_NAV_ITEMS);
  // Anything only reachable in simple mode (e.g. My Agents) that the groups miss.
  addSection('SIMPLE VIEW', CONSUMER_NAV_ITEMS);
  return sections;
}

const CATALOG = buildCatalog();
const TOGGLABLE_PATHS = CATALOG.flatMap((section) =>
  section.items.map((i) => i.path)
).filter((p) => p !== HOME_PATH);

function PageRow({ item, hidden, locked, onToggle }) {
  const theme = useTheme();
  return (
    <Box
      role="listitem"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 1,
        py: 1.25,
        '&:not(:last-of-type)': { borderBottom: '1px solid', borderColor: 'divider' },
      }}
    >
      <Box
        aria-hidden
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 32,
          height: 32,
          flexShrink: 0,
          color: hidden ? 'text.disabled' : 'text.secondary',
          opacity: hidden ? 0.6 : 1,
        }}
      >
        {item.icon}
      </Box>
      <Typography
        sx={{
          flex: 1,
          fontSize: '0.92rem',
          fontWeight: 600,
          color: hidden ? 'text.disabled' : 'text.primary',
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {item.label}
      </Typography>
      {locked ? (
        <Box
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.5,
            color: 'text.disabled',
            px: 1,
          }}
        >
          <AppIcon name="LockOutlined" fallback={LockOutlinedIcon} fontSize="small" />
          <Typography sx={{ fontSize: '0.78rem', fontWeight: 600 }}>Always on</Typography>
        </Box>
      ) : (
        <Button
          size="small"
          onClick={() => onToggle(item.path)}
          startIcon={
            hidden ? (
              <AppIcon name="VisibilityOff" fallback={VisibilityOffIcon} fontSize="small" />
            ) : (
              <AppIcon name="Visibility" fallback={VisibilityIcon} fontSize="small" />
            )
          }
          aria-label={`${hidden ? 'Show' : 'Hide'} ${item.label}`}
          sx={{
            textTransform: 'none',
            fontWeight: 700,
            minWidth: 76,
            borderRadius: 2,
            color: hidden ? 'primary.main' : 'text.secondary',
            '&:hover': { bgcolor: alpha(theme.palette.text.primary, 0.04) },
          }}
        >
          {hidden ? 'Show' : 'Hide'}
        </Button>
      )}
    </Box>
  );
}

/**
 * Settings > Pages panel: toggle which pages appear in the sidebar (advanced and
 * simple mode). Backed by useHiddenPages (localStorage + account sync). Home is
 * locked visible. Rendered inside a BentoCard on the Settings page.
 */
export default function PagesVisibilityPanel() {
  const theme = useTheme();
  const { hiddenPages, togglePage, showAll, hideAll } = useHiddenPages();
  const hiddenSet = useMemo(() => new Set(hiddenPages), [hiddenPages]);
  const hiddenCount = TOGGLABLE_PATHS.reduce((n, p) => n + (hiddenSet.has(p) ? 1 : 0), 0);
  const total = TOGGLABLE_PATHS.length;

  return (
    <Stack spacing={1.5} sx={{ width: '100%' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          flexWrap: 'wrap',
        }}
      >
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
          {hiddenCount === 0
            ? 'All pages visible'
            : `${hiddenCount} of ${total} page${total === 1 ? '' : 's'} hidden`}
        </Typography>
        <Stack direction="row" spacing={0.5}>
          <Button
            size="small"
            onClick={showAll}
            disabled={hiddenCount === 0}
            sx={{ textTransform: 'none', fontWeight: 700, minWidth: 0 }}
          >
            Show all
          </Button>
          <Button
            size="small"
            onClick={() => hideAll(TOGGLABLE_PATHS)}
            disabled={hiddenCount === total}
            sx={{ textTransform: 'none', fontWeight: 700, minWidth: 0 }}
          >
            Hide all
          </Button>
        </Stack>
      </Box>

      {CATALOG.map((section) => (
        <Box key={section.label}>
          <Typography
            variant="overline"
            sx={{
              display: 'block',
              px: 1,
              color: 'text.secondary',
              fontWeight: 700,
              letterSpacing: '0.08em',
              opacity: 0.8,
            }}
          >
            {section.label}
          </Typography>
          <Box
            role="list"
            sx={{
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 2,
              overflow: 'hidden',
            }}
          >
            {section.items.map((item) => {
              const locked = item.path === HOME_PATH;
              return (
                <PageRow
                  key={item.path}
                  item={item}
                  locked={locked}
                  hidden={!locked && hiddenSet.has(item.path)}
                  onToggle={togglePage}
                />
              );
            })}
          </Box>
        </Box>
      ))}
    </Stack>
  );
}
