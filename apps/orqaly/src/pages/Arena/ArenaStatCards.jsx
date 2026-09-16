import { Box, Paper, Typography, alpha, useTheme } from '@mui/material';

/**
 * The metrics strip. Same shape the rest of the platform uses (Projects,
 * Permissions, Notifications): tinted card, label, big number, helper line, and
 * an icon tile on the right.
 *
 * A card whose value is null renders a dash rather than a zero - on this page
 * "no rate was set" and "it cost nothing" must never look the same.
 */
export default function ArenaStatCards({ cards, columns = 5 }) {
  const theme = useTheme();

  return (
    <Box
      sx={{
        display: 'grid',
        gap: 1.25,
        gridTemplateColumns: {
          xs: 'repeat(2, minmax(0, 1fr))',
          sm: 'repeat(2, minmax(0, 1fr))',
          md: 'repeat(3, minmax(0, 1fr))',
          lg: `repeat(${columns}, minmax(0, 1fr))`,
        },
      }}
    >
      {cards.map((card) => {
        const Icon = card.icon;
        const color = card.color || theme.palette.primary.main;
        return (
          <Paper
            key={card.label}
            elevation={0}
            data-testid={`arena-stat-${card.key || card.label}`}
            sx={{
              p: 1.5,
              borderRadius: 2.5,
              border: '1px solid',
              borderColor: alpha(color, 0.22),
              background: `linear-gradient(135deg, ${alpha(color, 0.1)} 0%, ${alpha(theme.palette.background.paper, 0.98)} 70%)`,
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 1,
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                  {card.label}
                </Typography>
                <Typography
                  sx={{
                    fontSize: '1.35rem',
                    fontWeight: 800,
                    color: 'text.primary',
                    lineHeight: 1.15,
                    mt: 0.45,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {card.value}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ color: 'text.secondary', display: 'block', mt: 0.35 }}
                >
                  {card.helper}
                </Typography>
              </Box>
              {Icon && (
                <Box
                  sx={{
                    width: 34,
                    height: 34,
                    borderRadius: 2,
                    bgcolor: alpha(color, 0.16),
                    color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Icon sx={{ fontSize: 18 }} />
                </Box>
              )}
            </Box>
          </Paper>
        );
      })}
    </Box>
  );
}
