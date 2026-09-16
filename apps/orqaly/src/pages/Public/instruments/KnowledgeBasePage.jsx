import { Box, Button, Stack, Typography, alpha, useTheme } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import MarketingCtaButton from '@/components/Public/primitives/MarketingCtaButton';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import LaunchIcon from '@mui/icons-material/Launch';
import FormatQuoteOutlinedIcon from '@mui/icons-material/FormatQuoteOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import PublicShell from '../../../components/Public/PublicShell';
import HeroSplit from '../../../components/Public/primitives/HeroSplit';
import Spotlight from '../../../components/Public/primitives/Spotlight';
import FeatureMosaic from '../../../components/Public/primitives/FeatureMosaic';
import ComparisonMatrix from '../../../components/Public/primitives/ComparisonMatrix';
import RelatedGrid from '../../../components/Public/primitives/RelatedGrid';
import ClosingCta from '../../../components/Public/primitives/ClosingCta';
import DemoKnowledgeBase from '../../../components/Public/demo/DemoKnowledgeBase';
import { ITEMS_BY_SLUG } from '../../../data/instruments';

import AppIcon from '../../../components/icons/AppIcon';

function CitationFlowMock() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';
  return (
    <Box
      sx={{
        position: 'relative',
        borderRadius: 4,
        overflow: 'hidden',
        bgcolor: isDark ? alpha('#fff', 0.025) : '#fff',
        border: `1px solid ${theme.palette.divider}`,
        boxShadow: `0 20px 50px ${alpha(primary, 0.18)}`,
        p: { xs: 2.5, md: 3 },
      }}
    >
      <Box
        sx={{
          p: 2,
          mb: 2,
          borderRadius: 2,
          bgcolor: alpha(primary, 0.06),
          border: `1px solid ${alpha(primary, 0.25)}`,
        }}
      >
        <Typography sx={{ fontSize: '0.7rem', fontWeight: 800, color: 'primary.main', letterSpacing: '0.08em', textTransform: 'uppercase', mb: 1 }}>
          Agent answer
        </Typography>
        <Typography sx={{ fontSize: '0.92rem', color: 'text.primary', lineHeight: 1.65 }}>
          Self-serve refunds are limited to 14 days from order date{' '}
          <Box component="sup" sx={{ color: 'primary.main', fontWeight: 800, mx: 0.25 }}>[1]</Box>
          ; refunds beyond that window require manager approval
          <Box component="sup" sx={{ color: 'primary.main', fontWeight: 800, mx: 0.25 }}>[2]</Box>.
        </Typography>
      </Box>
      <Typography sx={{ fontSize: '0.7rem', fontWeight: 800, color: 'text.secondary', letterSpacing: '0.08em', textTransform: 'uppercase', mb: 1.25 }}>
        Sources
      </Typography>
      <Stack spacing={1}>
        {[
          { tag: '[1]', title: 'Refund policy 2026', meta: 'PDF · p. 2', quote: '"...self-serve refunds within 14 days of order..."' },
          { tag: '[2]', title: 'Customer ops handbook', meta: 'Notion · §3.4', quote: '"...manager approval required beyond standard window..."' },
        ].map((s) => (
          <Stack
            key={s.tag}
            direction="row"
            spacing={1.5}
            alignItems="flex-start"
            sx={{ p: 1.5, borderRadius: 1.5, border: `1px solid ${theme.palette.divider}`, bgcolor: isDark ? alpha('#fff', 0.02) : alpha(theme.palette.text.primary, 0.015) }}
          >
            <AppIcon
              name='DescriptionOutlined'
              fallback={DescriptionOutlinedIcon}
              sx={{ color: 'primary.main', fontSize: 18, mt: '2px' }} />
            <Stack spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" spacing={1} alignItems="baseline">
                <Typography sx={{ fontWeight: 800, fontSize: '0.7rem', color: 'primary.main' }}>{s.tag}</Typography>
                <Typography sx={{ fontWeight: 700, fontSize: '0.82rem', color: 'text.primary' }}>{s.title}</Typography>
                <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>· {s.meta}</Typography>
              </Stack>
              <Stack direction="row" spacing={0.75} alignItems="flex-start">
                <AppIcon
                  name='FormatQuoteOutlined'
                  fallback={FormatQuoteOutlinedIcon}
                  sx={{ color: 'text.disabled', fontSize: 12, transform: 'scaleX(-1)', mt: '3px' }} />
                <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary', fontStyle: 'italic', lineHeight: 1.5 }}>{s.quote}</Typography>
              </Stack>
            </Stack>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}

export default function KnowledgeBasePage() {
  const item = ITEMS_BY_SLUG['instruments:knowledge-base'];
  return (
    <PublicShell>
      <HeroSplit
        eyebrow="INSTRUMENTS · Knowledge Base"
        title={item.hero.title}
        subtitle={item.hero.subtitle}
        bgVariant="mesh"
        ctas={
          <>
            <MarketingCtaButton component={RouterLink} to="/signup" endIcon={<AppIcon name='ArrowForward' fallback={ArrowForwardIcon} />} sx={{ px: 3, py: 1.25 }}>
              Connect your sources
            </MarketingCtaButton>
            <Button component={RouterLink} to={item.inAppRoute} variant="outlined" size="large" endIcon={<AppIcon name='Launch' fallback={LaunchIcon} sx={{ fontSize: 18 }} />} sx={{ fontWeight: 700, borderRadius: 2, textTransform: 'none', px: 3, py: 1.25 }}>
              Open in app
            </Button>
          </>
        }
        visual={<DemoKnowledgeBase />}
      />
      <Box component="section" sx={{ py: { xs: 5, md: 8 } }}>
        <Box sx={{ maxWidth: 720, mx: 'auto', px: { xs: 2, md: 3 } }}>
          <Stack spacing={2.5}>
            {item.description.map((p, i) => (
              <Typography key={i} sx={{ fontSize: { xs: '1rem', md: '1.1rem' }, color: 'text.primary', lineHeight: 1.75 }}>
                {p}
              </Typography>
            ))}
          </Stack>
        </Box>
      </Box>
      <Spotlight
        eyebrow="Cited answers"
        title="Every answer points to its source."
        body="When an agent answers, you see exactly which document, paragraph, or transcript it drew from. No more guessing where a claim came from - or whether it was even real."
        bullets={[
          'Inline source citations on every response',
          'One-click jump to the underlying document',
          'Audit log of which agent read which source',
          'Outdated sources flagged automatically when content changes',
        ]}
        visual={<CitationFlowMock />}
        bg="tint"
        reverse
      />
      <FeatureMosaic
        title="The knobs that matter"
        subtitle="Built so non-engineers can manage it without losing control."
        features={item.features}
        featuredIndex={0}
      />
      <ComparisonMatrix
        title="Why this beats stitching it yourself"
        competitors={[
          { id: 'orqaly', label: 'Orqaly KB', us: true },
          { id: 'chatgpt', label: 'ChatGPT GPTs' },
          { id: 'notion', label: 'Notion AI' },
          { id: 'langchain', label: 'LangChain RAG' },
        ]}
        rows={[
          { capability: 'Zero-config (no vector DB to provision)', values: { orqaly: true, chatgpt: true, notion: true, langchain: false } },
          { capability: 'Inline citations on every answer', values: { orqaly: true, chatgpt: 'partial', notion: 'partial', langchain: 'partial' } },
          { capability: 'Shared across every agent in workspace', values: { orqaly: true, chatgpt: false, notion: false, langchain: 'partial' } },
          { capability: 'Permissioned by role + by agent', values: { orqaly: true, chatgpt: false, notion: 'partial', langchain: false } },
          { capability: 'Reachable via API + webhooks', values: { orqaly: true, chatgpt: false, notion: 'partial', langchain: true } },
        ]}
        bg="tint"
      />
      <RelatedGrid
        title="Pairs well with"
        items={[
          { label: 'Agents', to: '/control/agents', iconName: 'SmartToyOutlined', blurb: 'Scope a KB to a single agent or share across many.' },
          { label: 'Reports', to: '/instruments/reports', iconName: 'AssessmentOutlined', blurb: 'Reports pull prose from the KB into branded documents.' },
          { label: 'Requests', to: '/control/requests', iconName: 'InboxOutlined', blurb: 'KB lookup runs on every request, so simple asks resolve instantly.' },
        ]}
      />
      <ClosingCta
        title="Give your agents real memory."
        body="Drop in your docs. Stop pasting prompts. Start citing sources."
        primary={{ label: 'Try it free', to: '/signup' }}
      />
    </PublicShell>
  );
}
