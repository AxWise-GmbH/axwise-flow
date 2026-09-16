// Fallback for LandingGlassIcon when a name is not in `glassIconMap`.
// Maps MUI-outlined-icon names (matching @mui/icons-material module names)
// to the actual icon component, so passing iconName="VideocamOutlined"
// renders the proper MUI icon inside the glass tile instead of an empty cube.
//
// Order of lookup inside LandingGlassIcon:
//   1. glassIconMap (premium custom illustrations)
//   2. muiFallbackMap (this file - plain MUI outlined icons)
//   3. AutoAwesomeOutlined (final default)

// Industries / personas
import LocalHospitalOutlinedIcon from '@mui/icons-material/LocalHospitalOutlined';
import HomeWorkOutlinedIcon from '@mui/icons-material/HomeWorkOutlined';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import RestaurantOutlinedIcon from '@mui/icons-material/RestaurantOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import PrecisionManufacturingOutlinedIcon from '@mui/icons-material/PrecisionManufacturingOutlined';

// Instruments + Control Point surfaces
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';

// Feature-level icons used in FeatureMosaic / RelatedGrid items
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import FormatQuoteOutlinedIcon from '@mui/icons-material/FormatQuoteOutlined';
import DragIndicatorOutlinedIcon from '@mui/icons-material/DragIndicatorOutlined';
import ImportExportOutlinedIcon from '@mui/icons-material/ImportExportOutlined';
import CallSplitOutlinedIcon from '@mui/icons-material/CallSplitOutlined';
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined';
import ReplayOutlinedIcon from '@mui/icons-material/ReplayOutlined';
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined';
import AutorenewOutlinedIcon from '@mui/icons-material/AutorenewOutlined';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import FilterListOutlinedIcon from '@mui/icons-material/FilterListOutlined';
import PaletteOutlinedIcon from '@mui/icons-material/PaletteOutlined';
import TimelineOutlinedIcon from '@mui/icons-material/TimelineOutlined';

// Additional icons that appear in marketing data but are also worth covering
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import KeyOutlinedIcon from '@mui/icons-material/KeyOutlined';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import HistoryEduOutlinedIcon from '@mui/icons-material/HistoryEduOutlined';
import ShareOutlinedIcon from '@mui/icons-material/ShareOutlined';
import EventRepeatOutlinedIcon from '@mui/icons-material/EventRepeatOutlined';
import ChatBubbleOutlinedIcon from '@mui/icons-material/ChatBubbleOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import RecordVoiceOverOutlinedIcon from '@mui/icons-material/RecordVoiceOverOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import IntegrationInstructionsOutlinedIcon from '@mui/icons-material/IntegrationInstructionsOutlined';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import BarChartOutlinedIcon from '@mui/icons-material/BarChartOutlined';
import PaidOutlinedIcon from '@mui/icons-material/PaidOutlined';
import MicNoneOutlinedIcon from '@mui/icons-material/MicNoneOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import ExtensionOutlinedIcon from '@mui/icons-material/ExtensionOutlined';
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import SecurityOutlinedIcon from '@mui/icons-material/SecurityOutlined';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import PowerOutlinedIcon from '@mui/icons-material/PowerOutlined';
import FilterAltOutlinedIcon from '@mui/icons-material/FilterAltOutlined';
import CodeOutlinedIcon from '@mui/icons-material/CodeOutlined';
import AutoFixHighOutlinedIcon from '@mui/icons-material/AutoFixHighOutlined';
import PublicOutlinedIcon from '@mui/icons-material/PublicOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import PanToolOutlinedIcon from '@mui/icons-material/PanToolOutlined';
import RestoreOutlinedIcon from '@mui/icons-material/RestoreOutlined';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import BadgeIcon from '@mui/icons-material/Badge';
import StorefrontRoundedIcon from '@mui/icons-material/StorefrontRounded';
import AssignmentTurnedInOutlinedIcon from '@mui/icons-material/AssignmentTurnedInOutlined';
import HowToVoteOutlinedIcon from '@mui/icons-material/HowToVoteOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import HelpOutlineOutlinedIcon from '@mui/icons-material/HelpOutlineOutlined';

