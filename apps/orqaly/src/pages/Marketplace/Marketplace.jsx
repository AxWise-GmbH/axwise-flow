import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Box, Button, Paper, Typography, Collapse, Fade, alpha, useTheme } from '@mui/material';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import CorporateFareOutlinedIcon from '@mui/icons-material/CorporateFareOutlined';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import ExtensionOutlinedIcon from '@mui/icons-material/ExtensionOutlined';
import BusinessCenterOutlinedIcon from '@mui/icons-material/BusinessCenterOutlined';
import IntegrationInstructionsOutlinedIcon from '@mui/icons-material/IntegrationInstructionsOutlined';
import DnsOutlinedIcon from '@mui/icons-material/DnsOutlined';
import GlassIcon from '../../components/icons/GlassIcon';
import PageLayout from '../../components/Common/PageLayout';
import PillTabStrip from '../../components/Common/PillTabStrip';
import BentoCard from '../../components/Common/BentoCard';
import MetricsToggleButton from '../../components/Common/MetricsToggleButton';
import { useShowMetrics } from '../../hooks/useShowMetrics';
import MarketplaceAgentsTab from '../../components/Marketplace/MarketplaceAgentsTab';
import MarketplaceSkillsTab from '../../components/Marketplace/MarketplaceSkillsTab';
import MarketplaceToolsTab from '../../components/Marketplace/MarketplaceToolsTab';
import MarketplaceTeamsTab from '../../components/Marketplace/MarketplaceTeamsTab';
import MarketplaceOrgsTab from '../../components/Marketplace/MarketplaceOrgsTab';
import MarketplaceBusinessesTab from '../../components/Marketplace/MarketplaceBusinessesTab';
import MarketplaceReplicatorsTab from '../../components/Marketplace/MarketplaceReplicatorsTab';
import MarketplaceModelsTab from '../../components/Marketplace/MarketplaceModelsTab';
import { PREDEFINED_AGENTS } from '../../config/predefinedAgents';
import { BUNDLED_SKILLS } from '../../config/bundledSkills';
import { MCP_CATALOG } from '../../config/mcpToolCatalog';
import { CONSILIUM_TEMPLATES } from '../../config/consiliumTemplates';
import { ORG_TEMPLATES } from '../../config/orgTemplates';
import { BUSINESS_MODULES } from '../../config/businessModules';
import { PERSONAL_CATALOG_LABEL } from '../../config/catalogUi';

const TABS = [
  {
    id: 'orgs',
    label: 'Organizations',
    iconName: 'CorporateFareOutlined',
    icon: CorporateFareOutlinedIcon,
  },
  { id: 'teams', label: 'Consilium', iconName: 'GroupsOutlined', icon: GroupsOutlinedIcon },
  { id: 'agents', label: 'Agents', iconName: 'SmartToyOutlined', icon: SmartToyOutlinedIcon },
  { id: 'models', label: 'Models', iconName: 'DnsOutlined', icon: DnsOutlinedIcon },
  { id: 'tools', label: 'Tools', iconName: 'BuildOutlined', icon: BuildOutlinedIcon },
  { id: 'skills', label: 'Skills', iconName: 'PsychologyOutlined', icon: PsychologyOutlinedIcon },
  {
    id: 'businesses',
    label: 'Businesses',
    iconName: 'BusinessCenterOutlined',
    icon: BusinessCenterOutlinedIcon,
  },
  {
    id: 'replicators',
    label: 'Replicators',
    iconName: 'IntegrationInstructionsOutlined',
    icon: IntegrationInstructionsOutlinedIcon,
  },
];

const TAB_COMPONENTS = {
  orgs: MarketplaceOrgsTab,
  teams: MarketplaceTeamsTab,
  agents: MarketplaceAgentsTab,
  models: MarketplaceModelsTab,
  tools: MarketplaceToolsTab,
  skills: MarketplaceSkillsTab,
  businesses: MarketplaceBusinessesTab,
  replicators: MarketplaceReplicatorsTab,
};

// Static counts from catalog configs
const AGENT_COUNT = PREDEFINED_AGENTS.length;
const SKILL_COUNT = BUNDLED_SKILLS.length;
const TOOL_COUNT = MCP_CATALOG.length;
const TEMPLATE_COUNT = (CONSILIUM_TEMPLATES?.length || 0) + (ORG_TEMPLATES?.length || 0);

