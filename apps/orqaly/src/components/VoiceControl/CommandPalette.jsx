import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Typography, Paper, Popper, ClickAwayListener, alpha, useTheme } from '@mui/material';
import { filterSlashCommands, groupCommands } from './capabilities.js';

/**
 * Slash-command palette. Opens when the input starts with `/`.
 *
 * Props:
 *  - open: boolean — whether the popper is visible
 *  - anchorEl: HTMLElement | null — element to anchor above
 *  - query: string — text after the leading `/` (filter)
 *  - onSelect: (command) => void — fires when a command is picked
 *  - onClose: () => void — fires on Esc or click-away
 *
 * Keyboard:
 *  - Up/Down navigates the flat list
 *  - Enter selects
 *  - Esc closes
 *
 * (Parent forwards keyboard events via the `keyHandlerRef` callback.)
 */
export default function CommandPalette({
  open,
  anchorEl,
  query = '',
  onSelect,
  onClose,
  keyHandlerRef,
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const { main, light } = theme.palette.primary;

  const commands = useMemo(() => filterSlashCommands(query), [query]);
  const grouped = useMemo(() => groupCommands(commands), [commands]);
  const flatList = commands;

  const [rawActiveIdx, setActiveIdx] = useState(0);
  // Clamp during render — when the filtered list shrinks, the previous
  // index could be out of bounds. Cheap and avoids stale-state bugs.
  const activeIdx = Math.min(rawActiveIdx, Math.max(0, flatList.length - 1));
  const listRef = useRef(null);

  // Reset selection to top whenever the query changes.
  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  // Expose a key handler so the parent TextField can route keys to us
  useEffect(() => {
    if (!keyHandlerRef) return;
    keyHandlerRef.current = (e) => {
      if (!open) return false;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, Math.max(0, flatList.length - 1)));
        return true;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
        return true;
      }
      if (e.key === 'Enter') {
        const cmd = flatList[activeIdx];
        if (cmd) {
          e.preventDefault();
          onSelect?.(cmd);
          return true;
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
        return true;
      }
      return false;
    };
    return () => {
      if (keyHandlerRef) keyHandlerRef.current = null;
    };
  }, [open, flatList, activeIdx, onSelect, onClose, keyHandlerRef]);

  // Auto-scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(`[data-cmd-index="${activeIdx}"]`);
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIdx]);

  if (!open) return null;

  const itemSx = (isActive) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 1,
    px: 1.25,
    py: 0.75,
    borderRadius: 1.5,
    cursor: 'pointer',
    bgcolor: isActive ? alpha(main, 0.25) : 'transparent',
    border: '1px solid',
    borderColor: isActive ? alpha(light, 0.35) : 'transparent',
    transition: 'background 0.12s ease',
    '&:hover': {
      bgcolor: alpha(main, isActive ? 0.3 : 0.15),
    },
  });

  let flatIndex = -1;

  return (
    <Popper
      open={open}
      anchorEl={anchorEl}
      placement="top"
      modifiers={[
        { name: 'offset', options: { offset: [0, 8] } },
        { name: 'preventOverflow', options: { padding: 8 } },
      ]}
      style={{ zIndex: 1500, width: anchorEl?.clientWidth || 'auto' }}
    >
      <ClickAwayListener onClickAway={() => onClose?.()}>
        <Paper
          elevation={8}
          role="listbox"
          aria-label="Command palette"
          sx={{
            maxHeight: 360,
            overflowY: 'auto',
            p: 1,
            borderRadius: 3,
            bgcolor: isDark ? alpha('#0a0e18', 0.96) : alpha('#1a1f2c', 0.96),
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid',
            borderColor: alpha(light, 0.2),
            boxShadow: `0 8px 32px ${alpha('#000000', 0.4)}, 0 0 0 1px ${alpha(main, 0.1)}`,
          }}
          ref={listRef}
        >
          {flatList.length === 0 ? (
            <Box sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="caption" sx={{ color: alpha('#ffffff', 0.5) }}>
                No commands match “{query}”
              </Typography>
            </Box>
          ) : (
            Object.entries(grouped).map(([category, cmds]) => (
              <Box key={category} sx={{ mb: 0.5 }}>
                <Typography
                  variant="overline"
                  sx={{
                    display: 'block',
                    px: 1,
                    pt: 0.5,
                    pb: 0.25,
                    fontSize: '0.6rem',
                    letterSpacing: '0.15em',
                    fontWeight: 700,
                    color: alpha('#ffffff', 0.4),
                  }}
                >
                  {category}
                </Typography>
                {cmds.map((cmd) => {
                  flatIndex += 1;
                  const idx = flatIndex;
                  const isActive = idx === activeIdx;
                  return (
                    <Box
                      key={cmd.id}
                      role="option"
                      aria-selected={isActive}
                      data-cmd-index={idx}
                      sx={itemSx(isActive)}
                      onMouseEnter={() => setActiveIdx(idx)}
                      onMouseDown={(e) => {
                        // Mousedown (not click) so the TextField doesn't blur first
                        e.preventDefault();
                        onSelect?.(cmd);
                      }}
                    >
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography
                          variant="body2"
                          sx={{
                            color: '#fff',
                            fontWeight: 600,
                            fontSize: '0.8rem',
                            lineHeight: 1.3,
                          }}
                        >
                          {cmd.label}
                        </Typography>
                        {cmd.hint && (
                          <Typography
                            variant="caption"
                            sx={{
                              color: alpha('#ffffff', 0.45),
                              fontSize: '0.68rem',
                              display: 'block',
                              lineHeight: 1.3,
                            }}
                          >
                            {cmd.hint}
                          </Typography>
                        )}
                      </Box>
                      <Typography
                        variant="caption"
                        sx={{
                          color: alpha(light, 0.7),
                          fontSize: '0.65rem',
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                          flexShrink: 0,
                        }}
                      >
                        /{cmd.id}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
            ))
          )}
          <Box
            sx={{
              borderTop: '1px solid',
              borderColor: alpha('#ffffff', 0.08),
              mt: 0.5,
              pt: 0.5,
              px: 1,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Typography
              variant="caption"
              sx={{ color: alpha('#ffffff', 0.3), fontSize: '0.62rem' }}
            >
              ↑↓ navigate · ↵ select · esc close
            </Typography>
            <Typography
              variant="caption"
              sx={{ color: alpha('#ffffff', 0.3), fontSize: '0.62rem' }}
            >
              {flatList.length} command{flatList.length === 1 ? '' : 's'}
            </Typography>
          </Box>
        </Paper>
      </ClickAwayListener>
    </Popper>
  );
}
