import { useMemo } from 'react';
import { Box, Typography, useMediaQuery, useTheme } from '@mui/material';
import { Responsive, WidthProvider } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

import { getBlockComponent, BLOCK_REGISTRY } from './blockRegistry';
import BlockErrorBoundary from './BlockErrorBoundary';
import { exportBlockAsCsv } from '../../utils/csvExport';

const ResponsiveGridLayout = WidthProvider(Responsive);

const COLS = { lg: 12, md: 12, sm: 6, xs: 4, xxs: 2 };
const BREAKPOINTS = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 };

/**
 * Render a dashboard config as a responsive grid.
 *
 * Props:
 *   - blocks: Block[]
 *   - layout: LayoutItem[] (lg breakpoint)
 *   - resultsById: { [blockId]: { rows, total, error } | undefined }
 *   - loading: boolean
 *   - editable: boolean — show drag handles + per-block menus
 *   - onLayoutChange(newLayout)
 *   - onBlockAction(action, block) — action ∈ 'configure'|'duplicate'|'delete'
 *   - onSegmentClick({ dim, value }) — cross-filter
 *   - onRowClick({ dim, value })
 */
export default function DashboardGrid({
  blocks = [],
  layout = [],
  resultsById = {},
  loading = false,
  editable = false,
  onLayoutChange,
  onBlockAction,
  onSegmentClick,
  onRowClick,
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const layouts = useMemo(() => {
    // Use the lg layout for all breakpoints — react-grid-layout will adapt.
    const lg = blocks.map((b) => {
      const existing = layout.find((l) => l.i === b.id);
      if (existing) return existing;
      const def = BLOCK_REGISTRY[b.type]?.defaultLayout || { w: 4, h: 3 };
      return { i: b.id, x: 0, y: Infinity, w: def.w, h: def.h };
    });
    return { lg };
  }, [blocks, layout]);

  if (!blocks.length) {
    return (
      <Box
        sx={{
          py: 6,
          textAlign: 'center',
          border: '1px dashed',
          borderColor: 'divider',
          borderRadius: 3,
          bgcolor: 'background.default',
        }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
          {editable ? 'Add your first block' : 'This dashboard has no blocks'}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {editable
            ? 'Click "Add block" above to start composing.'
            : 'Open in edit mode to add blocks.'}
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        touchAction: isMobile ? 'pan-y' : 'auto',
        // Override RGL default styles for parity with theme
        '& .react-grid-item': {
          transition: 'transform 0.18s ease, box-shadow 0.18s ease',
          ...(isMobile ? { touchAction: 'pan-y' } : {}),
        },
        '& .react-grid-item.react-grid-placeholder': {
          background: (t) => t.palette.primary.main,
          opacity: 0.12,
          borderRadius: 12,
        },
        '& .react-grid-item > .react-resizable-handle': {
          opacity: editable ? 0.5 : 0,
        },
        '& .react-grid-item > .react-resizable-handle:hover': {
          opacity: editable ? 1 : 0,
        },
      }}
    >
      <ResponsiveGridLayout
        className="dashboard-grid"
        breakpoints={BREAKPOINTS}
        cols={COLS}
        layouts={layouts}
        // 48px rows + 6px margins keep blocks compact but readable. Horizontal
        // compaction pulls blocks leftward within their row, so any gap the
        // LLM (or a user drag) leaves between blocks auto-closes — the
        // dashboard always looks neat without anyone hand-aligning columns.
        rowHeight={48}
        margin={[6, 6]}
        containerPadding={[0, 0]}
        isDraggable={editable && !isMobile}
        isResizable={editable && !isMobile}
        draggableHandle=".block-drag-handle"
        onLayoutChange={(current, all) => onLayoutChange && onLayoutChange(current, all)}
        compactType="horizontal"
      >
        {blocks.map((block) => {
          const Component = getBlockComponent(block.type);
          if (!Component) {
            return (
              <Box key={block.id}>
                <Typography variant="caption" color="error">
                  Unknown block type: {block.type}
                </Typography>
              </Box>
            );
          }
          const result = resultsById[block.id];
          return (
            <Box key={block.id} sx={{ display: 'flex' }}>
              <BlockErrorBoundary>
                <Component
                  block={block}
                  data={result}
                  loading={loading && !result}
                  error={result?.error || ''}
                  editable={editable}
                  onConfigure={editable ? () => onBlockAction?.('configure', block) : undefined}
                  onDuplicate={editable ? () => onBlockAction?.('duplicate', block) : undefined}
                  onDelete={editable ? () => onBlockAction?.('delete', block) : undefined}
                  onExportCsv={() => exportBlockAsCsv(block, result)}
                  onSegmentClick={onSegmentClick}
                  onRowClick={onRowClick}
                />
              </BlockErrorBoundary>
            </Box>
          );
        })}
      </ResponsiveGridLayout>
    </Box>
  );
}
