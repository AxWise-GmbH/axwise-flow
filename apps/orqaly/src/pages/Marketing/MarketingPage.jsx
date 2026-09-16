import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Tabs,
  Tab,
  Stack,
  Chip,
  IconButton,
  Tooltip,
  Switch,
  LinearProgress,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  alpha,
  useTheme,
  Snackbar,
  Alert,
  Grid,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';

// MUI Icons
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import PeopleIcon from '@mui/icons-material/People';
import CampaignIcon from '@mui/icons-material/Campaign';
import FolderIcon from '@mui/icons-material/Folder';
import AutoGraphIcon from '@mui/icons-material/AutoGraph';
import GroupsIcon from '@mui/icons-material/Groups';
import AssignmentIcon from '@mui/icons-material/Assignment';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import ShareIcon from '@mui/icons-material/Share';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import LaunchIcon from '@mui/icons-material/Launch';
import SpeedIcon from '@mui/icons-material/Speed';

// Recharts
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
  ComposedChart,
  Line,
} from 'recharts';

import { fireConfetti } from '../../utils/confettiCanvas';
import PageLayout from '../../components/Common/PageLayout';
import BentoCard from '../../components/Common/BentoCard';
import { createHoverGlowShadow } from '../../theme/hoverGlow';
import { listContacts, addContact, deleteContact } from '../../services/contactsService';
import { campaignsService } from '../../services/campaignsService';

import AppIcon from '../../components/icons/AppIcon';

// ---------------------------------------------------------------------------
// Mock Data definitions
// ---------------------------------------------------------------------------

const MOCK_TRAFFIC_DATA = [
  { day: '01 Jun', clicks: 1200, regs: 420, depositors: 45, ngr: 3200, spend: 1350 },
  { day: '04 Jun', clicks: 1500, regs: 610, depositors: 62, ngr: 4860, spend: 1860 },
  { day: '07 Jun', clicks: 1800, regs: 780, depositors: 80, ngr: 6400, spend: 2400 },
  { day: '10 Jun', clicks: 2200, regs: 980, depositors: 110, ngr: 8300, spend: 3300 },
  { day: '13 Jun', clicks: 2000, regs: 840, depositors: 95, ngr: 7150, spend: 2850 },
  { day: '16 Jun', clicks: 2600, regs: 1150, depositors: 140, ngr: 10400, spend: 4200 },
  { day: '18 Jun', clicks: 3100, regs: 1490, depositors: 195, ngr: 15850, spend: 5850 },
];

const MOCK_CAMPAIGNS = [
  {
    id: 'MC-01',
    name: 'Summer Slots CPA [BR]',
    channel: 'Facebook Ads',
    geo: 'BR',
    redirectType: 'Flow Redirect',
    payoutModel: 'CPA $150',
    budget: 15000,
    spend: 12400,
    clicks: 82000,
    regs: 3100,
    ftds: 382,
    ctr: 4.8,
    cvr: 12.3,
    epc: 1.84,
    revenue: 57300,
    profit: 44900,
    roi: 362,
    status: 'Active',
  },
  {
    id: 'MC-02',
    name: 'Crypto Deposit RevShare [CA]',
    channel: 'Google Search',
    geo: 'CA',
    redirectType: 'Direct Link',
    payoutModel: 'RevShare 45%',
    budget: 8000,
    spend: 5200,
    clicks: 35000,
    regs: 1400,
    ftds: 195,
    ctr: 5.6,
    cvr: 13.9,
    epc: 1.55,
    revenue: 19500,
    profit: 14300,
    roi: 275,
    status: 'Active',
  },
  {
    id: 'MC-03',
    name: 'Reactivation Email [DE]',
    channel: 'Email',
    geo: 'DE',
    redirectType: 'Lander & Offer',
    payoutModel: 'CPA $120',
    budget: 1200,
    spend: 1200,
    clicks: 4500,
    regs: 980,
    ftds: 240,
    ctr: 24.2,
    cvr: 24.4,
    epc: 6.4,
    revenue: 28800,
    profit: 27600,
    roi: 2300,
    status: 'Active',
  },
  {
    id: 'MC-04',
    name: 'Reddit Poker Hybrid [US]',
    channel: 'Reddit Ads',
    geo: 'US',
    redirectType: 'Flow Redirect',
    payoutModel: 'Hybrid CPA+RS',
    budget: 5000,
    spend: 4900,
    clicks: 12000,
    regs: 680,
    ftds: 112,
    ctr: 1.8,
    cvr: 16.4,
    epc: 1.62,
    revenue: 19440,
    profit: 14540,
    roi: 296,
    status: 'Paused',
  },
  {
    id: 'MC-05',
    name: 'SMS Recovery Auto [IT]',
    channel: 'SMS Automation',
    geo: 'IT',
    redirectType: 'Direct Link',
    payoutModel: 'RevShare 40%',
    budget: 2000,
    spend: 850,
    clicks: 5000,
    regs: 820,
    ftds: 410,
    ctr: 15.5,
    cvr: 50.0,
    epc: 2.1,
    revenue: 10500,
    profit: 9650,
    roi: 1135,
    status: 'Active',
  },
];

const MOCK_CRM_LEADS = [
  {
    id: 'CRM-1',
    name: 'Maximilian Vance',
    email: 'max@vance-holdings.com',
    phone: '+49 171 2233',
    value: '$18,400',
    segment: 'Whale',
    score: 95,
    country: 'DE',
    risk: 'Low',
    source: 'fb_slots_vip',
    ftdStatus: 'Deposited',
    joined: '2026-06-01',
    fraudRisk: 'Clear',
  },
  {
    id: 'CRM-2',
    name: 'Ksenia Petrova',
    email: 'ksenia.p@mail.ru',
    phone: '+7 903 4455',
    value: '$6,200',
    segment: 'Active Player',
    score: 82,
    country: 'RU',
    risk: 'Medium',
    source: 'google_search_bet',
    ftdStatus: 'Deposited',
    joined: '2026-06-04',
    fraudRisk: 'VPN Detected',
  },
  {
    id: 'CRM-3',
    name: 'Arthur Pendragon',
    email: 'arthur@royal-spin.uk',
    phone: '+44 7911 123',
    value: '$1,250',
    segment: 'New User',
    score: 68,
    country: 'GB',
    risk: 'Low',
    source: 'email_mailer_re',
    ftdStatus: 'None',
    joined: '2026-06-07',
    fraudRisk: 'Clear',
  },
  {
    id: 'CRM-4',
    name: 'John Miller',
    email: 'jmiller@gmail.com',
    phone: '+1 212 555',
    value: '$450',
    segment: 'Churn Risk',
    score: 14,
    country: 'US',
    risk: 'High',
    source: 'reddit_fintech',
    ftdStatus: 'Deposited',
    joined: '2026-06-10',
    fraudRisk: 'Multi-account',
  },
  {
    id: 'CRM-5',
    name: 'Yuki Sato',
    email: 'yuki@sato-consulting.jp',
    phone: '+81 90 1234',
    value: '$22,500',
    segment: 'Whale',
    score: 98,
    country: 'JP',
    risk: 'Low',
    source: 'fb_slots_vip',
    ftdStatus: 'Deposited',
    joined: '2026-06-12',
    fraudRisk: 'Clear',
  },
];

const COHORT_RETENTION = [
  {
    cohort: 'Jan 2026',
    size: 1200,
    m0: '100%',
    m1: '48%',
    m2: '41%',
    m3: '36%',
    m4: '34%',
    m5: '32%',
  },
  {
    cohort: 'Feb 2026',
    size: 1450,
    m0: '100%',
    m1: '52%',
    m2: '44%',
    m3: '38%',
    m4: '35%',
    m5: '-',
  },
  { cohort: 'Mar 2026', size: 1800, m0: '100%', m1: '55%', m2: '48%', m3: '42%', m4: '-', m5: '-' },
  { cohort: 'Apr 2026', size: 2100, m0: '100%', m1: '58%', m2: '50%', m3: '-', m4: '-', m5: '-' },
  { cohort: 'May 2026', size: 2500, m0: '100%', m1: '62%', m2: '-', m3: '-', m4: '-', m5: '-' },
];

const CHANNEL_STATS = [
  { channel: 'Search Ads', traffic: 45000, cvr: 6.2, cost: 8900 },
  { channel: 'Direct Traffic', traffic: 32000, cvr: 8.5, cost: 0 },
  { channel: 'Social Media', traffic: 58000, cvr: 3.4, cost: 14500 },
  { channel: 'Affiliates', traffic: 29000, cvr: 9.1, cost: 24500 },
  { channel: 'Email Outreach', traffic: 18000, cvr: 4.8, cost: 450 },
];

const APPROVALS_QUEUE = [
  {
    id: 'AP-09',
    asset: 'Summer High Roller Banner (PNG)',
    size: '3.4 MB',
    manager: 'Acquisition Agent',
    status: 'Pending Review',
  },
  {
    id: 'AP-10',
    asset: 'Fintech Automated Newsletter Copy',
    size: '12 KB',
    manager: 'Content Copier Agent',
    status: 'Pending Review',
  },
  {
    id: 'AP-11',
    asset: 'E-commerce Discount Code 15% OFF',
    size: '1 Entry',
    manager: 'System Controller',
    status: 'Pending Review',
  },
];

// Contextual Recommendations per Sub-Page
const PAGE_RECOMMENDATIONS = {
  dashboard: [
    {
      text: 'Allocate $2,500 budget from paused Reddit campaign to high-performing Google Search vertical.',
      actionText: 'Shift Budget',
    },
    {
      text: 'Auto-schedule a newsletter blast targeting the Whale segment before the weekend.',
      actionText: 'Blast Email',
    },
  ],
  audiences: [
    {
      text: 'Create dynamic segment "High Churn Risk - Whale" to auto-trigger retention discounts.',
      actionText: 'Build Segment',
    },
    {
      text: 'Re-target players in cohort Feb 2026 that drop off in month 3.',
      actionText: 'Launch Retarget',
    },
  ],
  campaigns: [
    {
      text: 'Auto-pause Campaign MC-04 (Reddit) due to low CTR (<2%) and high cost-per-acquisition.',
      actionText: 'Pause Campaign',
    },
    {
      text: 'Activate variant B in A/B Test "Onboarding Flow v2" (Variant B has 98% significance).',
      actionText: 'Select Winner',
    },
  ],
  content: [
    {
      text: 'AI generated a new high-conversion banner ad variant. Push directly to materials folder.',
      actionText: 'Save Creative',
    },
    {
      text: 'Deploy highly-converting landing page template "Promo-Dark-Modern" to increase signups.',
      actionText: 'Deploy Page',
    },
  ],
  acquisition: [
    {
      text: 'Double referral commission tier from 10% to 20% to acquire active tech affiliates.',
      actionText: 'Update Commissions',
    },
    {
      text: 'Swap attribution model to "Data-Driven (AI)" to correctly attribute conversions to early banners.',
      actionText: 'Switch Attribution',
    },
  ],
  conversion: [
    {
      text: 'Increase button size for "Deposit Now" on mobile view based on heatmaps scroll drop.',
      actionText: 'Trigger Optimization',
    },
    {
      text: 'Set up webhook to notify Slack when Funnel drop-off rises above 15% in checkout.',
      actionText: 'Set Webhook',
    },
  ],
  retention: [
    {
      text: 'Trigger automated 20% cashback bonus coupon for users with high churn risk.',
      actionText: 'Send Reactivation',
    },
    {
      text: 'Customize landing page title text for Whale users using dynamic personalization copy.',
      actionText: 'Configure Personalization',
    },
  ],
  team: [
    {
      text: 'Promote Content Agent workload efficiency - assign creative design approvals template.',
      actionText: 'Optimize Workflow',
    },
    {
      text: 'Adjust budget allocating 10% more resources to retention goals.',
      actionText: 'Reallocate Resources',
    },
  ],
};

const DUMMY_LOGS = [
  'ORCHESTRATOR: Marketing vertical activated successfully.',
  'AGENT: Scanning traffic sources and referral networks...',
  'AGENT: Computed conversion drop-offs. Funnel analysis complete.',
  'ORCHESTRATOR: Idle. Awaiting autopilot toggle trigger...',
];

const SIMULATED_AUTOPILOT_STEPS = [
  'AGENT: Auto-detecting high churn risk users in Jan cohort...',
  'AGENT: Generated personalized email coupon copy (Code: WBACK15).',
  'ORCHESTRATOR: Deploying campaign "Autopilot Churn Win-Back" via email.',
  'AGENT: Adjusting variant budgets. Google search CPC bid increased by 5%.',
  'AGENT: UTM parameters validation complete. 12 links confirmed.',
  'ORCHESTRATOR: Checking approvals queue. Auto-approved Fintech Newsletter Copy.',
  'AGENT: Monitoring live CTR values. Statistical significance reached for A/B Test #2.',
];

