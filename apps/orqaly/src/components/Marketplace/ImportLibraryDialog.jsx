/**
 * ImportLibraryDialog + ImportFromButton - "Import From..." flow for the
 * Marketplace tabs. Lets a user search individual items across all curated
 * libraries, tick the exact ones they want and import just those (or import a
 * whole library at once), define their own, and read a short how-to. Imported
 * items appear in the tab and stay usable via the tab's existing action.
 *
 * Layout: a pill-tab bar (Browse / GitHub [agents only] / Custom) instead of
 * a stacked accordion - each mode is reachable in one click regardless of how
 * long the curated library list is (see PillTabStrip / DocTabBar.jsx for the
 * same pattern elsewhere). "How to import" is static copy, not a mode, so it
 * lives behind a small [?] icon next to the title instead of taking a tab.
 */
import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Paper,
  Typography,
  Chip,
  Checkbox,
  TextField,
  InputAdornment,
  Collapse,
  Link,
  Snackbar,
  Alert,
  CircularProgress,
  Popover,
  IconButton,
  Tooltip,
  Stack,
  useMediaQuery,
  useTheme,
  alpha,
} from '@mui/material';
import CloudDownloadOutlinedIcon from '@mui/icons-material/CloudDownloadOutlined';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import SearchIcon from '@mui/icons-material/Search';
import SearchOffIcon from '@mui/icons-material/SearchOff';
import CloseIcon from '@mui/icons-material/Close';
import LibraryBooksOutlinedIcon from '@mui/icons-material/LibraryBooksOutlined';
import AutoStoriesOutlinedIcon from '@mui/icons-material/AutoStoriesOutlined';
import TravelExploreIcon from '@mui/icons-material/TravelExplore';
import GitHubIcon from '@mui/icons-material/GitHub';
import FormDialog from '../Common/FormDialog';
import PillTabStrip from '../Common/PillTabStrip';
import EmptyState from '../Common/EmptyState';
import useScrollEdgeFade from '../Common/useScrollEdgeFade';
import { createHoverGlowHover } from '../../theme/hoverGlow';
import useImportedLibraries from '../../hooks/useImportedLibraries';
import useLibraryItems from '../../hooks/useLibraryItems';
import { fetchLibraryItems } from '../../services/importedLibrariesService';
import { fetchGithubAgents } from '../../services/githubAgentsService';
import { materializeImportedAgents } from '../../services/agentImportMaterializer';
import { getLibrariesForCategory, itemKey } from '../../config/marketplaceImportSources';
import { getProvidersForCategory } from '../../config/liveCatalogProviders';
import { TOUCH_SCROLL_CONTAINER_SX } from '../../utils/mobileTouchScroll';
import { inferLlmProvider, resolveLlmPair } from '../../utils/llmPair';

const ITEM_HINTS = {
  orgs: '[{ "name": "Group HQ", "type": "holding", "industry": "Tech", "entityCount": 1, "levels": 1, "entities": [{ "name": "Group HQ", "level": 0, "role": "holding", "parentId": null }] }]',
  teams:
    '[{ "name": "My Board", "industry": "Tech", "members": [{ "name": "Chair", "role": "chairman", "provider": "glm", "model": "glm-5.1", "temperature": 0.3, "maxTokens": 1500 }] }]',
  agents:
    '[{ "name": "My Agent", "role": "My Agent", "description": "...", "category": "Operations", "capabilities": ["..."], "connection_type": "glm", "model": "glm-5.1", "cost_per_task": 0.05, "system_prompt": "..." }]',
  models:
    '[{ "name": "My Model", "exactModel": "vendor/model", "provider": "@host", "hardware": "1x GPU", "ram": "32GB", "contextLength": 32768, "pricePerHour": 0.2, "tokensPerSecond": 30, "status": "online", "sizeClass": "md", "description": "..." }]',
  tools:
    '[{ "name": "My Tool", "description": "...", "connectionType": "api", "status": "active", "category": "custom" }]',
  skills:
    '[{ "name": "My Skill", "category": "ops", "tags": ["..."], "content": "# My Skill\\n..." }]',
};

const EMPTY_CUSTOM = { name: '', url: '', json: '' };

const IMPORT_LLM_PROVIDERS = [
  'groq',
  'openai',
  'anthropic',
  'deepseek',
  'glm',
  'qwen',
  'gemini',
  'openrouter',
  'gateway',
  'ollama',
  'local-openai',
];

