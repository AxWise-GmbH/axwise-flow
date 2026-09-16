import { useState, useCallback, useMemo } from 'react';
import {
  Box,
  Button,
  Divider,
  IconButton,
  Popover,
  Stack,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import FilterListOutlinedIcon from '@mui/icons-material/FilterListOutlined';
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import AppIcon from '../../components/icons/AppIcon';

export const SETTINGS_PINNED_ID = 'profile';
// Storage keys are derived from a prefix so the same layout engine can back
// several independent surfaces (Settings, Home, ...) without colliding. The
// default prefix preserves the original Settings keys for existing users.
const DEFAULT_STORAGE_PREFIX = 'orch_settings';
const hiddenKeyFor = (prefix) => `${prefix}_hidden_sections`;
const orderKeyFor = (prefix) => `${prefix}_section_order`;
const widthsKeyFor = (prefix) => `${prefix}_block_widths`;

function readHiddenSet(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function readSectionOrder(sortableKeys, key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return sortableKeys;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return sortableKeys;
    const known = new Set(sortableKeys);
    const filtered = parsed.filter((id) => known.has(id));
    const missing = sortableKeys.filter((id) => !filtered.includes(id));
    return [...filtered, ...missing];
  } catch {
    return sortableKeys;
  }
}

function SettingsBlockOptionRow({ id, label, hidden, sortable, onToggle }) {
  const theme = useTheme();
  const sortableApi = useSortable({ id, disabled: !sortable });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = sortableApi;
  const rowRef = sortable ? setNodeRef : undefined;
  const style = sortable
    ? {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 2 : undefined,
      }
    : undefined;

  return (
    <Box
      ref={rowRef}
      role="listitem"
      style={style}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 1,
        py: 1.25,
        bgcolor: isDragging ? alpha(theme.palette.primary.main, 0.08) : 'transparent',
        boxShadow: isDragging ? `0 4px 16px ${alpha(theme.palette.common.black, 0.18)}` : 'none',
        borderRadius: isDragging ? 1.5 : 0,
        '&:not(:last-of-type)': { borderBottom: '1px solid', borderColor: 'divider' },
      }}
    >
      <Box
        {...(sortable ? { ...attributes, ...listeners } : {})}
        aria-label={sortable ? `Drag to reorder ${label}` : `${label} stays at top`}
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 32,
          height: 32,
          flexShrink: 0,
          color: sortable ? 'text.secondary' : 'text.disabled',
          cursor: sortable ? (isDragging ? 'grabbing' : 'grab') : 'not-allowed',
          touchAction: 'none',
        }}
      >
        {sortable ? (
          <AppIcon name="DragIndicator" fallback={DragIndicatorIcon} fontSize="small" />
        ) : (
          <AppIcon name="LockOutlined" fallback={LockOutlinedIcon} fontSize="small" />
        )}
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
        {label}
      </Typography>
      <Button
        size="small"
        onClick={() => onToggle(id)}
        startIcon={
          hidden ? (
            <AppIcon name="VisibilityOff" fallback={VisibilityOffIcon} fontSize="small" />
          ) : (
            <AppIcon name="Visibility" fallback={VisibilityIcon} fontSize="small" />
          )
        }
        aria-label={`${hidden ? 'Show' : 'Hide'} ${label}`}
        sx={{
          textTransform: 'none',
          fontWeight: 700,
          minWidth: 76,
          color: hidden ? 'primary.main' : 'text.secondary',
        }}
      >
        {hidden ? 'Show' : 'Hide'}
      </Button>
    </Box>
  );
}

/**
 * The reorder/hide block list (Show all / Hide all / Reset header + drag list).
 * Extracted so it can live inside a popover (SettingsViewOptionsButton) or be
 * embedded directly in another surface (e.g. the Home filter dialog).
 */
