import { Button, alpha, useTheme } from '@mui/material';
import { useAssistantConversation } from '../../context/AssistantConversationContext';

/**
 * "+ New", in the fixed top bar.
 *
 * The same slot, shape and wording as the running goal's "+ New", so the two
 * surfaces offer their way out identically. Only one is ever on screen: a goal
 * publishes itself only while its thread is mounted, and that thread is
 * unmounted whenever the Assistant tab is the one showing. It began as an icon
 * next to the Assistant/Goal pills, where it crowded the composer and had to be
 * hovered before it said anything.
 *
 * Renders nothing until a page publishes a conversation, which on most routes is
 * never. Starting a new chat does not delete the old one - History reopens it.
 */
export default function TopBarAssistantActions() {
  const theme = useTheme();
  const { active, onNewChat } = useAssistantConversation();

  if (!active) return null;

  return (
    <Button
      size="small"
      variant="outlined"
      onClick={() => onNewChat()}
      sx={{
        flexShrink: 0,
        textTransform: 'none',
        fontSize: '0.74rem',
        fontWeight: 600,
        borderRadius: 2,
        borderColor: alpha(theme.palette.text.primary, 0.18),
        color: 'text.primary',
        px: 1.1,
        minWidth: 0,
      }}
    >
      + New
    </Button>
  );
}