export function resolveImportedAgentLlm(items) {
  const first = Array.isArray(items) ? items[0] : null;
  const explicitProvider = IMPORT_LLM_PROVIDERS.includes(first?.provider)
    ? first.provider
    : undefined;
  const inferredProvider = inferLlmProvider(first?.model);
  const legacyProvider = IMPORT_LLM_PROVIDERS.includes(first?.connection_type)
    ? first.connection_type
    : undefined;
  return resolveLlmPair({
    provider: explicitProvider || (!inferredProvider ? legacyProvider : undefined),
    model: first?.model,
  });
}

const selKey = (libId, item) => `${libId}::${itemKey(item)}`;

/** Status chip: communicates a state (live / imported / count / blocked). */
const STATUS_CHIP_SX = { height: 20, fontSize: '0.65rem', fontWeight: 600 };
/** Tag chip: descriptive metadata, not a state. */
const TAG_CHIP_SX = { height: 16, fontSize: '0.58rem', fontWeight: 600 };
/** One consistent gap/direction scale for every tab panel's body. */
const TAB_PANEL_SX = { flexDirection: 'column', gap: 1.5 };

/** Always-visible thin scrollbar so scrollable panels stay discoverable
    (the browser/OS default auto-hiding scrollbar can render invisible at rest). */
const visibleScrollbarSx = (theme) => ({
  scrollbarWidth: 'thin',
  scrollbarColor: `${alpha(theme.palette.text.primary, 0.28)} transparent`,
  '&::-webkit-scrollbar': { width: 8 },
  '&::-webkit-scrollbar-thumb': {
    backgroundColor: alpha(theme.palette.text.primary, 0.28),
    borderRadius: 8,
  },
  '&::-webkit-scrollbar-track': { backgroundColor: 'transparent' },
});