export default function Marketplace() {
  const theme = useTheme();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'orgs';
  const [showMetrics, setShowMetrics] = useShowMetrics('marketplace');

  const handleTabChange = useCallback(
    (tabId) => setSearchParams({ tab: tabId }, { replace: true }),
    [setSearchParams]
  );

  const ActiveTabComponent = TAB_COMPONENTS[activeTab] || MarketplaceOrgsTab;

  const statCards = [
    {
      label: 'Agent Templates',
      value: AGENT_COUNT,
      helper: 'Ready-to-add agents',
      color: theme.palette.primary.main,
      iconName: 'SmartToyOutlined',
      icon: SmartToyOutlinedIcon,
    },
    {
      label: 'Skill Packs',
      value: SKILL_COUNT,
      helper: 'Prompt & domain skills',
      color: '#7C3AED',
      iconName: 'PsychologyOutlined',
      icon: PsychologyOutlinedIcon,
    },
    {
      label: 'MCP Tools',
      value: TOOL_COUNT,
      helper: 'API integrations',
      color: theme.palette.info.main,
      iconName: 'ExtensionOutlined',
      icon: ExtensionOutlinedIcon,
    },
    {
      label: 'Rentable Models',
      value: 6,
      helper: 'Local LLM hosts',
      color: '#10B981',
      iconName: 'DnsOutlined',
      icon: DnsOutlinedIcon,
    },
    {
      label: 'Templates',
      value: TEMPLATE_COUNT,
      helper: 'Teams & org structures',
      color: theme.palette.warning.main,
      iconName: 'CorporateFareOutlined',
      icon: CorporateFareOutlinedIcon,
    },
    {
      label: 'Businesses',
      value: BUSINESS_MODULES.length,
      helper: 'Business modules',
      color: '#E53935',
      iconName: 'BusinessCenterOutlined',
      icon: BusinessCenterOutlinedIcon,
    },
  ];

  return (
    <PageLayout
      title={PERSONAL_CATALOG_LABEL}
      subtitle="Agent orchestration hub"
      showTitleBlock={false}
    >
      <BentoCard
        title={PERSONAL_CATALOG_LABEL}
        explain
        noTour
        pageInfoPath="/marketplace"
        subtitle={
          showMetrics
            ? `Agents: ${AGENT_COUNT} · Skills: ${SKILL_COUNT} · Tools: ${TOOL_COUNT} · Models: 6 · Templates: ${TEMPLATE_COUNT} · Businesses: ${BUSINESS_MODULES.length}`
            : undefined
        }
        icon={StorefrontOutlinedIcon}
        noPadding
        action={
          <MetricsToggleButton
            showMetrics={showMetrics}
            onToggle={() => setShowMetrics((v) => !v)}
          />
        }
      >
        {/* ── Metrics ───────────────────────────────────────────── */}
        <Collapse in={showMetrics}>
          <Box
            data-tour-block="marketplace-metrics"
            data-tour-label="Catalog stats"
            sx={{ px: { xs: 1.25, sm: 1.5 }, pt: 1.25, pb: 1.25 }}
          >
            <Box
              sx={{
                display: 'grid',
                gap: 1.25,
                gridTemplateColumns: {
                  xs: '1fr 1fr',
                  md: 'repeat(3, minmax(0, 1fr))',
                  lg: 'repeat(6, minmax(0, 1fr))',
                },
              }}
            >
              {statCards.map((card) => {
                return (
                  <Paper
                    key={card.label}
                    elevation={0}
                    sx={{
                      p: 1.5,
                      borderRadius: 2.5,
                      border: '1px solid',
                      borderColor: alpha(card.color, 0.22),
                      background: `linear-gradient(135deg, ${alpha(card.color, 0.1)} 0%, ${alpha(theme.palette.background.paper, 0.98)} 70%)`,
                    }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: 1,
                      }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography
                          variant="caption"
                          sx={{ color: 'text.secondary', fontWeight: 600 }}
                        >
                          {card.label}
                        </Typography>
                        <Typography
                          sx={{
                            fontSize: '1.35rem',
                            fontWeight: 800,
                            color: 'text.primary',
                            lineHeight: 1.15,
                            mt: 0.45,
                          }}
                        >
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
                          width: 34,
                          height: 34,
                          borderRadius: 2,
                          bgcolor: alpha(card.color, 0.16),
                          color: card.color,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <GlassIcon
                          name={card.iconName}
                          fallback={card.icon}
                          size={18}
                          tone={card.color}
                        />
                      </Box>
                    </Box>
                  </Paper>
                );
              })}
            </Box>
          </Box>
        </Collapse>

        {/* ── Tab Navigation ─────────────────────────────────────── */}
        <PillTabStrip
          data-tour-block="marketplace-tabs"
          data-tour-label="Categories"
          sx={{
            borderTop: showMetrics ? '1px solid' : 'none',
            borderColor: 'divider',
          }}
        >
          {TABS.map((t) => {
            const isActive = activeTab === t.id;
            return (
              <Button
                key={t.id}
                startIcon={
                  <GlassIcon
                    name={t.iconName}
                    fallback={t.icon}
                    size={18}
                    tone={isActive ? 'brand' : 'neutral'}
                  />
                }
                onClick={() => handleTabChange(t.id)}
                sx={{
                  borderRadius: 2.5,
                  textTransform: 'none',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  px: 2,
                  minHeight: 36,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  transition: 'all 0.2s',
                  bgcolor: isActive ? alpha(theme.palette.primary.main, 0.1) : 'transparent',
                  color: isActive ? 'primary.main' : 'text.secondary',
                  boxShadow: isActive
                    ? `0 2px 4px ${alpha(theme.palette.primary.main, 0.1)}`
                    : 'none',
                  '&:hover': {
                    bgcolor: isActive
                      ? alpha(theme.palette.primary.main, 0.15)
                      : alpha(theme.palette.text.primary, 0.05),
                    color: isActive ? 'primary.main' : 'text.primary',
                  },
                }}
              >
                {t.label}
              </Button>
            );
          })}
        </PillTabStrip>

        {/* ── Tab Content ────────────────────────────────────────── */}
        <Fade in key={activeTab} timeout={200}>
          <Box
            data-tour-block="marketplace-content"
            data-tour-label="Browse & import"
            sx={{ px: { xs: 1.25, sm: 1.5 }, py: 2 }}
          >
            <ActiveTabComponent />
          </Box>
        </Fade>
      </BentoCard>
    </PageLayout>
  );
}
