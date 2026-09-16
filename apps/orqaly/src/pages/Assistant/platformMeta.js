/**
 * Platform / connector identity for the Assistant Console cards.
 *
 * The codebase has no shared brand-icon map for these, so we mirror the
 * PLATFORM_META shape used in the Communicator tabs. Telegram has a native MUI
 * logo; Slack / Obsidian / Notion / Web fall back to the closest MUI glyph.
 *
 * The `color` values are brand identity colors (not theme tokens), so the
 * literals are intentional and isolated to this one file.
 */
import TelegramIcon from '@mui/icons-material/Telegram';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import NoteOutlinedIcon from '@mui/icons-material/NoteOutlined';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import LanguageOutlinedIcon from '@mui/icons-material/LanguageOutlined';

export const PLATFORM_META = {
  telegram: { label: 'Telegram', Icon: TelegramIcon, color: '#229ED9' },
  slack: { label: 'Slack', Icon: HubOutlinedIcon, color: '#611f69' },
  obsidian: { label: 'Obsidian', Icon: NoteOutlinedIcon, color: '#7C3AED' },
  notion: { label: 'Notion', Icon: ArticleOutlinedIcon, color: '#9AA4AF' },
  web: { label: 'Web', Icon: LanguageOutlinedIcon, color: '#10B981' },
};

/** Resolve a platform/connector key to its meta, with a neutral fallback. */
export function platformMeta(key) {
  const k = String(key || '').toLowerCase();
  return (
    PLATFORM_META[k] || { label: key || 'Channel', Icon: LanguageOutlinedIcon, color: '#8B949E' }
  );
}
