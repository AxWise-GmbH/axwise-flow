import { Box, Typography, Chip, Button, useTheme, alpha } from '@mui/material';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import CorporateFareOutlinedIcon from '@mui/icons-material/CorporateFareOutlined';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import PanelCard from './PanelCard';
import useInView from '../../../components/Common/useInView';
import { staggerSx } from '../../../components/Common/stagger';

import AppIcon from '../../../components/icons/AppIcon';

const TYPE_LABELS = {
  holding: 'Holding',
  subsidiary: 'Subsidiary',
  division: 'Division',
  department: 'Department',
  virtual: 'Virtual',
};
const typeLabel = (t) => TYPE_LABELS[t] || 'Organization';

function ChildCard({ org, sx }) {
  const theme = useTheme();
  const m = org.metrics || {};
  return (
    <Box
      sx={{
        p: 1,
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: alpha(theme.palette.primary.main, 0.04),
        display: 'flex',
        flexDirection: 'column',
        gap: 0.25,
        minWidth: 0,
        ...sx,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <AppIcon
          name="CorporateFareOutlined"
          fallback={CorporateFareOutlinedIcon}
          sx={{ fontSize: 14, color: 'primary.main' }}
        />
        <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
          {org.name}
        </Typography>
      </Box>
      <Typography variant="caption" color="text.secondary">
        {typeLabel(org.org_type)} · {m.teams || 0} teams · {m.agents || 0} agents
      </Typography>
    </Box>
  );
}

/**
 * Hierarchy of the selected organization: parent (if any), the org itself, and
 * its sub-organizations (units). Header action links to Add Investment.
 */
export default function OrgStructure({ orgs = [], selectedId, onAddInvestment, delay = 0 }) {
  const theme = useTheme();
  const [childrenRef, inView] = useInView();
  const selected = orgs.find((o) => o.id === selectedId);
  const parent = selected ? orgs.find((o) => o.id === selected.parent_id) : null;
  const children = selected ? orgs.filter((o) => o.parent_id === selected.id) : [];

  const addAction = (
    <Button
      size="small"
      variant="outlined"
      startIcon={<AppIcon name="AddRounded" fallback={AddRoundedIcon} sx={{ fontSize: 16 }} />}
      onClick={onAddInvestment}
    >
      Add Investment
    </Button>
  );

  return (
    <PanelCard
      title="Organization structure"
      subtitle="Hierarchy of the selected organization"
      action={addAction}
      delay={delay}
    >
      {!selected ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
          Select an organization to see its structure.
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
          {parent && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ minWidth: 56 }}>
                Parent
              </Typography>
              <Chip
                icon={
                  <AppIcon
                    name="AccountTreeOutlined"
                    fallback={AccountTreeOutlinedIcon}
                    sx={{ fontSize: '14px !important' }}
                  />
                }
                label={`${parent.name} · ${typeLabel(parent.org_type)}`}
                size="small"
                variant="outlined"
                sx={{ fontWeight: 600 }}
              />
            </Box>
          )}

          <Box
            sx={{
              p: 1.5,
              borderRadius: 2,
              border: '1px solid',
              borderColor: alpha(theme.palette.primary.main, 0.4),
              background: `linear-gradient(180deg, ${alpha(theme.palette.primary.main, 0.12)}, ${alpha(theme.palette.primary.main, 0.03)})`,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <AppIcon
                name="CorporateFareOutlined"
                fallback={CorporateFareOutlinedIcon}
                sx={{ fontSize: 18, color: 'primary.main' }}
              />
              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                {selected.name}
              </Typography>
              <Chip
                label={typeLabel(selected.org_type)}
                size="small"
                sx={{ height: 18, fontSize: '0.6rem', fontWeight: 700 }}
              />
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              {selected.metrics?.units || 0} units · {selected.metrics?.teams || 0} teams ·{' '}
              {selected.metrics?.agents || 0} agents
            </Typography>
          </Box>

          <Box>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontWeight: 700, display: 'block', mb: 0.75 }}
            >
              Sub-organizations ({children.length})
            </Typography>
            {children.length ? (
              <Box
                ref={childrenRef}
                sx={{
                  display: 'grid',
                  gap: 1,
                  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
                }}
              >
                {children.map((c, i) => (
                  <ChildCard key={c.id} org={c} sx={staggerSx(i, inView)} />
                ))}
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No sub-organizations under this entity.
              </Typography>
            )}
          </Box>
        </Box>
      )}
    </PanelCard>
  );
}