/** One selectable item row (used in both search results and expanded cards). */
function ItemRow({ lib, item, selected, imported, onToggle }) {
  const theme = useTheme();
  const glowHover = createHoverGlowHover(theme);
  // The whole row toggles selection so it is easy to tap on touch screens.
  const toggle = () => {
    if (!imported) onToggle(lib, item);
  };
  return (
    <Box
      role="button"
      tabIndex={imported ? -1 : 0}
      onClick={toggle}
      onKeyDown={(e) => {
        if (imported) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle();
        }
      }}
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 0.5,
        py: 0.75,
        px: 0.5,
        borderRadius: 1.5,
        opacity: imported ? 0.7 : 1,
        cursor: imported ? 'default' : 'pointer',
        transition: 'background-color 120ms, box-shadow 200ms',
        '&:hover': imported
          ? undefined
          : { bgcolor: alpha(theme.palette.primary.main, 0.06), ...glowHover['&:hover'] },
      }}
    >
      <Checkbox
        size="small"
        checked={imported || selected}
        disabled={imported}
        onClick={(e) => e.stopPropagation()}
        onChange={() => onToggle(lib, item)}
        sx={{ p: 0.5, mt: 0.1 }}
        inputProps={{ 'aria-label': `Select ${item.name}` }}
      />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {item.name}
          </Typography>
          {imported && (
            <Chip
              label="Imported"
              size="small"
              color="success"
              variant="outlined"
              sx={STATUS_CHIP_SX}
            />
          )}
        </Box>
        {item.description && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {item.description}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

function LibraryCard({
  lib,
  category,
  query,
  importedCount,
  busy,
  onImportAll,
  onRemove,
  isSelected,
  isImported,
  onToggle,
  onReport,
}) {
  const theme = useTheme();
  const glowHover = createHoverGlowHover(theme);
  const searching = !!query.trim();
  const [manualOpen, setManualOpen] = useState(false);
  const open = searching || manualOpen;
  const { items, total, hasMore, loading, loadMore, live } = useLibraryItems(
    lib,
    category,
    query,
    open
  );
  // While a search is forcing the card open there is nothing to meaningfully
  // toggle - a click here would silently flip manualOpen with no visible
  // effect, which is what made a manually-opened card look like it "closed
  // itself" once the search was cleared. No-op instead.
  const toggleOpen = () => {
    if (searching) return;
    setManualOpen((v) => !v);
  };
  // Collapsed: show the library's advertised size. Open: show the real count.
  const displayTotal = open ? total : (lib.itemCount ?? lib.items?.length ?? 0);
  const fullyImported = importedCount > 0 && importedCount >= displayTotal;

  // Report match state to the parent so it can show a global "no match" note.
  useEffect(() => {
    onReport?.(lib.id, { count: items.length, loading });
  }, [onReport, lib.id, items.length, loading]);

  // While searching, hide libraries that have no matching items.
  if (searching && !loading && items.length === 0) return null;
  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        borderRadius: 2,
        border: '1px solid',
        borderColor: importedCount > 0 ? alpha(theme.palette.success.main, 0.5) : 'divider',
        bgcolor: importedCount > 0 ? alpha(theme.palette.success.main, 0.05) : 'transparent',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25 }}>
        <Box
          role="button"
          tabIndex={0}
          aria-expanded={open}
          aria-label={`Toggle items for ${lib.name}`}
          onClick={toggleOpen}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggleOpen();
            }
          }}
          sx={{
            flex: 1,
            minWidth: 0,
            mx: -0.5,
            px: 0.5,
            borderRadius: 1.5,
            cursor: searching ? 'default' : 'pointer',
            transition: 'background-color 150ms, box-shadow 200ms',
            ...(searching
              ? {}
              : {
                  '&:hover': {
                    bgcolor: alpha(theme.palette.primary.main, 0.05),
                    ...glowHover['&:hover'],
                  },
                }),
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {lib.name}
            </Typography>
            <Chip
              label={`${displayTotal} items`}
              size="small"
              variant="outlined"
              sx={TAG_CHIP_SX}
            />
            {live && (
              <Chip
                label="live"
                size="small"
                color="primary"
                variant="outlined"
                sx={STATUS_CHIP_SX}
              />
            )}
            {lib.url && (
              <Link
                href={lib.url}
                target="_blank"
                rel="noopener"
                onClick={(e) => e.stopPropagation()}
                sx={{ display: 'inline-flex', alignItems: 'center' }}
              >
                <OpenInNewIcon sx={{ fontSize: 13, color: 'text.secondary' }} />
              </Link>
            )}
            <Box sx={{ flex: 1 }} />
            {open ? (
              <ExpandLessIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
            ) : (
              <ExpandMoreIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
            )}
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
            {lib.description}
          </Typography>
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.25 }}>
            {lib.author ? `by ${lib.author}` : ''}
            {importedCount > 0
              ? `${lib.author ? ' · ' : ''}${importedCount} of ${displayTotal} imported`
              : ''}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5 }}>
          <Button
            size="small"
            variant="outlined"
            onClick={onImportAll}
            disabled={busy || fullyImported}
            startIcon={busy ? <CircularProgress size={13} color="inherit" /> : null}
            sx={{
              textTransform: 'none',
              fontWeight: 700,
              borderRadius: 999,
              minWidth: 'auto',
              px: 2.25,
              borderColor: alpha(theme.palette.primary.main, 0.5),
              color: 'primary.main',
              '&:hover': {
                borderColor: 'primary.main',
                bgcolor: alpha(theme.palette.primary.main, 0.08),
              },
            }}
          >
            {fullyImported ? 'All imported' : 'Import all'}
          </Button>
          {importedCount > 0 && (
            <Button
              size="small"
              color="error"
              onClick={onRemove}
              disabled={busy}
              sx={{ textTransform: 'none', fontSize: '0.7rem', minWidth: 'auto', px: 1 }}
            >
              Remove
            </Button>
          )}
        </Box>
      </Box>
      <Collapse in={open}>
        <Box sx={{ mt: 1.5 }}>
          {/* Bounded, obviously-scrollable panel so long item lists stay usable
              on web and mobile without scrolling the whole dialog. */}
          <Box
            sx={{
              maxHeight: { xs: '38vh', sm: 300 },
              overflowY: 'auto',
              pr: 0.5,
              ...TOUCH_SCROLL_CONTAINER_SX,
              // Let scrolling past the list chain out to the dialog so the
              // other tabs' content stays reachable.
              overscrollBehaviorY: 'auto',
              // Always-visible slim scrollbar as a scroll affordance.
              ...visibleScrollbarSx(theme),
            }}
          >
            {items.map((item) => (
              <ItemRow
                key={itemKey(item)}
                lib={lib}
                item={item}
                selected={isSelected(lib, item)}
                imported={isImported(lib, item)}
                onToggle={onToggle}
              />
            ))}
            {loading && items.length === 0 && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
                <CircularProgress size={16} />
              </Box>
            )}
          </Box>
          {hasMore && (
            <Button
              size="small"
              fullWidth
              onClick={loadMore}
              disabled={loading}
              startIcon={loading ? <CircularProgress size={13} color="inherit" /> : null}
              sx={{ textTransform: 'none', mt: 0.75, borderRadius: 2 }}
            >
              {loading ? 'Loading...' : 'Load more'}
            </Button>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
}

export default function ImportLibraryDialog({ open, onClose, category, onImported }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const {
    importedSources,
    importedItems = [],
    importLibrary,
    importItems,
    removeLibrary,
    addCustomLibrary,
  } = useImportedLibraries(category);
  const curated = useMemo(() => getLibrariesForCategory(category), [category]);

  const TABS = useMemo(() => {
    const t = [{ key: 'browse', label: 'Browse', icon: LibraryBooksOutlinedIcon }];
    if (category === 'agents') t.push({ key: 'github', label: 'GitHub', icon: GitHubIcon });
    t.push({ key: 'custom', label: 'Custom', icon: AddCircleOutlineIcon });
    return t;
  }, [category]);
  const [activeTab, setActiveTab] = useState('browse');
  useEffect(() => {
    if (activeTab === 'github' && category !== 'agents') setActiveTab('browse');
  }, [activeTab, category]);

  const [helpAnchorEl, setHelpAnchorEl] = useState(null);

  const [busyId, setBusyId] = useState(null);
  const [query, setQuery] = useState('');
  const [cardState, setCardState] = useState({});
  const [selected, setSelected] = useState({});

  const reportCard = useCallback((id, state) => {
    setCardState((prev) => {
      const cur = prev[id];
      if (cur && cur.count === state.count && cur.loading === state.loading) return prev;
      return { ...prev, [id]: state };
    });
  }, []);
  const [customForm, setCustomForm] = useState(EMPTY_CUSTOM);
  const [formError, setFormError] = useState('');
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });

  // "Import from GitHub" (agents only): paste a public repo URL, discover agents.
  const [githubUrl, setGithubUrl] = useState('');
  const [githubBusy, setGithubBusy] = useState(false);
  const [githubError, setGithubError] = useState('');
  const [githubResult, setGithubResult] = useState(null);
  const [githubQuery, setGithubQuery] = useState('');
  const githubReqRef = useRef(0); // guards against stale (out-of-order) responses

  const { containerRef, sentinelRef, showBottomFade } = useScrollEdgeFade();

  const importedBySourceId = useMemo(
    () => Object.fromEntries(importedSources.map((s) => [s.sourceId, s])),
    [importedSources]
  );

  const importedKeys = useMemo(
    () => new Set(importedItems.map((it) => `${it._sourceId}::${itemKey(it)}`)),
    [importedItems]
  );

  const isImportedItem = useCallback(
    (lib, item) => importedKeys.has(selKey(lib.id, item)),
    [importedKeys]
  );
  const isSelectedItem = useCallback((lib, item) => !!selected[selKey(lib.id, item)], [selected]);

  const toggleItem = useCallback((lib, item) => {
    const key = selKey(lib.id, item);
    setSelected((prev) => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = { lib, item };
      return next;
    });
  }, []);

  const selectedCount = Object.keys(selected).length;

  // "No items match" only once every card has finished and found nothing.
  const noMatches =
    !!query.trim() &&
    curated.length > 0 &&
    curated.every((lib) => {
      const st = cardState[lib.id];
      return st && !st.loading && st.count === 0;
    });

  const handleImportAll = useCallback(
    async (lib) => {
      setBusyId(lib.id);
      try {
        // For live libraries, pull the full current list from the source so
        // "Import all" imports everything, not just the bundled samples.
        let toImport = lib;
        if (lib.live) {
          try {
            const r = await fetchLibraryItems({
              category,
              sourceId: lib.id,
              offset: 0,
              limit: 200,
            });
            if (r.live && r.items.length) toImport = { ...lib, items: r.items };
          } catch {
            // Fall back to the bundled items already on `lib`.
          }
        }
        await importLibrary(toImport);
        setToast({ open: true, message: `${lib.name} imported`, severity: 'success' });
        onImported?.();
      } catch (err) {
        setToast({ open: true, message: err.message || 'Import failed', severity: 'error' });
      } finally {
        setBusyId(null);
      }
    },
    [importLibrary, onImported, category]
  );

  const handleImportSelected = useCallback(async () => {
    const entries = Object.values(selected);
    if (entries.length === 0) return;
    // group selected items by their source library
    const bySource = new Map();
    for (const { lib, item } of entries) {
      const g = bySource.get(lib.id) || { lib, items: [] };
      g.items.push(item);
      bySource.set(lib.id, g);
    }
    setBusyId('selected');
    try {
      let activated = 0;
      for (const { lib, items } of bySource.values()) {
        await importItems(lib, items);
        // Auto-activate GitHub-imported agents straight into Agent Hub so they're
        // usable immediately (they also stay in the catalog as "Imported").
        if (category === 'agents' && String(lib.id || '').startsWith('github:')) {
          const enriched = items.map((it) => ({ ...it, _sourceName: lib.name, _sourceId: lib.id }));
          try {
            const res = await materializeImportedAgents(enriched, resolveImportedAgentLlm(items));
            activated += res?.createdCount || 0;
          } catch {
            /* non-fatal: still in the catalog, can be activated manually */
          }
        }
      }
      setToast({
        open: true,
        message: activated
          ? `${entries.length} imported - ${activated} added to Agent Hub`
          : `${entries.length} imported`,
        severity: 'success',
      });
      setSelected({});
      onImported?.();
    } catch (err) {
      setToast({ open: true, message: err.message || 'Import failed', severity: 'error' });
    } finally {
      setBusyId(null);
    }
  }, [selected, importItems, onImported, category]);

  const handleRemove = useCallback(
    async (rowId, name) => {
      setBusyId(rowId);
      try {
        await removeLibrary(rowId);
        setToast({ open: true, message: `${name} removed`, severity: 'success' });
        onImported?.();
      } catch (err) {
        setToast({ open: true, message: err.message || 'Remove failed', severity: 'error' });
      } finally {
        setBusyId(null);
      }
    },
    [removeLibrary, onImported]
  );

  const handleRegister = useCallback(async () => {
    setFormError('');
    setBusyId('custom');
    try {
      const res = await addCustomLibrary(customForm);
      if (!res.ok) {
        setFormError(res.error || 'Could not register library');
        return;
      }
      setCustomForm(EMPTY_CUSTOM);
      setToast({ open: true, message: 'Library registered', severity: 'success' });
      onImported?.();
    } finally {
      setBusyId(null);
    }
  }, [addCustomLibrary, customForm, onImported]);

  // A synthetic "library" for the fetched GitHub repo, so selection + import
  // reuse the exact same machinery as curated libraries (toggleItem / import).
  const githubLib = useMemo(() => {
    const r = githubResult?.repo;
    if (!r) return null;
    return {
      id: `github:${r.owner}/${r.repo}`,
      name: r.fullName || `${r.owner}/${r.repo}`,
      url: r.url,
      custom: false,
    };
  }, [githubResult]);

  // How many agents to auto-load (paged) so the whole repo is searchable
  // client-side. Bounds server calls for very large repos.
  const CLIENT_LOAD_CAP = 600;

  // Fetch the repo's agents up front - page 1 immediately, the rest in the
  // background - so search runs entirely client-side (no per-keystroke server
  // calls, hence no rate-limit). A monotonic request id discards a superseded
  // load (URL changed or re-fetched mid-load).
  const handleFetchGithub = useCallback(async () => {
    const url = githubUrl.trim();
    if (!url) return;
    const reqId = githubReqRef.current + 1;
    githubReqRef.current = reqId;
    setGithubQuery(''); // a freshly fetched repo starts unfiltered
    setGithubBusy(true);
    setGithubError('');
    // Only clear GitHub-sourced selections - Browse-tab picks stay intact.
    setSelected((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([k]) => !k.startsWith('github:')))
    );
    try {
      const first = await fetchGithubAgents({ url, offset: 0, limit: 100, q: '' });
      if (githubReqRef.current !== reqId) return;
      setGithubResult(first);
      if (!first.total) {
        setGithubError(first.warnings?.[0] || 'No agents found in this repository.');
        setGithubBusy(false);
        return;
      }
      // Background-load remaining pages so the full repo is searchable locally.
      let items = first.items;
      let rejected = first.rejected || 0;
      let offset = (first.offset || 0) + (first.limit || 100);
      let hasMore = first.hasMore;
      while (hasMore && items.length < CLIENT_LOAD_CAP) {
        let page;
        try {
          page = await fetchGithubAgents({ url, offset, limit: 100, q: '' });
        } catch (e) {
          if (githubReqRef.current !== reqId) return;
          // Keep everything loaded so far; just note the rest didn't load.
          setGithubError(
            `Showing ${items.length} of ${first.total} - couldn't load the rest (${e.message || 'error'}). Try again in a moment.`
          );
          break;
        }
        if (githubReqRef.current !== reqId) return;
        items = [...items, ...page.items];
        rejected += page.rejected || 0;
        offset += page.limit || 100;
        hasMore = page.hasMore;
        setGithubResult((prev) => ({ ...prev, items, rejected, hasMore }));
      }
    } catch (err) {
      if (githubReqRef.current !== reqId) return;
      // First page failed: keep any previously loaded list, surface the error.
      setGithubError(err.message || 'Failed to fetch agents');
    } finally {
      if (githubReqRef.current === reqId) setGithubBusy(false);
    }
  }, [githubUrl]);

  // Client-side search over the already-loaded agents - instant, no server call.
  const githubFilteredItems = useMemo(() => {
    const items = githubResult?.items || [];
    const q = githubQuery.trim().toLowerCase();
    if (!q) return items;
    const hay = (it) =>
      [
        it.name,
        it.description,
        it.role,
        it.category,
        it._path,
        Array.isArray(it.capabilities) ? it.capabilities.join(' ') : '',
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
    return items.filter((it) => hay(it).includes(q));
  }, [githubResult, githubQuery]);

  return (
    <>
      <FormDialog
        open={open}
        onClose={onClose}
        title="Import libraries"
        subtitle="Search items across libraries, pick what you need, or import a whole library"
        icon={CloudDownloadOutlinedIcon}
        titleAdornment={
          <Tooltip title="How to import">
            <IconButton
              size="small"
              onClick={(e) => setHelpAnchorEl(e.currentTarget)}
              aria-label="How to import"
              sx={{ color: 'primary.main' }}
            >
              <HelpOutlineIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>
        }
        maxWidth="md"
        contentDividers={false}
        contentRef={containerRef}
        paperSx={{ maxHeight: { xs: '92vh', sm: '88vh' } }}
        contentSx={{
          display: 'flex',
          flexDirection: 'column',
          // A flex column child of the scroll="paper" Paper needs minHeight:0 so
          // it shrinks to the Paper height and its own overflowY:auto engages;
          // without it the content grows past the Paper and cannot scroll.
          minHeight: 0,
          overflowY: 'auto',
          ...TOUCH_SCROLL_CONTAINER_SX,
          // Always-visible slim scrollbar so the (otherwise auto-hiding)
          // scroll affordance for the rest of the dialog stays discoverable.
          ...visibleScrollbarSx(theme),
        }}
        footerJustify={selectedCount > 0 ? 'space-between' : 'flex-end'}
        footerLeft={
          selectedCount > 0 ? (
            <Stack direction="row" alignItems="center" spacing={1.5}>
              <Typography
                variant="body2"
                sx={{ fontWeight: 600, display: { xs: 'none', sm: 'block' } }}
              >
                {selectedCount} selected
              </Typography>
              <Button
                size="small"
                onClick={() => setSelected({})}
                sx={{ textTransform: 'none', color: 'text.secondary' }}
              >
                Clear
              </Button>
            </Stack>
          ) : null
        }
        primaryLabel={selectedCount > 0 ? `Import selected (${selectedCount})` : 'Done'}
        onPrimary={selectedCount > 0 ? handleImportSelected : onClose}
        primaryDisabled={busyId === 'selected'}
        hideCancel
      >
        <PillTabStrip role="tablist" aria-label="Import mode" sx={{ px: 0, pt: 1.5, pb: 3 }}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            const Icon = tab.icon;
            return (
              <Button
                key={tab.key}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.key)}
                startIcon={isMobile ? undefined : <Icon sx={{ fontSize: 16 }} />}
                sx={{
                  textTransform: 'none',
                  fontWeight: isActive ? 700 : 600,
                  fontSize: { xs: '0.75rem', sm: '0.85rem' },
                  borderRadius: 2.5,
                  minHeight: 36,
                  px: 1.75,
                  whiteSpace: 'nowrap',
                  color: isActive ? 'primary.main' : 'text.secondary',
                  bgcolor: isActive ? alpha(theme.palette.primary.main, 0.1) : 'transparent',
                  boxShadow: isActive
                    ? `0 2px 4px ${alpha(theme.palette.primary.main, 0.1)}`
                    : 'none',
                  transition: 'all 0.2s',
                  '& .MuiButton-startIcon': { mr: 0.75 },
                  '&:hover': {
                    bgcolor: isActive
                      ? alpha(theme.palette.primary.main, 0.14)
                      : alpha(theme.palette.text.primary, 0.06),
                  },
                }}
              >
                {tab.label}
              </Button>
            );
          })}
        </PillTabStrip>

        {/* Browse: search across curated libraries, pick items or import a whole one. */}
        <Box sx={{ ...TAB_PANEL_SX, display: activeTab === 'browse' ? 'flex' : 'none' }}>
          <TextField
            size="small"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search items by name or keyword..."
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 18, color: 'text.disabled' }} />
                </InputAdornment>
              ),
            }}
            inputProps={{ 'aria-label': 'Search items' }}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />

          {curated.length === 0 ? (
            <EmptyState
              dense
              icon={AutoStoriesOutlinedIcon}
              title="No curated libraries yet"
              description="Register your own under the Custom tab."
            />
          ) : (
            <>
              {curated.map((lib) => {
                const imp = importedBySourceId[lib.id];
                return (
                  <LibraryCard
                    key={lib.id}
                    lib={lib}
                    category={category}
                    query={query}
                    importedCount={imp?.itemCount ?? 0}
                    busy={busyId === lib.id || busyId === imp?.id}
                    onImportAll={() => handleImportAll(lib)}
                    onRemove={() => handleRemove(imp.id, lib.name)}
                    isSelected={isSelectedItem}
                    isImported={isImportedItem}
                    onToggle={toggleItem}
                    onReport={reportCard}
                  />
                );
              })}
              {noMatches && (
                <EmptyState
                  dense
                  icon={SearchOffIcon}
                  title={`No items match "${query.trim()}"`}
                  description="Try a different search term, or open a library above to browse everything it offers."
                />
              )}
            </>
          )}
        </Box>

        {/* Import from GitHub - agents only. Paste a public repo, discover agents. */}
        {category === 'agents' && (
          <Box sx={{ ...TAB_PANEL_SX, display: activeTab === 'github' ? 'flex' : 'none' }}>
            <Typography variant="body2" color="text.secondary">
              Paste a public GitHub repo URL and fetch it to discover the agents inside. Nothing
              imports yet — tick the ones you want below, then use "Import selected".
            </Typography>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1}
              alignItems={{ xs: 'stretch', sm: 'flex-start' }}
            >
              <TextField
                fullWidth
                size="small"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleFetchGithub();
                  }
                }}
                placeholder="https://github.com/owner/repo"
                inputProps={{ 'aria-label': 'GitHub repository URL' }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
              <Button
                variant="contained"
                size="small"
                disableElevation
                onClick={handleFetchGithub}
                disabled={githubBusy || !githubUrl.trim()}
                startIcon={githubBusy ? <CircularProgress size={13} color="inherit" /> : null}
                sx={{
                  textTransform: 'none',
                  fontWeight: 600,
                  borderRadius: 2,
                  whiteSpace: 'nowrap',
                }}
              >
                {githubBusy ? 'Fetching' : 'Fetch agents'}
              </Button>
            </Stack>

            <Typography variant="caption" color="text.disabled">
              Public repositories. Reads front-matter markdown agents, orqaly.agents.json,
              .claude/agents, and CrewAI agents.yaml.
            </Typography>

            {githubResult?.repo && (
              <TextField
                size="small"
                fullWidth
                value={githubQuery}
                onChange={(e) => setGithubQuery(e.target.value)}
                placeholder="Search agents by name or keyword..."
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ fontSize: 18, color: 'text.disabled' }} />
                    </InputAdornment>
                  ),
                  endAdornment: githubQuery ? (
                    <InputAdornment position="end">
                      <IconButton
                        size="small"
                        aria-label="Clear search"
                        onClick={() => setGithubQuery('')}
                      >
                        <CloseIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </InputAdornment>
                  ) : null,
                }}
                inputProps={{ 'aria-label': 'Search fetched agents' }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            )}

            {githubError && (
              <Typography variant="caption" color="error">
                {githubError}
              </Typography>
            )}

            {githubResult && githubResult.total > 0 && (
              <>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                  <Chip
                    label={
                      githubQuery.trim()
                        ? `${githubFilteredItems.length} of ${githubResult.total} match`
                        : githubResult.items.length < githubResult.total
                          ? `Loaded ${githubResult.items.length} of ${githubResult.total}`
                          : `${githubResult.total} agent${githubResult.total === 1 ? '' : 's'}`
                    }
                    size="small"
                    color="primary"
                    variant="outlined"
                    sx={STATUS_CHIP_SX}
                  />
                  {githubBusy && <CircularProgress size={13} color="inherit" />}
                  {githubResult.rejected > 0 && (
                    <Chip
                      label={`${githubResult.rejected} blocked`}
                      size="small"
                      color="warning"
                      variant="outlined"
                      sx={STATUS_CHIP_SX}
                    />
                  )}
                  {githubResult.repo?.url && (
                    <Link
                      href={githubResult.repo.url}
                      target="_blank"
                      rel="noopener"
                      sx={{ display: 'inline-flex', alignItems: 'center' }}
                    >
                      <OpenInNewIcon sx={{ fontSize: 13, color: 'text.secondary' }} />
                    </Link>
                  )}
                </Box>
                {githubResult.warnings?.length > 0 && (
                  <Typography variant="caption" color="text.secondary">
                    {githubResult.warnings[0]}
                  </Typography>
                )}
                <Box
                  sx={{
                    maxHeight: { xs: '38vh', sm: 300 },
                    overflowY: 'auto',
                    pr: 0.5,
                    ...TOUCH_SCROLL_CONTAINER_SX,
                    ...visibleScrollbarSx(theme),
                  }}
                >
                  {githubFilteredItems.map((item) => (
                    <ItemRow
                      key={itemKey(item)}
                      lib={githubLib}
                      item={item}
                      selected={isSelectedItem(githubLib, item)}
                      imported={isImportedItem(githubLib, item)}
                      onToggle={toggleItem}
                    />
                  ))}
                  {githubQuery.trim() && githubFilteredItems.length === 0 && (
                    <EmptyState
                      dense
                      icon={SearchOffIcon}
                      title={`No agents match "${githubQuery.trim()}"`}
                      description="Try a different keyword, or clear the search to see all agents."
                    />
                  )}
                </Box>
              </>
            )}
          </Box>
        )}

        {/* Custom: register your own library by pasting items as JSON. */}
        <Box sx={{ ...TAB_PANEL_SX, display: activeTab === 'custom' ? 'flex' : 'none' }}>
          <Typography variant="body2" color="text.secondary">
            Give it a name and paste your items as JSON to define what's importable. Once
            registered, it appears here just like a curated library — pick items or import it all.
          </Typography>
          <TextField
            label="Name"
            size="small"
            value={customForm.name}
            onChange={(e) => setCustomForm((f) => ({ ...f, name: e.target.value }))}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />
          <TextField
            label="Source URL (optional)"
            size="small"
            value={customForm.url}
            onChange={(e) => setCustomForm((f) => ({ ...f, url: e.target.value }))}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />
          <TextField
            label="Items JSON (optional)"
            size="small"
            multiline
            minRows={2}
            value={customForm.json}
            onChange={(e) => setCustomForm((f) => ({ ...f, json: e.target.value }))}
            placeholder={ITEM_HINTS[category]}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
                fontFamily: 'monospace',
                fontSize: '0.72rem',
              },
            }}
          />
          {formError && (
            <Typography variant="caption" color="error">
              {formError}
            </Typography>
          )}
          <Button
            variant="outlined"
            size="small"
            onClick={handleRegister}
            disabled={busyId === 'custom' || !customForm.name.trim()}
            sx={{
              alignSelf: 'flex-start',
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: 2,
            }}
          >
            {busyId === 'custom' ? 'Registering...' : 'Register'}
          </Button>
        </Box>

        {/* Scroll-edge affordance: a bottom fade appears only while there is
            more content below the fold, driven by an IntersectionObserver on
            the sentinel below (see useScrollEdgeFade). */}
        <Box ref={sentinelRef} aria-hidden sx={{ height: 1, flexShrink: 0 }} />
        <Box
          aria-hidden
          sx={{
            position: 'sticky',
            bottom: 0,
            height: 40,
            mt: '-40px',
            pointerEvents: 'none',
            opacity: showBottomFade ? 1 : 0,
            transition: 'opacity 200ms ease',
            background: `linear-gradient(to bottom, transparent, ${alpha(theme.palette.background.paper, 0.94)})`,
          }}
        />
      </FormDialog>

      <Popover
        open={!!helpAnchorEl}
        anchorEl={helpAnchorEl}
        onClose={() => setHelpAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { p: 2, maxWidth: 320, borderRadius: 2 } } }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
          How to import
        </Typography>
        <Box
          component="ol"
          sx={{ m: 0, pl: 2.5, display: 'flex', flexDirection: 'column', gap: 0.5 }}
        >
          <Typography component="li" variant="body2" color="text.secondary">
            Search an item by name, or open a library to see everything it offers.
          </Typography>
          <Typography component="li" variant="body2" color="text.secondary">
            Tick the items you want and press "Import selected", or use "Import all".
          </Typography>
          <Typography component="li" variant="body2" color="text.secondary">
            Imported items appear in this tab tagged "Imported", saved to your account only.
          </Typography>
          <Typography component="li" variant="body2" color="text.secondary">
            Use them with the same buttons as the built-in ones; remove a library any time.
          </Typography>
        </Box>
      </Popover>

      <Snackbar
        open={toast.open}
        autoHideDuration={3500}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={toast.severity}
          variant="filled"
          onClose={() => setToast((t) => ({ ...t, open: false }))}
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </>
  );
}

export function ImportFromButton({ category, onImported, sx }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const hasLiveCatalog = getProvidersForCategory(category).length > 0;
  return (
    <>
      <Button
        variant="outlined"
        size="small"
        startIcon={<CloudDownloadOutlinedIcon />}
        onClick={() => setOpen(true)}
        sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2, ...sx }}
      >
        Import
      </Button>
      {hasLiveCatalog && (
        <Button
          variant="text"
          size="small"
          startIcon={<TravelExploreIcon />}
          onClick={() => navigate(`/marketplace/import?category=${encodeURIComponent(category)}`)}
          sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2, ...sx }}
        >
          Catalog
        </Button>
      )}
      <ImportLibraryDialog
        open={open}
        onClose={() => setOpen(false)}
        category={category}
        onImported={onImported}
      />
    </>
  );
}
