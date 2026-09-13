import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  alpha,
  useTheme,
} from '@mui/material';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import BentoCard from '../../../components/Common/BentoCard';

const headerCellSx = {
  fontWeight: 700,
  fontSize: '0.7rem',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'text.secondary',
  borderBottom: '1px solid',
  borderColor: 'divider',
};

export default function ActionKpiMappingBlock({ data }) {
  const d = data || {};
  const rows = d.rows || [];
  const theme = useTheme();

  return (
    <BentoCard
      title="Action → KPI Mapping"
      subtitle="System actions mapped to KPIs and financial impact"
      icon={HubOutlinedIcon}
      iconColor={theme.palette.secondary.main}
    >
      <TableContainer sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={headerCellSx}>Action</TableCell>
              <TableCell sx={headerCellSx}>Direct KPI</TableCell>
              <TableCell sx={headerCellSx}>Indirect KPI</TableCell>
              <TableCell sx={headerCellSx} align="center">
                Revenue
              </TableCell>
              <TableCell sx={headerCellSx} align="center">
                Margin
              </TableCell>
              <TableCell sx={headerCellSx} align="center">
                Retention
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row, idx) => (
              <TableRow key={idx} hover>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.82rem' }}>{row.action}</TableCell>
                <TableCell sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
                  {row.directKpi}
                </TableCell>
                <TableCell sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
                  {row.indirectKpi}
                </TableCell>
                <TableCell align="center">
                  <Chip
                    size="small"
                    label={row.revenueImpact}
                    sx={{
                      height: 20,
                      fontSize: '0.68rem',
                      bgcolor: alpha(theme.palette.success.main, 0.15),
                      color: theme.palette.success.dark,
                      border: '1px solid',
                      borderColor: alpha(theme.palette.success.main, 0.3),
                      borderRadius: 1,
                    }}
                  />
                </TableCell>
                <TableCell align="center">
                  <Chip
                    size="small"
                    label={row.marginImpact}
                    sx={{
                      height: 20,
                      fontSize: '0.68rem',
                      bgcolor: alpha(theme.palette.info.main, 0.15),
                      color: theme.palette.info.dark,
                      border: '1px solid',
                      borderColor: alpha(theme.palette.info.main, 0.3),
                      borderRadius: 1,
                    }}
                  />
                </TableCell>
                <TableCell align="center">
                  <Chip
                    size="small"
                    label={row.retentionImpact}
                    sx={{
                      height: 20,
                      fontSize: '0.68rem',
                      bgcolor: alpha(theme.palette.secondary.main, 0.15),
                      color: theme.palette.secondary.dark,
                      border: '1px solid',
                      borderColor: alpha(theme.palette.secondary.main, 0.3),
                      borderRadius: 1,
                    }}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </BentoCard>
  );
}