export function SettingsBlockOptionsList({
  title = 'Blocks',
  pinnedLabel,
  pinnedId = SETTINGS_PINNED_ID,
  sortableKeys,
  labels,
  hiddenSections,
  sectionOrder,
  onToggle,
  onReorder,
  onShowAll,
  onHideAll,
  onReset,
}) {
  const allKeys = [
    ...(pinnedId ? [pinnedId] : []),
    ...sectionOrder.filter((id) => sortableKeys.includes(id)),
  ];
  const hiddenCount = allKeys.reduce((n, id) => n + (hiddenSections.has(id) ? 1 : 0), 0);
  const totalCount = allKeys.length;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sectionOrder.indexOf(active.id);
    const newIndex = sectionOrder.indexOf(over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(sectionOrder, oldIndex, newIndex));
  };

  return (
    <Box>
      <Box sx={{ px: 1, pt: 0.5, pb: 1 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
            mb: 0.25,
          }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
            {title}
          </Typography>
          <Stack direction="row" spacing={0.5}>
            <Button
              size="small"
              onClick={onShowAll}
              disabled={hiddenCount === 0}
              sx={{ textTransform: 'none', fontWeight: 700, minWidth: 0 }}
            >
              Show all
            </Button>
            <Button
              size="small"
              onClick={onHideAll}
              disabled={hiddenCount === totalCount}
              sx={{ textTransform: 'none', fontWeight: 700, minWidth: 0 }}
            >
              Hide all
            </Button>
            <Button
              size="small"
              onClick={onReset}
              sx={{ textTransform: 'none', fontWeight: 700, minWidth: 0 }}
            >
              Reset
            </Button>
          </Stack>
        </Box>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          Drag{' '}
          <AppIcon
            name="DragIndicator"
            fallback={DragIndicatorIcon}
            sx={{ fontSize: 14, verticalAlign: -2 }}
          />{' '}
          to reorder.
          {pinnedId && pinnedLabel ? ` ${pinnedLabel} stays at top.` : ''}
        </Typography>
      </Box>
      <Box sx={{ maxHeight: { xs: '50vh', sm: 360 }, overflowY: 'auto' }} role="list">
        {pinnedId && (
          <SettingsBlockOptionRow
            id={pinnedId}
            label={pinnedLabel}
            hidden={hiddenSections.has(pinnedId)}
            sortable={false}
            onToggle={onToggle}
          />
        )}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sectionOrder} strategy={verticalListSortingStrategy}>
            {sectionOrder.map((id) => (
              <SettingsBlockOptionRow
                key={id}
                id={id}
                label={labels[id] || id}
                hidden={hiddenSections.has(id)}
                sortable
                onToggle={onToggle}
              />
            ))}
          </SortableContext>
        </DndContext>
      </Box>
    </Box>
  );
}

export function SettingsViewOptionsButton({
  pinnedLabel,
  pinnedId = SETTINGS_PINNED_ID,
  sortableKeys,
  labels,
  hiddenSections,
  sectionOrder,
  onToggle,
  onReorder,
  onShowAll,
  onHideAll,
  onReset,
  iconOnly = true,
}) {
  const theme = useTheme();
  const [anchor, setAnchor] = useState(null);
  const open = Boolean(anchor);
  const allKeys = [
    ...(pinnedId ? [pinnedId] : []),
    ...sectionOrder.filter((id) => sortableKeys.includes(id)),
  ];
  const hiddenCount = allKeys.reduce((n, id) => n + (hiddenSections.has(id) ? 1 : 0), 0);

  return (
    <>
      {iconOnly ? (
        <IconButton
          size="small"
          onClick={(e) => setAnchor(e.currentTarget)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={hiddenCount > 0 ? `View options, ${hiddenCount} hidden` : 'View options'}
          sx={{
            flexShrink: 0,
            width: 44,
            height: 44,
            borderRadius: 0,
            borderLeft: '1px solid',
            borderColor: alpha(
              theme.palette.primary.main,
              theme.palette.mode === 'dark' ? 0.22 : 0.14
            ),
            color: 'text.primary',
          }}
        >
          <AppIcon name="FilterListOutlined" fallback={FilterListOutlinedIcon} fontSize="small" />
        </IconButton>
      ) : (
        <Button
          size="small"
          variant="outlined"
          startIcon={
            <AppIcon name="FilterListOutlined" fallback={FilterListOutlinedIcon} fontSize="small" />
          }
          onClick={(e) => setAnchor(e.currentTarget)}
          aria-haspopup="dialog"
          aria-expanded={open}
          sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 999 }}
        >
          View options{hiddenCount > 0 ? ` · ${hiddenCount} hidden` : ''}
        </Button>
      )}
      <Popover
        open={open}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: {
              mt: 1,
              width: { xs: 'calc(100vw - 32px)', sm: 380 },
              maxWidth: 'calc(100vw - 32px)',
              borderRadius: 2,
              boxShadow: 6,
              overflow: 'hidden',
            },
          },
        }}
      >
        <Box sx={{ px: 1, pt: 1 }}>
          <SettingsBlockOptionsList
            title="Settings blocks"
            pinnedLabel={pinnedLabel}
            pinnedId={pinnedId}
            sortableKeys={sortableKeys}
            labels={labels}
            hiddenSections={hiddenSections}
            sectionOrder={sectionOrder}
            onToggle={onToggle}
            onReorder={onReorder}
            onShowAll={onShowAll}
            onHideAll={onHideAll}
            onReset={onReset}
          />
        </Box>
      </Popover>
    </>
  );
}

