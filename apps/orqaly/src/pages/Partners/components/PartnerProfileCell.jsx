import { Box, Typography, IconButton, Tooltip } from '@mui/material';
import EntityInfoBadge from '../../../components/Common/EntityInfoBadge';
import { Link } from 'react-router-dom';
import AssignmentIcon from '@mui/icons-material/AssignmentOutlined';
import BarChartIcon from '@mui/icons-material/BarChartOutlined';
import UploadFileIcon from '@mui/icons-material/UploadFileOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';

import AppIcon from '../../../components/icons/AppIcon';

export default function PartnerProfileCell({
  partner,
  onOpenKanban,
  onViewStats,
  onUploadMaterial,
  onArchivePartner,
}) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.2 }}>
      <Box
        component={Link}
        to={`/partners/${partner.id}`}
        sx={{
          textDecoration: 'none',
          display: 'block',
          '&:hover .partner-name': { color: 'primary.main' },
        }}
      >
        <Typography
          className="partner-name"
          variant="body2"
          sx={{
            fontWeight: 600,
            color: 'text.primary',
            transition: 'color 0.15s',
            lineHeight: 1.3,
          }}
        >
          {partner.name}
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
          {partner.userId}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
        <EntityInfoBadge
          createdAt={partner.createdAt}
          updatedAt={partner.updatedAt}
          createdBy={partner.createdBy}
        />
      </Box>
      <Box sx={{ display: 'flex', gap: 0.2, mt: 0.2 }}>
        {onOpenKanban && (
          <Tooltip title="Tasks" arrow>
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onOpenKanban(partner);
              }}
              sx={{ color: 'primary.main', p: 0.35 }}
            >
              <AppIcon name="AssignmentOutlined" fallback={AssignmentIcon} sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        )}
        {onViewStats && (
          <Tooltip title="View Partner" arrow>
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onViewStats(partner);
              }}
              sx={{ color: 'text.secondary', p: 0.35 }}
            >
              <AppIcon name="BarChartOutlined" fallback={BarChartIcon} sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        )}
        {onUploadMaterial && (
          <Tooltip title="Upload Material" arrow>
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onUploadMaterial(partner);
              }}
              sx={{ color: 'text.secondary', p: 0.35 }}
            >
              <AppIcon name="UploadFileOutlined" fallback={UploadFileIcon} sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        )}
        {onArchivePartner && (
          <Tooltip title="Delete partner (archive)" arrow>
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onArchivePartner(partner);
              }}
              sx={{ color: 'error.main', p: 0.35 }}
            >
              <AppIcon name="DeleteOutline" fallback={DeleteOutlineIcon} sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    </Box>
  );
}
