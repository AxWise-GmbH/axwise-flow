/**
 * The deliverable viewer: the finished work, read inside the popup it came from.
 *
 * Every action on a result row used to leave: Download writes a file the user
 * then has to find and open, Open throws a new browser tab at them. Neither
 * answers the question actually being asked at that moment, which is "what did
 * it produce?". This answers it in place - the panel rises over the dialog, and
 * closing it puts the list back exactly as it was.
 *
 * It renders the format rather than the source: a markdown brief reads as a
 * document, a CSV as a table, a PDF in an embed, an image at its own size. When
 * a format cannot be rendered in a browser at all - a spreadsheet binary, a page
 * that refuses to be framed - it says so plainly and offers the file, because a
 * blank grey box that was supposed to be a preview is worse than no preview.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Slide,
  Tooltip,
  Typography,
  alpha,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DownloadIcon from '@mui/icons-material/Download';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import GlassIcon from '../../icons/GlassIcon';
import AssistantMarkdown from '../../VoiceControl/AssistantMarkdown';
import { DeliverableViewerContext } from './deliverableViewerContext';
import {
  FORMAT_LABEL,
  TABULAR_FORMATS,
  TEXTUAL_FORMATS,
  VIEW_FORMAT,
  parseDelimited,
} from './deliverableFormats';

/**
 * Text the viewer holds itself, versus text it has to go and get.
 *
 * Only the fetched case keeps state. Inline text is already in hand, so
 * copying it into state through an effect would be a second render for nothing
 * - and a frame of "loading" over content that was never loading.
 */
function useDeliverableText(item) {
  const inline = typeof item?.text === 'string' ? item.text : null;
  const url = item?.url || null;
  const needsFetch = Boolean(item && inline === null && url && TEXTUAL_FORMATS.has(item.format));
  // Keyed by url, so a result opened while a previous fetch is in flight shows
  // its own loading state rather than the other one's body.
  const [remote, setRemote] = useState({ url: null, text: null, error: '' });

  useEffect(() => {
    if (!needsFetch) return undefined;
    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`The file could not be loaded (HTTP ${res.status}).`);
        return res.text();
      })
      .then((text) => setRemote({ url, text, error: '' }))
      .catch((err) => {
        // An aborted fetch is this effect cleaning up after itself, not a
        // failure to show the user.
        if (err?.name === 'AbortError') return;
        setRemote({ url, text: null, error: err?.message || 'Could not load the file.' });
      });
    return () => controller.abort();
  }, [needsFetch, url]);

  if (inline !== null) return { text: inline, loading: false, error: '' };
  if (!needsFetch) return { text: null, loading: false, error: '' };
  if (remote.url !== url) return { text: null, loading: true, error: '' };
  return { text: remote.text, loading: false, error: remote.error };
}

/** Delimited text as a table, with the first row as its header. */
function DataTable({ text, delimiter }) {
  const theme = useTheme();
  const rows = useMemo(() => parseDelimited(text, delimiter), [text, delimiter]);
  if (rows.length === 0) {
    return (
      <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>Empty file.</Typography>
    );
  }
  const [header, ...body] = rows;
  const cellSx = {
    px: 1.25,
    py: 0.75,
    borderBottom: '1px solid',
    borderColor: 'divider',
    fontSize: '0.78rem',
    verticalAlign: 'top',
    whiteSpace: 'pre-wrap',
  };
  return (
    // The table scrolls in its own box: a wide export must not make the whole
    // panel scroll sideways.
    <Box sx={{ overflowX: 'auto' }}>
      <Box component="table" sx={{ borderCollapse: 'collapse', minWidth: '100%' }}>
        <Box component="thead">
          <Box component="tr">
            {header.map((cell, i) => (
              <Box
                component="th"
                key={`h-${i}`}
                sx={{
                  ...cellSx,
                  textAlign: 'left',
                  fontWeight: 700,
                  position: 'sticky',
                  top: 0,
                  bgcolor: 'background.paper',
                  color: theme.palette.primary.main,
                }}
              >
                {cell}
              </Box>
            ))}
          </Box>
        </Box>
        <Box component="tbody">
          {body.map((row, r) => (
            <Box component="tr" key={`r-${r}`}>
              {row.map((cell, c) => (
                <Box component="td" key={`c-${c}`} sx={cellSx}>
                  {cell}
                </Box>
              ))}
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

/** Monospace text that keeps its own line breaks. */
function PlainText({ text }) {
  return (
    <Box
      component="pre"
      sx={{
        m: 0,
        fontFamily: 'ui-monospace, monospace',
        fontSize: '0.78rem',
        lineHeight: 1.6,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        color: 'text.primary',
      }}
    >
      {text}
    </Box>
  );
}

/** The one thing to say when a format cannot be shown in a browser. */
function NoPreview({ item, reason }) {
  return (
    <Box sx={{ py: 4, textAlign: 'center' }}>
      <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, mb: 0.5 }}>
        This one opens outside the app
      </Typography>
      <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', mb: 2 }}>{reason}</Typography>
      {item.url && (
        <Button
          variant="outlined"
          size="small"
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          startIcon={<GlassIcon name="OpenInNew" fallback={OpenInNewIcon} size={14} />}
          sx={{ textTransform: 'none', borderRadius: 2 }}
        >
          Open the file
        </Button>
      )}
    </Box>
  );
}

/** The body, chosen by format. */
export function DeliverableBody({ item }) {
  const theme = useTheme();
  const { text, loading, error } = useDeliverableText(item);

  if (!item) return null;

  if (loading) {
    return (
      <Box
        role="status"
        aria-label="Loading the deliverable"
        sx={{ display: 'flex', justifyContent: 'center', py: 6 }}
      >
        <CircularProgress size={22} />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ fontSize: '0.8rem' }}>
        {error}
      </Alert>
    );
  }

  if (item.format === VIEW_FORMAT.image) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center' }}>
        <Box
          component="img"
          src={item.url}
          alt={item.title || 'Deliverable'}
          sx={{ maxWidth: '100%', borderRadius: 1.5, border: '1px solid', borderColor: 'divider' }}
        />
      </Box>
    );
  }

  if (item.format === VIEW_FORMAT.pdf) {
    return (
      // <object> rather than <iframe>: it falls back to its own children when
      // the browser has no PDF plugin, instead of showing an empty frame.
      <Box
        component="object"
        data={item.url}
        type="application/pdf"
        aria-label={item.title || 'PDF'}
        sx={{ width: '100%', height: '100%', minHeight: 420, border: 0 }}
      >
        <NoPreview item={item} reason="This browser cannot display PDFs inline." />
      </Box>
    );
  }

  if (item.format === VIEW_FORMAT.site) {
    return (
      <Box sx={{ height: '100%', minHeight: 420, display: 'flex', flexDirection: 'column' }}>
        <Box
          component="iframe"
          src={item.url}
          title={item.title || 'Web page'}
          sx={{ flex: 1, width: '100%', border: 0, borderRadius: 1.5, bgcolor: '#fff' }}
        />
        {/* Plenty of hosts send X-Frame-Options and simply refuse. The frame
            goes blank with no error, so the way out is always on screen. */}
        <Typography sx={{ mt: 1, fontSize: '0.7rem', color: 'text.disabled' }}>
          Some sites refuse to be embedded. If this stays blank, open it in a tab.
        </Typography>
      </Box>
    );
  }

  if (typeof text !== 'string') {
    return <NoPreview item={item} reason="There is no preview for this kind of file yet." />;
  }

  if (TABULAR_FORMATS.has(item.format)) {
    return <DataTable text={text} delimiter={item.format === VIEW_FORMAT.tsv ? '\t' : ','} />;
  }

  if (item.format === VIEW_FORMAT.markdown) {
    // The markdown renderer is the assistant's, which draws on a dark chat
    // surface by default. The dialog follows the theme, so it is told which.
    return <AssistantMarkdown text={text} color={theme.palette.text.primary} />;
  }

  return <PlainText text={text} />;
}

