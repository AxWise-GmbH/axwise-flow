import { Alert, Box, Chip, List, ListItem, ListItemText, Stack, Typography } from '@mui/material';
import MemoryOutlinedIcon from '@mui/icons-material/MemoryOutlined';
import BentoCard from '../Common/BentoCard';
import EmptyState from '../Common/EmptyState';

function asItems(memory) {
  if (Array.isArray(memory)) return memory;
  return memory?.items || memory?.memory_items || [];
}

export default function MemoryScopeSummary({ memory, unavailableReason }) {
  const items = asItems(memory);
  const namespaces = memory?.namespaces || memory?.allowed_namespaces || [];
  const scopeSummary =
    memory?.scope_summary ||
    memory?.scopeSummary ||
    memory?.purpose ||
    'No reusable memory selected.';

  return (
    <BentoCard
      title="Memory scope"
      subtitle="Only authorized, relevant memory enters this run"
      icon={MemoryOutlinedIcon}
    >
      {unavailableReason ? (
        <Alert severity="info">{unavailableReason}</Alert>
      ) : (
        <Typography variant="body2">{scopeSummary}</Typography>
      )}
      {Array.isArray(namespaces) && namespaces.length > 0 ? (
        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 1.5 }}>
          {namespaces.map((namespace) => (
            <Chip
              key={namespace.id || namespace.name || namespace}
              size="small"
              variant="outlined"
              label={namespace.label || namespace.name || String(namespace)}
            />
          ))}
        </Stack>
      ) : null}

      {!unavailableReason ? (
        <Box sx={{ mt: 1.5 }}>
          {items.length === 0 ? (
            <EmptyState
              dense
              icon={MemoryOutlinedIcon}
              title="No memory used"
              description="A zero-memory result is valid when nothing relevant is authorized."
            />
          ) : (
            <List dense disablePadding aria-label="Memory used by this run">
              {items.map((item, index) => (
                <ListItem
                  key={item.memory_id || item.id || index}
                  disableGutters
                  alignItems="flex-start"
                >
                  <ListItemText
                    primary={item.summary || item.content || item.label || 'Memory item'}
                    secondary={
                      item.why_used ||
                      item.whyUsed ||
                      item.reason ||
                      'Selected by the authorized memory router.'
                    }
                  />
                  {item.classification ? (
                    <Chip size="small" label={item.classification} variant="outlined" />
                  ) : null}
                </ListItem>
              ))}
            </List>
          )}
        </Box>
      ) : null}
    </BentoCard>
  );
}
