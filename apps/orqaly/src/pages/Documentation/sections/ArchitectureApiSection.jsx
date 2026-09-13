import { Box, Stack, Typography, Chip, Button, TableCell, TableRow, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import SchemaOutlinedIcon from '@mui/icons-material/SchemaOutlined';
import ApiOutlinedIcon from '@mui/icons-material/ApiOutlined';
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import BentoCard from '../../../components/Common/BentoCard';
import DocTable from '../components/DocTable';
import DocCallout from '../components/DocCallout';
import DocSectionTitle from '../components/DocSectionTitle';
import { DISPATCHERS, API_PATTERN_STEPS, API_ENDPOINTS } from '../data/api';
import { DB_TABLES, DB_DOMAINS, MIGRATION_COUNT } from '../data/database';
import { docId } from '../data/searchIndex';
import { useAnchorHighlight } from '../hooks/useAnchorHighlight';

const POSTMAN_URL = '/documentation/Orchestratori-API.postman_collection.json';

const METHOD_COLORS = {
  GET: 'info',
  POST: 'success',
  PUT: 'warning',
  DELETE: 'error',
};

export default function ArchitectureApiSection({ highlightId }) {
  const theme = useTheme();
  const p = theme.palette;
  const isDark = p.mode === 'dark';
  useAnchorHighlight(highlightId, alpha(p.primary.main, 0.15));

  return (
    <Stack spacing={3}>
      {/* Dispatcher model */}
      <BentoCard
        title="The serverless dispatcher model"
        subtitle="Everything routes by ?path=<name>"
        icon={SchemaOutlinedIcon}
        iconColor={p.primary.main}
        minHeight={100}
      >
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
            The backend is a set of Vercel serverless dispatchers. Each request carries a{' '}
            <code>?path=&lt;name&gt;</code> query parameter that the dispatcher maps to a statically
            imported handler module. The frontend never imports server code or talks to the database
            directly - it always goes through these routes.
          </Typography>
          <DocSectionTitle icon={ApiOutlinedIcon} color={p.primary.main}>
            The pattern every handler follows
          </DocSectionTitle>
          <Stack spacing={1.25}>
            {API_PATTERN_STEPS.map((s) => (
              <Stack key={s.step} direction="row" spacing={1.5} alignItems="flex-start">
                <Chip label={s.step} size="small" color="primary" sx={{ height: 20, minWidth: 20, fontWeight: 800, fontSize: '0.66rem' }} />
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.8rem' }}>
                    {s.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                    {s.detail}
                  </Typography>
                </Box>
              </Stack>
            ))}
          </Stack>
        </Stack>
      </BentoCard>

      {/* Dispatchers */}
      <BentoCard
        title="Dispatchers"
        subtitle={`${DISPATCHERS.length} serverless cores`}
        icon={SchemaOutlinedIcon}
        iconColor={p.info?.main || p.primary.main}
        minHeight={100}
      >
        <Box sx={{ display: 'grid', gap: 1.25, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
          {DISPATCHERS.map((d) => (
            <Box
              key={d.name}
              sx={{
                p: 1.75,
                borderRadius: 2.5,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: isDark ? alpha(p.background.paper, 0.5) : p.background.paper,
              }}
            >
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75, flexWrap: 'wrap' }}>
                <Typography variant="subtitle2" sx={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '0.8rem' }}>
                  {d.route}
                </Typography>
                <Chip label={d.auth} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.6rem', borderRadius: 1 }} />
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.55, display: 'block', mb: 1 }}>
                {d.desc}
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {d.handlers.map((h) => (
                  <Chip
                    key={h}
                    label={h}
                    size="small"
                    sx={{ height: 18, fontSize: '0.6rem', borderRadius: 1, fontFamily: 'monospace', bgcolor: alpha(p.primary.main, 0.08) }}
                  />
                ))}
              </Box>
            </Box>
          ))}
        </Box>
      </BentoCard>

      {/* Endpoint reference */}
      <BentoCard
        title="Endpoint reference"
        subtitle={`${API_ENDPOINTS.length} representative endpoints`}
        icon={ApiOutlinedIcon}
        iconColor={p.success?.main || p.primary.main}
        minHeight={100}
        action={
          <Button
            size="small"
            variant="outlined"
            href={POSTMAN_URL}
            download
            startIcon={<DownloadOutlinedIcon sx={{ fontSize: 16 }} />}
            sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
          >
            Postman
          </Button>
        }
      >
        <DocTable head={['Method', 'Path', { label: 'Auth', align: 'center' }, 'Description', { label: 'Rate', align: 'center' }]} minWidth={640}>
          {API_ENDPOINTS.map((e, i) => (
            <TableRow key={i} id={docId('endpoint', i)} hover>
              <TableCell>
                <Chip label={e.method} size="small" color={METHOD_COLORS[e.method] || 'default'} sx={{ height: 20, fontSize: '0.62rem', borderRadius: 1, fontWeight: 700 }} />
              </TableCell>
              <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.72rem' }}>{e.path}</TableCell>
              <TableCell align="center">
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                  {e.auth}
                </Typography>
              </TableCell>
              <TableCell>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.73rem' }}>
                  {e.desc}
                </Typography>
              </TableCell>
              <TableCell align="center">
                <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.68rem' }}>
                  {e.rate}
                </Typography>
              </TableCell>
            </TableRow>
          ))}
        </DocTable>
      </BentoCard>

      {/* Database */}
      <BentoCard
        title="Database schema"
        subtitle={`${DB_TABLES.length}+ tables · ${MIGRATION_COUNT} migrations · RLS on every table`}
        icon={StorageOutlinedIcon}
        iconColor={p.warning?.main || p.primary.main}
        minHeight={100}
      >
        <Stack spacing={2.5}>
          <DocCallout color={p.info?.main}>
            Postgres on Supabase. Every table has Row Level Security enabled: user-scoped tables use{' '}
            <code>auth.uid() = user_id</code> (with a service-role bypass for backend workers), and
            shared tables use <code>auth.role() = &apos;authenticated&apos;</code>. The Knowledge Base uses
            pgvector for embeddings. Migrations are strictly sequential in <code>supabase/migrations/</code>.
          </DocCallout>
          {DB_DOMAINS.map((domain) => (
            <Box key={domain}>
              <Typography variant="caption" sx={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.secondary' }}>
                {domain}
              </Typography>
              <Box sx={{ mt: 1 }}>
                <DocTable head={['Table', { label: 'RLS', align: 'center' }, 'Purpose']} minWidth={520}>
                  {DB_TABLES.filter((t) => t.domain === domain).map((t) => (
                    <TableRow key={t.name} id={docId('table', t.name)} hover>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.73rem', fontWeight: 600 }}>{t.name}</TableCell>
                      <TableCell align="center">
                        <Chip label={t.rls} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.62rem', borderRadius: 1 }} />
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.73rem' }}>
                          {t.description}
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
