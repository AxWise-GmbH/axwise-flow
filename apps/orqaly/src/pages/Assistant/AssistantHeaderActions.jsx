import { useState } from 'react';
import {
  Box,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import RocketLaunchOutlinedIcon from '@mui/icons-material/RocketLaunchOutlined';
import FilterButton from '../../components/Common/FilterButton';

import AppIcon from '../../components/icons/AppIcon';

/**
 * Compact toolbar for the Assistant console (replaces the old title header).
 * Pure/presentational - all data + actions come in via props.
 *
 * Layout: filter (left) + optional robot assistant-switcher, then an Explain
 * icon and a "+" menu (New Assistant / Finish Setup) on the right.
 */
export default function AssistantHeaderActions({
  onExplain,
  onOpenFilters,
  filterCount = 0,
  assistants = [],
  currentId,
  onSwitch,
  showSwitcher = false,
  onNewAssistant,
  onFinishSetup,
}) {
  const theme = useTheme();
  const [switchAnchor, setSwitchAnchor] = useState(null);
  const [plusAnchor, setPlusAnchor] = useState(null);

  const currentName = assistants.find((a) => a.id === currentId)?.name || 'Assistant';

  const pick = (fn) => () => {
    setPlusAnchor(null);
    fn?.();
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
      {/* Left: filter + optional assistant switcher */}
      <FilterButton onClick={onOpenFilters} count={filterCount} tooltip="Filters & options" />
      {showSwitcher && (
        <>
          <Tooltip title={`Assistant: ${currentName}`} arrow>
            <IconButton
              size="small"
              onClick={(e) => setSwitchAnchor(e.currentTarget)}
              aria-label="Switch assistant"
              aria-haspopup="menu"
              sx={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                border: '1px solid',
                borderColor: 'divider',
                color: 'text.secondary',
                '&:hover': { borderColor: 'primary.main', color: 'primary.main' },
              }}
            >
              <AppIcon
                name="SmartToyOutlined"
                fallback={SmartToyOutlinedIcon}
                sx={{ fontSize: 18 }}
              />
            </IconButton>
          </Tooltip>
          <Menu
            anchorEl={switchAnchor}
            open={Boolean(switchAnchor)}
            onClose={() => setSwitchAnchor(null)}
          >
            {assistants.map((a) => (
              <MenuItem
                key={a.id}
                selected={a.id === currentId}
                onClick={() => {
                  setSwitchAnchor(null);
                  onSwitch?.(a.id);
                }}
              >
                <ListItemIcon>
                  {a.id === currentId ? (
                    <AppIcon name="CheckRounded" fallback={CheckRoundedIcon} fontSize="small" />
                  ) : (
                    <AppIcon
                      name="SmartToyOutlined"
                      fallback={SmartToyOutlinedIcon}
                      fontSize="small"
                    />
                  )}
                </ListItemIcon>
                <ListItemText>{a.name}</ListItemText>
              </MenuItem>
            ))}
          </Menu>
        </>
      )}
      <Box sx={{ flex: 1 }} />
      {/* Right: Explain (icon only) + "+" menu */}
      <Tooltip title="Explain" arrow>
        <IconButton
          onClick={onExplain}
          aria-label="Explain"
          sx={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            border: '1px solid',
            borderColor: 'divider',
            color: 'text.secondary',
            '&:hover': { borderColor: 'primary.main', color: 'primary.main' },
          }}
        >
          <AppIcon
            name="HelpOutlineRounded"
            fallback={HelpOutlineRoundedIcon}
            sx={{ fontSize: 18 }}
          />
        </IconButton>
      </Tooltip>
      <Tooltip title="Setup" arrow>
        <IconButton
          onClick={(e) => setPlusAnchor(e.currentTarget)}
          aria-label="Setup options"
          aria-haspopup="menu"
          sx={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            border: '1px solid',
            borderColor: theme.palette.primary.main,
            color: 'primary.main',
            '&:hover': { bgcolor: 'action.hover' },
          }}
        >
          <AppIcon name="AddRounded" fallback={AddRoundedIcon} sx={{ fontSize: 20 }} />
        </IconButton>
      </Tooltip>
      <Menu anchorEl={plusAnchor} open={Boolean(plusAnchor)} onClose={() => setPlusAnchor(null)}>
        <MenuItem onClick={pick(onNewAssistant)}>
          <ListItemIcon>
            <AppIcon
              name="AutoAwesomeOutlined"
              fallback={AutoAwesomeOutlinedIcon}
              fontSize="small"
            />
          </ListItemIcon>
          <ListItemText
            primary="New Assistant"
            secondary={
              <Typography variant="caption" color="text.secondary">
                Start over with a new assistant
              </Typography>
            }
          />
        </MenuItem>
        <MenuItem onClick={pick(onFinishSetup)}>
          <ListItemIcon>
            <AppIcon
              name="RocketLaunchOutlined"
              fallback={RocketLaunchOutlinedIcon}
              fontSize="small"
            />
          </ListItemIcon>
          <ListItemText
            primary="Finish Setup"
            secondary={
              <Typography variant="caption" color="text.secondary">
                Continue the current setup
              </Typography>
            }
          />
        </MenuItem>
      </Menu>
    </Box>
  );
}
