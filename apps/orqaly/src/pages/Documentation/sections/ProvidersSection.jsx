import { Box, Stack, Typography, Chip, TableCell, TableRow, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import BentoCard from '../../../components/Common/BentoCard';
import DocTable from '../components/DocTable';
import DocCallout from '../components/DocCallout';
import { LLM_PROVIDERS, FALLBACK_CHAIN, PROVIDER_NOTES } from '../data/providers';
import { docId } from '../data/searchIndex';
import { useAnchorHighlight } from '../hooks/useAnchorHighlight';

export default function ProvidersSection({ highlightId }) {
  const theme = useTheme();
  const p = theme.palette;
  useAnchorHighlight(highlightId, alpha(p.primary.main, 0.15));

  return (
    <Stack spacing={3}>
      <BentoCard
        title="Supported LLM providers"
        subtitle={`${LLM_PROVIDERS.length} providers · local-first hybrid`}
        icon={HubOutlinedIcon}
        iconColor={p.primary.main}
        minHeight={100}
      >
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
            Each agent, board member, and workflow node can pick its own model. If a provider is slow
            or rate-limited, the executor automatically advances through the fallback chain.
          </Typography>
          <DocTable head={['Provider', 'Default model', 'Credential', 'Base URL']} minWidth={640}>
            {LLM_PROVIDERS.map((prov) => (
              <TableRow key={prov.id} id={docId('provider', prov.id)} hover>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem' }}>{prov.name}</TableCell>
                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.71rem' }}>{prov.model}</TableCell>
                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.68rem', color: 'text.secondary' }}>{prov.env}</TableCell>
                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.68rem', color: 'text.secondary' }}>{prov.baseUrl}</TableCell>
              </TableRow>
            ))}
          </DocTable>
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.secondary', mr: 1 }}>
              Fallback chain
            </Typography>
            <Box sx={{ display: 'inline-flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5, verticalAlign: 'middle' }}>
              {FALLBACK_CHAIN.map((id, i) => (
                <Chip
                  key={id}
                  label={`${i + 1}. ${id}`}
                  size="small"
                  sx={{ height: 20, fontSize: '0.64rem', borderRadius: 1, fontFamily: 'monospace', bgcolor: alpha(p.primary.main, 0.08) }}
                />
              ))}
            </Box>
          </Box>
        </Stack>
      </BentoCard>

      <BentoCard
        title="Routing, cost & security"
        subtitle="Fallback, tracking, and BYOK encryption"
        icon={ShieldOutlinedIcon}
        iconColor={p.warning?.main || p.primary.main}
        minHeight={100}
      >
        <Stack spacing={1.5}>
          {PROVIDER_NOTES.map((note) => (
            <DocCallout key={note.title} color={p.info?.main}>
              <strong>{note.title}.</strong> {note.body}
            </DocCallout>
          ))}
        </Stack>
      </BentoCard>
    </Stack>
  );
}