export function useSettingsBlockLayout(
  sectionDefs,
  { storagePrefix = DEFAULT_STORAGE_PREFIX, pinnedId = SETTINGS_PINNED_ID } = {}
) {
  const availableDefs = sectionDefs;
  const hiddenKey = hiddenKeyFor(storagePrefix);
  const orderKey = orderKeyFor(storagePrefix);
  const widthsKey = widthsKeyFor(storagePrefix);
  const availableIds = useMemo(() => availableDefs.map((section) => section.id), [availableDefs]);
  const sortableKeys = useMemo(
    () => availableIds.filter((id) => id !== pinnedId),
    [availableIds, pinnedId]
  );
  const labels = useMemo(
    () => Object.fromEntries(availableDefs.map((section) => [section.id, section.label])),
    [availableDefs]
  );

  const [hiddenSections, setHiddenSections] = useState(() => readHiddenSet(hiddenKey));
  const [sectionOrder, setSectionOrder] = useState(() => readSectionOrder(sortableKeys, orderKey));
  // Block ids rendered at half width. Set only by applying a template.
  const [blockWidths, setBlockWidths] = useState(() => readHiddenSet(widthsKey));

  const persistHidden = useCallback(
    (next) => {
      try {
        localStorage.setItem(hiddenKey, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
    },
    [hiddenKey]
  );
  const persistOrder = useCallback(
    (next) => {
      try {
        localStorage.setItem(orderKey, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    },
    [orderKey]
  );
  const persistWidths = useCallback(
    (next) => {
      try {
        localStorage.setItem(widthsKey, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
    },
    [widthsKey]
  );

  const toggleSection = useCallback(
    (id) => {
      setHiddenSections((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        persistHidden(next);
        return next;
      });
    },
    [persistHidden]
  );

  const showAllSections = useCallback(() => {
    setHiddenSections(() => {
      const next = new Set();
      persistHidden(next);
      return next;
    });
  }, [persistHidden]);

  const hideAllSections = useCallback(() => {
    setHiddenSections(() => {
      const next = new Set(availableIds);
      persistHidden(next);
      return next;
    });
  }, [availableIds, persistHidden]);

  const resetLayout = useCallback(() => {
    setHiddenSections(() => {
      const next = new Set();
      persistHidden(next);
      return next;
    });
    setSectionOrder(sortableKeys);
    persistOrder(sortableKeys);
    setBlockWidths(() => {
      const next = new Set();
      persistWidths(next);
      return next;
    });
  }, [persistHidden, persistOrder, persistWidths, sortableKeys]);

  const reorderSections = useCallback(
    (next) => {
      setSectionOrder(next);
      persistOrder(next);
    },
    [persistOrder]
  );

  // Apply a full layout snapshot (a template) atomically. `order` is sanitized
  // against the known sortable keys (unknown ids dropped, missing ones appended)
  // so a saved template keeps working after blocks are added or removed.
  const applyLayout = useCallback(
    ({ hidden = [], order = [], widths = [] } = {}) => {
      const known = new Set(sortableKeys);
      const filteredOrder = order.filter((id) => known.has(id));
      const missing = sortableKeys.filter((id) => !filteredOrder.includes(id));
      const nextOrder = [...filteredOrder, ...missing];
      const nextHidden = new Set((hidden || []).filter((id) => availableIds.includes(id)));
      const nextWidths = new Set((widths || []).filter((id) => availableIds.includes(id)));
      setSectionOrder(nextOrder);
      persistOrder(nextOrder);
      setHiddenSections(nextHidden);
      persistHidden(nextHidden);
      setBlockWidths(nextWidths);
      persistWidths(nextWidths);
    },
    [sortableKeys, availableIds, persistOrder, persistHidden, persistWidths]
  );

  const isSectionHidden = useCallback((id) => hiddenSections.has(id), [hiddenSections]);

  const getSectionOrder = useCallback(
    (id) => {
      if (pinnedId && id === pinnedId) return 0;
      const idx = sectionOrder.indexOf(id);
      return idx >= 0 ? idx + 1 : 999;
    },
    [sectionOrder, pinnedId]
  );

  const navSections = useMemo(() => {
    const orderedIds = [...(pinnedId ? [pinnedId] : []), ...sectionOrder].filter(
      (id, index, arr) => arr.indexOf(id) === index && availableIds.includes(id)
    );
    return orderedIds
      .filter((id) => !hiddenSections.has(id))
      .map((id) => availableDefs.find((section) => section.id === id))
      .filter(Boolean);
  }, [availableDefs, availableIds, hiddenSections, sectionOrder, pinnedId]);

  return {
    hiddenSections,
    sectionOrder,
    blockWidths,
    sortableKeys,
    labels,
    navSections,
    toggleSection,
    reorderSections,
    showAllSections,
    hideAllSections,
    resetLayout,
    applyLayout,
    isSectionHidden,
    getSectionOrder,
  };
}
