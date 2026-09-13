import { Box, Typography, Chip } from '@mui/material';

const groupColors = {
  Webmaster: { bg: '#DBEAFE', color: '#2563EB' },
  Partner: { bg: '#D1FAE5', color: '#059669' },
};

export default function GroupTeamCell({ partner }) {
  const colors = groupColors[partner.group] || groupColors.Webmaster;
  const teams = partner.teams || [];
  const teamNames = teams.map((t) => t.name).filter(Boolean);

  return (
    <Box>
      <Typography variant="body2" sx={{ fontWeight: 500, lineHeight: 1.3 }}>
        {teamNames.length > 0
          ? teamNames.length === 1
            ? teamNames[0]
            : `${teamNames[0]} +${teamNames.length - 1}`
          : partner.team || '-'}
      </Typography>
      <Box sx={{ display: 'flex', gap: 0.5, mt: 0.3, flexWrap: 'wrap' }}>
        <Chip
          label={partner.group}
          size="small"
          sx={{
            height: 20,
            fontSize: '0.65rem',
            fontWeight: 600,
            bgcolor: colors.bg,
            color: colors.color,
          }}
        />
        {teams.length > 1 && (
          <Chip
            label={`${teams.length} teams`}
            size="small"
            sx={{
              height: 20,
              fontSize: '0.65rem',
              fontWeight: 600,
              bgcolor: 'action.hover',
              color: 'text.secondary',
            }}
          />
        )}
      </Box>
    </Box>
  );
}
