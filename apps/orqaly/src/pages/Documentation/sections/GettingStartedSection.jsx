import { Box, Stack, Typography, Chip, TableCell, TableRow, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import RocketLaunchOutlinedIcon from '@mui/icons-material/RocketLaunchOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import CodeOutlinedIcon from '@mui/icons-material/CodeOutlined';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import BentoCard from '../../../components/Common/BentoCard';
import DocCodeBlock from '../components/DocCodeBlock';
import DocTable from '../components/DocTable';
import DocCallout from '../components/DocCallout';
import { LAYER_FLOW, QUICKSTART_STEPS, AUTH_FLOW_STEPS } from '../data/gettingStarted';
import { ENV_VARS, ENV_GROUPS } from '../data/env';
import { docId } from '../data/searchIndex';
import { useAnchorHighlight } from '../hooks/useAnchorHighlight';

function StepRow({ step, title, detail }) {
  const theme = useTheme();
  const c = theme.palette.primary.main;
  return (
    <Stack direction="row" spacing={1.5} alignItems="flex-start">
      <Box
        sx={{
          width: 26,
          height: 26,
          borderRadius: '50%',
          bgcolor: alpha(c, 0.12),
          color: c,
          fontWeight: 800,
          fontSize: '0.75rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {step}
      </Box>
      <Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.82rem' }}>
          {title}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.6 }}>
          {detail}
        </Typography>
      </Box>
    </Stack>
  );
}

export default function GettingStartedSection({ highlightId }) {
  const theme = useTheme();
  const p = theme.palette;
  useAnchorHighlight(highlightId, alpha(p.primary.main, 0.15));

  return (
    <Stack spacing={3}>
      {/* Layer flow */}
      <BentoCard
        title="How Orqaly works"
        subtitle="Goal in, organization out"
        icon={AccountTreeOutlinedIcon}
        iconColor={p.primary.main}
        minHeight={100}
      >
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
            Orqaly is an autonomous AI agent orchestration platform. You hand it a goal; work then
            flows down through five layers, gets executed and evaluated, and is recorded in an
            append-only source of truth.
          </Typography>
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'stretch',
              gap: 1,
            }}
          >
            {LAYER_FLOW.map((layer, i) => (
              <Box key={layer.name} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: alpha(p.primary.main, 0.25),
                    bgcolor: alpha(p.primary.main, p.mode === 'dark' ? 0.06 : 0.03),
                    minWidth: 150,
                    flex: 1,
                  }}
                >
                  <Typography variant="subtitle2" sx={{ fontWeight: 800, fontSize: '0.82rem' }}>
                    {layer.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.5 }}>
                    {layer.desc}
                  </Typography>
                </Box>
                {i < LAYER_FLOW.length - 1 && (
                  <ArrowForwardIcon
                    sx={{ fontSize: 16, color: 'text.disabled', display: { xs: 'none', md: 'block' } }}
                  />
                )}
              </Box>
            ))}
          </Box>
        </Stack>
      </BentoCard>

      {/* Quickstart */}
      <BentoCard
        title="Developer quickstart"
        subtitle="Run it locally in four steps"
        icon={RocketLaunchOutlinedIcon}
        iconColor={p.success?.main || p.primary.main}
        minHeight={100}
      >
        <Stack spacing={2}>
          {QUICKSTART_STEPS.map((s) => (
            <Box key={s.step}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75 }}>
                <Chip
                  label={s.step}
                  size="small"
                  color="primary"
                  sx={{ height: 20, minWidth: 20, fontWeight: 800, fontSize: '0.68rem' }}
                />
                <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.82rem' }}>
                  {s.title}
                </Typography>
              </Stack>
              <DocCodeBlock code={s.code} color={p.success?.main} />
            </Box>
          ))}
          <DocCallout color={p.warning?.main}>
            The dev server runs on <code>http://localhost:5176</code>. Use <code>npm run dev:local</code>{' '}
            to also start the API and worker. Run <code>npm run validate-env</code> to confirm your
            environment is configured.
          </DocCallout>
        </Stack>
      </BentoCard>

      {/* Auth flow */}
      <BentoCard
        title="Authentication & session"
        subtitle="Supabase JWT, verified per request"
        icon={LockOutlinedIcon}
        iconColor={p.info?.main || p.primary.main}
        minHeight={100}
      >
        <Stack spacing={2}>
          {AUTH_FLOW_STEPS.map((s) => (
            <StepRow key={s.step} step={s.step} title={s.title} detail={s.detail} />
          ))}
        </Stack>
      </BentoCard>

      {/* Env vars */}
      <BentoCard
        title="Environment variables"
        subtitle={`${ENV_VARS.length} variables · from .env.example`}
        icon={CodeOutlinedIcon}
        iconColor={p.warning?.main || p.primary.main}
        minHeight={100}
      >
        <Stack spacing={2.5}>
          {ENV_GROUPS.map((group) => (
            <Box key={group}>
              <Typography
                variant="caption"
                sx={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.secondary' }}
              >
                {group}
              </Typography>
              <Box sx={{ mt: 1 }}>
                <DocTable head={['Variable', { label: 'Scope', align: 'center' }, { label: 'Req', align: 'center' }, 'Description']} minWidth={560}>
                  {ENV_VARS.filter((v) => v.group === group).map((v) => (
                    <TableRow key={v.name} id={docId('env', v.name)} hover>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.73rem', fontWeight: 600 }}>
                        {v.name}
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={v.scope}
                          size="small"
                          variant="outlined"
                          sx={{ height: 20, fontSize: '0.62rem', borderRadius: 1 }}
                        />
                      </TableCell>
                      <TableCell align="center">
                        {v.req ? (
                          <Chip label="Yes" size="small" color="error" sx={{ height: 20, fontSize: '0.62rem', borderRadius: 1 }} />
                        ) : (
                          <Typography variant="caption" color="text.disabled">
                            -
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.73rem' }}>
                          {v.description}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </DocTable>
              </Box>
            </Box>
          ))}
        </Stack>
      </BentoCard>
    </Stack>
  );
}