export default function MarketingPage() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const { pageId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  // Route fallback or validate
  const activePage = useMemo(() => {
    const validPages = [
      'dashboard',
      'audiences',
      'campaigns',
      'content',
      'acquisition',
      'conversion',
      'retention',
      'team',
    ];
    return validPages.includes(pageId) ? pageId : 'dashboard';
  }, [pageId]);

  // Tab State Persisted in URL Query parameters
  const currentTab = useMemo(() => {
    return parseInt(searchParams.get('tab') || '0', 10);
  }, [searchParams]);

  const handleTabChange = useCallback(
    (event, newValue) => {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set('tab', String(newValue));
      setSearchParams(nextParams);
    },
    [searchParams, setSearchParams]
  );

  // Reset tab index to 0 when page route changes
  const prevPageRef = useRef(activePage);
  useEffect(() => {
    if (prevPageRef.current !== activePage) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set('tab', '0');
      setSearchParams(nextParams);
      prevPageRef.current = activePage;
    }
  }, [activePage, searchParams, setSearchParams]);

  // UI States
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });
  const [autopilotActive, setAutopilotActive] = useState(() => {
    return localStorage.getItem('orchestratori_marketing_autopilot_active') === 'true';
  });
  const [aiPanelOpen, setAiPanelOpen] = useState(true);
  const [autopilotLogs, setAutopilotLogs] = useState(() => {
    const saved = localStorage.getItem('orchestratori_marketing_autopilot_logs');
    return saved ? JSON.parse(saved) : DUMMY_LOGS;
  });

  const handleTriggerAction = useCallback((text) => {
    fireConfetti();
    const time = new Date().toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    setAutopilotLogs((prev) => {
      const next = [...prev, `[${time}] ACTION MANUAL: Applied action -> "${text}"`].slice(-50);
      localStorage.setItem('orchestratori_marketing_autopilot_logs', JSON.stringify(next));
      return next;
    });
    setToast({
      open: true,
      message: `Successfully applied adjustment: "${text.slice(0, 32)}..."`,
      severity: 'success',
    });
  }, []);

  const [activeGoal, setActiveGoal] = useState('Decrease Churn by 15%');

  // Interactive controls state
  const [forecastBudget, setForecastBudget] = useState(25000);
  const [forecastSplit, setForecastSplit] = useState({ google: 50, fb: 30, tiktok: 20 });
  const [attributionModel, setAttributionModel] = useState('First Touch');

  // Upgraded UTM parameters supporting click tracking click_id and sub_id parameters
  const [utmUrl, setUtmUrl] = useState({
    base: 'https://orqaly.com',
    source: 'newsletter',
    medium: 'email',
    campaign: 'summer_promo',
    sub_id1: 'affiliate123',
    sub_id2: 'fb_ads',
    click_id: 'click_xyz123',
  });

  const [approvals, setApprovals] = useState(APPROVALS_QUEUE);
  const [vipThreshold, setVipThreshold] = useState(5000);
  const [newSegName, setNewSegName] = useState('');
  const [couponCode, setCouponCode] = useState('MISSYOU20');

  // Service Integrations States (FB Pixel, GA4, Postbacks)
  const [fbPixelId, setFbPixelId] = useState(
    () => localStorage.getItem('orchestratori_marketing_fb_pixel_id') || ''
  );
  const [ga4MeasurementId, setGa4MeasurementId] = useState(
    () => localStorage.getItem('orchestratori_marketing_ga4_measurement_id') || ''
  );
  const [postbackUrlTemplate, setPostbackUrlTemplate] = useState(
    () =>
      localStorage.getItem('orchestratori_marketing_postback_url_template') ||
      'https://postback.affiliatenetwork.com/postback?click_id={click_id}&event={event}&payout={payout}'
  );

  // Modal Visibility States
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [createCampaignOpen, setCreateCampaignOpen] = useState(false);
  const [uploadAssetOpen, setUploadAssetOpen] = useState(false);
  const [addTaskOpen, setAddTaskOpen] = useState(false);

  // Form Value States with professional iGaming fields
  const [contactForm, setContactForm] = useState({
    name: '',
    email: '',
    phone: '',
    segment: 'New User',
    value: '$0',
    score: 80,
    country: 'US',
    risk: 'Low',
    source: 'fb_slots_vip',
    ftdStatus: 'None',
    joined: new Date().toISOString().split('T')[0],
    fraudRisk: 'Clear',
  });

  const [campaignForm, setCampaignForm] = useState({
    name: '',
    channel: 'Google Search',
    geo: 'US',
    redirectType: 'Direct Link',
    payoutModel: 'CPA $150',
    budget: 5000,
    status: 'Active',
  });

  const [assetForm, setAssetForm] = useState({
    title: '',
    type: 'Image',
    rating: 'A',
    conversions: 150,
  });

  const [taskForm, setTaskForm] = useState({
    task: '',
    assignee: 'Acquisition Agent',
  });

  const [utmLabel, setUtmLabel] = useState('');

  // Dynamic Data Lists
  const [crmList, setCrmList] = useState([]);
  const [crmLoading, setCrmLoading] = useState(false);

  const [campaignsList, setCampaignsList] = useState([]);
  const [campaignsLoading, setCampaignsLoading] = useState(false);

  const [assetsList, setAssetsList] = useState(() => {
    const saved = localStorage.getItem('orchestratori_marketing_assets');
    return saved
      ? JSON.parse(saved)
      : [
          {
            id: 'ASSET-1',
            title: 'VIP Launch Banner (300x250)',
            type: 'Image',
            rating: 'A+',
            conversions: 240,
          },
          {
            id: 'ASSET-2',
            title: 'Promo Welcome Copy Intro',
            type: 'Copy Text',
            rating: 'B',
            conversions: 180,
          },
          {
            id: 'ASSET-3',
            title: 'Fintech Autopilot Header Image',
            type: 'Banner',
            rating: 'A',
            conversions: 310,
          },
        ];
  });

  const [savedUtmsList, setSavedUtmsList] = useState(() => {
    const saved = localStorage.getItem('orchestratori_marketing_saved_utms');
    return saved
      ? JSON.parse(saved)
      : [
          {
            id: 'UTM-1',
            label: 'Newsletter Blast',
            url: 'https://orqaly.com?utm_source=newsletter&utm_medium=email&utm_campaign=summer_promo',
            date: '2026-06-15',
          },
          {
            id: 'UTM-2',
            label: 'Partner Banner Link',
            url: 'https://orqaly.com?utm_source=partner&utm_medium=banner&utm_campaign=saas_launch',
            date: '2026-06-17',
          },
        ];
  });

  const [tasksList, setTasksList] = useState(() => {
    const saved = localStorage.getItem('orchestratori_marketing_tasks');
    return saved
      ? JSON.parse(saved)
      : [
          {
            id: 'TSK-1',
            task: 'Prepare VIP banner assets for acquisition launch',
            assignee: 'Content Copier Agent',
            done: true,
          },
          {
            id: 'TSK-2',
            task: 'Adjust CPA margins on Facebook Paid ads',
            assignee: 'Acquisition Agent',
            done: false,
          },
          {
            id: 'TSK-3',
            task: 'Approve SMS Coupon Code Win-back copy',
            assignee: 'Arthur Pendragon',
            done: false,
          },
          {
            id: 'TSK-4',
            task: 'Run monthly cohort retention audits',
            assignee: 'System Controller',
            done: true,
          },
        ];
  });

  // DB Sync Fetches
  const fetchCRMContacts = useCallback(async () => {
    setCrmLoading(true);
    try {
      const res = await listContacts();
      if (Array.isArray(res) && res.length > 0) {
        const mapped = res.map((item) => {
          const meta = item.metadata || {};
          return {
            id: item.id,
            name: item.name,
            email: item.email || '',
            phone: item.phone || '',
            value: meta.value || item.comment || '$0',
            segment: meta.segment || item.attitude || 'neutral',
            score: meta.score !== undefined ? Number(meta.score) : 50,
            country: meta.country || 'US',
            risk: meta.risk || 'Low',
            joined: meta.joined || '2026-06-18',
            source: meta.source || 'fb_slots_vip',
            ftdStatus: meta.ftdStatus || 'None',
            fraudRisk: meta.fraudRisk || 'Clear',
            isDb: true,
          };
        });
        setCrmList(mapped);
      } else {
        const localSaved = localStorage.getItem('orchestratori_marketing_crm_contacts');
        if (localSaved) {
          setCrmList(JSON.parse(localSaved));
        } else {
          setCrmList(MOCK_CRM_LEADS);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch CRM contacts from DB:', err);
      const localSaved = localStorage.getItem('orchestratori_marketing_crm_contacts');
      if (localSaved) {
        setCrmList(JSON.parse(localSaved));
      } else {
        setCrmList(MOCK_CRM_LEADS);
      }
    } finally {
      setCrmLoading(false);
    }
  }, []);

  const fetchCampaigns = useCallback(async () => {
    setCampaignsLoading(true);
    try {
      let apiCampaigns = [];
      try {
        apiCampaigns = await campaignsService.list();
      } catch (err) {
        console.warn('Could not load campaigns from API, using defaults:', err);
      }

      const customSaved = localStorage.getItem('orchestratori_marketing_custom_campaigns');
      const customCampaigns = customSaved ? JSON.parse(customSaved) : [];

      let baseList = [];
      if (apiCampaigns && apiCampaigns.length > 0) {
        baseList = apiCampaigns.map((c) => ({
          id: String(c.id),
          name: c.name || 'API Campaign',
          channel: c.channel || 'Referral',
          budget: c.dailyLimit || 10000,
          spend: c.spend || 0,
          conversions: c.conversions || 0,
          ctr: c.ctr || 3.5,
          status: c.status === 'active' || c.status === 'Active' ? 'Active' : 'Paused',
          isApi: true,
          geo: c.geo || 'US',
          redirectType: c.redirectType || 'Direct Link',
          payoutModel: c.payoutModel || 'CPA $150',
          regs: c.regs || 0,
          ftds: c.ftds || 0,
          epc: c.epc || 0.0,
          revenue: c.revenue || 0,
          profit: c.profit || 0,
          roi: c.roi || 0,
        }));
      } else {
        baseList = MOCK_CAMPAIGNS;
      }

      const deletedCampaignIds = JSON.parse(
        localStorage.getItem('orchestratori_marketing_deleted_campaigns') || '[]'
      );
      const filteredBaseList = baseList.filter((c) => !deletedCampaignIds.includes(c.id));

      const merged = [...customCampaigns, ...filteredBaseList];
      setCampaignsList(merged);
    } catch (err) {
      console.error(err);
      setCampaignsList(MOCK_CAMPAIGNS);
    } finally {
      setCampaignsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCRMContacts();
    fetchCampaigns();
  }, [fetchCRMContacts, fetchCampaigns]);

  // Lead Submission & Deletion Handler
  const handleAddContactSubmit = async () => {
    if (!contactForm.name.trim()) {
      setToast({ open: true, message: 'Name is required to add a lead', severity: 'error' });
      return;
    }

    try {
      const cleanAttitude = ['vip', 'friendly', 'neutral', 'cold_lead', 'hostile'].includes(
        contactForm.segment.toLowerCase()
      )
        ? contactForm.segment.toLowerCase()
        : 'neutral';

      await addContact({
        name: contactForm.name.trim(),
        email: contactForm.email.trim(),
        phone: contactForm.phone.trim(),
        attitude: cleanAttitude,
        comment: contactForm.value,
        metadata: {
          value: contactForm.value,
          segment: contactForm.segment,
          score: Number(contactForm.score),
          country: contactForm.country,
          risk: contactForm.risk,
          joined: contactForm.joined,
          source: contactForm.source,
          ftdStatus: contactForm.ftdStatus,
          fraudRisk: contactForm.fraudRisk,
        },
        contact_type: 'mail',
      });

      await fetchCRMContacts();
      setToast({ open: true, message: 'Contact saved to Database', severity: 'success' });
    } catch (err) {
      console.warn('DB Insert failed, saving locally:', err);
      const newContact = {
        id: 'local_' + Math.random().toString(36).substring(2, 9),
        name: contactForm.name,
        email: contactForm.email,
        phone: contactForm.phone,
        value: contactForm.value,
        segment: contactForm.segment,
        score: Number(contactForm.score),
        country: contactForm.country,
        risk: contactForm.risk,
        joined: contactForm.joined,
        source: contactForm.source,
        ftdStatus: contactForm.ftdStatus,
        fraudRisk: contactForm.fraudRisk,
        isDb: false,
      };
      const updatedList = [newContact, ...crmList];
      setCrmList(updatedList);
      localStorage.setItem('orchestratori_marketing_crm_contacts', JSON.stringify(updatedList));
      setToast({
        open: true,
        message: 'Saved contact locally (offline mode)',
        severity: 'success',
      });
    }
    setAddContactOpen(false);
    // Reset form
    setContactForm({
      name: '',
      email: '',
      phone: '',
      segment: 'New User',
      value: '$0',
      score: 80,
      country: 'US',
      risk: 'Low',
      source: 'fb_slots_vip',
      ftdStatus: 'None',
      joined: new Date().toISOString().split('T')[0],
      fraudRisk: 'Clear',
    });
  };

  const handleDeleteContact = async (id, name) => {
    if (typeof id === 'string' && id.startsWith('local_')) {
      const updated = crmList.filter((item) => item.id !== id);
      setCrmList(updated);
      localStorage.setItem('orchestratori_marketing_crm_contacts', JSON.stringify(updated));
      setToast({ open: true, message: `Deleted local lead: ${name}`, severity: 'info' });
    } else {
      try {
        await deleteContact(id);
        await fetchCRMContacts();
        setToast({ open: true, message: `Deleted ${name} from Database`, severity: 'success' });
      } catch (err) {
        console.warn('DB delete failed, filtering local state:', err);
        const updated = crmList.filter((item) => item.id !== id);
        setCrmList(updated);
        localStorage.setItem('orchestratori_marketing_crm_contacts', JSON.stringify(updated));
        setToast({ open: true, message: `Deleted lead locally`, severity: 'info' });
      }
    }
  };

  // Campaigns Handlers
  const handleCreateCampaignSubmit = () => {
    if (!campaignForm.name.trim()) {
      setToast({ open: true, message: 'Campaign name is required', severity: 'error' });
      return;
    }
    const newCampaign = {
      id: 'MC-' + Math.floor(100 + Math.random() * 900),
      name: campaignForm.name,
      channel: campaignForm.channel,
      budget: Number(campaignForm.budget),
      spend: 0,
      conversions: 0,
      ctr: 0.0,
      status: campaignForm.status,
      isCustom: true,
      geo: campaignForm.geo,
      redirectType: campaignForm.redirectType,
      payoutModel: campaignForm.payoutModel,
      regs: 0,
      ftds: 0,
      epc: 0.0,
      revenue: 0,
      profit: 0,
      roi: 0,
    };
    const customSaved = localStorage.getItem('orchestratori_marketing_custom_campaigns');
    const customCampaigns = customSaved ? JSON.parse(customSaved) : [];
    const updated = [newCampaign, ...customCampaigns];
    localStorage.setItem('orchestratori_marketing_custom_campaigns', JSON.stringify(updated));
    setCampaignsList((prev) => [newCampaign, ...prev]);
    setCreateCampaignOpen(false);
    setCampaignForm({
      name: '',
      channel: 'Google Search',
      geo: 'US',
      redirectType: 'Direct Link',
      payoutModel: 'CPA $150',
      budget: 5000,
      status: 'Active',
    });
    setToast({
      open: true,
      message: `Created campaign: ${campaignForm.name}`,
      severity: 'success',
    });
  };

  const handleToggleCampaignStatus = useCallback(
    (id, name, currentStatus) => {
      const nextStatus = currentStatus === 'Active' ? 'Paused' : 'Active';
      const customSaved = localStorage.getItem('orchestratori_marketing_custom_campaigns');
      let customCampaigns = customSaved ? JSON.parse(customSaved) : [];
      const isCustom = customCampaigns.some((c) => c.id === id);
      if (isCustom) {
        customCampaigns = customCampaigns.map((c) =>
          c.id === id ? { ...c, status: nextStatus } : c
        );
        localStorage.setItem(
          'orchestratori_marketing_custom_campaigns',
          JSON.stringify(customCampaigns)
        );
      } else {
        const overrides = JSON.parse(
          localStorage.getItem('orchestratori_marketing_campaign_overrides') || '{}'
        );
        overrides[id] = { status: nextStatus };
        localStorage.setItem(
          'orchestratori_marketing_campaign_overrides',
          JSON.stringify(overrides)
        );
      }
      setCampaignsList((prev) =>
        prev.map((item) => (item.id === id ? { ...item, status: nextStatus } : item))
      );
      handleTriggerAction(`Campaign ${name} set to ${nextStatus}`);
    },
    [handleTriggerAction]
  );

  const handleDeleteCampaign = useCallback(
    (id, name) => {
      const customSaved = localStorage.getItem('orchestratori_marketing_custom_campaigns');
      let customCampaigns = customSaved ? JSON.parse(customSaved) : [];
      const isCustom = customCampaigns.some((c) => c.id === id);
      if (isCustom) {
        customCampaigns = customCampaigns.filter((c) => c.id !== id);
        localStorage.setItem(
          'orchestratori_marketing_custom_campaigns',
          JSON.stringify(customCampaigns)
        );
      } else {
        const deletedCampaignIds = JSON.parse(
          localStorage.getItem('orchestratori_marketing_deleted_campaigns') || '[]'
        );
        if (!deletedCampaignIds.includes(id)) {
          deletedCampaignIds.push(id);
          localStorage.setItem(
            'orchestratori_marketing_deleted_campaigns',
            JSON.stringify(deletedCampaignIds)
          );
        }
      }
      setCampaignsList((prev) => prev.filter((item) => item.id !== id));
      handleTriggerAction(`Deleted campaign ${name}`);
    },
    [handleTriggerAction]
  );

  // Assets Handlers
  const handleUploadAssetSubmit = () => {
    if (!assetForm.title.trim()) {
      setToast({ open: true, message: 'Asset title is required', severity: 'error' });
      return;
    }
    const newAsset = {
      id: 'ASSET-' + Math.floor(100 + Math.random() * 900),
      title: assetForm.title,
      type: assetForm.type,
      rating: assetForm.rating,
      conversions: Number(assetForm.conversions) || 0,
    };
    const updated = [newAsset, ...assetsList];
    setAssetsList(updated);
    localStorage.setItem('orchestratori_marketing_assets', JSON.stringify(updated));
    setUploadAssetOpen(false);
    setAssetForm({
      title: '',
      type: 'Image',
      rating: 'A',
      conversions: 150,
    });
    setToast({ open: true, message: `Uploaded material: ${assetForm.title}`, severity: 'success' });
  };

  const handleDeleteAsset = (id, title) => {
    const updated = assetsList.filter((item) => item.id !== id);
    setAssetsList(updated);
    localStorage.setItem('orchestratori_marketing_assets', JSON.stringify(updated));
    setToast({ open: true, message: `Deleted asset: ${title}`, severity: 'info' });
  };

  // UTM Links Handlers
  const handleSaveUtm = (label, url) => {
    const newUtm = {
      id: 'UTM-' + Math.floor(100 + Math.random() * 900),
      label,
      url,
      date: new Date().toISOString().split('T')[0],
    };
    const updated = [newUtm, ...savedUtmsList];
    setSavedUtmsList(updated);
    localStorage.setItem('orchestratori_marketing_saved_utms', JSON.stringify(updated));
    setToast({ open: true, message: `Saved UTM Link: ${label}`, severity: 'success' });
  };

  const handleDeleteUtm = (id, label) => {
    const updated = savedUtmsList.filter((item) => item.id !== id);
    setSavedUtmsList(updated);
    localStorage.setItem('orchestratori_marketing_saved_utms', JSON.stringify(updated));
    setToast({ open: true, message: `Deleted UTM Link: ${label}`, severity: 'info' });
  };

  // Tasks Handlers
  const handleAddTaskSubmit = () => {
    if (!taskForm.task.trim()) {
      setToast({ open: true, message: 'Task description is required', severity: 'error' });
      return;
    }
    const newTask = {
      id: 'TSK-' + Math.floor(100 + Math.random() * 900),
      task: taskForm.task,
      assignee: taskForm.assignee || 'Unassigned',
      done: false,
    };
    const updated = [...tasksList, newTask];
    setTasksList(updated);
    localStorage.setItem('orchestratori_marketing_tasks', JSON.stringify(updated));
    setAddTaskOpen(false);
    setTaskForm({
      task: '',
      assignee: 'Acquisition Agent',
    });
    setToast({ open: true, message: `Added task: ${taskForm.task}`, severity: 'success' });
  };

  const handleToggleTask = (id) => {
    const updated = tasksList.map((t) => {
      if (t.id === id) {
        const nextDone = !t.done;
        handleTriggerAction(`Toggled task status to: ${nextDone ? 'Completed' : 'Pending'}`);
        return { ...t, done: nextDone };
      }
      return t;
    });
    setTasksList(updated);
    localStorage.setItem('orchestratori_marketing_tasks', JSON.stringify(updated));
  };

  const handleDeleteTask = (id, taskName) => {
    const updated = tasksList.filter((t) => t.id !== id);
    setTasksList(updated);
    localStorage.setItem('orchestratori_marketing_tasks', JSON.stringify(updated));
    setToast({ open: true, message: `Deleted task: ${taskName}`, severity: 'info' });
  };

  // Autopilot loop simulator
  const logIntervalRef = useRef(null);
  useEffect(() => {
    if (autopilotActive) {
      logIntervalRef.current = setInterval(() => {
        const randomStep =
          SIMULATED_AUTOPILOT_STEPS[Math.floor(Math.random() * SIMULATED_AUTOPILOT_STEPS.length)];
        const time = new Date().toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        const entry = `[${time}] ${randomStep}`;
        setAutopilotLogs((prev) => {
          const next = [...prev, entry].slice(-50); // cap logs at 50
          localStorage.setItem('orchestratori_marketing_autopilot_logs', JSON.stringify(next));
          return next;
        });
      }, 7000);
    } else {
      if (logIntervalRef.current) clearInterval(logIntervalRef.current);
    }
    return () => {
      if (logIntervalRef.current) clearInterval(logIntervalRef.current);
    };
  }, [autopilotActive]);

  const handleAutopilotToggle = useCallback((e) => {
    const nextVal = e.target.checked;
    setAutopilotActive(nextVal);
    localStorage.setItem('orchestratori_marketing_autopilot_active', String(nextVal));

    const time = new Date().toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const logMsg = nextVal
      ? `[${time}] ORCHESTRATOR: Autopilot loop engaged. Agent taking control.`
      : `[${time}] ORCHESTRATOR: Autopilot disengaged. Swapped to manual operation.`;

    setAutopilotLogs((prev) => {
      const next = [...prev, logMsg];
      localStorage.setItem('orchestratori_marketing_autopilot_logs', JSON.stringify(next));
      return next;
    });

    setToast({
      open: true,
      message: nextVal
        ? 'Autopilot Engaged — AI Agent actively auditing page metrics'
        : 'Autopilot Disengaged',
      severity: nextVal ? 'success' : 'info',
    });
  }, []);

  const handleClearLogs = useCallback(() => {
    setAutopilotLogs(DUMMY_LOGS);
    localStorage.removeItem('orchestratori_marketing_autopilot_logs');
    setToast({ open: true, message: 'Autopilot log cleared', severity: 'info' });
  }, []);

  // ---------------------------------------------------------------------------
  // Dynamically constructed Tabs mapping
  // ---------------------------------------------------------------------------
  const TABS_CONFIG = {
    dashboard: ['Overview', 'KPIs', 'Forecasts', 'AI Insights'],
    audiences: ['CRM', 'Segments', 'Cohorts', 'Customer Journeys'],
    campaigns: ['Active', 'Calendar', 'Automation', 'A/B Tests'],
    content: ['Assets / Materials', 'Landing Pages', 'Templates', 'Guidelines'],
    acquisition: ['Channels', 'Traffic Sources', 'Attribution', 'UTM Management'],
    conversion: ['Funnels', 'Conversion Analysis', 'User Behavior', 'Events Log'],
    retention: ['Loyalty Tiers', 'Churn Risk', 'Reactivation', 'Personalization'],
    team: ['Managers', 'Tasks Kanban', 'Approvals Queue', 'Budget Allocations'],
  };

  const tabs = TABS_CONFIG[activePage] || [];

  // Top Row Page KPI metrics configurations
  const pageMetrics = useMemo(() => {
    const config = {
      dashboard: [
        {
          label: 'Net Gaming Revenue (NGR)',
          value: '$56,420',
          helper: '+18.4% GGR share',
          color: theme.palette.primary.main,
          icon: TrendingUpIcon,
        },
        {
          label: 'Depositors (FTD)',
          value: '729',
          helper: 'CPA: $118 avg',
          color: theme.palette.success.main,
          icon: PeopleIcon,
        },
        {
          label: 'Marketing ROI',
          value: '270.8%',
          helper: 'Total Spend: $15,850',
          color: theme.palette.warning.main,
          icon: CampaignIcon,
        },
      ],
      audiences: [
        {
          label: 'Total Contacts',
          value: '45,820',
          helper: '+420 acquired today',
          color: theme.palette.primary.main,
          icon: GroupsIcon,
        },
        {
          label: 'Active Segments',
          value: '14',
          helper: '8 automated cohorts',
          color: theme.palette.success.main,
          icon: AutoGraphIcon,
        },
        {
          label: 'VIP Players (LTV > $5k)',
          value: '620',
          helper: 'LTV share: 64%',
          color: theme.palette.info.main,
          icon: SmartToyOutlinedIcon,
        },
      ],
      campaigns: [
        {
          label: 'Active Budgets',
          value: '$23,200',
          helper: '5 active campaigns',
          color: theme.palette.primary.main,
          icon: CampaignIcon,
        },
        {
          label: 'Average CTR',
          value: '5.2%',
          helper: 'Benchmark: 3.4%',
          color: theme.palette.success.main,
          icon: TrendingUpIcon,
        },
        {
          label: 'A/B Runs',
          value: '4 Split Tests',
          helper: '2 reaching significance',
          color: theme.palette.info.main,
          icon: AutoGraphIcon,
        },
      ],
      content: [
        {
          label: 'Total Assets',
          value: '412',
          helper: 'Images, Copy & Videos',
          color: theme.palette.primary.main,
          icon: FolderIcon,
        },
        {
          label: 'Live Landing Pages',
          value: '8 paths',
          helper: 'Avg Bounce Rate: 34%',
          color: theme.palette.success.main,
          icon: LaunchIcon,
        },
        {
          label: 'Email Templates',
          value: '24 layouts',
          helper: 'Tone: Aggressive Conversion',
          color: theme.palette.info.main,
          icon: MenuBookIcon,
        },
      ],
      acquisition: [
        {
          label: 'Direct Traffic Share',
          value: '42%',
          helper: 'Unpaid conversions',
          color: theme.palette.primary.main,
          icon: ShareIcon,
        },
        {
          label: 'Top Referral CPA',
          value: '$12.40',
          helper: 'Source: Affiliates Network',
          color: theme.palette.success.main,
          icon: AutoGraphIcon,
        },
        {
          label: 'Total Clicks',
          value: '184.2k',
          helper: '+18.5% click volume',
          color: theme.palette.warning.main,
          icon: SpeedIcon,
        },
      ],
      conversion: [
        {
          label: 'Funnel Completion',
          value: '4.82%',
          helper: 'Visitors -> paying',
          color: theme.palette.primary.main,
          icon: AutoGraphIcon,
        },
        {
          label: 'Deposit Conversion',
          value: '18.4%',
          helper: 'Reg -> first deposit',
          color: theme.palette.success.main,
          icon: TrendingUpIcon,
        },
        {
          label: 'Scroll Depth',
          value: '72%',
          helper: 'Avg session scrolling',
          color: theme.palette.info.main,
          icon: SpeedIcon,
        },
      ],
      retention: [
        {
          label: 'VIP Retention Rate',
          value: '92.4%',
          helper: 'VIP loyalty target: 90%',
          color: theme.palette.primary.main,
          icon: PeopleIcon,
        },
        {
          label: 'Avg User Lifetime',
          value: '8.4 mos',
          helper: 'LTV target: 12 months',
          color: theme.palette.success.main,
          icon: TrendingUpIcon,
        },
        {
          label: 'Flagged Churn Risk',
          value: '112 users',
          helper: 'High risk tier (Red)',
          color: theme.palette.error.main,
          icon: SmartToyOutlinedIcon,
        },
      ],
      team: [
        {
          label: 'Active Operators',
          value: '4 human / 3 AI',
          helper: 'Total allocation: 7',
          color: theme.palette.primary.main,
          icon: GroupsIcon,
        },
        {
          label: 'Pending Approvals',
          value: '3 assets',
          helper: 'SLA: 2 hours',
          color: theme.palette.warning.main,
          icon: AssignmentIcon,
        },
        {
          label: 'Spent Budget share',
          value: '74%',
          helper: '$37,200 of $50,000',
          color: theme.palette.success.main,
          icon: CampaignIcon,
        },
      ],
    };
    return config[activePage] || config.dashboard;
  }, [activePage, theme]);

  // Page dynamic title mappings
  const pageTitles = {
    dashboard: {
      title: 'Marketing Dashboard',
      subtitle: 'Universal analytics, KPIs, forecasting simulator, and automated insights.',
    },
    audiences: {
      title: 'Audiences & Segmentation',
      subtitle: 'Manage CRM profiles, construct dynamic cohorts, and track customer journeys.',
    },
    campaigns: {
      title: 'Campaign Hub',
      subtitle: 'Schedule operations, configure workflow automation nodes, and audit split tests.',
    },
    content: {
      title: 'Content Assets & Pages',
      subtitle: 'Deploy landing pages, inspect brand guides, and audit media creatives.',
    },
    acquisition: {
      title: 'Acquisition Channels',
      subtitle:
        'Audit traffic referrers, swap attribution structures, and construct UTM parameters.',
    },
    conversion: {
      title: 'Conversion Funnels',
      subtitle: 'Investigate scroll drop-offs, event statistics, and behavioral mouse tracking.',
    },
    retention: {
      title: 'Retention & VIP Programs',
      subtitle:
        'Predict churn probabilities, configure loyalty matrices, and Personalize copywriting.',
    },
    team: {
      title: 'Operations & Budgeting',
      subtitle: 'Govern manager permissions, check off tasks, and sign off queued approvals.',
    },
  };

  const { title: headingTitle, subtitle: headingSubtitle } =
    pageTitles[activePage] || pageTitles.dashboard;

  // ---------------------------------------------------------------------------
  // Tab Widget Renderers (32 in total)
  // ---------------------------------------------------------------------------

  // 1. Dashboard Tab renderers
  const renderDashboardOverview = () => (
    <Box sx={{ height: 320, width: '100%', mt: 2 }}>
      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
        Clicks vs registrations vs depositors (FTD)
      </Typography>
      <ResponsiveContainer width="100%" height="90%">
        <ComposedChart data={MOCK_TRAFFIC_DATA} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorRegs" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#7C3AED" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#7C3AED" stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke={isDark ? '#2e2e30' : '#e0e0e0'}
          />
          <XAxis dataKey="day" stroke="text.disabled" style={{ fontSize: '0.75rem' }} />
          <YAxis stroke="text.disabled" style={{ fontSize: '0.75rem' }} />
          <RechartsTooltip
            contentStyle={{
              backgroundColor: isDark ? '#1e1e1e' : '#ffffff',
              borderColor: '#7C3AED',
            }}
          />
          <Legend
            layout="horizontal"
            align="center"
            verticalAlign="top"
            wrapperStyle={{ fontSize: '0.75rem', paddingBottom: '10px' }}
          />
          <Bar
            dataKey="clicks"
            name="Clicks (Ad Traffic)"
            fill="#3b82f6"
            fillOpacity={0.75}
            barSize={25}
            radius={[4, 4, 0, 0]}
          />
          <Area
            type="monotone"
            dataKey="regs"
            name="Registrations"
            stroke="#7C3AED"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorRegs)"
          />
          <Line
            type="monotone"
            dataKey="depositors"
            name="Depositors (FTD)"
            stroke="#10B981"
            strokeWidth={3.5}
            dot={{ r: 4, strokeWidth: 2 }}
            activeDot={{ r: 6 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </Box>
  );

  const renderDashboardKPIs = () => (
    <Grid container spacing={2}>
      {[
        {
          title: 'CAC (Customer Acquisition Cost)',
          value: '$72.50',
          change: '-8%',
          state: 'good',
          desc: 'Paid ad CPC decrease is lowering registration costs.',
        },
        {
          title: 'LTV (Lifetime Value Share)',
          value: '$458.00',
          change: '+14%',
          state: 'good',
          desc: 'VIP deposits have increased retention metrics.',
        },
        {
          title: 'CAC Payback Period',
          value: '4.2 months',
          change: '-12%',
          state: 'good',
          desc: 'Payback speed improved due to higher early spend.',
        },
        {
          title: 'Avg Deposit Value',
          value: '$84.00',
          change: '+3%',
          state: 'neutral',
          desc: 'Stabile trend across fintech and gaming accounts.',
        },
      ].map((kpi, idx) => (
        <Grid size={{ xs: 12, sm: 6 }} key={idx}>
          <Paper
            variant="outlined"
            sx={{ p: 2, borderRadius: 2, bgcolor: isDark ? alpha('#7C3AED', 0.03) : '#fafafa' }}
          >
            <Typography variant="caption" color="text.secondary" fontWeight={600}>
              {kpi.title}
            </Typography>
            <Stack direction="row" alignItems="center" spacing={1.5} sx={{ my: 1 }}>
              <Typography variant="h5" fontWeight={800}>
                {kpi.value}
              </Typography>
              <Chip
                label={kpi.change}
                size="small"
                color={kpi.state === 'good' ? 'success' : 'default'}
                sx={{ fontWeight: 700, height: 18, fontSize: '0.68rem' }}
              />
            </Stack>
            <Typography variant="caption" color="text.secondary">
              {kpi.desc}
            </Typography>
          </Paper>
        </Grid>
      ))}
    </Grid>
  );

  const renderDashboardForecasts = () => {
    const projectedConversions = Math.round(
      (forecastBudget / 100) *
        (forecastSplit.google * 0.08 + forecastSplit.fb * 0.05 + forecastSplit.tiktok * 0.04)
    );
    const projectedRevenue = Math.round(projectedConversions * 140);
    const projectedRoi = Math.round(((projectedRevenue - forecastBudget) / forecastBudget) * 100);

    return (
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 2 }}>
          Interactive AI Forecast Simulator
        </Typography>
        <Typography variant="body2" color="text.secondary" paragraph>
          Drag the budget slider and adjust the channel allocation weights below. The AI Agent will
          calculate forecasted outcomes in real-time based on current acquisition trends.
        </Typography>

        <Stack spacing={2} sx={{ mb: 3 }}>
          <Box>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}
            >
              <span>
                Monthly Budget: <strong>${forecastBudget.toLocaleString()}</strong>
              </span>
              <span>Max: $50,000</span>
            </Typography>
            <input
              type="range"
              min="2000"
              max="50000"
              step="1000"
              value={forecastBudget}
              onChange={(e) => setForecastBudget(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#7C3AED' }}
            />
          </Box>

          <Grid container spacing={2}>
            {[
              { label: 'Google Search Ads (%)', key: 'google' },
              { label: 'Facebook Ad Campaigns (%)', key: 'fb' },
              { label: 'TikTok Video Ads (%)', key: 'tiktok' },
            ].map((channelObj) => (
              <Grid size={{ xs: 12, sm: 4 }} key={channelObj.key}>
                <Typography variant="caption" color="text.secondary">
                  {channelObj.label}
                </Typography>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={forecastSplit[channelObj.key]}
                  onChange={(e) => {
                    const val = Math.min(100, Math.max(0, Number(e.target.value)));
                    setForecastSplit((prev) => ({ ...prev, [channelObj.key]: val }));
                  }}
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: '8px',
                    border: '1px solid #7c7c82',
                    background: 'transparent',
                    color: 'inherit',
                    marginTop: '4px',
                  }}
                />
              </Grid>
            ))}
          </Grid>
        </Stack>

        <Paper
          variant="outlined"
          sx={{
            p: 2,
            borderRadius: 2.5,
            bgcolor: alpha('#7C3AED', 0.05),
            borderColor: alpha('#7C3AED', 0.2),
          }}
        >
          <Typography variant="subtitle2" color="primary" gutterBottom>
            Predicted Forecast Outcomes
          </Typography>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            {[
              {
                label: 'Est. Conversions',
                value: projectedConversions.toLocaleString(),
                color: '#fff',
              },
              {
                label: 'Projected Net Rev',
                value: `$${projectedRevenue.toLocaleString()}`,
                color: '#10B981',
              },
              {
                label: 'Forecasted ROI',
                value: `${projectedRoi}%`,
                color: projectedRoi >= 0 ? '#10B981' : '#F87171',
              },
            ].map((res, i) => (
              <Grid size={{ xs: 12, sm: 4 }} key={i}>
                <Typography variant="caption" color="text.secondary" display="block">
                  {res.label}
                </Typography>
                <Typography variant="h6" fontWeight={800} sx={{ color: res.color }}>
                  {res.value}
                </Typography>
              </Grid>
            ))}
          </Grid>
        </Paper>
      </Box>
    );
  };

  const renderDashboardInsights = () => (
    <Stack spacing={1.5}>
      {[
        {
          type: 'Alert',
          text: 'Google Search conversion values rose by 18% in the past 48 hours. AI recommends shifting $1,500 from Facebook to maximize lead volume.',
          action: 'Shift $1.5k to Search',
        },
        {
          type: 'Opportunity',
          text: 'We detected a spike in traffic referrals from organic SaaS listings on Reddit. Target them with dedicated custom landing pages.',
          action: 'Create Reddit Segment',
        },
        {
          type: 'Warning',
          text: 'Fintech ad bids have increased on Facebook. Your acquisition costs may rise if campaign schedules remain unmodified.',
          action: 'Lower FB Max Bid',
        },
      ].map((ins, i) => (
        <Paper
          key={i}
          sx={{
            p: 1.5,
            borderRadius: 2,
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            alignItems: { xs: 'flex-start', sm: 'center' },
            justifyContent: 'space-between',
            gap: 1.5,
            borderLeft: '3px solid',
            borderColor:
              ins.type === 'Alert'
                ? 'warning.main'
                : ins.type === 'Warning'
                  ? 'error.main'
                  : 'info.main',
          }}
        >
          <Box>
            <Chip
              label={ins.type}
              size="small"
              color={ins.type === 'Alert' ? 'warning' : ins.type === 'Warning' ? 'error' : 'info'}
              sx={{ fontWeight: 800, height: 18, fontSize: '0.65rem', mb: 0.5 }}
            />
            <Typography variant="body2">{ins.text}</Typography>
          </Box>
          <Button
            variant="outlined"
            size="small"
            onClick={() => handleTriggerAction(ins.action)}
            sx={{ textTransform: 'none', whiteSpace: 'nowrap', borderRadius: 1.5 }}
          >
            {ins.action}
          </Button>
        </Paper>
      ))}
    </Stack>
  );

  // 2. Audiences Tab renderers
  const renderAudiencesCRM = () => (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="subtitle2">Lead Profiles Database</Typography>
        <Button
          variant="contained"
          size="small"
          startIcon={<AppIcon name="Add" fallback={AddIcon} />}
          onClick={() => setAddContactOpen(true)}
          sx={{ textTransform: 'none', borderRadius: 2 }}
        >
          Add Lead
        </Button>
      </Stack>
      {crmLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 4 }}>
          <CircularProgress size={32} />
        </Box>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Lead Details</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Source / Joined</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>FTD Status</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Fraud Risk</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>LTV Spent</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">
                  Actions
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {crmList.map((lead, idx) => {
                const countryFlags = {
                  DE: '🇩🇪',
                  RU: '🇷🇺',
                  GB: '🇬🇧',
                  US: '🇺🇸',
                  JP: '🇯🇵',
                  BR: '🇧🇷',
                  CA: '🇨🇦',
                  IT: '🇮🇹',
                };
                const flag = countryFlags[lead.country?.toUpperCase()] || lead.country || '🌐';

                return (
                  <TableRow key={lead.id || idx}>
                    <TableCell>
                      <Stack direction="row" spacing={1.5} alignItems="center">
                        <span style={{ fontSize: '1.25rem' }} title={lead.country}>
                          {flag}
                        </span>
                        <Box>
                          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                            {lead.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {lead.email || 'No email'} · {lead.phone || 'No phone'}
                          </Typography>
                        </Box>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {lead.source}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {lead.joined}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={lead.ftdStatus}
                        size="small"
                        color={lead.ftdStatus === 'Deposited' ? 'success' : 'default'}
                        variant={lead.ftdStatus === 'Deposited' ? 'filled' : 'outlined'}
                        sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700 }}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={lead.fraudRisk}
                        size="small"
                        color={
                          lead.fraudRisk === 'Clear'
                            ? 'success'
                            : lead.fraudRisk === 'VPN Detected'
                              ? 'warning'
                              : 'error'
                        }
                        variant="outlined"
                        sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700 }}
                      />
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>{lead.value}</TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        <Button
                          size="small"
                          onClick={() => handleTriggerAction(`Email ${lead.name}`)}
                          sx={{ textTransform: 'none', p: 0.5 }}
                        >
                          Contact
                        </Button>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDeleteContact(lead.id, lead.name)}
                        >
                          <AppIcon name="Delete" fallback={DeleteIcon} sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })}
              {crmList.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                    No contacts found. Click "Add Lead" to create one.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );

  const renderAudiencesSegments = () => {
    return (
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
          Active Marketing Segments
        </Typography>
        <Stack spacing={1} sx={{ mb: 3 }}>
          {[
            { name: 'VIP High Roller Users', contacts: 620, rules: 'LTV Spent > $5,000' },
            { name: 'Active (Past 7 Days)', contacts: 12450, rules: 'Last active < 168 hours ago' },
            {
              name: 'Crypto Depositors',
              contacts: 3890,
              rules: 'Attributed via Wallet/Coin payments',
            },
            {
              name: 'Inactive - Dormant SaaS',
              contacts: 1205,
              rules: 'Zero clicks and sessions > 30 days',
            },
          ].map((seg, i) => (
            <Paper
              key={i}
              variant="outlined"
              sx={{
                p: 1.5,
                borderRadius: 2,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  {seg.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {seg.rules} · {seg.contacts.toLocaleString()} active users
                </Typography>
              </Box>
              <Button
                size="small"
                variant="outlined"
                onClick={() => handleTriggerAction(`Target segment: ${seg.name}`)}
                sx={{ textTransform: 'none', borderRadius: 1.5 }}
              >
                Target
              </Button>
            </Paper>
          ))}
        </Stack>

        <Stack direction="row" spacing={1.5} alignItems="center">
          <TextField
            size="small"
            label="Custom Segment Name"
            placeholder="e.g. Inactive Whales"
            value={newSegName}
            onChange={(e) => setNewSegName(e.target.value)}
            sx={{ flex: 1 }}
          />
          <Button
            variant="contained"
            onClick={() => {
              if (!newSegName.trim()) return;
              handleTriggerAction(`Create segment: ${newSegName}`);
              setNewSegName('');
            }}
            sx={{ textTransform: 'none', borderRadius: 2 }}
          >
            Build Segment
          </Button>
        </Stack>
      </Box>
    );
  };

  const renderAudiencesCohorts = () => (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
        Monthly Cohort User Retention Grid
      </Typography>
      <TableContainer>
        <Table size="small" sx={{ minWidth: 500 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Cohort Month</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Acquired Users</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="center">
                Month 0
              </TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="center">
                Month 1
              </TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="center">
                Month 2
              </TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="center">
                Month 3
              </TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="center">
                Month 4
              </TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="center">
                Month 5
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {COHORT_RETENTION.map((c, idx) => (
              <TableRow key={idx}>
                <TableCell sx={{ fontWeight: 600 }}>{c.cohort}</TableCell>
                <TableCell>{c.size.toLocaleString()}</TableCell>
                {['m0', 'm1', 'm2', 'm3', 'm4', 'm5'].map((mKey) => {
                  const val = c[mKey];
                  const numericVal = val.includes('%') ? parseInt(val.replace('%', ''), 10) : 0;
                  const opacity = numericVal > 0 ? (numericVal / 100) * 0.45 : 0;
                  return (
                    <TableCell
                      key={mKey}
                      align="center"
                      sx={{
                        fontWeight: 700,
                        bgcolor: opacity > 0 ? alpha('#7C3AED', opacity) : 'transparent',
                        color: numericVal > 0 ? (isDark ? '#e3d6ff' : '#4c2a96') : 'text.disabled',
                      }}
                    >
                      {val}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );

  const renderAudiencesJourneys = () => (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
        Visual Conversion Journey Funnel Tracker
      </Typography>
      <Grid container spacing={1.5}>
        {[
          { step: '1. Ad Clicked', value: '45,820 users', loss: '100%', color: '#7C3AED' },
          { step: '2. Landing Loaded', value: '29,320 users', loss: '64% drop', color: '#10B981' },
          { step: '3. Form Submitted', value: '8,450 users', loss: '28% drop', color: '#3b82f6' },
          { step: '4. Lead Qualified', value: '1,250 users', loss: '14% drop', color: '#F59E0B' },
        ].map((journey, i) => (
          <Grid size={{ xs: 12, sm: 3 }} key={i}>
            <Paper
              variant="outlined"
              sx={{
                p: 2,
                borderRadius: 2.5,
                textAlign: 'center',
                borderTop: `4px solid ${journey.color}`,
              }}
            >
              <Typography variant="caption" color="text.secondary" fontWeight={700}>
                {journey.step}
              </Typography>
              <Typography variant="subtitle1" fontWeight={800} sx={{ mt: 1 }}>
                {journey.value}
              </Typography>
              <Chip
                label={journey.loss}
                size="small"
                variant="outlined"
                sx={{ mt: 1.5, height: 18, fontSize: '0.65rem', fontWeight: 600 }}
              />
            </Paper>
          </Grid>
        ))}
      </Grid>
      <Button
        variant="outlined"
        size="small"
        onClick={() => handleTriggerAction('Optimize stage drop-offs')}
        sx={{ mt: 2.5, textTransform: 'none', display: 'block', mx: 'auto', borderRadius: 2 }}
      >
        Trigger Journey Optimization
      </Button>
    </Box>
  );

  // 3. Campaigns Tab renderers
  const renderCampaignsActive = () => (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="subtitle2">Active Media Campaigns</Typography>
        <Button
          variant="contained"
          size="small"
          startIcon={<AppIcon name="Add" fallback={AddIcon} />}
          onClick={() => setCreateCampaignOpen(true)}
          sx={{ textTransform: 'none', borderRadius: 2 }}
        >
          Create Campaign
        </Button>
      </Stack>
      {campaignsLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 4 }}>
          <CircularProgress size={32} />
        </Box>
      ) : (
        <TableContainer sx={{ mb: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Campaign / GEO</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Redirect & Payout</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Clicks / Regs / FTDs</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>EPC / Spend</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Profit / ROI</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">
                  Actions
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {campaignsList.map((c) => {
                const countryFlags = {
                  DE: '🇩🇪',
                  RU: '🇷🇺',
                  GB: '🇬🇧',
                  US: '🇺🇸',
                  JP: '🇯🇵',
                  BR: '🇧🇷',
                  CA: '🇨🇦',
                  IT: '🇮🇹',
                };
                const flag = countryFlags[c.geo?.toUpperCase()] || c.geo || '🌐';

                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <span style={{ fontSize: '1.1rem' }}>{flag}</span>
                        <Box>
                          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                            {c.name}
                            <Chip
                              label={c.status}
                              size="small"
                              color={c.status === 'Active' ? 'success' : 'default'}
                              sx={{ height: 16, fontSize: '0.55rem', ml: 1, fontWeight: 700 }}
                            />
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {c.id} · {c.channel}
                          </Typography>
                        </Box>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {c.redirectType}
                      </Typography>
                      <Chip
                        label={c.payoutModel}
                        size="small"
                        variant="outlined"
                        color="primary"
                        sx={{ height: 18, fontSize: '0.6rem', mt: 0.5 }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {(c.clicks || 0).toLocaleString()}{' '}
                        <span style={{ color: 'gray' }}>clicks</span>
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        regs: {(c.regs || 0).toLocaleString()} · FTDs:{' '}
                        <strong>{(c.ftds || 0).toLocaleString()}</strong>
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        EPC: ${(c.epc || 0).toFixed(2)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        spend: ${(c.spend || 0).toLocaleString()} / $
                        {(c.budget || 0).toLocaleString()}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 700,
                          color: (c.profit || 0) >= 0 ? 'success.main' : 'error.main',
                        }}
                      >
                        ${(c.profit || 0).toLocaleString()}
                      </Typography>
                      <Chip
                        label={`${c.roi || 0}% ROI`}
                        size="small"
                        color={(c.roi || 0) >= 0 ? 'success' : 'error'}
                        variant="outlined"
                        sx={{ height: 18, fontSize: '0.6rem', mt: 0.5, fontWeight: 700 }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        <Tooltip
                          title={c.status === 'Active' ? 'Pause Campaign' : 'Resume Campaign'}
                        >
                          <IconButton
                            size="small"
                            onClick={() => handleToggleCampaignStatus(c.id, c.name, c.status)}
                          >
                            {c.status === 'Active' ? (
                              <AppIcon name="Pause" fallback={PauseIcon} sx={{ fontSize: 16 }} />
                            ) : (
                              <AppIcon
                                name="PlayArrow"
                                fallback={PlayArrowIcon}
                                sx={{ fontSize: 16 }}
                              />
                            )}
                          </IconButton>
                        </Tooltip>
                        <IconButton
                          size="small"
                          onClick={() => handleDeleteCampaign(c.id, c.name)}
                          color="error"
                        >
                          <AppIcon name="Delete" fallback={DeleteIcon} sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })}
              {campaignsList.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                    No campaigns found. Click "Create Campaign" to create one.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );

  const renderCampaignsCalendar = () => (
    <Box sx={{ p: 1 }}>
      <Typography variant="subtitle2" sx={{ mb: 2 }}>
        Visual Campaign Calendar
      </Typography>
      <Grid container spacing={1}>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
          <Grid
            size={{ xs: 1.7 }}
            key={day}
            sx={{
              textAlign: 'center',
              fontWeight: 700,
              p: 0.5,
              bgcolor: 'action.hover',
              borderRadius: 1,
            }}
          >
            <Typography variant="caption">{day}</Typography>
          </Grid>
        ))}
        {Array.from({ length: 28 }).map((_, i) => {
          const dayNum = i + 1;
          const hasEvent = dayNum === 5 || dayNum === 12 || dayNum === 18 || dayNum === 24;
          const eventLabel =
            dayNum === 5
              ? 'Summer VIP'
              : dayNum === 12
                ? 'Crypto Promo'
                : dayNum === 18
                  ? 'Mailer'
                  : 'SaaS Launch';
          return (
            <Grid
              size={{ xs: 1.7 }}
              key={i}
              sx={{
                height: 80,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1.5,
                p: 0.5,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                bgcolor: hasEvent ? alpha('#7C3AED', 0.04) : 'transparent',
              }}
            >
              <Typography variant="caption" color="text.secondary" fontWeight={700}>
                {dayNum}
              </Typography>
              {hasEvent && (
                <Chip
                  label={eventLabel}
                  size="small"
                  color="secondary"
                  sx={{ height: 16, fontSize: '0.55rem', fontWeight: 800 }}
                />
              )}
            </Grid>
          );
        })}
      </Grid>
    </Box>
  );

  const renderCampaignsAutomation = () => (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
        Trigger Operations Nodes
      </Typography>
      <Paper
        variant="outlined"
        sx={{ p: 2.5, borderRadius: 3, borderStyle: 'dashed', textAlign: 'center' }}
      >
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          justifyContent="center"
          alignItems="center"
        >
          <Paper
            sx={{
              p: 1.5,
              borderRadius: 2,
              bgcolor: alpha('#7C3AED', 0.1),
              border: '1px solid',
              borderColor: '#7C3AED',
            }}
          >
            <Typography variant="caption" color="text.secondary" display="block">
              TRIGGER NODE
            </Typography>
            <Typography variant="subtitle2" fontWeight={800}>
              User Registration
            </Typography>
          </Paper>
          <AppIcon
            name="ArrowForward"
            fallback={ArrowForwardIcon}
            sx={{ color: 'text.disabled' }}
          />
          <Paper
            sx={{
              p: 1.5,
              borderRadius: 2,
              bgcolor: alpha('#10B981', 0.1),
              border: '1px solid',
              borderColor: '#10B981',
            }}
          >
            <Typography variant="caption" color="text.secondary" display="block">
              DELAY TIMEOUT
            </Typography>
            <Typography variant="subtitle2" fontWeight={800}>
              Wait 2 Hours
            </Typography>
          </Paper>
          <AppIcon
            name="ArrowForward"
            fallback={ArrowForwardIcon}
            sx={{ color: 'text.disabled' }}
          />
          <Paper
            sx={{
              p: 1.5,
              borderRadius: 2,
              bgcolor: alpha('#3b82f6', 0.1),
              border: '1px solid',
              borderColor: '#3b82f6',
            }}
          >
            <Typography variant="caption" color="text.secondary" display="block">
              ACTION NODE
            </Typography>
            <Typography variant="subtitle2" fontWeight={800}>
              Send VIP Invite
            </Typography>
          </Paper>
        </Stack>
        <Button
          variant="contained"
          size="small"
          onClick={() => handleTriggerAction('Publish Automation Flow')}
          sx={{ mt: 3, textTransform: 'none', borderRadius: 2 }}
        >
          Deploy Automation Node
        </Button>
      </Paper>
    </Box>
  );

  const renderCampaignsABTests = () => (
    <Stack spacing={2}>
      {[
        {
          name: 'Onboarding Flow Signup Page',
          variantA: 'C conversion: 4.2%',
          variantB: 'Variant B conversion: 6.8%',
          significance: '98% significant',
          winner: 'Winner: Variant B',
        },
        {
          name: 'Deposit Cashback Button Text',
          variantA: 'Promo text conversion: 18.2%',
          variantB: 'Direct cash conversion: 19.5%',
          significance: '52% (Not significant)',
          winner: 'Winner: Variant A (Baseline)',
        },
      ].map((test, idx) => (
        <Paper key={idx} variant="outlined" sx={{ p: 2, borderRadius: 2.5 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="subtitle2" fontWeight={700}>
              {test.name}
            </Typography>
            <Chip
              label={test.significance}
              size="small"
              color={test.significance.includes('Not') ? 'default' : 'success'}
              sx={{ height: 20, fontSize: '0.65rem', fontWeight: 800 }}
            />
          </Stack>
          <Grid container spacing={2} sx={{ mt: 1.5 }}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Typography variant="caption" color="text.secondary" display="block">
                Variant A (Control)
              </Typography>
              <Typography variant="body2" fontWeight={600}>
                {test.variantA}
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Typography variant="caption" color="text.secondary" display="block">
                Variant B (Challenge)
              </Typography>
              <Typography variant="body2" fontWeight={600}>
                {test.variantB}
              </Typography>
            </Grid>
          </Grid>
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            sx={{ mt: 2, pt: 1, borderTop: '1px solid', borderColor: 'divider' }}
          >
            <Typography variant="caption" color="secondary.main" fontWeight={700}>
              {test.winner}
            </Typography>
            <Button
              size="small"
              onClick={() => handleTriggerAction(`Confirm Winner: ${test.winner}`)}
              sx={{ textTransform: 'none' }}
            >
              Promote Winner
            </Button>
          </Stack>
        </Paper>
      ))}
    </Stack>
  );

  // 4. Content Tab renderers
  const renderContentAssets = () => (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="subtitle2">Creative Materials Directory</Typography>
        <Button
          variant="contained"
          size="small"
          startIcon={<AppIcon name="Add" fallback={AddIcon} />}
          onClick={() => setUploadAssetOpen(true)}
          sx={{ textTransform: 'none', borderRadius: 2 }}
        >
          Upload Material
        </Button>
      </Stack>
      <Grid container spacing={2}>
        {assetsList.map((asset, i) => (
          <Grid size={{ xs: 12, sm: 4 }} key={asset.id || i}>
            <Paper
              variant="outlined"
              sx={{
                p: 2,
                borderRadius: 2.5,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                position: 'relative',
              }}
            >
              <Box>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                  sx={{ mb: 1 }}
                >
                  <Chip
                    label={asset.type}
                    size="small"
                    variant="outlined"
                    sx={{ height: 18, fontSize: '0.6rem' }}
                  />
                  <Chip
                    label={`AI rating: ${asset.rating}`}
                    size="small"
                    color="secondary"
                    sx={{ height: 18, fontSize: '0.65rem', fontWeight: 800 }}
                  />
                </Stack>
                <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 1, pr: 3 }}>
                  {asset.title}
                </Typography>
              </Box>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                sx={{ mt: 2 }}
              >
                <Typography variant="caption" color="text.secondary">
                  {asset.conversions} conversions
                </Typography>
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => handleDeleteAsset(asset.id, asset.title)}
                  sx={{ p: 0.5 }}
                >
                  <AppIcon name="Delete" fallback={DeleteIcon} sx={{ fontSize: 16 }} />
                </IconButton>
              </Stack>
            </Paper>
          </Grid>
        ))}
        {assetsList.length === 0 && (
          <Grid size={12}>
            <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
              No creative assets found. Click "Upload Material" to add one.
            </Paper>
          </Grid>
        )}
      </Grid>
    </Box>
  );

  const renderContentLandingPages = () => (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 700 }}>Landing Page Path</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Tracking Status</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Total Visitors</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Bounce Rate</TableCell>
            <TableCell sx={{ fontWeight: 700 }} align="right">
              Builder Actions
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {[
            {
              path: '/promo/summer-vip',
              visitors: 14500,
              bounce: '31.2%',
              status: 'Live',
              fbPixel: 'Active',
              ga4: 'Active',
              postbacks: 'Active',
            },
            {
              path: '/promo/crypto-wallet',
              visitors: 9400,
              bounce: '24.5%',
              status: 'Live',
              fbPixel: 'Active',
              ga4: 'Active',
              postbacks: 'Inactive',
            },
            {
              path: '/promo/saas-discount',
              visitors: 3200,
              bounce: '44.8%',
              status: 'Draft',
              fbPixel: 'Inactive',
              ga4: 'Inactive',
              postbacks: 'Inactive',
            },
          ].map((page, idx) => (
            <TableRow key={idx}>
              <TableCell>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'primary.main' }}>
                  {page.path}
                </Typography>
                <Chip
                  label={page.status}
                  size="small"
                  color={page.status === 'Live' ? 'success' : 'default'}
                  sx={{ height: 16, fontSize: '0.55rem', fontWeight: 700, mt: 0.5 }}
                />
              </TableCell>
              <TableCell>
                <Stack direction="row" spacing={0.5}>
                  <Chip
                    label={`FB: ${page.fbPixel}`}
                    size="small"
                    variant="outlined"
                    color={page.fbPixel === 'Active' ? 'success' : 'default'}
                    sx={{ height: 18, fontSize: '0.6rem' }}
                  />
                  <Chip
                    label={`GA4: ${page.ga4}`}
                    size="small"
                    variant="outlined"
                    color={page.ga4 === 'Active' ? 'success' : 'default'}
                    sx={{ height: 18, fontSize: '0.6rem' }}
                  />
                  <Chip
                    label={`Postback: ${page.postbacks}`}
                    size="small"
                    variant="outlined"
                    color={page.postbacks === 'Active' ? 'success' : 'default'}
                    sx={{ height: 18, fontSize: '0.6rem' }}
                  />
                </Stack>
              </TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{page.visitors.toLocaleString()}</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>{page.bounce}</TableCell>
              <TableCell align="right">
                <Button
                  size="small"
                  onClick={() => handleTriggerAction(`Open page ${page.path} in builder`)}
                  sx={{ textTransform: 'none' }}
                >
                  Edit Design
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );

  const renderContentTemplates = () => (
    <Stack spacing={1.5}>
      {[
        {
          name: 'Welcome Mail (Gaming Vertical)',
          channel: 'Email',
          preview: 'Hi {{name}}, welcome to Lucky Vegas! Deposit today and get...',
        },
        {
          name: 'Quick Churn Alert discount (SaaS)',
          channel: 'SMS',
          preview: 'Hey! We miss you. Get 3 months free SaaS premium tier code: SAASBACK',
        },
        {
          name: 'Affiliate Commissions Report Template',
          channel: 'Email',
          preview: 'Hi partner! Your referral commission report is live. Spent...',
        },
      ].map((temp, i) => (
        <Paper key={i} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
          <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
            <Typography variant="subtitle2" fontWeight={700}>
              {temp.name}
            </Typography>
            <Chip
              label={temp.channel}
              size="small"
              variant="outlined"
              sx={{ height: 18, fontSize: '0.65rem' }}
            />
          </Stack>
          <Typography
            variant="caption"
            color="text.secondary"
            display="block"
            sx={{ fontStyle: 'italic', bgcolor: 'action.hover', p: 1, borderRadius: 1 }}
          >
            "{temp.preview}"
          </Typography>
        </Paper>
      ))}
    </Stack>
  );

  const renderContentGuidelines = () => (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
        Corporate Guidelines & Brand Colors
      </Typography>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { color: '#7C3AED', label: 'Primary Brand Color' },
          { color: '#10B981', label: 'Secondary / Deposit Color' },
          { color: '#1E1E1E', label: 'Dark Mode Slate background' },
        ].map((brand, i) => (
          <Grid
            size={{ xs: 12, sm: 4 }}
            key={i}
            sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}
          >
            <Box
              sx={{
                width: 32,
                height: 32,
                borderRadius: 1,
                bgcolor: brand.color,
                border: '1px solid #7c7c82',
              }}
            />
            <Box>
              <Typography variant="caption" color="text.secondary" display="block">
                {brand.label}
              </Typography>
              <Typography variant="subtitle2" fontWeight={700}>
                {brand.color}
              </Typography>
            </Box>
          </Grid>
        ))}
      </Grid>
      <Typography variant="caption" color="text.secondary">
        Tone Rules: Keep email communications direct and friendly. Do not spam. Avoid clickbait
        titles. Ensure compliance labels are displayed.
      </Typography>
    </Box>
  );

  // 5. Acquisition Tab renderers
  const renderAcquisitionChannels = () => (
    <Box sx={{ height: 320, width: '100%', mt: 2 }}>
      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
        Conversion rate per channel (%)
      </Typography>
      <ResponsiveContainer width="100%" height="90%">
        <BarChart data={CHANNEL_STATS} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke={isDark ? '#2e2e30' : '#e0e0e0'}
          />
          <XAxis dataKey="channel" stroke="text.disabled" style={{ fontSize: '0.75rem' }} />
          <YAxis stroke="text.disabled" style={{ fontSize: '0.75rem' }} />
          <RechartsTooltip contentStyle={{ backgroundColor: isDark ? '#1e1e1e' : '#ffffff' }} />
          <Bar dataKey="cvr" name="Conversion Rate (%)" fill="#7C3AED" radius={[4, 4, 0, 0]}>
            {CHANNEL_STATS.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={index === 3 ? '#10B981' : '#7C3AED'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );

  const renderAcquisitionSources = () => (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 700 }}>Domain Source</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Total Visitors</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Quality Score</TableCell>
            <TableCell sx={{ fontWeight: 700 }} align="right">
              Status
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {[
            {
              domain: 'google.com (Paid Search)',
              visitors: 45000,
              score: 85,
              status: 'High Volume',
            },
            {
              domain: 'partner-network.net (Affiliate)',
              visitors: 29000,
              score: 92,
              status: 'High Quality',
            },
            { domain: 'facebook.com (Social)', visitors: 58000, score: 48, status: 'Stabile' },
            {
              domain: 'reddit.com/r/fintech',
              visitors: 4200,
              score: 78,
              status: 'Niche Conversion',
            },
          ].map((src, idx) => (
            <TableRow key={idx}>
              <TableCell sx={{ fontWeight: 600 }}>{src.domain}</TableCell>
              <TableCell>{src.visitors.toLocaleString()}</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>{src.score}/100</TableCell>
              <TableCell align="right">
                <Chip
                  label={src.status}
                  size="small"
                  color={src.score > 80 ? 'success' : 'default'}
                  sx={{ height: 18, fontSize: '0.65rem' }}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );

  const renderAcquisitionAttribution = () => (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 2 }}>
        Conversion Attribution Structure Selector
      </Typography>
      <Typography variant="body2" color="text.secondary" paragraph>
        Choose how revenue conversions are credited back to advertising touchpoints. Swapping models
        changes credit metrics dynamically.
      </Typography>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {['First Touch', 'Last Touch', 'Linear Attribution', 'Data-Driven (AI)'].map((model) => (
          <Grid size={{ xs: 12, sm: 3 }} key={model}>
            <Paper
              onClick={() => {
                setAttributionModel(model);
                handleTriggerAction(`Swapped attribution model to ${model}`);
              }}
              variant="outlined"
              sx={{
                p: 2,
                borderRadius: 2.5,
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s',
                bgcolor: attributionModel === model ? alpha('#7C3AED', 0.08) : 'transparent',
                borderColor: attributionModel === model ? '#7C3AED' : 'divider',
                '&:hover': { borderColor: '#7C3AED' },
              }}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                {model}
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                {model === 'Data-Driven (AI)'
                  ? 'Auto credit based on conversions'
                  : 'Static ruleset'}
              </Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2.5, bgcolor: 'action.hover' }}>
        <Typography variant="caption" color="text.secondary">
          Current Active Ruleset Model
        </Typography>
        <Typography variant="subtitle1" fontWeight={800} color="secondary.main">
          {attributionModel}
        </Typography>
      </Paper>
    </Box>
  );

  const renderAcquisitionUTM = () => {
    const generatedUrlStr = `${utmUrl.base}?utm_source=${encodeURIComponent(utmUrl.source)}&utm_medium=${encodeURIComponent(utmUrl.medium)}&utm_campaign=${encodeURIComponent(utmUrl.campaign)}${utmUrl.sub_id1 ? `&sub_id1=${encodeURIComponent(utmUrl.sub_id1)}` : ''}${utmUrl.sub_id2 ? `&sub_id2=${encodeURIComponent(utmUrl.sub_id2)}` : ''}${utmUrl.click_id ? `&click_id=${encodeURIComponent(utmUrl.click_id)}` : ''}`;

    return (
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 2 }}>
          Interactive UTM URL Builder
        </Typography>
        <Grid container spacing={2} sx={{ mb: 2.5 }}>
          <Grid size={{ xs: 12 }}>
            <TextField
              size="small"
              fullWidth
              label="Base Destination URL"
              value={utmUrl.base}
              onChange={(e) => setUtmUrl((prev) => ({ ...prev, base: e.target.value }))}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              size="small"
              fullWidth
              label="Campaign Source (utm_source)"
              value={utmUrl.source}
              onChange={(e) => setUtmUrl((prev) => ({ ...prev, source: e.target.value }))}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              size="small"
              fullWidth
              label="Campaign Medium (utm_medium)"
              value={utmUrl.medium}
              onChange={(e) => setUtmUrl((prev) => ({ ...prev, medium: e.target.value }))}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              size="small"
              fullWidth
              label="Campaign Name (utm_campaign)"
              value={utmUrl.campaign}
              onChange={(e) => setUtmUrl((prev) => ({ ...prev, campaign: e.target.value }))}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              size="small"
              fullWidth
              label="Affiliate Sub ID 1 (sub_id1)"
              value={utmUrl.sub_id1 || ''}
              onChange={(e) => setUtmUrl((prev) => ({ ...prev, sub_id1: e.target.value }))}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              size="small"
              fullWidth
              label="Traffic Source Sub ID 2 (sub_id2)"
              value={utmUrl.sub_id2 || ''}
              onChange={(e) => setUtmUrl((prev) => ({ ...prev, sub_id2: e.target.value }))}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              size="small"
              fullWidth
              label="Click ID Token (click_id)"
              value={utmUrl.click_id || ''}
              onChange={(e) => setUtmUrl((prev) => ({ ...prev, click_id: e.target.value }))}
            />
          </Grid>
        </Grid>
        <Paper
          variant="outlined"
          sx={{
            p: 2,
            borderRadius: 2.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 2,
            bgcolor: isDark ? alpha('#7C3AED', 0.04) : '#fafafa',
            mb: 3,
          }}
        >
          <Typography
            variant="body2"
            sx={{
              fontFamily: 'monospace',
              wordBreak: 'break-all',
              fontSize: '0.8rem',
              color: '#10B981',
              fontWeight: 600,
            }}
          >
            {generatedUrlStr}
          </Typography>
          <IconButton
            size="small"
            onClick={() => {
              navigator.clipboard.writeText(generatedUrlStr);
              setToast({
                open: true,
                message: 'Copied UTM Link to Clipboard',
                severity: 'success',
              });
            }}
            color="primary"
          >
            <AppIcon name="ContentCopy" fallback={ContentCopyIcon} sx={{ fontSize: 18 }} />
          </IconButton>
        </Paper>
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2.5, bgcolor: 'action.hover', mb: 4 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Save This UTM Link
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
            <TextField
              size="small"
              label="URL Name / Description Tag"
              placeholder="e.g. Summer VIP Promotion"
              value={utmLabel}
              onChange={(e) => setUtmLabel(e.target.value)}
              sx={{ flex: 1 }}
            />
            <Button
              variant="contained"
              startIcon={<AppIcon name="Add" fallback={AddIcon} />}
              onClick={() => {
                if (!utmLabel.trim()) {
                  setToast({
                    open: true,
                    message: 'Please provide a name/label for the link',
                    severity: 'warning',
                  });
                  return;
                }
                handleSaveUtm(utmLabel.trim(), generatedUrlStr);
                setUtmLabel('');
              }}
              sx={{ textTransform: 'none', borderRadius: 2 }}
            >
              Save Link
            </Button>
          </Stack>
        </Paper>
        <Paper
          variant="outlined"
          sx={{ p: 2.5, borderRadius: 2.5, bgcolor: 'action.hover', mb: 4 }}
        >
          <Typography
            variant="subtitle2"
            color="primary"
            sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1, fontWeight: 700 }}
          >
            <AppIcon name="Launch" fallback={LaunchIcon} sx={{ fontSize: 18 }} />
            Third-Party Tracking Integrations
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            Configure conversion postbacks, pixel injections, and analytical web tracking scripts to
            automatically sync client signals.
          </Typography>

          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                size="small"
                fullWidth
                label="Facebook Pixel ID"
                placeholder="e.g. 1029384756"
                value={fbPixelId}
                onChange={(e) => setFbPixelId(e.target.value)}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                size="small"
                fullWidth
                label="Google Analytics 4 ID"
                placeholder="e.g. G-H2KL59X9"
                value={ga4MeasurementId}
                onChange={(e) => setGa4MeasurementId(e.target.value)}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                size="small"
                fullWidth
                label="Custom Postback Webhook"
                placeholder="https://tracker.com/postback?click_id={click_id}"
                value={postbackUrlTemplate}
                onChange={(e) => setPostbackUrlTemplate(e.target.value)}
              />
            </Grid>
          </Grid>
          <Button
            variant="contained"
            color="primary"
            onClick={() => {
              localStorage.setItem('orchestratori_marketing_fb_pixel_id', fbPixelId);
              localStorage.setItem('orchestratori_marketing_ga4_measurement_id', ga4MeasurementId);
              localStorage.setItem(
                'orchestratori_marketing_postback_url_template',
                postbackUrlTemplate
              );
              setToast({
                open: true,
                message: 'Tracking configurations saved successfully',
                severity: 'success',
              });
              fireConfetti();
            }}
            sx={{ textTransform: 'none', borderRadius: 2 }}
          >
            Save Integrations
          </Button>
        </Paper>
        <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
          Saved Campaign UTM Links
        </Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Label Tag</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Generated UTM Link</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Date Saved</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">
                  Actions
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {savedUtmsList.map((utm) => (
                <TableRow key={utm.id}>
                  <TableCell sx={{ fontWeight: 600 }}>{utm.label}</TableCell>
                  <TableCell
                    sx={{
                      fontFamily: 'monospace',
                      fontSize: '0.75rem',
                      maxWidth: 300,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {utm.url}
                  </TableCell>
                  <TableCell>{utm.date}</TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                      <IconButton
                        size="small"
                        onClick={() => {
                          navigator.clipboard.writeText(utm.url);
                          setToast({
                            open: true,
                            message: 'Copied link to clipboard',
                            severity: 'success',
                          });
                        }}
                        color="primary"
                      >
                        <AppIcon
                          name="ContentCopy"
                          fallback={ContentCopyIcon}
                          sx={{ fontSize: 16 }}
                        />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => handleDeleteUtm(utm.id, utm.label)}
                        color="error"
                      >
                        <AppIcon name="Delete" fallback={DeleteIcon} sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
              {savedUtmsList.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                    No saved links yet. Use the builder above to save links.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    );
  };

  // 6. Conversion Tab renderers
  const renderConversionFunnels = () => (
    <Box sx={{ p: 1 }}>
      <Typography variant="subtitle2" sx={{ mb: 2 }}>
        Checkout User Journey Funnel
      </Typography>
      <Stack spacing={1.5}>
        {[
          { label: 'Step 1: Website Visitors', value: 45820, percent: 100, color: '#7C3AED' },
          { label: 'Step 2: Sign-Up Form Initiated', value: 29320, percent: 64, color: '#5b2cab' },
          {
            label: 'Step 3: Account Onboard Completed',
            value: 8450,
            percent: 18,
            color: '#3f1f77',
          },
          {
            label: 'Step 4: Paid Active Conversion (FTD)',
            value: 1250,
            percent: 2.7,
            color: '#10B981',
          },
        ].map((f, i) => (
          <Box key={i}>
            <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
              <Typography variant="caption" fontWeight={700}>
                {f.label}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                <strong>{f.value.toLocaleString()}</strong> ({f.percent}%)
              </Typography>
            </Stack>
            <Box
              sx={{
                width: '100%',
                height: 28,
                borderRadius: 1.5,
                bgcolor: 'action.hover',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <Box
                sx={{
                  width: `${f.percent}%`,
                  height: '100%',
                  bgcolor: f.color,
                  borderRadius: 1.5,
                  display: 'flex',
                  alignItems: 'center',
                  px: 1.5,
                }}
              >
                {f.percent > 5 && (
                  <Typography
                    variant="caption"
                    sx={{ color: '#fff', fontWeight: 700, fontSize: '0.7rem' }}
                  >
                    {f.percent}%
                  </Typography>
                )}
              </Box>
            </Box>
          </Box>
        ))}
      </Stack>
    </Box>
  );

  const renderConversionAnalysis = () => (
    <Box sx={{ height: 320, width: '100%', mt: 2 }}>
      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
        Hourly/Daily Conversion Rate Trends (%)
      </Typography>
      <ResponsiveContainer width="100%" height="90%">
        <AreaChart data={MOCK_TRAFFIC_DATA} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke={isDark ? '#2e2e30' : '#e0e0e0'}
          />
          <XAxis dataKey="day" stroke="text.disabled" style={{ fontSize: '0.75rem' }} />
          <YAxis stroke="text.disabled" style={{ fontSize: '0.75rem' }} />
          <RechartsTooltip contentStyle={{ backgroundColor: isDark ? '#1e1e1e' : '#ffffff' }} />
          <Area
            type="monotone"
            dataKey="conversions"
            stroke="#10B981"
            fill="#10B981"
            fillOpacity={0.15}
            strokeWidth={2.5}
          />
        </AreaChart>
      </ResponsiveContainer>
    </Box>
  );

  const renderConversionBehavior = () => (
    <Grid container spacing={2}>
      {[
        { label: 'Avg Session Time', value: '4 mins 12 secs', target: 'Target: 5m' },
        { label: 'Scroll Depth Drop-Off', value: '45% reach bottom', target: 'Target: 50%' },
        { label: 'Autofill Form rate', value: '74% of forms', target: 'Target: 80%' },
        { label: 'Mobile Conversion volume', value: '64% share', target: 'Target: 60%' },
      ].map((b, i) => (
        <Grid size={{ xs: 12, sm: 6 }} key={i}>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
            <Typography variant="caption" color="text.secondary" fontWeight={700}>
              {b.label}
            </Typography>
            <Typography variant="h6" fontWeight={800} sx={{ my: 0.5 }}>
              {b.value}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {b.target}
            </Typography>
          </Paper>
        </Grid>
      ))}
    </Grid>
  );

  const renderConversionEvents = () => (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
        Outbound Affiliate Conversion Postbacks (Hook Log)
      </Typography>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Hook ID</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Affiliate Partner</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Event Trigger</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Reward</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>HTTP Response</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Timestamp</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {[
              {
                id: 'PB-402',
                affiliate: 'AlphaMedia Group',
                event: 'FTD (First Deposit)',
                payout: '$150.00',
                status: 200,
                statusText: 'OK',
                time: '2026-06-18 20:34:02',
              },
              {
                id: 'PB-401',
                affiliate: 'GamblingElite UK',
                event: 'Registration',
                payout: '$5.00',
                status: 200,
                statusText: 'OK',
                time: '2026-06-18 20:30:15',
              },
              {
                id: 'PB-400',
                affiliate: 'VegasMinds Partners',
                event: 'FTD (First Deposit)',
                payout: '$120.00',
                status: 503,
                statusText: 'Service Unavailable',
                time: '2026-06-18 20:25:40',
              },
              {
                id: 'PB-399',
                affiliate: 'AlphaMedia Group',
                event: 'Registration',
                payout: '$3.50',
                status: 200,
                statusText: 'OK',
                time: '2026-06-18 20:18:22',
              },
              {
                id: 'PB-398',
                affiliate: 'SaaSReferrals Network',
                event: 'Subscription Active',
                payout: '$45.00',
                status: 200,
                statusText: 'OK',
                time: '2026-06-18 19:54:10',
              },
            ].map((log) => (
              <TableRow key={log.id}>
                <TableCell sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{log.id}</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>{log.affiliate}</TableCell>
                <TableCell>
                  <Chip
                    label={log.event}
                    size="small"
                    variant="outlined"
                    sx={{ height: 20, fontSize: '0.65rem' }}
                  />
                </TableCell>
                <TableCell sx={{ fontWeight: 700, color: 'success.main' }}>{log.payout}</TableCell>
                <TableCell>
                  <Chip
                    label={`${log.status} ${log.statusText}`}
                    size="small"
                    color={log.status === 200 ? 'success' : 'error'}
                    sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700 }}
                  />
                </TableCell>
                <TableCell sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                  {log.time}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );

  // 7. Retention Tab renderers
  const renderRetentionLoyalty = () => (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
        VIP & Loyalty Program Points Matrix
      </Typography>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { tier: 'Bronze VIP Tier', threshold: '0 - 1,000 points', cash: '2% cashback' },
          { tier: 'Silver VIP Tier', threshold: '1,001 - 5,000 points', cash: '5% cashback' },
          { tier: 'Gold VIP Tier', threshold: '5,001 - 10,000 points', cash: '8% cashback' },
          { tier: 'Platinum VIP Tier', threshold: '10,000+ points', cash: '12% cashback' },
        ].map((vip, i) => (
          <Grid size={{ xs: 12, sm: 3 }} key={i}>
            <Paper
              variant="outlined"
              sx={{
                p: 1.5,
                borderRadius: 2,
                textAlign: 'center',
                bgcolor: i === 2 ? alpha('#7C3AED', 0.06) : 'transparent',
                borderColor: i === 2 ? '#7C3AED' : 'divider',
              }}
            >
              <Typography variant="subtitle2" fontWeight={800}>
                {vip.tier}
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ my: 0.5 }}>
                {vip.threshold}
              </Typography>
              <Chip
                label={vip.cash}
                size="small"
                color="secondary"
                sx={{ height: 18, fontSize: '0.65rem' }}
              />
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Stack direction="row" spacing={1.5} alignItems="center">
        <TextField
          size="small"
          label="Gold VIP Tier Threshold (points)"
          type="number"
          value={vipThreshold}
          onChange={(e) => setVipThreshold(Number(e.target.value))}
          sx={{ flex: 1 }}
        />
        <Button
          variant="contained"
          onClick={() => handleTriggerAction(`Update VIP threshold: ${vipThreshold}`)}
          sx={{ textTransform: 'none', borderRadius: 2 }}
        >
          Save VIP Config
        </Button>
      </Stack>
    </Box>
  );

  const renderRetentionChurn = () => (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
        High-Risk Churn Prediction Warnings
      </Typography>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Days Inactive</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>LTV Share</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Churn Risk</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">
                Actions
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {[
              {
                name: 'John Miller',
                email: 'jmiller@gmail.com',
                inactive: '12 days',
                ltv: '$450',
                risk: '92% High',
              },
              {
                name: 'Ksenia Petrova',
                email: 'ksenia.p@mail.ru',
                inactive: '8 days',
                ltv: '$6,200',
                risk: '58% Medium',
              },
              {
                name: 'Marcus Sterling',
                email: 'marcus@sterling.org',
                inactive: '14 days',
                ltv: '$9,200',
                risk: '84% High',
              },
            ].map((usr, i) => (
              <TableRow key={i}>
                <TableCell>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    {usr.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {usr.email}
                  </Typography>
                </TableCell>
                <TableCell>{usr.inactive}</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>{usr.ltv}</TableCell>
                <TableCell>
                  <Chip
                    label={usr.risk}
                    size="small"
                    color={usr.risk.includes('High') ? 'error' : 'warning'}
                    sx={{ height: 18, fontSize: '0.65rem', fontWeight: 800 }}
                  />
                </TableCell>
                <TableCell align="right">
                  <Button
                    size="small"
                    variant="contained"
                    color="warning"
                    onClick={() => handleTriggerAction(`Reactivate user ${usr.name}`)}
                    sx={{ textTransform: 'none', height: 24, fontSize: '0.7rem' }}
                  >
                    Reactivate
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );

  const renderRetentionReactivation = () => {
    return (
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
          Configure Reactivation Coupon Campaign
        </Typography>
        <Grid container spacing={2} sx={{ mb: 2.5 }}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              size="small"
              fullWidth
              label="Promo Discount Code"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <FormControl size="small" fullWidth>
              <InputLabel>Trigger Target Period</InputLabel>
              <Select defaultValue={7} label="Trigger Target Period">
                <MenuItem value={5}>Inactive for 5 Days</MenuItem>
                <MenuItem value={7}>Inactive for 7 Days</MenuItem>
                <MenuItem value={14}>Inactive for 14 Days</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>
        <Button
          variant="contained"
          onClick={() => handleTriggerAction(`Reactivation code: ${couponCode}`)}
          sx={{ textTransform: 'none', borderRadius: 2 }}
        >
          Deploy Reactivation Sequence
        </Button>
      </Box>
    );
  };

  const renderRetentionPersonalization = () => (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
        Segment Copywriting Personalizer
      </Typography>
      <Stack spacing={1.5}>
        {[
          {
            segment: 'Whale (High LTV)',
            headline: 'Welcome Back VIP! Your platinum tier rewards are ready.',
            channel: 'Website Banner',
          },
          {
            segment: 'Churn Risk (Dormant)',
            headline: 'We miss you! Deposit now to secure 20% cashback bonus.',
            channel: 'SMS Outbound',
          },
          {
            segment: 'New Sign-Ups',
            headline: 'Ready to spin? Claim your registration gift below.',
            channel: 'Landing Page',
          },
        ].map((pers, i) => (
          <Paper key={i} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
            <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
              <Chip
                label={pers.segment}
                size="small"
                color="secondary"
                sx={{ height: 18, fontSize: '0.65rem', fontWeight: 800 }}
              />
              <Typography variant="caption" color="text.secondary">
                {pers.channel}
              </Typography>
            </Stack>
            <Typography
              variant="subtitle2"
              fontWeight={700}
              sx={{ fontStyle: 'italic', pl: 1, borderLeft: '2px solid #7C3AED' }}
            >
              "{pers.headline}"
            </Typography>
          </Paper>
        ))}
      </Stack>
    </Box>
  );

  // 8. Team Tab renderers
  const renderTeamManagers = () => (
    <Grid container spacing={2}>
      {[
        {
          name: 'Sarah Vance (CEO)',
          role: 'Owner',
          status: 'Active',
          color: theme.palette.success.main,
        },
        {
          name: 'Acquisition Agent',
          role: 'AI Marketing Agent',
          status: 'Running Autopilot',
          color: theme.palette.primary.main,
          isAi: true,
        },
        {
          name: 'Content Copier Agent',
          role: 'AI Copywriter Agent',
          status: 'Monitoring Assets',
          color: theme.palette.primary.main,
          isAi: true,
        },
        {
          name: 'Arthur Pendragon',
          role: 'CMO Operator',
          status: 'Reviewing Approvals',
          color: theme.palette.warning.main,
        },
      ].map((mgr, i) => (
        <Grid size={{ xs: 12, sm: 6 }} key={i}>
          <Paper
            variant="outlined"
            sx={{ p: 2, borderRadius: 2.5, display: 'flex', alignItems: 'center', gap: 2 }}
          >
            <Box
              sx={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                bgcolor: alpha(mgr.color, 0.12),
                color: mgr.color,
                display: 'flex',
                alignItems: 'center',
                justify: 'center',
                flexShrink: 0,
              }}
            >
              {mgr.isAi ? (
                <AppIcon
                  name="SmartToyOutlined"
                  fallback={SmartToyOutlinedIcon}
                  sx={{ fontSize: 24, mx: 'auto' }}
                />
              ) : (
                <AppIcon name="People" fallback={PeopleIcon} sx={{ fontSize: 24, mx: 'auto' }} />
              )}
            </Box>
            <Box>
              <Typography variant="subtitle2" fontWeight={700}>
                {mgr.name}
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block">
                {mgr.role}
              </Typography>
              <Chip
                label={mgr.status}
                size="small"
                sx={{
                  height: 16,
                  fontSize: '0.58rem',
                  fontWeight: 800,
                  mt: 0.5,
                  bgcolor: alpha(mgr.color, 0.08),
                  color: mgr.color,
                }}
              />
            </Box>
          </Paper>
        </Grid>
      ))}
    </Grid>
  );

  const renderTeamTasks = () => (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="subtitle2">Active Operations Checklist</Typography>
        <Button
          variant="contained"
          size="small"
          startIcon={<AppIcon name="Add" fallback={AddIcon} />}
          onClick={() => setAddTaskOpen(true)}
          sx={{ textTransform: 'none', borderRadius: 2 }}
        >
          Add Task
        </Button>
      </Stack>
      <Stack spacing={1}>
        {tasksList.map((t, i) => (
          <Paper
            key={t.id || i}
            variant="outlined"
            sx={{
              p: 1.5,
              borderRadius: 2,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              bgcolor: t.done ? 'action.hover' : 'transparent',
              opacity: t.done ? 0.75 : 1,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <IconButton
                size="small"
                color={t.done ? 'success' : 'default'}
                onClick={() => handleToggleTask(t.id)}
              >
                {t.done ? (
                  <AppIcon name="Check" fallback={CheckIcon} sx={{ fontSize: 16 }} />
                ) : (
                  <Box
                    sx={{ width: 16, height: 16, border: '1px solid #7c7c82', borderRadius: '50%' }}
                  />
                )}
              </IconButton>
              <Typography
                variant="body2"
                sx={{
                  textDecoration: t.done ? 'line-through' : 'none',
                  fontWeight: t.done ? 500 : 600,
                }}
              >
                {t.task}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip
                label={t.assignee}
                size="small"
                variant="outlined"
                sx={{ height: 18, fontSize: '0.62rem' }}
              />
              <IconButton size="small" color="error" onClick={() => handleDeleteTask(t.id, t.task)}>
                <AppIcon name="Delete" fallback={DeleteIcon} sx={{ fontSize: 16 }} />
              </IconButton>
            </Stack>
          </Paper>
        ))}
        {tasksList.length === 0 && (
          <Paper variant="outlined" sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>
            No operations tasks yet. Click "Add Task" to create one.
          </Paper>
        )}
      </Stack>
    </Box>
  );

  const renderTeamApprovals = () => (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
        Creative Assets Sign-Off Queue
      </Typography>
      {approvals.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>
          All approvals resolved!
        </Paper>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Asset Name</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Requested By</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">
                  Actions
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {approvals.map((app) => (
                <TableRow key={app.id}>
                  <TableCell>
                    <Typography variant="subtitle2" fontWeight={600}>
                      {app.asset}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {app.id} · {app.size}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={app.manager}
                      size="small"
                      sx={{ height: 18, fontSize: '0.6rem' }}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                      <IconButton
                        size="small"
                        color="success"
                        onClick={() => {
                          setApprovals((prev) => prev.filter((item) => item.id !== app.id));
                          handleTriggerAction(`Approved asset ${app.id}`);
                        }}
                      >
                        <AppIcon name="Check" fallback={CheckIcon} sx={{ fontSize: 16 }} />
                      </IconButton>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => {
                          setApprovals((prev) => prev.filter((item) => item.id !== app.id));
                          handleTriggerAction(`Rejected asset ${app.id}`);
                        }}
                      >
                        <AppIcon name="Close" fallback={CloseIcon} sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );

  const renderTeamBudget = () => {
    const data = [
      { name: 'Acquisition Bids', value: 24500, color: '#7C3AED' },
      { name: 'Creatives & Content', value: 8500, color: '#3b82f6' },
      { name: 'Retention & Loyalty', value: 4200, color: '#10B981' },
      { name: 'Team Reserves', value: 12800, color: '#F59E0B' },
    ];
    return (
      <Box sx={{ height: 320, width: '100%', mt: 2 }}>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          Budget Share Allocation (USD)
        </Typography>
        <ResponsiveContainer width="100%" height="90%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={85}
              paddingAngle={3}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <RechartsTooltip formatter={(val) => `$${val.toLocaleString()}`} />
            <Legend
              layout="horizontal"
              align="center"
              verticalAlign="bottom"
              style={{ fontSize: '0.75rem' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </Box>
    );
  };

  const renderTabContent = () => {
    if (activePage === 'dashboard') {
      if (currentTab === 0) return renderDashboardOverview();
      if (currentTab === 1) return renderDashboardKPIs();
      if (currentTab === 2) return renderDashboardForecasts();
      if (currentTab === 3) return renderDashboardInsights();
    }
    if (activePage === 'audiences') {
      if (currentTab === 0) return renderAudiencesCRM();
      if (currentTab === 1) return renderAudiencesSegments();
      if (currentTab === 2) return renderAudiencesCohorts();
      if (currentTab === 3) return renderAudiencesJourneys();
    }
    if (activePage === 'campaigns') {
      if (currentTab === 0) return renderCampaignsActive();
      if (currentTab === 1) return renderCampaignsCalendar();
      if (currentTab === 2) return renderCampaignsAutomation();
      if (currentTab === 3) return renderCampaignsABTests();
    }
    if (activePage === 'content') {
      if (currentTab === 0) return renderContentAssets();
      if (currentTab === 1) return renderContentLandingPages();
      if (currentTab === 2) return renderContentTemplates();
      if (currentTab === 3) return renderContentGuidelines();
    }
    if (activePage === 'acquisition') {
      if (currentTab === 0) return renderAcquisitionChannels();
      if (currentTab === 1) return renderAcquisitionSources();
      if (currentTab === 2) return renderAcquisitionAttribution();
      if (currentTab === 3) return renderAcquisitionUTM();
    }
    if (activePage === 'conversion') {
      if (currentTab === 0) return renderConversionFunnels();
      if (currentTab === 1) return renderConversionAnalysis();
      if (currentTab === 2) return renderConversionBehavior();
      if (currentTab === 3) return renderConversionEvents();
    }
    if (activePage === 'retention') {
      if (currentTab === 0) return renderRetentionLoyalty();
      if (currentTab === 1) return renderRetentionChurn();
      if (currentTab === 2) return renderRetentionReactivation();
      if (currentTab === 3) return renderRetentionPersonalization();
    }
    if (activePage === 'team') {
      if (currentTab === 0) return renderTeamManagers();
      if (currentTab === 1) return renderTeamTasks();
      if (currentTab === 2) return renderTeamApprovals();
      if (currentTab === 3) return renderTeamBudget();
    }
    return <Typography>Widget under construction.</Typography>;
  };

  return (
    <PageLayout title={headingTitle} subtitle={headingSubtitle} showTitleBlock>
      <Grid container spacing={2.5}>
        {/* Main interactive panel */}
        <Grid size={{ xs: 12, lg: aiPanelOpen ? 8 : 12 }}>
          {/* Sub-Page Metrics Bar */}
          <Grid container spacing={1.5} sx={{ mb: 2 }}>
            {pageMetrics.map((card, i) => {
              const Icon = card.icon;
              return (
                <Grid size={{ xs: 12, sm: 4 }} key={i}>
                  <Paper
                    elevation={0}
                    sx={{
                      p: 1.5,
                      borderRadius: 2.5,
                      border: '1px solid',
                      borderColor: alpha(card.color, 0.22),
                      background: `linear-gradient(135deg, ${alpha(card.color, 0.08)} 0%, ${alpha(theme.palette.background.paper, 0.98)} 70%)`,
                    }}
                  >
                    <Box sx={{ display: 'flex', justify: 'space-between', gap: 1 }}>
                      <Box>
                        <Typography
                          variant="caption"
                          sx={{ color: 'text.secondary', fontWeight: 600 }}
                        >
                          {card.label}
                        </Typography>
                        <Typography variant="h6" sx={{ fontWeight: 800, mt: 0.5, lineHeight: 1.1 }}>
                          {card.value}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{ color: 'text.secondary', display: 'block', mt: 0.35 }}
                        >
                          {card.helper}
                        </Typography>
                      </Box>
                      <Box
                        sx={{
                          width: 32,
                          height: 32,
                          borderRadius: 1.5,
                          bgcolor: alpha(card.color, 0.12),
                          color: card.color,
                          display: 'flex',
                          alignItems: 'center',
                          justify: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <AppIcon fallback={Icon} sx={{ fontSize: 18, mx: 'auto' }} />
                      </Box>
                    </Box>
                  </Paper>
                </Grid>
              );
            })}
          </Grid>

          {/* Main BentoCard for tabs */}
          <BentoCard
            title={headingTitle}
            subtitle={
              <Tabs
                value={currentTab}
                onChange={handleTabChange}
                variant="scrollable"
                scrollButtons="auto"
                sx={{
                  minHeight: 32,
                  '& .MuiTab-root': {
                    py: 0.5,
                    px: 1.5,
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    minHeight: 32,
                    textTransform: 'none',
                  },
                }}
              >
                {tabs.map((tabLabel, idx) => (
                  <Tab key={idx} label={tabLabel} />
                ))}
              </Tabs>
            }
            icon={CampaignIcon}
            iconColor="#7C3AED"
            titleWithAction
            action={
              <Button
                variant="outlined"
                size="small"
                onClick={() => setAiPanelOpen((v) => !v)}
                startIcon={
                  <AppIcon
                    name="SmartToyOutlined"
                    fallback={SmartToyOutlinedIcon}
                    sx={{ fontSize: 14 }}
                  />
                }
                sx={{
                  textTransform: 'none',
                  fontSize: '0.7rem',
                  borderRadius: 2,
                  fontWeight: 700,
                  borderColor: alpha('#7C3AED', 0.4),
                  color: '#7C3AED',
                  '&:hover': {
                    borderColor: '#7C3AED',
                    bgcolor: alpha('#7C3AED', 0.05),
                  },
                }}
              >
                {aiPanelOpen ? 'Hide Agent' : 'Show Agent'}
              </Button>
            }
          >
            <Box sx={{ minHeight: 280, pt: 1 }}>{renderTabContent()}</Box>
          </BentoCard>
        </Grid>

        {/* Floating AI Agent Sidebar panel */}
        {aiPanelOpen && (
          <Grid size={{ xs: 12, lg: 4 }}>
            <Paper
              elevation={0}
              sx={{
                p: 2,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                borderRadius: 3,
                border: '1px solid',
                borderColor: autopilotActive ? alpha('#10B981', 0.35) : alpha('#7C3AED', 0.22),
                backgroundImage: isDark
                  ? `linear-gradient(135deg, ${alpha(autopilotActive ? '#10B981' : '#7C3AED', 0.05)} 0%, ${alpha(theme.palette.background.paper, 0.95)} 80%)`
                  : theme.palette.background.paper,
                boxShadow: createHoverGlowShadow(theme),
                transition: 'border-color 0.4s ease',
              }}
            >
              {/* Sidebar Header */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                <Box
                  sx={{
                    width: 38,
                    height: 38,
                    borderRadius: 2,
                    bgcolor: alpha(autopilotActive ? '#10B981' : '#7C3AED', 0.12),
                    color: autopilotActive ? '#10B981' : '#7C3AED',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                  }}
                >
                  <AppIcon
                    name="SmartToyOutlined"
                    fallback={SmartToyOutlinedIcon}
                    sx={{ fontSize: 20 }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      bottom: -2,
                      right: -2,
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      backgroundColor: autopilotActive ? '#10B981' : '#7C3AED',
                      border: `2px solid ${theme.palette.background.paper}`,
                      animation: autopilotActive ? 'pulse 1.5s infinite' : 'none',
                    }}
                  />
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                    Marketing Orchestrator
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {autopilotActive ? 'Autopilot: Active & Auditing' : 'Manual Oversight Mode'}
                  </Typography>
                </Box>
              </Box>

              {/* Autopilot toggle */}
              <Paper
                variant="outlined"
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justify: 'space-between',
                  mb: 2,
                }}
              >
                <Typography variant="caption" fontWeight={700}>
                  Engage AI Autopilot
                </Typography>
                <Switch
                  checked={autopilotActive}
                  onChange={handleAutopilotToggle}
                  color="success"
                  sx={{
                    '& .MuiSwitch-switchBase.Mui-checked': { color: '#10B981' },
                    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                      backgroundColor: '#10B981',
                    },
                  }}
                />
              </Paper>

              {/* Goal settings */}
              <Typography
                variant="overline"
                color="text.secondary"
                fontWeight={700}
                sx={{ display: 'block', mb: 0.5 }}
              >
                Active Marketing Goal
              </Typography>
              <FormControl size="small" fullWidth sx={{ mb: 2.5 }}>
                <Select
                  value={activeGoal}
                  onChange={(e) => {
                    setActiveGoal(e.target.value);
                    setToast({
                      open: true,
                      message: `Orchestrator goal shifted to: ${e.target.value}`,
                      severity: 'info',
                    });
                  }}
                  sx={{ borderRadius: 2, fontWeight: 700 }}
                >
                  <MenuItem value="Decrease Churn by 15%">Decrease Churn by 15%</MenuItem>
                  <MenuItem value="Optimize Paid Ad CPC">Optimize Paid Ad CPC</MenuItem>
                  <MenuItem value="Maximize Referral ROI">Maximize Referral ROI</MenuItem>
                </Select>
              </FormControl>

              {/* Recommendations */}
              <Typography
                variant="overline"
                color="text.secondary"
                fontWeight={700}
                sx={{ display: 'block', mb: 0.5 }}
              >
                AI Recommendations
              </Typography>
              <Stack spacing={1} sx={{ mb: 2.5, flex: 1, overflow: 'auto' }}>
                {(PAGE_RECOMMENDATIONS[activePage] || []).map((rec, i) => (
                  <Paper
                    key={i}
                    variant="outlined"
                    sx={{
                      p: 1.25,
                      borderRadius: 1.5,
                      bgcolor: alpha(theme.palette.secondary.main, 0.02),
                    }}
                  >
                    <Typography
                      variant="caption"
                      display="block"
                      color="text.secondary"
                      paragraph
                      sx={{ mb: 1 }}
                    >
                      {rec.text}
                    </Typography>
                    <Button
                      variant="contained"
                      size="small"
                      fullWidth
                      onClick={() => handleTriggerAction(rec.actionText)}
                      sx={{
                        textTransform: 'none',
                        py: 0.4,
                        fontSize: '0.68rem',
                        borderRadius: 1.5,
                      }}
                    >
                      {rec.actionText}
                    </Button>
                  </Paper>
                ))}
              </Stack>

              {/* Terminal Logs */}
              <Box
                sx={{ display: 'flex', justify: 'space-between', alignItems: 'center', mb: 0.5 }}
              >
                <Typography variant="overline" color="text.secondary" fontWeight={700}>
                  Autopilot Execution Logs
                </Typography>
                <Button
                  size="small"
                  onClick={handleClearLogs}
                  sx={{ textTransform: 'none', fontSize: '0.6rem', p: 0 }}
                >
                  Clear
                </Button>
              </Box>
              <Box
                sx={{
                  bgcolor: isDark ? '#141416' : '#f4f4f6',
                  color: isDark ? '#c0caf5' : '#333333',
                  p: 1.5,
                  borderRadius: 2,
                  fontFamily: 'monospace',
                  fontSize: '0.7rem',
                  height: 140,
                  overflowY: 'auto',
                  border: '1px solid',
                  borderColor: 'divider',
                  display: 'flex',
                  flexDirection: 'column-reverse', // keep logs scrolling upwards
                }}
              >
                <Stack spacing={0.5}>
                  {autopilotLogs
                    .slice()
                    .reverse()
                    .map((log, i) => (
                      <div key={i} style={{ wordBreak: 'break-all', opacity: i === 0 ? 1 : 0.7 }}>
                        {log}
                      </div>
                    ))}
                </Stack>
              </Box>
            </Paper>
          </Grid>
        )}
      </Grid>
      {/* Dialog: Add Lead */}
      <Dialog
        open={addContactOpen}
        onClose={() => setAddContactOpen(false)}
        PaperProps={{
          sx: {
            borderRadius: 3,
            bgcolor: isDark ? '#1a1a1e' : '#ffffff',
            backgroundImage: isDark
              ? 'linear-gradient(to bottom, rgba(255,255,255,0.02), rgba(255,255,255,0))'
              : 'none',
            border: '1px solid',
            borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
            boxShadow: '0 24px 48px -12px rgba(0,0,0,0.5)',
            p: 1,
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: 800, pb: 1 }}>Add CRM Lead Profile</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1, minWidth: { xs: 280, sm: 400 } }}>
            <TextField
              size="small"
              label="Full Name"
              value={contactForm.name}
              onChange={(e) => setContactForm((prev) => ({ ...prev, name: e.target.value }))}
              fullWidth
              required
            />
            <TextField
              size="small"
              label="Email Address"
              value={contactForm.email}
              onChange={(e) => setContactForm((prev) => ({ ...prev, email: e.target.value }))}
              fullWidth
            />
            <TextField
              size="small"
              label="Phone Number"
              value={contactForm.phone}
              onChange={(e) => setContactForm((prev) => ({ ...prev, phone: e.target.value }))}
              fullWidth
            />
            <Grid container spacing={2}>
              <Grid size={{ xs: 6 }}>
                <FormControl size="small" fullWidth>
                  <InputLabel>Segment Tag</InputLabel>
                  <Select
                    value={contactForm.segment}
                    label="Segment Tag"
                    onChange={(e) =>
                      setContactForm((prev) => ({ ...prev, segment: e.target.value }))
                    }
                  >
                    <MenuItem value="Whale">Whale</MenuItem>
                    <MenuItem value="Active Player">Active Player</MenuItem>
                    <MenuItem value="New User">New User</MenuItem>
                    <MenuItem value="Churn Risk">Churn Risk</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField
                  size="small"
                  label="LTV Spend Value"
                  value={contactForm.value}
                  onChange={(e) => setContactForm((prev) => ({ ...prev, value: e.target.value }))}
                  fullWidth
                />
              </Grid>
            </Grid>
            <Grid container spacing={2}>
              <Grid size={{ xs: 4 }}>
                <TextField
                  size="small"
                  label="Country Code"
                  placeholder="e.g. US"
                  value={contactForm.country}
                  onChange={(e) => setContactForm((prev) => ({ ...prev, country: e.target.value }))}
                  fullWidth
                />
              </Grid>
              <Grid size={{ xs: 4 }}>
                <TextField
                  size="small"
                  label="Score (%)"
                  type="number"
                  value={contactForm.score}
                  onChange={(e) =>
                    setContactForm((prev) => ({ ...prev, score: Number(e.target.value) }))
                  }
                  fullWidth
                />
              </Grid>
              <Grid size={{ xs: 4 }}>
                <FormControl size="small" fullWidth>
                  <InputLabel>Risk</InputLabel>
                  <Select
                    value={contactForm.risk}
                    label="Risk"
                    onChange={(e) => setContactForm((prev) => ({ ...prev, risk: e.target.value }))}
                  >
                    <MenuItem value="Low">Low</MenuItem>
                    <MenuItem value="Medium">Medium</MenuItem>
                    <MenuItem value="High">High</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>

            <Grid container spacing={2}>
              <Grid size={{ xs: 6 }}>
                <TextField
                  size="small"
                  label="Referral Source / Link"
                  placeholder="e.g. fb_slots_vip"
                  value={contactForm.source}
                  onChange={(e) => setContactForm((prev) => ({ ...prev, source: e.target.value }))}
                  fullWidth
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField
                  size="small"
                  label="Joined Date"
                  type="date"
                  value={contactForm.joined}
                  onChange={(e) => setContactForm((prev) => ({ ...prev, joined: e.target.value }))}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
            </Grid>

            <Grid container spacing={2}>
              <Grid size={{ xs: 6 }}>
                <FormControl size="small" fullWidth>
                  <InputLabel>FTD Status</InputLabel>
                  <Select
                    value={contactForm.ftdStatus}
                    label="FTD Status"
                    onChange={(e) =>
                      setContactForm((prev) => ({ ...prev, ftdStatus: e.target.value }))
                    }
                  >
                    <MenuItem value="None">None</MenuItem>
                    <MenuItem value="Deposited">Deposited</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 6 }}>
                <FormControl size="small" fullWidth>
                  <InputLabel>Fraud Check Risk</InputLabel>
                  <Select
                    value={contactForm.fraudRisk}
                    label="Fraud Check Risk"
                    onChange={(e) =>
                      setContactForm((prev) => ({ ...prev, fraudRisk: e.target.value }))
                    }
                  >
                    <MenuItem value="Clear">Clear</MenuItem>
                    <MenuItem value="VPN Detected">VPN Detected</MenuItem>
                    <MenuItem value="Multi-account">Multi-account</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setAddContactOpen(false)}
            sx={{ textTransform: 'none', borderRadius: 2 }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleAddContactSubmit}
            sx={{ textTransform: 'none', borderRadius: 2 }}
          >
            Save Lead
          </Button>
        </DialogActions>
      </Dialog>
      {/* Dialog: Create Campaign */}
      <Dialog
        open={createCampaignOpen}
        onClose={() => setCreateCampaignOpen(false)}
        PaperProps={{
          sx: {
            borderRadius: 3,
            bgcolor: isDark ? '#1a1a1e' : '#ffffff',
            border: '1px solid',
            borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
            boxShadow: '0 24px 48px -12px rgba(0,0,0,0.5)',
            p: 1,
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: 800, pb: 1 }}>Create Media Campaign</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1, minWidth: { xs: 280, sm: 360 } }}>
            <TextField
              size="small"
              label="Campaign Name"
              placeholder="e.g. Winter VIP Blast"
              value={campaignForm.name}
              onChange={(e) => setCampaignForm((prev) => ({ ...prev, name: e.target.value }))}
              fullWidth
              required
            />
            <FormControl size="small" fullWidth>
              <InputLabel>Traffic Channel</InputLabel>
              <Select
                value={campaignForm.channel}
                label="Traffic Channel"
                onChange={(e) => setCampaignForm((prev) => ({ ...prev, channel: e.target.value }))}
              >
                <MenuItem value="Google Search">Google Search</MenuItem>
                <MenuItem value="Facebook Ads">Facebook Ads</MenuItem>
                <MenuItem value="TikTok Video Ads">TikTok Video Ads</MenuItem>
                <MenuItem value="Reddit Ads">Reddit Ads</MenuItem>
                <MenuItem value="Email">Email</MenuItem>
                <MenuItem value="SMS Automation">SMS Automation</MenuItem>
              </Select>
            </FormControl>
            <Grid container spacing={2}>
              <Grid size={{ xs: 6 }}>
                <TextField
                  size="small"
                  label="GEO Country Code"
                  placeholder="e.g. BR"
                  value={campaignForm.geo}
                  onChange={(e) => setCampaignForm((prev) => ({ ...prev, geo: e.target.value }))}
                  fullWidth
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <FormControl size="small" fullWidth>
                  <InputLabel>Redirect Type</InputLabel>
                  <Select
                    value={campaignForm.redirectType}
                    label="Redirect Type"
                    onChange={(e) =>
                      setCampaignForm((prev) => ({ ...prev, redirectType: e.target.value }))
                    }
                  >
                    <MenuItem value="Direct Link">Direct Link</MenuItem>
                    <MenuItem value="Flow Redirect">Flow Redirect</MenuItem>
                    <MenuItem value="Lander & Offer">Lander & Offer</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
            <Grid container spacing={2}>
              <Grid size={{ xs: 6 }}>
                <TextField
                  size="small"
                  label="Payout Model"
                  placeholder="e.g. CPA $150"
                  value={campaignForm.payoutModel}
                  onChange={(e) =>
                    setCampaignForm((prev) => ({ ...prev, payoutModel: e.target.value }))
                  }
                  fullWidth
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField
                  size="small"
                  label="Monthly Budget ($)"
                  type="number"
                  value={campaignForm.budget}
                  onChange={(e) =>
                    setCampaignForm((prev) => ({ ...prev, budget: Number(e.target.value) }))
                  }
                  fullWidth
                />
              </Grid>
            </Grid>
            <FormControl size="small" fullWidth>
              <InputLabel>Initial Status</InputLabel>
              <Select
                value={campaignForm.status}
                label="Initial Status"
                onChange={(e) => setCampaignForm((prev) => ({ ...prev, status: e.target.value }))}
              >
                <MenuItem value="Active">Active</MenuItem>
                <MenuItem value="Paused">Paused</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setCreateCampaignOpen(false)}
            sx={{ textTransform: 'none', borderRadius: 2 }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleCreateCampaignSubmit}
            sx={{ textTransform: 'none', borderRadius: 2 }}
          >
            Launch
          </Button>
        </DialogActions>
      </Dialog>
      {/* Dialog: Upload Asset */}
      <Dialog
        open={uploadAssetOpen}
        onClose={() => setUploadAssetOpen(false)}
        PaperProps={{
          sx: {
            borderRadius: 3,
            bgcolor: isDark ? '#1a1a1e' : '#ffffff',
            border: '1px solid',
            borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
            boxShadow: '0 24px 48px -12px rgba(0,0,0,0.5)',
            p: 1,
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: 800, pb: 1 }}>Upload Creative Material</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1, minWidth: { xs: 280, sm: 360 } }}>
            <TextField
              size="small"
              label="Asset Title"
              placeholder="e.g. Promo Dark Modern Banner"
              value={assetForm.title}
              onChange={(e) => setAssetForm((prev) => ({ ...prev, title: e.target.value }))}
              fullWidth
              required
            />
            <FormControl size="small" fullWidth>
              <InputLabel>Material Type</InputLabel>
              <Select
                value={assetForm.type}
                label="Material Type"
                onChange={(e) => setAssetForm((prev) => ({ ...prev, type: e.target.value }))}
              >
                <MenuItem value="Image">Image (Banner)</MenuItem>
                <MenuItem value="Video">Video Ad</MenuItem>
                <MenuItem value="Copy Text">Copywriting Text</MenuItem>
                <MenuItem value="HTML Template">HTML Template</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" fullWidth>
              <InputLabel>AI Quality Score</InputLabel>
              <Select
                value={assetForm.rating}
                label="AI Quality Score"
                onChange={(e) => setAssetForm((prev) => ({ ...prev, rating: e.target.value }))}
              >
                <MenuItem value="A+">A+ (Exceptional)</MenuItem>
                <MenuItem value="A">A (Strong)</MenuItem>
                <MenuItem value="B">B (Moderate)</MenuItem>
                <MenuItem value="C">C (Needs Refinement)</MenuItem>
              </Select>
            </FormControl>
            <TextField
              size="small"
              label="Est. Conversions Volume"
              type="number"
              value={assetForm.conversions}
              onChange={(e) =>
                setAssetForm((prev) => ({ ...prev, conversions: Number(e.target.value) }))
              }
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setUploadAssetOpen(false)}
            sx={{ textTransform: 'none', borderRadius: 2 }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleUploadAssetSubmit}
            sx={{ textTransform: 'none', borderRadius: 2 }}
          >
            Add Asset
          </Button>
        </DialogActions>
      </Dialog>
      {/* Dialog: Add Task */}
      <Dialog
        open={addTaskOpen}
        onClose={() => setAddTaskOpen(false)}
        PaperProps={{
          sx: {
            borderRadius: 3,
            bgcolor: isDark ? '#1a1a1e' : '#ffffff',
            border: '1px solid',
            borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
            boxShadow: '0 24px 48px -12px rgba(0,0,0,0.5)',
            p: 1,
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: 800, pb: 1 }}>Add Operations Task</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1, minWidth: { xs: 280, sm: 360 } }}>
            <TextField
              size="small"
              label="Task Description"
              placeholder="e.g. Schedule promotional codes blast"
              value={taskForm.task}
              onChange={(e) => setTaskForm((prev) => ({ ...prev, task: e.target.value }))}
              fullWidth
              required
            />
            <FormControl size="small" fullWidth>
              <InputLabel>Assignee / Agent</InputLabel>
              <Select
                value={taskForm.assignee}
                label="Assignee / Agent"
                onChange={(e) => setTaskForm((prev) => ({ ...prev, assignee: e.target.value }))}
              >
                <MenuItem value="Acquisition Agent">Acquisition Agent (AI)</MenuItem>
                <MenuItem value="Content Copier Agent">Content Copier Agent (AI)</MenuItem>
                <MenuItem value="System Controller">System Controller (AI)</MenuItem>
                <MenuItem value="Sarah Vance (CEO)">Sarah Vance (CEO)</MenuItem>
                <MenuItem value="Arthur Pendragon">Arthur Pendragon (CMO)</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setAddTaskOpen(false)}
            sx={{ textTransform: 'none', borderRadius: 2 }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleAddTaskSubmit}
            sx={{ textTransform: 'none', borderRadius: 2 }}
          >
            Create Task
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar
        open={toast.open}
        autoHideDuration={4000}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={toast.severity}
          onClose={() => setToast((t) => ({ ...t, open: false }))}
          variant="filled"
        >
          {toast.message}
        </Alert>
      </Snackbar>
      <style>{`
        @keyframes pulse {
          0% { transform: scale(0.95); opacity: 0.5; }
          50% { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(0.95); opacity: 0.5; }
        }
      `}</style>
    </PageLayout>
  );
}
