import { Box, Paper, Typography, IconButton, Chip, alpha, useTheme } from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { formatFieldValue } from '../utils/fieldFormat';
import { createHoverGlowShadow } from '../../../theme/hoverGlow';

/**
 * Card-view tile for one entity (matches the /projects card layout): name +
 * the type's showInTable fields as uppercase-label / value rows.
 */
export default function EntityCard({ entity, fields, color, onMenu }) {
  const theme = useTheme();
  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 2.5,
        border: '1px solid',
        borderColor: 'divider',
        transition: 'transform .15s, border-color .15s, box-shadow .15s',
        '&:hover': {
          transform: 'translateY(-2px)',
          borderColor: alpha(color, 0.5),
          boxShadow: createHoverGlowShadow(theme),
        },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1.5 }}>
        <Box
          sx={{
            width: 32,
            height: 32,
            borderRadius: 2,
            bgcolor: alpha(color, 0.14),
            flexShrink: 0,
          }}
        />
        <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', flex: 1, minWidth: 0 }}>
          {entity.name}
        </Typography>
        <IconButton
          size="small"
          onClick={(e) => onMenu(e.currentTarget, entity)}
          aria-label="Row actions"
        >
          <MoreVertIcon fontSize="small" />
        </IconButton>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        {fields.map((f) => (
          <Box key={f.key}>
            <Typography
              variant="caption"
              sx={{
                color: 'text.disabled',
                fontWeight: 700,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                fontSize: '0.62rem',
                display: 'block',
              }}
            >
              {f.label}
            </Typography>
            {f.type === 'select' && entity.data?.[f.key] ? (
              <Chip
                label={formatFieldValue(f, entity.data?.[f.key])}
                size="small"
                sx={{
                  height: 20,
                  fontSize: '0.68rem',
                  mt: 0.25,
                  bgcolor: alpha(color, 0.12),
                  color,
                }}
              />
            ) : (
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {formatFieldValue(f, entity.data?.[f.key])}
              </Typography>
            )}
          </Box>
        ))}
      </Box>
    </Paper>
  );
}
