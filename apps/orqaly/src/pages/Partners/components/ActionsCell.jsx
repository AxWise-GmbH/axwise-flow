import { Box, IconButton, Tooltip } from '@mui/material';
import AssignmentIcon from '@mui/icons-material/AssignmentOutlined';
import BarChartIcon from '@mui/icons-material/BarChartOutlined';
import UploadFileIcon from '@mui/icons-material/UploadFileOutlined';

import AppIcon from '../../../components/icons/AppIcon';

export default function ActionsCell({ partner, onOpenKanban, onViewStats, onUploadMaterial }) {
  return (
    <Box sx={{ display: 'flex', gap: 0.3 }}>
      {onOpenKanban && (
        <Tooltip title="Tasks" arrow>
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onOpenKanban(partner);
            }}
            sx={{ color: 'primary.main' }}
          >
            <AppIcon name="AssignmentOutlined" fallback={AssignmentIcon} fontSize="small" />
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
            sx={{ color: 'text.secondary' }}
          >
            <AppIcon name="BarChartOutlined" fallback={BarChartIcon} fontSize="small" />
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
            sx={{ color: 'text.secondary' }}
          >
            <AppIcon name="UploadFileOutlined" fallback={UploadFileIcon} fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
}
