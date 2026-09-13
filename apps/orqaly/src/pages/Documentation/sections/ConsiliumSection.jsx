import { Box, Stack, Typography, Chip, TableCell, TableRow, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import SecurityOutlinedIcon from '@mui/icons-material/SecurityOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import ApiOutlinedIcon from '@mui/icons-material/ApiOutlined';
import CodeOutlinedIcon from '@mui/icons-material/CodeOutlined';
import BentoCard from '../../../components/Common/BentoCard';
import DocCodeBlock from '../components/DocCodeBlock';
import DocTable from '../components/DocTable';
import DocSectionTitle from '../components/DocSectionTitle';
import {
  CONSILIUM_MEMBER_ROLES,
  CONSILIUM_SECURITY_LEVELS,
  CONSILIUM_PIPELINE_STEPS,
  CONSILIUM_API_ENDPOINTS,
  CONSILIUM_INSTRUCTION_EXAMPLE,
  CONSILIUM_EXAMPLES,
} from '../data/consilium';

export default function ConsiliumSection() {
  const theme = useTheme();
  const p = theme.palette;
  const cColor = p.info?.main || p.primary.main;

  return (
    <Stack spacing={3}>
      {/* What is Consilium + roles */}
      <BentoCard
        title="The AI board of directors"
        subtitle="Multi-model evaluation with consensus"
        icon={ShieldOutlinedIcon}
        iconColor={p.primary.main}
        minHeight={100}
      >
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
            A Consilium is a board of AI members - each able to run on a different LLM - that evaluates
            work in parallel and reaches a decision through consensus rules, with security scanning,
            fraud detection, and quarantine for risky decisions.
          </Typography>
          <DocSectionTitle icon={GroupsOutlinedIcon} color={p.primary.main}>
            Member roles
          </DocSectionTitle>
          <DocTable head={['Role', 'Responsibility']} minWidth={420}>
            {CONSILIUM_MEMBER_ROLES.map((r) => (
              <TableRow key={r.role} hover>
                <TableCell>
                  <Chip label={r.role} size="small" sx={{ height: 20, fontSize: '0.66rem', borderRadius: 1, fontWeight: 700, bgcolor: alpha(p.primary.main, 0.1), color: 'primary.main' }} />
                </TableCell>
                <TableCell>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                    {r.description}
                  </Typography>
                </TableCell>
              </TableRow>
            ))}
          </DocTable>
        </Stack>
      </BentoCard>

      {/* Pipeline + security */}
      <BentoCard
        title="Evaluation pipeline"
        subtitle="7 stages from submission to stored result"
        icon={AccountTreeOutlinedIcon}
        iconColor={p.success?.main || p.primary.main}
        minHeight={100}
      >
        <Stack spacing={2}>
          <Stack spacing={1.25}>
            {CONSILIUM_PIPELINE_STEPS.map((s) => (
              <Stack key={s.step} direction="row" spacing={1.5} alignItems="flex-start">
                <Chip label={s.step} size="small" color="primary" sx={{ height: 20, minWidth: 20, fontWeight: 800, fontSize: '0.66rem' }} />
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.8rem' }}>
                    {s.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                    {s.description}
                  </Typography>
                </Box>
              </Stack>
            ))}
          </Stack>
          <DocSectionTitle icon={SecurityOutlinedIcon} color={p.warning?.main}>
            Security levels
          </DocSectionTitle>
          <DocTable head={['Level', 'Behavior']} minWidth={420}>
            {CONSILIUM_SECURITY_LEVELS.map((s) => (
              <TableRow key={s.level} hover>
                <TableCell>
                  <Chip label={s.level} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.64rem', borderRadius: 1, fontWeight: 700 }} />
                </TableCell>
                <TableCell>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                    {s.description}
                  </Typography>
                </TableCell>
              </TableRow>
            ))}
          </DocTable>
        </Stack>
      </BentoCard>

      {/* Endpoints + onboarding */}
      <BentoCard
        title="Endpoints & onboarding"
        subtitle="/api/concilium?path=<name>"
        icon={ApiOutlinedIcon}
        iconColor={cColor}
        minHeight={100}
      >
        <Stack spacing={2}>
          <DocTable head={['Path', 'Methods', 'Description']} minWidth={520}>
            {CONSILIUM_API_ENDPOINTS.map((e) => (
              <TableRow key={e.path} hover>
                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.73rem', fontWeight: 600 }}>{e.path}</TableCell>
                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.68rem', color: 'text.secondary' }}>{e.methods}</TableCell>
                <TableCell>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.73rem' }}>
                    {e.description}
                  </Typography>
                </TableCell>
              </TableRow>
            ))}
          </DocTable>
          <DocSectionTitle icon={CodeOutlinedIcon} color={cColor}>
            Instruction packet (returned on accept)
          </DocSectionTitle>
          <DocCodeBlock code={CONSILIUM_INSTRUCTION_EXAMPLE} label="json" color={cColor} />
        </Stack>
      </BentoCard>

      {/* Examples */}
      <BentoCard
        title="Integration examples"
        subtitle={`${CONSILIUM_EXAMPLES.length} snippets`}
        icon={CodeOutlinedIcon}
        iconColor={p.success?.main || p.primary.main}
        minHeight={100}
      >
        <Stack spacing={2}>
          {CONSILIUM_EXAMPLES.map((ex) => (
            <Box key={ex.label}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.8rem', mb: 0.75 }}>
                {ex.label}
              </Typography>
              <DocCodeBlock code={ex.code} color={p.success?.main} />
            </Box>
          ))}
        </Stack>
      </BentoCard>
    </Stack>
  );
}
