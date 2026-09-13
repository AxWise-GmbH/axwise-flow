import { Box, Typography, Button, Chip } from '@mui/material';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import MailOutlineRoundedIcon from '@mui/icons-material/MailOutlineRounded';
import PhoneRoundedIcon from '@mui/icons-material/PhoneRounded';
import BentoCard from '../../../components/Common/BentoCard';
import { EditButton, SectionLabel } from './_shared';

import AppIcon from '../../../components/icons/AppIcon';

const ATTITUDE = {
  vip: { label: 'VIP', color: 'warning' },
  friendly: { label: 'Friendly', color: 'success' },
  neutral: { label: 'Neutral', color: 'default' },
  cold_lead: { label: 'Cold lead', color: 'info' },
  hostile: { label: 'Hostile', color: 'error' },
};

function Count({ icon: Icon, label, value }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
      {Icon && <Icon sx={{ fontSize: 20, color: 'primary.main' }} />}
      <Box sx={{ minWidth: 0 }}>
        <SectionLabel>{label}</SectionLabel>
        <Typography sx={{ fontWeight: 800, fontSize: '1.2rem', lineHeight: 1.1 }}>
          {value}
        </Typography>
      </Box>
    </Box>
  );
}

/** Total / mail / phone counts, contacts grouped by organization with attitude badges. */
export default function ContactsCard({ contacts, organizations = [], onEdit, onAdd }) {
  const orgName = (id) => organizations.find((o) => o.id === id)?.name || 'No organization';
  const groups = {};
  for (const c of contacts.list || []) {
    const key = c.organization_id || '__none__';
    (groups[key] ||= []).push(c);
  }
  const groupKeys = Object.keys(groups);

  return (
    <BentoCard
      title="Contacts"
      icon={PeopleAltOutlinedIcon}
      action={<EditButton onClick={onEdit} />}
      plainHeader
    >
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Count icon={PeopleAltOutlinedIcon} label="Unique" value={contacts.total} />
        <Count icon={MailOutlineRoundedIcon} label="Mail" value={contacts.mail} />
        <Count icon={PhoneRoundedIcon} label="Phone" value={contacts.phone} />
      </Box>
      <Box
        sx={{
          mt: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 1.25,
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          maxHeight: { xs: 220, sm: 'none' },
        }}
      >
        {groupKeys.map((k) => (
          <Box key={k}>
            <SectionLabel>{k === '__none__' ? 'No organization' : orgName(k)}</SectionLabel>
            <Box sx={{ mt: 0.5, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {groups[k].map((c) => (
                <Box key={c.id} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {c.contact_type === 'mail' ? (
                    <AppIcon
                      name="MailOutlineRounded"
                      fallback={MailOutlineRoundedIcon}
                      sx={{ fontSize: 16, color: 'text.secondary' }}
                    />
                  ) : (
                    <AppIcon
                      name="PhoneRounded"
                      fallback={PhoneRoundedIcon}
                      sx={{ fontSize: 16, color: 'text.secondary' }}
                    />
                  )}
                  <Typography
                    sx={{ fontWeight: 700, fontSize: '0.85rem', flex: 1, minWidth: 0 }}
                    noWrap
                  >
                    {c.name}
                  </Typography>
                  <Chip
                    size="small"
                    variant="outlined"
                    color={ATTITUDE[c.attitude]?.color || 'default'}
                    label={ATTITUDE[c.attitude]?.label || c.attitude}
                    sx={{ fontWeight: 700, height: 20 }}
                  />
                </Box>
              ))}
            </Box>
          </Box>
        ))}
      </Box>
      <Box sx={{ display: 'flex', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
        <Button
          size="small"
          startIcon={<AppIcon name="MailOutlineRounded" fallback={MailOutlineRoundedIcon} />}
          onClick={() => onAdd && onAdd('mail')}
          sx={{ textTransform: 'none', fontWeight: 700, color: 'primary.main' }}
        >
          Add mail contact
        </Button>
        <Button
          size="small"
          startIcon={<AppIcon name="PhoneRounded" fallback={PhoneRoundedIcon} />}
          onClick={() => onAdd && onAdd('phone')}
          sx={{ textTransform: 'none', fontWeight: 700, color: 'primary.main' }}
        >
          Add phone contact
        </Button>
      </Box>
    </BentoCard>
  );
}
