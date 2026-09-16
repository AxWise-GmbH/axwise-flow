import {
  Drawer,
  Box,
  Typography,
  IconButton,
  Divider,
  List,
  ListItem,
  ListItemText,
  Chip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

import AppIcon from '../../../components/icons/AppIcon';

export default function NotificationCenterDrawer({ open, onClose, notifications = [] }) {
  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Box sx={{ width: 420, p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            mb: 1.5,
          }}
        >
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Notification Center
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Page activity updates
            </Typography>
          </Box>
          <IconButton onClick={onClose} size="small">
            <AppIcon name="Close" fallback={CloseIcon} />
          </IconButton>
        </Box>

        <Divider sx={{ mb: 1 }} />

        {notifications.length === 0 ? (
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              No changes yet
            </Typography>
          </Box>
        ) : (
          <List sx={{ flex: 1, overflow: 'auto', py: 0 }}>
            {notifications.map((item) => (
              <ListItem key={item.id} alignItems="flex-start" sx={{ px: 0, py: 1.1 }}>
                <ListItemText
                  primary={
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 1,
                      }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {item.topic}
                      </Typography>
                      <Chip
                        label={item.time}
                        size="small"
                        sx={{
                          height: 20,
                          fontSize: '0.62rem',
                          bgcolor: '#F1F5F9',
                          color: '#64748B',
                        }}
                      />
                    </Box>
                  }
                  secondary={
                    <Box component="span" sx={{ display: 'block' }}>
                      <Typography
                        component="span"
                        variant="body2"
                        color="text.secondary"
                        sx={{ mt: 0.4, fontSize: '0.78rem', lineHeight: 1.35, display: 'block' }}
                      >
                        {item.changes}
                      </Typography>
                      {item.action?.target_url && (
                        <Box component="span" sx={{ display: 'inline-flex', mt: 0.75 }}>
                          <Typography
                            component="a"
                            href={item.action.target_url}
                            sx={{
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              textDecoration: 'none',
                              color: 'primary.main',
                              px: 1.25,
                              py: 0.5,
                              borderRadius: 1,
                              bgcolor: 'action.hover',
                              '&:hover': { bgcolor: 'action.selected' },
                            }}
                          >
                            → {item.action.label || 'Open'}
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  }
                />
              </ListItem>
            ))}
          </List>
        )}
      </Box>
    </Drawer>
  );
}