const MAP = {
  // Industries / personas
  LocalHospitalOutlined: LocalHospitalOutlinedIcon,
  HomeWorkOutlined: HomeWorkOutlinedIcon,
  StorefrontOutlined: StorefrontOutlinedIcon,
  RestaurantOutlined: RestaurantOutlinedIcon,
  SchoolOutlined: SchoolOutlinedIcon,
  GavelOutlined: GavelOutlinedIcon,
  CampaignOutlined: CampaignOutlinedIcon,
  VideocamOutlined: VideocamOutlinedIcon,
  BadgeOutlined: BadgeOutlinedIcon,
  PrecisionManufacturingOutlined: PrecisionManufacturingOutlinedIcon,

  // Instruments + Control Point surfaces
  TaskAltOutlined: TaskAltOutlinedIcon,
  FolderOpenOutlined: FolderOpenOutlinedIcon,
  BusinessOutlined: BusinessOutlinedIcon,
  TrendingUpOutlined: TrendingUpOutlinedIcon,
  InboxOutlined: InboxOutlinedIcon,

  // Features
  CloudUploadOutlined: CloudUploadOutlinedIcon,
  FormatQuoteOutlined: FormatQuoteOutlinedIcon,
  DragIndicatorOutlined: DragIndicatorOutlinedIcon,
  ImportExportOutlined: ImportExportOutlinedIcon,
  CallSplitOutlined: CallSplitOutlinedIcon,
  StorageOutlined: StorageOutlinedIcon,
  ReplayOutlined: ReplayOutlinedIcon,
  LayersOutlined: LayersOutlinedIcon,
  AutorenewOutlined: AutorenewOutlinedIcon,
  TimerOutlined: TimerOutlinedIcon,
  FilterListOutlined: FilterListOutlinedIcon,
  PaletteOutlined: PaletteOutlinedIcon,
  TimelineOutlined: TimelineOutlinedIcon,

  // Other names referenced across data files (cover broadly so we never
  // regress to an empty cube if a new entry is added).
  LockOutlined: LockOutlinedIcon,
  KeyOutlined: KeyOutlinedIcon,
  BoltOutlined: BoltOutlinedIcon,
  EmailOutlined: EmailOutlinedIcon,
  SearchOutlined: SearchOutlinedIcon,
  HistoryOutlined: HistoryOutlinedIcon,
  HistoryEduOutlined: HistoryEduOutlinedIcon,
  ShareOutlined: ShareOutlinedIcon,
  EventRepeatOutlined: EventRepeatOutlinedIcon,
  ChatBubbleOutlined: ChatBubbleOutlinedIcon,
  FactCheckOutlined: FactCheckOutlinedIcon,
  RecordVoiceOverOutlined: RecordVoiceOverOutlinedIcon,
  PictureAsPdfOutlined: PictureAsPdfOutlinedIcon,
  IntegrationInstructionsOutlined: IntegrationInstructionsOutlinedIcon,
  ContentCopyOutlined: ContentCopyOutlinedIcon,
  ScienceOutlined: ScienceOutlinedIcon,
  BarChartOutlined: BarChartOutlinedIcon,
  PaidOutlined: PaidOutlinedIcon,
  MicNoneOutlined: MicNoneOutlinedIcon,
  GroupsOutlined: GroupsOutlinedIcon,
  SmartToyOutlined: SmartToyOutlinedIcon,
  ExtensionOutlined: ExtensionOutlinedIcon,
  AdminPanelSettingsOutlined: AdminPanelSettingsOutlinedIcon,
  SecurityOutlined: SecurityOutlinedIcon,
  ShieldOutlined: ShieldOutlinedIcon,
  ForumOutlined: ForumOutlinedIcon,
  PowerOutlined: PowerOutlinedIcon,
  FilterAltOutlined: FilterAltOutlinedIcon,
  CodeOutlined: CodeOutlinedIcon,
  AutoFixHighOutlined: AutoFixHighOutlinedIcon,
  PublicOutlined: PublicOutlinedIcon,
  TuneOutlined: TuneOutlinedIcon,
  VisibilityOutlined: VisibilityOutlinedIcon,
  PanToolOutlined: PanToolOutlinedIcon,
  RestoreOutlined: RestoreOutlinedIcon,
  BuildOutlined: BuildOutlinedIcon,
  HubOutlined: HubOutlinedIcon,
  AccountTreeOutlined: AccountTreeOutlinedIcon,
  AssessmentOutlined: AssessmentOutlinedIcon,
  DashboardOutlined: DashboardOutlinedIcon,
  MenuBookOutlined: MenuBookOutlinedIcon,
  AutoAwesomeOutlined: AutoAwesomeOutlinedIcon,
  Badge: BadgeIcon,
  StorefrontRounded: StorefrontRoundedIcon,
  AssignmentTurnedInOutlined: AssignmentTurnedInOutlinedIcon,
  HowToVoteOutlined: HowToVoteOutlinedIcon,
  AssignmentOutlined: AssignmentOutlinedIcon,
  DescriptionOutlined: DescriptionOutlinedIcon,
  Send: SendOutlinedIcon,
  SendOutlined: SendOutlinedIcon,
  HelpOutlineOutlined: HelpOutlineOutlinedIcon,
};

export function lookupMuiFallback(name) {
  if (!name) return null;
  return MAP[name] || null;
}

// Last-resort generic icon for the rare case where neither map matches.
export const DEFAULT_FALLBACK = AutoAwesomeOutlinedIcon;
