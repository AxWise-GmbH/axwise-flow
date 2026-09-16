import { Box, CircularProgress, Stack, Typography } from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import SecurityOutlinedIcon from '@mui/icons-material/SecurityOutlined';
import AutoFixHighOutlinedIcon from '@mui/icons-material/AutoFixHighOutlined';

import AppIcon from '../../../../components/icons/AppIcon';

const STAGES = [
  {
    id: 'uploading',
    label: 'Uploading',
    icon: CloudUploadOutlinedIcon,
    hint: 'Writing to encrypted storage...',
  },
  {
    id: 'scanning',
    label: 'Scanning',
    icon: SecurityOutlinedIcon,
    hint: 'VirusTotal check - may take up to 90 seconds for new files.',
  },
  {
    id: 'parsing',
    label: 'Parsing',
    icon: AutoFixHighOutlinedIcon,
    hint: 'Extracting keys and matching to known providers...',
  },
];

export default function ImportScanProgress({ stage }) {
  const currentIdx = STAGES.findIndex((s) => s.id === stage);

  return (
    <Box sx={{ py: 3 }}>
      <Stack spacing={2}>
        {STAGES.map((s, i) => {
          const Icon = s.icon;
          const isActive = i === currentIdx;
          const isDone = i < currentIdx;
          const isPending = i > currentIdx;

          return (
            <Stack
              key={s.id}
              direction="row"
              spacing={2}
              alignItems="center"
              sx={{ opacity: isPending ? 0.4 : 1 }}
            >
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {isDone && (
                  <AppIcon
                    name="CheckCircleOutline"
                    fallback={CheckCircleOutlineIcon}
                    color="success"
                  />
                )}
                {isActive && <CircularProgress size={20} />}
                {isPending && (
                  <AppIcon fallback={Icon} fontSize="small" sx={{ color: 'text.disabled' }} />
                )}
              </Box>
              <Box>
                <Typography variant="body2" fontWeight={isActive ? 700 : 500}>
                  {s.label}
                </Typography>
                {isActive && (
                  <Typography variant="caption" color="text.secondary">
                    {s.hint}
                  </Typography>
                )}
              </Box>
            </Stack>
          );
        })}
      </Stack>
    </Box>
  );
}
