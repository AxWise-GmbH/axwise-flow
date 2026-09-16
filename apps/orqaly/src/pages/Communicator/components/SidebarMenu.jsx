/**
 * [module: design-system + connection-hub]
 * SidebarMenu - reusable left-rail navigation used by Communicator's
 * two top tabs (Agent Workspace + Communicator).
 *
 * Desktop: vertical list of items with icons, active item gets primary-tinted
 * background + 3px left accent bar. Optional footer slot pinned to the bottom
 * (used for the "Connected as @user · Disconnect" card).
 *
 * Mobile (< sm): renders as a full-width Select dropdown above the content
 * pane. The footer is hidden on mobile (gets its own row above the select
 * via the parent if needed).
 */
import {
  Box,
  FormControl,
  Select,
  MenuItem,
  Typography,
  useTheme,
  useMediaQuery,
  alpha,
  Chip,
} from '@mui/material';

import AppIcon from '../../../components/icons/AppIcon';

export default function SidebarMenu({ items = [], value, onChange, footer = null, width = 220 }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  if (isMobile) {
    return (
      <Box sx={{ p: { xs: 1, sm: 1.5 }, borderBottom: '1px solid', borderColor: 'divider' }}>
        <FormControl size="small" fullWidth>
          <Select
            value={value || items[0]?.id || ''}
            onChange={(e) => onChange?.(e.target.value)}
            sx={{
              borderRadius: 2,
              '& .MuiSelect-select': { display: 'flex', alignItems: 'center', gap: 1, py: 1 },
            }}
          >
            {items.map((it) => {
              const Icon = it.icon;
              return (
                <MenuItem key={it.id} value={it.id} disabled={it.disabled}>
                  {Icon && (
                    <Box
                      component="span"
                      sx={{ display: 'inline-flex', mr: 0.75, color: 'text.secondary' }}
                    >
                      <AppIcon fallback={Icon} sx={{ fontSize: 18 }} />
                    </Box>
                  )}
                  <Box component="span" sx={{ fontWeight: 600 }}>
                    {it.label}
                  </Box>
                  {it.badge != null && (
                    <Chip
                      size="small"
                      label={it.badge}
                      sx={{
                        ml: 'auto',
                        height: 18,
                        fontSize: '0.65rem',
                        bgcolor: alpha(theme.palette.success.main, 0.15),
                        color: 'success.main',
                      }}
                    />
                  )}
                </MenuItem>
              );
            })}
          </Select>
        </FormControl>
        {footer && <Box sx={{ mt: 1.25 }}>{footer}</Box>}
      </Box>
    );
  }

  // Desktop sidebar
  return (
    <Box
      sx={{
        width,
        flexShrink: 0,
        borderRight: '1px solid',
        borderColor: 'divider',
        bgcolor: alpha(theme.palette.common.black, 0.1),
        p: 1.25,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.5,
        minHeight: 540,
      }}
    >
      {items.map((it) => {
        const active = value === it.id;
        const Icon = it.icon;
        return (
          <Box
            key={it.id}
            role="button"
            tabIndex={0}
            onClick={() => !it.disabled && onChange?.(it.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                !it.disabled && onChange?.(it.id);
              }
            }}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.25,
              px: 1.25,
              py: 1.1,
              borderRadius: 1.75,
              fontSize: '0.84rem',
              fontWeight: 600,
              color: active ? 'primary.main' : 'text.secondary',
              bgcolor: active ? alpha(theme.palette.primary.main, 0.1) : 'transparent',
              borderLeft: '3px solid',
              borderLeftColor: active ? theme.palette.primary.main : 'transparent',
              cursor: it.disabled ? 'not-allowed' : 'pointer',
              opacity: it.disabled ? 0.45 : 1,
              transition: 'background-color 0.15s, color 0.15s',
              '&:hover': {
                bgcolor: it.disabled
                  ? 'transparent'
                  : active
                    ? alpha(theme.palette.primary.main, 0.14)
                    : alpha(theme.palette.text.primary, 0.04),
                color: it.disabled ? 'text.secondary' : active ? 'primary.main' : 'text.primary',
              },
              outline: 'none',
              '&:focus-visible': {
                boxShadow: `0 0 0 2px ${alpha(theme.palette.primary.main, 0.4)}`,
              },
            }}
          >
            <Box
              component="span"
              sx={{
                width: 20,
                height: 20,
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: active ? 'primary.main' : 'text.secondary',
              }}
            >
              {Icon ? <AppIcon fallback={Icon} sx={{ fontSize: 18 }} /> : '·'}
            </Box>
            <Box
              sx={{
                flex: 1,
                minWidth: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {it.label}
            </Box>
            {it.badge != null && (
              <Chip
                size="small"
                label={it.badge}
                sx={{
                  height: 18,
                  fontSize: '0.62rem',
                  fontWeight: 700,
                  bgcolor: alpha(theme.palette.success.main, 0.15),
                  color: 'success.main',
                  border: 'none',
                  '& .MuiChip-label': { px: 0.75 },
                }}
              />
            )}
            {it.adminTag && (
              <Typography
                variant="caption"
                sx={{
                  fontSize: '0.55rem',
                  fontWeight: 700,
                  color: 'warning.main',
                  bgcolor: alpha(theme.palette.warning.main, 0.14),
                  px: 0.6,
                  py: 0.1,
                  borderRadius: 0.75,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                admin
              </Typography>
            )}
          </Box>
        );
      })}
      {footer && <Box sx={{ mt: 'auto', pt: 1 }}>{footer}</Box>}
    </Box>
  );
}
