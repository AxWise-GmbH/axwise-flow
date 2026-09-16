import { Box, Stack, Typography, Chip, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import BentoCard from '../../../components/Common/BentoCard';
import AppIcon from '../../../components/icons/AppIcon';
import { PAGES_FEATURES } from '../data/pages';
import { docId } from '../data/searchIndex';
import { useAnchorHighlight } from '../hooks/useAnchorHighlight';

export default function ProductPagesSection({ highlightId }) {
  const theme = useTheme();
  const p = theme.palette;
  const isDark = p.mode === 'dark';
  useAnchorHighlight(highlightId, alpha(p.primary.main, 0.15));

  return (
    <BentoCard
      title="Product surface"
      subtitle={`${PAGES_FEATURES.length} pages`}
      icon={DashboardOutlinedIcon}
      iconColor={p.primary.main}
      minHeight={100}
    >
      <Box
        sx={{
          display: 'grid',
          gap: 1.25,
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr' },
        }}
      >
        {PAGES_FEATURES.map((page) => (
          <Box
            key={page.path}
            id={docId('page', page.path)}
            sx={{
              p: 1.75,
              borderRadius: 2.5,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: isDark ? alpha(p.background.paper, 0.5) : p.background.paper,
              transition: 'all 0.2s',
              '&:hover': {
                borderColor: alpha(p.primary.main, 0.5),
                transform: 'translateY(-2px)',
              },
            }}
          >
            <Stack direction="row" spacing={1.25} alignItems="flex-start">
              <Box
                sx={{
                  width: 34,
                  height: 34,
                  borderRadius: 1.75,
                  bgcolor: alpha(p.primary.main, isDark ? 0.16 : 0.1),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <AppIcon fallback={page.icon} sx={{ fontSize: 18, color: p.primary.main }} />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexWrap: 'wrap' }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.85rem' }}>
                    {page.name}
                  </Typography>
                  <Chip
                    label={page.path}
                    size="small"
                    sx={{ height: 18, fontSize: '0.6rem', borderRadius: 1, fontFamily: 'monospace' }}
                  />
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.5, display: 'block', mt: 0.5 }}>
                  {page.description}
                </Typography>
              </Box>
            </Stack>
          </Box>
        ))}
      </Box>
    </BentoCard>
  );
}
