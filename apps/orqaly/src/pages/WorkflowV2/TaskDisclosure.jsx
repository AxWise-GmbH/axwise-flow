import { useId, useState } from 'react';
import { Box, Button, Stack } from '@mui/material';

/** Keep optional detail out of both the page and accessibility tree until requested. */
export function TaskDisclosure({ title, children, defaultOpen = false }) {
  const id = useId();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Box sx={{ minWidth: 0, borderTop: '1px solid', borderColor: 'divider', pt: 0.5 }}>
      <Button
        color="inherit"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        sx={{ justifyContent: 'space-between', width: '100%', textAlign: 'left', gap: 1, py: 1 }}
      >
        {title}
        <Box component="span" aria-hidden>
          {open ? '−' : '+'}
        </Box>
      </Button>
      {open ? (
        <Stack id={id} spacing={1.5} sx={{ pt: 1, pb: 1.5 }}>
          {children}
        </Stack>
      ) : null}
    </Box>
  );
}