/**
 * Mount the viewer over whatever this wraps.
 *
 * Renders a fragment, so the popup's own flex layout is untouched: the overlay
 * is a sibling of the dialog's header, content and actions, absolutely
 * positioned over all three. The host has to be a positioned element - the
 * dialog paper sets `position: relative` for exactly this.
 */
export function DeliverableViewerProvider({ children }) {
  const theme = useTheme();
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [item, setItem] = useState(null);

  const view = useCallback((next) => setItem(next || null), []);
  const close = useCallback(() => setItem(null), []);
  const api = useMemo(() => ({ view, close }), [view, close]);

  // Escape closes the viewer without closing the dialog behind it. Without
  // this the key falls through to the Dialog and takes the whole popup with it,
  // which loses the user's place in the results.
  useEffect(() => {
    if (!item) return undefined;
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      close();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [item, close]);

  return (
    <DeliverableViewerContext.Provider value={api}>
      {children}
      <Slide
        direction="up"
        in={Boolean(item)}
        timeout={reduceMotion ? 0 : 260}
        mountOnEnter
        unmountOnExit
      >
        <Box
          role="dialog"
          aria-label={item ? `Viewing ${item.title || 'deliverable'}` : 'Deliverable viewer'}
          sx={{
            position: 'absolute',
            inset: 0,
            zIndex: 3,
            display: 'flex',
            flexDirection: 'column',
            bgcolor: 'background.paper',
            backgroundImage: 'none',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: { xs: 1.5, sm: 2.5 },
              py: 1.25,
              flexShrink: 0,
              borderBottom: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography
                sx={{
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {item?.title || 'Deliverable'}
              </Typography>
              {item?.format && (
                <Typography sx={{ fontSize: '0.68rem', color: 'text.disabled' }}>
                  {FORMAT_LABEL[item.format] || item.format}
                </Typography>
              )}
            </Box>

            {item?.onDownload && (
              <Button
                size="small"
                variant="outlined"
                onClick={item.onDownload}
                startIcon={<GlassIcon name="Download" fallback={DownloadIcon} size={14} />}
                sx={{
                  textTransform: 'none',
                  fontSize: '0.7rem',
                  borderRadius: 2,
                  borderColor: alpha(theme.palette.text.primary, 0.2),
                }}
              >
                Download
              </Button>
            )}

            <Tooltip title="Back to the results">
              <IconButton size="small" onClick={close} aria-label="Close the viewer">
                <GlassIcon name="Close" fallback={CloseIcon} size={18} />
              </IconButton>
            </Tooltip>
          </Box>

          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              overflow: 'auto',
              px: { xs: 1.5, sm: 2.5 },
              py: 2,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <DeliverableBody item={item} />
          </Box>
        </Box>
      </Slide>
    </DeliverableViewerContext.Provider>
  );
}

export default DeliverableViewerProvider;
