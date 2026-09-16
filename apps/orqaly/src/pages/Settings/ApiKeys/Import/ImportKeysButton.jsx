import { useState } from 'react';
import { Button } from '@mui/material';
import FileUploadOutlinedIcon from '@mui/icons-material/FileUploadOutlined';
import ImportKeysDialog from './ImportKeysDialog';

import AppIcon from '../../../../components/icons/AppIcon';

export default function ImportKeysButton({ onImported }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="outlined"
        size="small"
        startIcon={<AppIcon name="FileUploadOutlined" fallback={FileUploadOutlinedIcon} />}
        onClick={() => setOpen(true)}
        sx={{ textTransform: 'none' }}
      >
        Import keys
      </Button>
      <ImportKeysDialog open={open} onClose={() => setOpen(false)} onComplete={onImported} />
    </>
  );
}
