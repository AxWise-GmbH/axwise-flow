/**
 * ImageGrid — responsive thumbnail grid for generated image assets.
 *
 * 2 columns on mobile (xs), auto-fill 100px on desktop.
 * Each tile is clickable — opens the full-size image in a new tab.
 * Caption overlay at the bottom shows the slot label ("IG 1" etc).
 *
 * Tiles whose extractor matched a `goal_artifacts` row get a small ✨ pill
 * in the bottom-right corner. Clicking it opens the RefineModal directly
 * (no toggle pill row — the grid layout would shred). On success the
 * tile's `<img src>` swaps to the refined URL and a "v2" badge appears.
 * Cap of 2 refinements per tile, same as everywhere else.
 */
import { useState, useEffect, useCallback } from 'react';
import { Box, Typography, alpha, Tooltip } from '@mui/material';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import GroupHeader from './GroupHeader';
import RefineModal from '../../Deliverables/RefineModal';
import { listRefinements, startRefinement } from '../../Deliverables/deliverableRefineApi';
import GlassIcon from '../../icons/GlassIcon';

const THUMB_SIZE = 100;
const MAX_REFINEMENTS = 2;

function ImageTile({ item, G }) {
  const refinable = !!(item.parentKind && item.parentId);
  // per-tile state: list of done refinements + which version is selected.
  // We only fetch when the tile is refinable to keep network footprint small.
  const [refinements, setRefinements] = useState([]);
  const [selectedVersion, setSelectedVersion] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (!refinable) return undefined;
    let cancelled = false;
    listRefinements(item.parentKind, item.parentId)
      .then((rows) => {
        if (cancelled) return;
        const done = (Array.isArray(rows) ? rows : []).filter((r) => r.status === 'done');
        setRefinements(done);
      })
      .catch(() => {
        if (!cancelled) setRefinements([]);
      });
    return () => {
      cancelled = true;
    };
  }, [refinable, item.parentKind, item.parentId]);

  const handleSubmit = useCallback(
    async (prompt) => {
      const result = await startRefinement({
        kind: item.parentKind,
        parentId: item.parentId,
        prompt,
      });
      const newRow = {
        id: result.id,
        version: result.version,
        refined_url: result.refined_url,
        refined_content: result.refined_content,
        status: 'done',
      };
      setRefinements((prev) => [...prev, newRow]);
      setSelectedVersion(result.version);
      setModalOpen(false);
    },
    [item.parentKind, item.parentId]
  );

  // Display URL is original v1 OR the URL of the selected refinement.
  const activeRefinement =
    selectedVersion > 1 ? refinements.find((r) => r.version === selectedVersion) : null;
  const displayUrl = activeRefinement?.refined_url || item.url;
  const remaining = Math.max(0, MAX_REFINEMENTS - refinements.length);
  const atLimit = remaining === 0;

  return (
    <Box
      sx={{
        position: 'relative',
        borderRadius: 0.75,
        overflow: 'hidden',
        border: '1px solid',
        borderColor: alpha(G, 0.2),
        aspectRatio: '1',
        transition: 'transform 0.15s, border-color 0.15s',
        '&:hover': {
          borderColor: G,
          transform: 'scale(1.02)',
        },
      }}
    >
      {/* Tile image — full-bleed, click to open in new tab */}
      <Box
        component="a"
        href={displayUrl}
        target="_blank"
        rel="noopener noreferrer"
        sx={{ position: 'absolute', inset: 0, display: 'block' }}
      >
        <Box
          component="img"
          src={displayUrl}
          alt={item.slot}
          loading="lazy"
          sx={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
        />
      </Box>

      {/* Version badge — top-left, shows when a non-original version is selected */}
      {selectedVersion > 1 && (
        <Tooltip
          title={`Showing v${selectedVersion}. Click to flip back to original.`}
          placement="right"
          arrow
        >
          <Box
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setSelectedVersion(1);
            }}
            sx={{
              position: 'absolute',
              top: 4,
              left: 4,
              px: 0.75,
              py: 0.25,
              borderRadius: 5,
              bgcolor: alpha(G, 0.92),
              color: '#fff',
              fontSize: '0.55rem',
              fontWeight: 800,
              letterSpacing: '0.04em',
              cursor: 'pointer',
              userSelect: 'none',
              zIndex: 2,
            }}
          >
            v{selectedVersion}
          </Box>
        </Tooltip>
      )}

      {/* Toggle to v1 vs latest refined (when at least one refinement exists) */}
      {refinements.length > 0 && selectedVersion === 1 && (
        <Tooltip
          title={`${refinements.length} refinement${refinements.length > 1 ? 's' : ''} available — click to view v${refinements[refinements.length - 1].version}.`}
          placement="right"
          arrow
        >
          <Box
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setSelectedVersion(refinements[refinements.length - 1].version);
            }}
            sx={{
              position: 'absolute',
              top: 4,
              left: 4,
              px: 0.75,
              py: 0.25,
              borderRadius: 5,
              bgcolor: alpha('#000', 0.55),
              color: '#fff',
              fontSize: '0.55rem',
              fontWeight: 700,
              letterSpacing: '0.04em',
              cursor: 'pointer',
              userSelect: 'none',
              zIndex: 2,
            }}
          >
            v1
          </Box>
        </Tooltip>
      )}

      {/* ✨ Improve pill — bottom-right, only when the tile has a backing artifact */}
      {refinable && (
        <Tooltip
          title={
            atLimit
              ? `Improvement limit reached (${MAX_REFINEMENTS}/${MAX_REFINEMENTS})`
              : `Improve image — ${remaining} of ${MAX_REFINEMENTS} left`
          }
          placement="left"
          arrow
        >
          <Box
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!atLimit) setModalOpen(true);
            }}
            sx={{
              position: 'absolute',
              bottom: 4,
              right: 4,
              px: 0.75,
              py: 0.35,
              borderRadius: 5,
              bgcolor: atLimit ? alpha('#000', 0.45) : alpha(G, 0.92),
              color: '#fff',
              fontSize: '0.55rem',
              fontWeight: 700,
              letterSpacing: '0.04em',
              cursor: atLimit ? 'not-allowed' : 'pointer',
              userSelect: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 0.25,
              zIndex: 2,
              opacity: atLimit ? 0.7 : 1,
              '&:hover': atLimit ? {} : { bgcolor: G },
            }}
          >
            <GlassIcon name="LightbulbOutlined" size={10} tone="neutral" />
            {atLimit ? 'Limit' : 'Improve'}
          </Box>
        </Tooltip>
      )}

      {/* Caption overlay — bottom strip across the full width */}
      <Box
        sx={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          p: 0.5,
          pr: refinable ? 8 : 0.5, // leave room for the Improve pill on the right
          bgcolor: 'rgba(0,0,0,0.55)',
          color: '#fff',
          zIndex: 1,
        }}
      >
        <Typography
          sx={{
            fontSize: '0.58rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {item.slot}
        </Typography>
      </Box>

      <RefineModal
        open={modalOpen}
        kind={item.parentKind}
        remaining={remaining}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmit}
      />
    </Box>
  );
}

export default function ImageGrid({ items, icon, label, G, glassIconName }) {
  return (
    <Box>
      <GroupHeader
        icon={icon}
        glassIconName={glassIconName}
        label={label}
        count={items.length}
        G={G}
      />
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: 'repeat(2, 1fr)',
            sm: `repeat(auto-fill, minmax(${THUMB_SIZE}px, 1fr))`,
          },
          gap: 1,
          p: 1,
          borderRadius: 1,
          border: '1px solid',
          borderColor: alpha(G, 0.15),
          bgcolor: alpha(G, 0.03),
        }}
      >
        {items.map((item) => (
          <ImageTile key={item.url} item={item} G={G} />
        ))}
      </Box>
    </Box>
  );
}
