/**
 * ToolSelector - renders the "Pick your tool" card inside the calibration
 * wizard for categories that have a tool catalog (currently only presentation).
 *
 * For categories with no catalog entries, the parent skips rendering this
 * and falls back to auto-generation.
 */
import { Box, Paper, Typography, Chip, Grid } from '@mui/material';
import { listToolsForDeliverable } from '../../../shared/deliverableToolsCatalog';

function StarRating({ count }) {
  const filled = '★'.repeat(count);
  const empty = '☆'.repeat(5 - count);
  return (
    <Typography
      component="span"
      sx={{ fontSize: '0.7rem', color: 'warning.main', letterSpacing: 1 }}
    >
      {filled}
      <Typography component="span" sx={{ color: 'text.disabled' }}>
        {empty}
      </Typography>
    </Typography>
  );
}

export default function ToolSelector({ deliverableType, value, onChange }) {
  const tools = listToolsForDeliverable(deliverableType);
  if (tools.length === 0) return null;
  // Hide the selector entirely when there's only one option - the wizard
  // pre-selects it silently. Showing a single-card grid would be visual noise.
  if (tools.length === 1) return null;

  return (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5, bgcolor: 'background.default' }}>
      <Typography
        variant="caption"
        sx={{
          fontWeight: 700,
          fontSize: '0.65rem',
          textTransform: 'uppercase',
          color: 'text.secondary',
          display: 'block',
          mb: 1,
        }}
      >
        Pick your tool
      </Typography>

      <Grid container spacing={1}>
        {tools.map((tool) => {
          const selected = value === tool.id;
          const clickable = tool.enabled;
          return (
            <Grid item xs={12} sm={6} key={tool.id}>
              <Paper
                variant="outlined"
                onClick={() => clickable && onChange(tool.id)}
                sx={{
                  p: 1.25,
                  cursor: clickable ? 'pointer' : 'not-allowed',
                  opacity: clickable ? 1 : 0.55,
                  borderColor: selected ? 'primary.main' : 'divider',
                  borderWidth: selected ? 2 : 1,
                  transition: 'border-color 120ms',
                  '&:hover': {
                    borderColor: clickable ? 'primary.main' : 'divider',
                  },
                  position: 'relative',
                  height: '100%',
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 1,
                    mb: 0.5,
                  }}
                >
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.8rem' }} noWrap>
                      {tool.name}
                    </Typography>
                    <StarRating count={tool.quality_stars} />
                  </Box>
                  <Chip
                    size="small"
                    label={tool.price_label}
                    color={tool.tier === 'free' ? 'success' : 'default'}
                    sx={{ height: 18, fontSize: '0.6rem', flexShrink: 0 }}
                  />
                </Box>

                <Typography
                  variant="caption"
                  sx={{
                    fontSize: '0.65rem',
                    color: 'text.secondary',
                    display: 'block',
                    lineHeight: 1.3,
                    mb: tool.enabled ? 0 : 0.5,
                  }}
                >
                  {tool.description}
                </Typography>

                {!tool.enabled && (
                  <Chip
                    size="small"
                    label="Coming soon"
                    sx={{
                      height: 16,
                      fontSize: '0.55rem',
                      mt: 0.25,
                      bgcolor: 'action.disabledBackground',
                      color: 'text.secondary',
                    }}
                  />
                )}
              </Paper>
            </Grid>
          );
        })}
      </Grid>

      <Typography
        variant="caption"
        sx={{
          fontSize: '0.6rem',
          color: 'text.disabled',
          display: 'block',
          mt: 0.75,
          fontStyle: 'italic',
        }}
      >
        Paid options will become clickable once payment integration ships. For now use the free
        option.
      </Typography>
    </Paper>
  );
}
