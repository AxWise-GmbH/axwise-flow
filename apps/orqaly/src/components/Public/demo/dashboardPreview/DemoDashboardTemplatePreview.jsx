import { Box, Stack, Typography, alpha, useTheme } from '@mui/material';
import {
  PreviewShell,
  KpiRow,
  ChartCard,
  MiniLineChart,
  MiniBarChart,
  MiniFunnel,
  MiniDualBar,
  SplitBar,
  StatusChips,
  PipelineColumns,
  PartnerRankList,
} from './chartPrimitives';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';

import AppIcon from '../../../icons/AppIcon';

const BENTO = {
  display: 'grid',
  gap: 1.5,
  gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
};

function AiCostsPreview({ category }) {
  const { preview, tint, kpis } = category;
  return (
    <PreviewShell category={category}>
      <KpiRow kpis={kpis} tint={tint} columns={4} />
      <Box sx={{ ...BENTO }}>
        <ChartCard title={preview.barTitle} tint={tint}>
          <MiniBarChart bars={preview.bars} tint={tint} />
        </ChartCard>
        <ChartCard title={preview.lineTitle} tint={tint}>
          <MiniLineChart points={preview.linePoints} tint={tint} />
        </ChartCard>
      </Box>
    </PreviewShell>
  );
}

function MarketingPreview({ category }) {
  const { preview, tint, kpis } = category;
  return (
    <PreviewShell category={category}>
      <KpiRow kpis={kpis} tint={tint} />
      <Box sx={{ ...BENTO }}>
        <ChartCard title={preview.funnelTitle} tint={tint}>
          <MiniFunnel stages={preview.funnel} tint={tint} />
        </ChartCard>
        <ChartCard title={preview.channelTitle} tint={tint}>
          <MiniBarChart bars={preview.channels} tint={tint} horizontal />
        </ChartCard>
      </Box>
    </PreviewShell>
  );
}

function OperationalPreview({ category }) {
  const { preview, tint, kpis } = category;
  return (
    <PreviewShell category={category}>
      <KpiRow kpis={kpis} tint={tint} />
      <Box sx={{ ...BENTO }}>
        <ChartCard title={preview.lineTitle} tint={tint}>
          <MiniLineChart points={preview.linePoints} tint={tint} height={64} />
        </ChartCard>
        <ChartCard title={preview.statusTitle} tint={tint}>
          <StatusChips statuses={preview.statuses} tint={tint} />
        </ChartCard>
      </Box>
    </PreviewShell>
  );
}

function AccountantPreview({ category }) {
  const { preview, tint, kpis } = category;
  return (
    <PreviewShell category={category}>
      <KpiRow kpis={kpis} tint={tint} />
      <Box sx={{ ...BENTO }}>
        <ChartCard title={preview.compareTitle} tint={tint}>
          <MiniDualBar rows={preview.compare} tint={tint} />
          <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
            <Typography sx={{ fontSize: '0.62rem', color: 'text.secondary' }}>■ Revenue</Typography>
            <Typography sx={{ fontSize: '0.62rem', color: 'text.secondary' }}>■ Expenses</Typography>
          </Stack>
        </ChartCard>
        <ChartCard title={preview.splitTitle} tint={tint}>
          <SplitBar
            creator={preview.split.creator}
            platform={preview.split.platform}
            amount={preview.split.amount}
            tint={tint}
          />
        </ChartCard>
      </Box>
    </PreviewShell>
  );
}

function PartnersPreview({ category }) {
  const { preview, tint, kpis } = category;
  return (
    <PreviewShell category={category}>
      <KpiRow kpis={kpis} tint={tint} />
      <Box sx={{ ...BENTO }}>
        <ChartCard title={preview.pipelineTitle} tint={tint} sx={{ minHeight: 120 }}>
          <PipelineColumns columns={preview.pipeline} tint={tint} />
        </ChartCard>
        <ChartCard title={preview.partnersTitle} tint={tint}>
          <PartnerRankList partners={preview.partners} tint={tint} />
        </ChartCard>
      </Box>
    </PreviewShell>
  );
}

function CustomPreview({ category }) {
  const theme = useTheme();
  const { preview, tint } = category;
  const isDark = theme.palette.mode === 'dark';
  return (
    <PreviewShell category={category}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 1.5,
          minHeight: 200,
        }}
      >
        {preview.ghosts.map((label) => (
          <Box
            key={label}
            sx={{
              p: 2,
              borderRadius: 2.5,
              border: `2px dashed ${alpha(tint, 0.4)}`,
              bgcolor: isDark ? alpha('#fff', 0.02) : alpha(tint, 0.04),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 72,
            }}
          >
            <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: 'text.secondary' }}>{label}</Typography>
          </Box>
        ))}
      </Box>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="center"
        spacing={1}
        sx={{
          mt: 2,
          p: 1.5,
          borderRadius: 2,
          bgcolor: alpha(tint, 0.1),
          border: `1px solid ${alpha(tint, 0.25)}`,
        }}
      >
        <AppIcon
          name='AutoAwesomeOutlined'
          fallback={AutoAwesomeOutlinedIcon}
          sx={{ fontSize: 18, color: tint }} />
        <Typography sx={{ fontSize: '0.82rem', fontStyle: 'italic', color: 'text.secondary' }}>{preview.prompt}</Typography>
      </Stack>
    </PreviewShell>
  );
}

const PREVIEW_BY_ID = {
  'ai-costs': AiCostsPreview,
  marketing: MarketingPreview,
  operational: OperationalPreview,
  accountant: AccountantPreview,
  partners: PartnersPreview,
  custom: CustomPreview,
};

export default function DemoDashboardTemplatePreview({ category }) {
  const Layout = PREVIEW_BY_ID[category.id] ?? AiCostsPreview;
  return <Layout category={category} />;
}
