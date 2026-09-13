import { Box, Typography, Switch, Paper, Chip, Button, alpha, useTheme } from '@mui/material';
import WidgetsOutlinedIcon from '@mui/icons-material/WidgetsOutlined';
import BentoCard from '../Common/BentoCard';
import AppIcon from '../icons/AppIcon';
import {
  FEATURE_CATEGORIES,
  MARKETPLACE_FEATURES,
  FEATURE_ICON_MAP,
} from '../../config/featureMarketplace';
import { useEnabledFeatures } from '../../hooks/useEnabledFeatures';

export default function FeatureMarketplace() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const { enabledFeatures, isFeatureEnabled, toggleFeature, setEnabledFeatures } =
    useEnabledFeatures();
  const enabledCount = enabledFeatures.length;
  const totalCount = MARKETPLACE_FEATURES.length;

  return (
    <BentoCard
      title="Feature Marketplace"
      subtitle="Add features to your sidebar"
      icon={WidgetsOutlinedIcon}
      iconColor={theme.palette.secondary.main}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {FEATURE_CATEGORIES.map((category) => {
          const features = MARKETPLACE_FEATURES.filter((f) => f.categoryId === category.id);
          const accent = theme.palette[category.color]?.main || theme.palette.primary.main;

          return (
            <Paper
              key={category.id}
              elevation={0}
              sx={{
                borderRadius: 2.5,
                border: '1px solid',
                borderColor: 'divider',
                overflow: 'hidden',
              }}
            >
              {/* Category header */}
              <Box
                sx={{
                  px: 2,
                  py: 1.25,
                  bgcolor: isDark ? alpha(accent, 0.06) : alpha(accent, 0.04),
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Typography
                  variant="overline"
                  sx={{
                    fontWeight: 700,
                    fontSize: '0.7rem',
                    letterSpacing: '0.08em',
                    color: accent,
                    display: 'block',
                    lineHeight: 1.4,
                  }}
                >
                  {category.label}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.3 }}>
                  {category.description}
                </Typography>
              </Box>

              {/* Feature rows */}
              <Box sx={{ px: 1.5, py: 0.5 }}>
                {features.map((feature, idx) => {
                  const Icon = FEATURE_ICON_MAP[feature.iconName];
                  const enabled = isFeatureEnabled(feature.id);

                  return (
                    <Box
                      key={feature.id}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.5,
                        py: 1.25,
                        borderTop: idx > 0 ? '1px solid' : 'none',
                        borderColor: alpha(theme.palette.divider, 0.5),
                      }}
                    >
                      {/* Icon */}
                      <Box
                        sx={{
                          width: 36,
                          height: 36,
                          borderRadius: 1.5,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          bgcolor: enabled
                            ? alpha(accent, 0.15)
                            : alpha(theme.palette.text.primary, 0.06),
                          color: enabled ? accent : 'text.secondary',
                          flexShrink: 0,
                          transition: 'all 0.2s ease',
                        }}
                      >
                        {Icon && <AppIcon name={feature.iconName} fallback={Icon} size={20} />}
                      </Box>

                      {/* Text */}
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 600,
                            lineHeight: 1.3,
                            color: enabled ? 'text.primary' : 'text.secondary',
                            transition: 'color 0.2s ease',
                          }}
                        >
                          {feature.label}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{
                            color: 'text.disabled',
                            lineHeight: 1.3,
                            display: { xs: 'none', sm: 'block' },
                          }}
                        >
                          {feature.description}
                        </Typography>
                      </Box>

                      {/* Toggle */}
                      <Switch
                        size="small"
                        checked={enabled}
                        onChange={() => toggleFeature(feature.id)}
                        slotProps={{ input: { 'aria-label': `Toggle ${feature.label}` } }}
                        sx={{ flexShrink: 0 }}
                      />
                    </Box>
                  );
                })}
              </Box>
            </Paper>
          );
        })}

        {/* Footer */}
        <Box
          sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pt: 0.5 }}
        >
          <Chip
            label={`${enabledCount} of ${totalCount} enabled`}
            size="small"
            sx={{
              fontWeight: 600,
              fontSize: '0.75rem',
              bgcolor:
                enabledCount > 0
                  ? alpha(theme.palette.primary.main, isDark ? 0.15 : 0.08)
                  : alpha(theme.palette.text.primary, 0.06),
              color: enabledCount > 0 ? 'primary.main' : 'text.secondary',
            }}
          />
          {enabledCount > 0 && (
            <Button
              size="small"
              onClick={() => setEnabledFeatures([])}
              sx={{
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.75rem',
                color: 'text.secondary',
                '&:hover': { color: 'error.main' },
              }}
            >
              Reset all
            </Button>
          )}
        </Box>
      </Box>
    </BentoCard>
  );
}
