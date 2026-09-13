import { Box, Typography, Chip } from '@mui/material';
import DatasetRoundedIcon from '@mui/icons-material/DatasetRounded';
import StickyNote2OutlinedIcon from '@mui/icons-material/StickyNote2Outlined';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import BentoCard from '../../../components/Common/BentoCard';
import { EditButton, SectionLabel, StatusDot } from './_shared';
import { platformMeta } from '../platformMeta';

import AppIcon from '../../../components/icons/AppIcon';

function Count({ icon: Icon, label, value }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
      {Icon && <AppIcon fallback={Icon} sx={{ fontSize: 22, color: 'primary.main' }} />}
      <Box sx={{ minWidth: 0 }}>
        <SectionLabel>{label}</SectionLabel>
        <Typography sx={{ fontWeight: 800, fontSize: '1.2rem', lineHeight: 1.1 }}>
          {value}
        </Typography>
      </Box>
    </Box>
  );
}

/** Knowledge counts + connectors (Obsidian/Notion) + tags. Edit -> Data step. */
export default function DataKnowledgeCard({ data, onEdit }) {
  const { counts, connectors = [], tags = [], tagsMore = 0 } = data;
  return (
    <BentoCard
      title="Data"
      icon={DatasetRoundedIcon}
      action={<EditButton onClick={onEdit} />}
      plainHeader
      scrollBody
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1.5, flexWrap: 'wrap' }}>
        <Count icon={StickyNote2OutlinedIcon} label="Notes" value={counts.notes} />
        <Count icon={InsertDriveFileOutlinedIcon} label="Files" value={counts.files} />
        <Count icon={LinkRoundedIcon} label="Links" value={counts.links} />
      </Box>
      <Box sx={{ mt: 2 }}>
        <SectionLabel>Connectors</SectionLabel>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 0.75 }}>
          {connectors.map((c) => {
            const meta = platformMeta(c.id);
            const Icon = meta.Icon;
            return (
              <Box
                key={c.id}
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.75,
                  px: 1.25,
                  py: 0.6,
                  borderRadius: 1.5,
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <AppIcon fallback={Icon} sx={{ fontSize: 18, color: meta.color }} />
                <Typography sx={{ fontWeight: 700, fontSize: '0.82rem' }}>{c.name}</Typography>
                <StatusDot />
              </Box>
            );
          })}
        </Box>
      </Box>
      <Box sx={{ mt: 2 }}>
        <SectionLabel>Tags</SectionLabel>
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 0.75 }}>
          {tags.map((t) => (
            <Chip key={t} label={t} size="small" variant="outlined" sx={{ fontWeight: 600 }} />
          ))}
          {tagsMore > 0 && <Chip label={`+${tagsMore}`} size="small" sx={{ fontWeight: 700 }} />}
        </Box>
      </Box>
    </BentoCard>
  );
}
