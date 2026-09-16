/**
 * DeliverableRow — shared compact horizontal row used by every Group
 * component in the Final Results block.
 *
 * Layout: small preview tile on the left (140×90 desktop, full-width
 * 140-tall on mobile), bold title + dim metadata in the middle
 * (flex: 1), action buttons stacked on the right. Wraps vertically on
 * screens narrower than 600px so preview sits above the title/actions.
 *
 * Props:
 *   preview — React node rendered inside the left preview tile
 *             (usually an <img> or an <IconTile>)
 *   title   — bold primary text (task title or filename)
 *   meta    — array of strings for dim secondary lines; first line is
 *             monospace-formatted (good for URLs and filenames)
 *   actions — array of { label, href?, onClick?, icon?, download? };
 *             the first action renders as an outlined button, the rest
 *             as text buttons
 *   G       — theme primary color, passed from parent
 */
import { Box, Typography, Button, alpha } from '@mui/material';
import VersionPicker from '../../Deliverables/VersionPicker';

const PREVIEW_W = 140;
const PREVIEW_H = 90;

// Backend hasn't shipped refiners for these goal_artifact subkinds yet.
// VersionPicker uses this to render a disabled Improve button with a
// clearer "coming soon" tooltip rather than letting the request 400.
const DISABLED_ARTIFACT_KINDS = ['data'];

export default function DeliverableRow({
  preview,
  title,
  meta,
  actions,
  G,
  extraMeta,
  // New props plumbed through by extractors → group components → here.
  // When all are present, an Improve quality picker renders below the
  // meta lines. When missing, the row stays exactly as before.
  parentKind,
  parentId,
  originalValue,
  originalUrl,
  artifactKind,
  onVersionChange,
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        alignItems: { xs: 'stretch', sm: 'center' },
        gap: { xs: 1, sm: 1.5 },
        p: 1,
        borderRadius: 1,
        border: '1px solid',
        borderColor: alpha(G, 0.15),
        bgcolor: alpha(G, 0.03),
        transition: 'border-color 0.15s',
        '&:hover': { borderColor: alpha(G, 0.35) },
      }}
    >
      {/* Preview */}
      <Box
        sx={{
          width: { xs: '100%', sm: PREVIEW_W },
          height: { xs: 140, sm: PREVIEW_H },
          flexShrink: 0,
          borderRadius: 0.75,
          overflow: 'hidden',
          border: '1px solid',
          borderColor: alpha(G, 0.2),
          bgcolor: alpha(G, 0.05),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {preview}
      </Box>

      {/* Title + metadata */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          sx={{
            fontSize: '0.82rem',
            fontWeight: 700,
            color: 'text.primary',
            lineHeight: 1.3,
            mb: 0.4,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </Typography>
        {meta &&
          meta.filter(Boolean).map((line, i) => (
            <Typography
              key={`meta-${i}`}
              sx={{
                fontSize: '0.7rem',
                color: alpha(G, 0.7),
                lineHeight: 1.4,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontFamily: i === 0 ? 'monospace' : undefined,
              }}
            >
              {line}
            </Typography>
          ))}

        {extraMeta}

        {parentKind && parentId && (
          <Box sx={{ mt: 0.5 }}>
            <VersionPicker
              kind={parentKind}
              parentId={parentId}
              originalValue={originalValue || ''}
              originalUrl={originalUrl || null}
              artifactKind={artifactKind}
              disabledKinds={DISABLED_ARTIFACT_KINDS}
              onSelectVersion={(value) => onVersionChange?.(parentId, value)}
              compact
            />
          </Box>
        )}
      </Box>

      {/* Actions */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'row', sm: 'column' },
          gap: 0.5,
          flexShrink: 0,
          width: { xs: '100%', sm: 'auto' },
        }}
      >
        {actions.map((action, i) => (
          <Button
            key={`a-${i}`}
            size="small"
            variant={i === 0 ? 'outlined' : 'text'}
            href={action.href}
            download={action.download || undefined}
            target={action.download ? undefined : '_blank'}
            rel="noopener noreferrer"
            onClick={action.onClick}
            startIcon={action.icon || undefined}
            sx={{
              fontSize: '0.65rem',
              textTransform: 'none',
              minWidth: { xs: 0, sm: 120 },
              flex: { xs: 1, sm: 'none' },
              color: G,
              borderColor: i === 0 ? alpha(G, 0.35) : 'transparent',
              justifyContent: { xs: 'center', sm: 'flex-start' },
              whiteSpace: 'nowrap',
              '&:hover': {
                borderColor: i === 0 ? G : 'transparent',
                bgcolor: alpha(G, 0.08),
              },
            }}
          >
            {action.label}
          </Button>
        ))}
      </Box>
    </Box>
  );
}
