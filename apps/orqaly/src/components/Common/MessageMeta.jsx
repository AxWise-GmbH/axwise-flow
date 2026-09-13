/**
 * The line under a chat message: copy it, and when it was said.
 *
 * Sits outside the bubble rather than inside it, so it never changes the shape
 * of what someone actually wrote, and it hangs on the sender's side - right for
 * the user, left for everything answering them.
 *
 *   [hh:mm:ss]  (copy)      mine
 *   (copy)  [hh:mm:ss]      theirs
 *              dd.mm.yyyy
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';

import AppIcon from '../icons/AppIcon';
import { messageStamp } from '../../utils/messageStamp';

/** How long the tick stays after a copy. */
const COPIED_MS = 1400;

/**
 * @param {string} text - what the copy button puts on the clipboard.
 * @param {string|number|Date} at - when the message was said.
 * @param {'left'|'right'} align - which side of the thread it hangs on.
 */
export default function MessageMeta({ text = '', at = null, align = 'left' }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const copy = useCallback(async () => {
    const value = String(text ?? '');
    if (!value) return;
    const clipboard = typeof navigator === 'undefined' ? null : navigator.clipboard;
    if (typeof clipboard?.writeText !== 'function') return;
    try {
      await clipboard.writeText(value);
    } catch {
      // No clipboard permission, or an insecure origin. Nothing to recover -
      // just don't claim it worked.
      return;
    }
    setCopied(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), COPIED_MS);
  }, [text]);

  const stamp = messageStamp(at);
  const hasText = Boolean(String(text ?? ''));
  // A bubble with neither (the typing indicator) gets no line at all.
  if (!hasText && !stamp) return null;

  const mine = align === 'right';

  const stampNode = stamp ? (
    <Box
      data-testid="message-stamp"
      sx={{ lineHeight: 1.2, textAlign: mine ? 'right' : 'left', flexShrink: 0 }}
    >
      <Typography
        component="span"
        sx={{
          display: 'block',
          fontSize: '0.58rem',
          fontWeight: 600,
          color: 'text.disabled',
          // Tabular figures, or the seconds ticking make the column jitter.
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {stamp.time}
      </Typography>
      <Typography
        component="span"
        sx={{
          display: 'block',
          fontSize: '0.58rem',
          color: 'text.disabled',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {stamp.date}
      </Typography>
    </Box>
  ) : null;

  const copyNode = hasText ? (
    <Tooltip title={copied ? 'Copied' : 'Copy message'} arrow>
      <IconButton
        size="small"
        onClick={copy}
        aria-label={copied ? 'Message copied' : 'Copy message'}
        sx={{
          p: 0.3,
          color: copied ? 'success.main' : 'text.disabled',
          '&:hover': { color: copied ? 'success.main' : 'text.secondary' },
        }}
      >
        <AppIcon
          name={copied ? 'CheckRounded' : 'ContentCopyRounded'}
          fallback={copied ? CheckRoundedIcon : ContentCopyRoundedIcon}
          sx={{ fontSize: 14 }}
        />
      </IconButton>
    </Tooltip>
  ) : null;

  return (
    <Box
      data-testid="message-meta"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        mt: 0.35,
        px: 0.25,
        justifyContent: mine ? 'flex-end' : 'flex-start',
      }}
    >
      {mine ? (
        <>
          {stampNode}
          {copyNode}
        </>
      ) : (
        <>
          {copyNode}
          {stampNode}
        </>
      )}
    </Box>
  );
}
