import React from 'react';
import { Box, Grid, Typography, Button, Stack } from '@mui/material';
import PageLayout from '../components/Common/PageLayout'; // Adjust path
import GlassCard from '../components/Common/GlassCard'; // Adjust path
import AddIcon from '@mui/icons-material/Add';

import AppIcon from '../components/icons/AppIcon';

/**
 * 🚀 ENTERPRISE FEATURE TEMPLATE
 *
 * Instructions:
 * 1. Copy this file to `src/pages/YourFeature/YourFeature.jsx`.
 * 2. Rename the component.
 * 3. This layout automatically inherits the Enterprise Design System (colors, fonts, spacing).
 */
export default function FeatureTemplate() {
  return (
    <PageLayout
      title="Feature Title"
      subtitle="Manage your enterprise resources efficiently."
      maxWidth={1600}
    >
      {/* ── Actions Toolbar ───────────────────────────────────────────── */}
      <Stack direction="row" justifyContent="flex-end" spacing={2} mb={3}>
        <Button variant="outlined">Export</Button>
        <Button variant="contained" startIcon={<AppIcon name="Add" fallback={AddIcon} />}>
          New Item
        </Button>
      </Stack>
      {/* ── Dashboard Grid ────────────────────────────────────────────── */}
      <Grid container spacing={3}>
        {/* Metric Cards */}
        {[1, 2, 3].map((item) => (
          <Grid item xs={12} md={4} key={item}>
            <GlassCard sx={{ p: 3 }}>
              <Typography
                variant="caption"
                color="text.secondary"
                fontWeight={600}
                textTransform="uppercase"
              >
                Key Metric {item}
              </Typography>
              <Typography variant="h3" fontWeight={700} color="text.primary" mt={1}>
                {98 * item}%
              </Typography>
              <Typography variant="body2" color="success.main" fontWeight={500}>
                +12% vs last month
              </Typography>
            </GlassCard>
          </Grid>
        ))}

        {/* Main Content Area */}
        <Grid item xs={12}>
          <GlassCard sx={{ minHeight: 400, p: 0 }}>
            {/* Header for the section */}
            <Box sx={{ p: 3, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="h6">Recent Activity</Typography>
            </Box>

            {/* Content / Table Placeholder */}
            <Box
              sx={{
                p: 3,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: 300,
              }}
            >
              <Typography color="text.secondary">Table or Chart Component goes here.</Typography>
            </Box>
          </GlassCard>
        </Grid>
      </Grid>
    </PageLayout>
  );
}
