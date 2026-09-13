import { useEffect, useRef, useState } from 'react';
import {
  Box,
  ClickAwayListener,
  InputAdornment,
  MenuItem,
  MenuList,
  Paper,
  Popper,
  TextField,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import AppIcon from '../../components/icons/AppIcon';
import { SETTLE } from '../../theme/settingsMotion';
import { searchSettings } from './settingsSections';

/**
 * Find a setting without knowing which tab it lives on.
 *
 * One tab at a time is a better page than fourteen stacked cards, but it hides
 * things the long scroll used to expose - "where do I change my Telegram
 * handle?" is now two guesses. This searches every visible tab's blocks by
 * title, description and keywords and takes you straight there, opening the
 * block it matched.
 *
 * The field is narrow until you touch it, so the rail keeps its room for tabs.
 */

const MAX_HITS = 8;

export default function SettingsSearch({ tabs, onPick }) {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [anchorEl, setAnchorEl] = useState(null);
  const inputRef = useRef(null);

  const hits = searchSettings(query, tabs).slice(0, MAX_HITS);
  const open = focused && query.trim().length > 0;

  // "/" and Ctrl/Cmd+K reach the field from anywhere on the page, the way the
  // rest of the platform's search affordances do.
  useEffect(() => {
    const onKey = (event) => {
      const tag = event.target?.tagName;
      const typingElsewhere =
        tag === 'INPUT' || tag === 'TEXTAREA' || event.target?.isContentEditable;
      const slash = event.key === '/' && !typingElsewhere;
      const cmdK = event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey);
      if (!slash && !cmdK) return;
      event.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pick = (hit) => {
    if (!hit) return;
    onPick?.(hit);
    setQuery('');
    setFocused(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      setQuery('');
      inputRef.current?.blur();
      return;
    }
    if (!open || hits.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor((c) => (c + 1) % hits.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor((c) => (c - 1 + hits.length) % hits.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      pick(hits[cursor] || hits[0]);
    }
  };

  return (
    <ClickAwayListener onClickAway={() => setFocused(false)}>
      <Box ref={setAnchorEl} sx={{ display: 'flex', alignItems: 'center' }}>
        <TextField
          size="small"
          value={query}
          inputRef={inputRef}
          onChange={(event) => {
            setQuery(event.target.value);
            setCursor(0);
          }}
          onFocus={() => setFocused(true)}
          onKeyDown={onKeyDown}
          placeholder="Search settings"
          inputProps={{ 'aria-label': 'Search settings' }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <AppIcon
                  name="SearchOutlined"
                  fallback={SearchOutlinedIcon}
                  sx={{ fontSize: 16, color: 'text.secondary' }}
                />
              </InputAdornment>
            ),
          }}
          sx={{
            width: focused || query ? { xs: 150, sm: 200 } : { xs: 44, sm: 132 },
            transition: `width 320ms ${SETTLE}`,
            '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
            '& .MuiOutlinedInput-root': { borderRadius: 2, height: 36, fontSize: '0.8rem' },
          }}
        />
        <Popper
          open={open}
          anchorEl={anchorEl}
          placement="bottom-end"
          style={{ zIndex: theme.zIndex.modal }}
        >
          <Paper
            elevation={0}
            sx={{
              mt: 0.75,
              minWidth: 260,
              borderRadius: 2,
              border: '1px solid',
              borderColor: alpha(theme.palette.primary.main, 0.22),
              overflow: 'hidden',
            }}
          >
            {hits.length === 0 ? (
              <Typography variant="caption" sx={{ display: 'block', px: 1.5, py: 1.25 }}>
                Nothing matches “{query.trim()}”.
              </Typography>
            ) : (
              <MenuList dense aria-label="Settings search results">
                {hits.map((hit, index) => (
                  <MenuItem
                    key={`${hit.tabId}.${hit.blockKey}`}
                    selected={index === cursor}
                    onMouseEnter={() => setCursor(index)}
                    onClick={() => pick(hit)}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" noWrap>
                        {hit.title}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {hit.tabLabel}
                      </Typography>
                    </Box>
                  </MenuItem>
                ))}
              </MenuList>
            )}
          </Paper>
        </Popper>
      </Box>
    </ClickAwayListener>
  );
}
