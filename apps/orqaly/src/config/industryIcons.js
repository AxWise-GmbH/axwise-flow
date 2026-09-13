/**
 * Industry -> icon resolution for Consilium boards / team templates.
 *
 * Marketplace Consilium templates (`consiliumTemplates.js`) carry an `industry`
 * string plus a snake_case Material `icon` ligature. Live boards derive their
 * industry from free text. This resolver returns a renderable MUI icon for
 * either input, so `IndustryIcon` can drop into a card's existing tile.
 *
 * Mirrors the models brand resolver (`modelBrands.js`).
 */
import CodeOutlinedIcon from '@mui/icons-material/CodeOutlined';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import LocalHospitalOutlinedIcon from '@mui/icons-material/LocalHospitalOutlined';
import ShoppingCartOutlinedIcon from '@mui/icons-material/ShoppingCartOutlined';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import PrecisionManufacturingOutlinedIcon from '@mui/icons-material/PrecisionManufacturingOutlined';
import ApartmentOutlinedIcon from '@mui/icons-material/ApartmentOutlined';
import MovieOutlinedIcon from '@mui/icons-material/MovieOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import DnsOutlinedIcon from '@mui/icons-material/DnsOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import FlightOutlinedIcon from '@mui/icons-material/FlightOutlined';
import RestaurantOutlinedIcon from '@mui/icons-material/RestaurantOutlined';
import AgricultureOutlinedIcon from '@mui/icons-material/AgricultureOutlined';
import CellTowerOutlinedIcon from '@mui/icons-material/CellTowerOutlined';
import CurrencyBitcoinIcon from '@mui/icons-material/CurrencyBitcoin';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import SportsEsportsOutlinedIcon from '@mui/icons-material/SportsEsportsOutlined';

// An icon record: `name` is the PascalCase MUI name (also used to look up a
// Phosphor variant in advanced mode), `fallback` is the MUI component.
const ico = (name, fallback) => ({ name, fallback });

// Honor the snake_case `icon` ligature the templates already ship.
const LIGATURE = {
  code: ico('CodeOutlined', CodeOutlinedIcon),
  account_balance: ico('AccountBalanceOutlined', AccountBalanceOutlinedIcon),
  local_hospital: ico('LocalHospitalOutlined', LocalHospitalOutlinedIcon),
  shopping_cart: ico('ShoppingCartOutlined', ShoppingCartOutlinedIcon),
  storefront: ico('StorefrontOutlined', StorefrontOutlinedIcon),
  gavel: ico('GavelOutlined', GavelOutlinedIcon),
  precision_manufacturing: ico('PrecisionManufacturingOutlined', PrecisionManufacturingOutlinedIcon),
  apartment: ico('ApartmentOutlined', ApartmentOutlinedIcon),
  movie: ico('MovieOutlined', MovieOutlinedIcon),
  school: ico('SchoolOutlined', SchoolOutlinedIcon),
  bolt: ico('BoltOutlined', BoltOutlinedIcon),
  campaign: ico('CampaignOutlined', CampaignOutlinedIcon),
  dns: ico('DnsOutlined', DnsOutlinedIcon),
};

// Keyword patterns matched against the industry text. First match wins, so
// keep specific terms above generic ones. Covers the CLAUDE.md directions
// (e-commerce, fintech, marketing, data-center) plus the template industries.
const PATTERNS = [
  [/fintech|finance|financ|banking|\bbank|invest|insur|wealth/, ico('AccountBalanceOutlined', AccountBalanceOutlinedIcon)],
  [/health|pharma|medical|clinic|biotech|life science/, ico('LocalHospitalOutlined', LocalHospitalOutlinedIcon)],
  [/e-?commerce|retail|commerce|shop|consumer goods/, ico('StorefrontOutlined', StorefrontOutlinedIcon)],
  [/legal|\blaw\b|consult|advisory|compliance/, ico('GavelOutlined', GavelOutlinedIcon)],
  [/manufactur|industrial|factory|automotive/, ico('PrecisionManufacturingOutlined', PrecisionManufacturingOutlinedIcon)],
  [/real estate|property|proptech|construction/, ico('ApartmentOutlined', ApartmentOutlinedIcon)],
  [/media|entertainment|film|music|publish/, ico('MovieOutlined', MovieOutlinedIcon)],
  [/gaming|game|esports/, ico('SportsEsportsOutlined', SportsEsportsOutlinedIcon)],
  [/education|edtech|learning|academ|school|university/, ico('SchoolOutlined', SchoolOutlinedIcon)],
  [/energy|sustainab|utilit|renewable|cleantech|\besg\b|climate/, ico('BoltOutlined', BoltOutlinedIcon)],
  [/marketing|advertis|growth|\bads?\b|brand/, ico('CampaignOutlined', CampaignOutlinedIcon)],
  [/data[- ]?cent|infrastructure|devops|cloud|hosting|server/, ico('DnsOutlined', DnsOutlinedIcon)],
  [/logistic|supply chain|transport|shipping|freight/, ico('LocalShippingOutlined', LocalShippingOutlinedIcon)],
  [/travel|hospitality|tourism|airline|aviation/, ico('FlightOutlined', FlightOutlinedIcon)],
  [/food|restaurant|beverage|culinary/, ico('RestaurantOutlined', RestaurantOutlinedIcon)],
  [/agricultur|agritech|farming/, ico('AgricultureOutlined', AgricultureOutlinedIcon)],
  [/telecom|telecommunication|5g|network/, ico('CellTowerOutlined', CellTowerOutlinedIcon)],
  [/crypto|blockchain|web3|defi/, ico('CurrencyBitcoin', CurrencyBitcoinIcon)],
  [/security|cyber|privacy/, ico('ShieldOutlined', ShieldOutlinedIcon)],
  [/tech|saas|software|\bit\b|developer|platform|\bai\b|data/, ico('CodeOutlined', CodeOutlinedIcon)],
];

/**
 * Resolve an industry icon record, or `null` when unrecognised (caller renders
 * a generic groups icon).
 * @param {string} [industry] free-text industry / sector
 * @param {string} [iconHint] snake_case Material ligature (e.g. template `icon`)
 * @returns {{ name: string, fallback: import('react').ComponentType } | null}
 */
export function resolveIndustryIcon(industry, iconHint) {
  if (iconHint && LIGATURE[iconHint]) return LIGATURE[iconHint];
  const hay = (industry || '').toLowerCase().trim();
  if (!hay) return null;
  const match = PATTERNS.find(([re]) => re.test(hay));
  return match ? match[1] : null;
}
