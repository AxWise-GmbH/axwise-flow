import { Box, Stack, Typography, Chip, TableCell, TableRow, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import CodeOutlinedIcon from '@mui/icons-material/CodeOutlined';
import BentoCard from '../../../components/Common/BentoCard';
import DocCodeBlock from '../components/DocCodeBlock';
import DocTable from '../components/DocTable';
import DocCallout from '../components/DocCallout';
import DocSectionTitle from '../components/DocSectionTitle';
import {
  AGENT_LIFECYCLE_STEPS,
  AGENT_DISCOVERY,
  MCP_AGENT_CONFIG,
  MCP_AGENT_TOOLS,
  AGENT_ROLE_PERMISSIONS,
  AGENT_ROLE_DENIED,
  AGENT_EXAMPLES,
} from '../data/agents';

export default function AgentsSection() {
  const theme = useTheme();
  const p = theme.palette;
  const agentColor = p.secondary?.main || p.primary.main;

  return (
    <Stack spacing={3}>
      {/* Lifecycle */}
      <BentoCard
        title="Agent lifecycle"
        subtitle="Register to evaluate, over MCP"
        icon={SmartToyOutlinedIcon}
        iconColor={p.primary.main}
        minHeight={100}
      >
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
            External AI agents connect to Orqaly over the Model Context Protocol using a platform-issued
            tracking token, then enqueue jobs, contribute to the Knowledge Base, and stream reports back
            under least-privilege scopes.
          </Typography>
          <Stack spacing={1.25}>
            {AGENT_LIFECYCLE_STEPS.map((s) => (
              <Stack key={s.step} direction="row" spacing={1.5} alignItems="flex-start">
                <Chip label={s.step} size="small" color="primary" sx={{ height: 20, minWidth: 20, fontWeight: 800, fontSize: '0.66rem' }} />
                <Box>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.8rem' }}>
                      {s.name}
                    </Typography>
                    <Chip label={s.endpoint} size="small" sx={{ height: 18, fontSize: '0.6rem', borderRadius: 1, fontFamily: 'monospace', bgcolor: alpha(p.primary.main, 0.08) }} />
                  </Stack>
                  <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                    {s.description}
                  </Typography>
                </Box>
              </Stack>
            ))}
          </Stack>
        </Stack>
      </BentoCard>

      {/* MCP connection */}
      <BentoCard
        title="Connect over MCP"
        subtitle="Point your client at the Orqaly MCP server"
        icon={HubOutlinedIcon}
        iconColor={p.info?.main || p.primary.main}
        minHeight={100}
      >
        <Stack spacing={2}>
          <DocCodeBlock code={MCP_AGENT_CONFIG} label="mcp config" color={p.info?.main} />
          <DocSectionTitle icon={CodeOutlinedIcon} color={p.info?.main}>
            Tools exposed to agents
          </DocSectionTitle>
          <Box sx={{ display: 'grid', gap: 0.75, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
            {MCP_AGENT_TOOLS.map((t) => (
              <Stack key={t.name} direction="row" spacing={1} alignItems="baseline">
                <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 700, color: 'primary.main' }}>
                  {t.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {t.description}
                </Typography>
              </Stack>
            ))}
          </Box>
          <DocSectionTitle icon={HubOutlinedIcon} color={p.info?.main}>
            Discovery endpoints
          </DocSectionTitle>
          <Stack spacing={0.75}>
            {AGENT_DISCOVERY.map((d) => (
              <Stack key={d.path} direction="row" spacing={1} alignItems="baseline" sx={{ flexWrap: 'wrap' }}>
                <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                  {d.path}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {d.desc}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Stack>
      </BentoCard>

      {/* Permissions */}
      <BentoCard
        title="Agent role & permissions"
        subtitle="Least privilege by default"
        icon={AdminPanelSettingsOutlinedIcon}
        iconColor={agentColor}
        minHeight={100}
      >
        <Stack spacing={2}>
          <DocTable head={['Page', { label: 'Access', align: 'center' }, 'Details']} minWidth={480}>
            {AGENT_ROLE_PERMISSIONS.map((r) => (
              <TableRow key={r.page} hover>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.78rem' }}>{r.page}</TableCell>
                <TableCell align="center">
                  <Chip label={r.access} size="small" color="primary" variant="outlined" sx={{ height: 20, fontSize: '0.62rem', borderRadius: 1 }} />
                </TableCell>
                <TableCell>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.73rem' }}>
                    {r.details}
                  </Typography>
                </TableCell>
              </TableRow>
            ))}
          </DocTable>
          <DocCallout color={p.error?.main}>
            Denied to agents: {AGENT_ROLE_DENIED.join(', ')}. Never grant automation access to API Keys,
            Permissions, or billing surfaces.
          </DocCallout>
        </Stack>
      </BentoCard>

      {/* Examples */}
      <BentoCard
        title="Integration examples"
        subtitle={`${AGENT_EXAMPLES.length} clients`}
        icon={CodeOutlinedIcon}
        iconColor={p.success?.main || p.primary.main}
        minHeight={100}
      >
        <Stack spacing={2}>
          {AGENT_EXAMPLES.map((ex) => (
            <Box key={ex.platform}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.8rem', mb: 0.75 }}>
                {ex.label}
              </Typography>
              <DocCodeBlock code={ex.code} label={ex.platform} color={p.success?.main} />
            </Box>
          ))}
        </Stack>
      </BentoCard>
    </Stack>
  );
}
