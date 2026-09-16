import { Box, Stack, Typography, Chip, TableCell, TableRow, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import CodeOutlinedIcon from '@mui/icons-material/CodeOutlined';
import BentoCard from '../../../components/Common/BentoCard';
import DocCodeBlock from '../components/DocCodeBlock';
import DocTable from '../components/DocTable';
import DocCallout from '../components/DocCallout';
import DocSectionTitle from '../components/DocSectionTitle';
import {
  TOOLS_CONNECTION_TYPES,
  TOOLS_CORE_SOLUTIONS,
  TOOLS_ROLE_PERMISSIONS,
  TOOLS_ROLE_DENIED,
  MCP_TOOL_CONFIG,
  MCP_TOOL_TOOLS,
  TOOLS_EXAMPLES,
} from '../data/tools';

export default function ToolsSection() {
  const theme = useTheme();
  const p = theme.palette;
  const toolColor = p.warning?.main || p.primary.main;

  return (
    <Stack spacing={3}>
      <BentoCard
        title="Connect tools to core solutions"
        subtitle="Scoped, isolated workspace per tool"
        icon={BuildOutlinedIcon}
        iconColor={p.primary.main}
        minHeight={100}
      >
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
            External tools and integrations plug into Orqaly&apos;s core solutions and run inside a
            scoped workspace - they only ever see their own data.
          </Typography>
          <DocSectionTitle icon={HubOutlinedIcon} color={p.primary.main}>
            Connection types
          </DocSectionTitle>
          <Box sx={{ display: 'grid', gap: 0.75, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
            {TOOLS_CONNECTION_TYPES.map((c) => (
              <Stack key={c.type} direction="row" spacing={1} alignItems="baseline">
                <Chip label={c.label} size="small" sx={{ height: 20, fontSize: '0.62rem', borderRadius: 1, fontWeight: 700, bgcolor: alpha(p.primary.main, 0.1), color: 'primary.main' }} />
                <Typography variant="caption" color="text.secondary">
                  {c.desc}
                </Typography>
              </Stack>
            ))}
          </Box>
          <DocSectionTitle icon={BuildOutlinedIcon} color={p.primary.main}>
            Core solutions
          </DocSectionTitle>
          <DocTable head={['Solution', 'What it does', 'Entry point']} minWidth={620}>
            {TOOLS_CORE_SOLUTIONS.map((s) => (
              <TableRow key={s.solution} hover>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.78rem' }}>{s.solution}</TableCell>
                <TableCell>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.73rem' }}>
                    {s.desc}
                  </Typography>
                </TableCell>
                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.68rem', color: 'text.secondary' }}>{s.endpoint}</TableCell>
              </TableRow>
            ))}
          </DocTable>
        </Stack>
      </BentoCard>

      <BentoCard
        title="Connect over MCP"
        subtitle="Expose your tool to agents and clients"
        icon={HubOutlinedIcon}
        iconColor={p.info?.main || p.primary.main}
        minHeight={100}
      >
        <Stack spacing={2}>
          <DocCodeBlock code={MCP_TOOL_CONFIG} label="mcp config" color={p.info?.main} />
          <Box sx={{ display: 'grid', gap: 0.75, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
            {MCP_TOOL_TOOLS.map((t) => (
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
        </Stack>
      </BentoCard>

      <BentoCard
        title="Tool role & permissions"
        subtitle="Scoped to your own data"
        icon={AdminPanelSettingsOutlinedIcon}
        iconColor={toolColor}
        minHeight={100}
      >
        <Stack spacing={2}>
          <DocTable head={['Page', { label: 'Access', align: 'center' }, 'Scoping']} minWidth={480}>
            {TOOLS_ROLE_PERMISSIONS.map((r) => (
              <TableRow key={r.page} hover>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.78rem' }}>{r.page}</TableCell>
                <TableCell align="center">
                  <Chip label={r.access} size="small" color="primary" variant="outlined" sx={{ height: 20, fontSize: '0.62rem', borderRadius: 1 }} />
                </TableCell>
                <TableCell>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.73rem' }}>
                    {r.scoping}
                  </Typography>
                </TableCell>
              </TableRow>
            ))}
          </DocTable>
          <DocCallout color={p.error?.main}>
            Denied to tools: {TOOLS_ROLE_DENIED.join(', ')}.
          </DocCallout>
        </Stack>
      </BentoCard>

      <BentoCard
        title="Integration examples"
        subtitle={`${TOOLS_EXAMPLES.length} clients`}
        icon={CodeOutlinedIcon}
        iconColor={p.success?.main || p.primary.main}
        minHeight={100}
      >
        <Stack spacing={2}>
          {TOOLS_EXAMPLES.map((ex) => (
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
