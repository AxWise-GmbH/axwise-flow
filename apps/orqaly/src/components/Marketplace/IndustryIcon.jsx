import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import AppIcon from '../icons/AppIcon';
import { resolveIndustryIcon } from '../../config/industryIcons';

/**
 * Renders an industry-representative icon for a Consilium board / template.
 * Drops into a card's existing tile. Falls back to a generic groups icon when
 * the industry is unrecognised, so every card keeps a same-size glyph.
 */
export default function IndustryIcon({ industry, icon, color, size = 20 }) {
  const resolved = resolveIndustryIcon(industry, icon) || {
    name: 'GroupsOutlined',
    fallback: GroupsOutlinedIcon,
  };
  // AppIcon's advanced Iconify branch reads its explicit `size` prop and does
  // not consume MUI's `sx.fontSize`; pass the dimension through the supported
  // channel so both icon implementations render at the same size.
  return <AppIcon name={resolved.name} fallback={resolved.fallback} size={size} sx={{ color }} />;
}
