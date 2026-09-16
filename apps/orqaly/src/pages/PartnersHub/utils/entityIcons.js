/**
 * Icon resolvers for the Partners hub.
 *  - ENTITY_TYPE_ICON_MAP: keyed by a type config's `icon` name (system types).
 *  - metricIcon(): picks a glyph for a metric card by its format/agg.
 * Both fall back to a generic glyph so custom types/metrics still render.
 */
import HandshakeOutlinedIcon from '@mui/icons-material/HandshakeOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import WarehouseOutlinedIcon from '@mui/icons-material/WarehouseOutlined';
import ContactsOutlinedIcon from '@mui/icons-material/ContactsOutlined';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import PaidOutlinedIcon from '@mui/icons-material/PaidOutlined';
import PercentOutlinedIcon from '@mui/icons-material/PercentOutlined';
import NumbersOutlinedIcon from '@mui/icons-material/NumbersOutlined';
import FormatListNumberedOutlinedIcon from '@mui/icons-material/FormatListNumberedOutlined';

export const ENTITY_TYPE_ICON_MAP = {
  HandshakeOutlined: HandshakeOutlinedIcon,
  LocalShippingOutlined: LocalShippingOutlinedIcon,
  WarehouseOutlined: WarehouseOutlinedIcon,
  ContactsOutlined: ContactsOutlinedIcon,
};

export function entityTypeIcon(iconName) {
  return ENTITY_TYPE_ICON_MAP[iconName] || CategoryOutlinedIcon;
}

/** Icon for a metric stat card, chosen from the metric's format/agg. */
export function metricIcon(metric, typeIcon) {
  if (metric.agg === 'count') return typeIcon || FormatListNumberedOutlinedIcon;
  if (metric.format === 'currency') return PaidOutlinedIcon;
  if (metric.format === 'percent') return PercentOutlinedIcon;
  return NumbersOutlinedIcon;
}
