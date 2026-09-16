import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Typography,
  CircularProgress,
  useTheme,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import PageLayout from '../../components/Common/PageLayout';
import Reveal from '../../components/Common/Reveal';
import AssistantHeaderActions from './AssistantHeaderActions';
import ExplainTour from '../../components/Common/ExplainTour';
import { createHoverGlowShadow } from '../../theme/hoverGlow';
import { ASSISTANT_EXPLAIN } from './assistantExplainContent';
import AssistantSetupChatDialog from '../../components/Assistant/AssistantSetupChatDialog';
import { useAssistantConsole } from '../../hooks/useAssistantConsole';
import { useSettingsBlockLayout } from '../Settings/SettingsViewOptions';
import AssistantFilterDialog from './AssistantFilterDialog';
import HealthBanner from './HealthBanner';
import AddContactDialog from './AddContactDialog';
import ProfileBrainCard from './cards/ProfileBrainCard';
import ChannelsCard from './cards/ChannelsCard';
import DataKnowledgeCard from './cards/DataKnowledgeCard';
import ContactsCard from './cards/ContactsCard';
import ConversationHistoryCard from './cards/ConversationHistoryCard';
import TeamCommsCard from './cards/TeamCommsCard';
import BriefStatusCard from './cards/BriefStatusCard';
import ArenaStatusCard from './cards/ArenaStatusCard';
import VoiceSampleCard from './cards/VoiceSampleCard';
import UsageCard from './cards/UsageCard';
import InsightsPanelCard from './cards/InsightsPanelCard';
import CommunicationActivityCard from './cards/CommunicationActivityCard';
import AssistantChatCard from './cards/AssistantChatCard';
import BriefReviewDialog from '../../components/Assistant/BriefReviewDialog';
import {
  ASSISTANT_BLOCK_DEFS,
  ASSISTANT_TIER_H,
  ASSISTANT_BLOCK_SPAN,
  ASSISTANT_BLOCK_TIER,
  BUILTIN_ASSISTANT_TEMPLATES,
} from './assistantTemplates';
import { templateMatches } from '../../utils/blockTemplates';
import useDashboardTemplates from '../../hooks/useDashboardTemplates';

import AppIcon from '../../components/icons/AppIcon';

const EXPLAIN_SEEN_KEY = 'orchestratori_assistant_explain_seen';

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

// Every block is a fixed size: its column span and height tier come from
// ASSISTANT_BLOCK_DEFS (the "Beginner" structure). `alignItems: start` stops a
// short block from stretching to a taller neighbour; content taller than its
// tier scrolls inside the card. This renders identically in Simple and Advanced
// UI mode (same component; Simple just caps the column width).
const GRID_SX = {
  display: 'grid',
  gap: '10px',
  gridAutoFlow: 'dense',
  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
  alignItems: 'start',
};

// Map a block's span to its CSS grid-column. 'full' spans the whole row; 2-wide
// blocks fall back to a single column below the md breakpoint.
function blockGridColumn(span) {
  if (span === 'full') return '1 / -1';
  if (span === 2) return { xs: 'span 1', sm: 'span 2' };
  return 'span 1';
}

/**
 * Assistant Console (/assistant). Loads live data via useAssistantConsole and
 * renders reorderable/hideable blocks. Editable blocks (brain, voice, contacts)
 * write back through their services and refetch. "Edit"/"Add channel" reopen the
 * setup wizard at the matching step.
 */
export default function AssistantPage() {
  const navigate = useNavigate();
  const theme = useTheme();
  // Demo data switch: ON shows the fixture (great for reviewing layout), OFF
  // shows real data. Persisted per browser.
  const [demo, setDemo] = useState(() => {
    const v = localStorage.getItem('orch_assistant_demo');
    return v === null ? true : v === 'true';
  });
  const toggleDemo = (val) => {
    setDemo(val);
    try {
      localStorage.setItem('orch_assistant_demo', String(val));
    } catch {
      /* ignore */
    }
  };
  const {
    data,
    loading,
    refetch,
    save,
    config,
    assistants = [],
    currentId,
    createAssistant,
    switchAssistant,
  } = useAssistantConsole({ demo });
  // storagePrefix is versioned: bump the suffix to retire a stale persisted
  // block order/arrangement when the default layout changes. v5 inserts the
  // Arena block directly under Company Brief (existing v4 orders would
  // otherwise append it at the bottom).
  const layout = useSettingsBlockLayout(ASSISTANT_BLOCK_DEFS, {
    storagePrefix: 'orch_assistant_v5',
    pinnedId: null,
  });

  // Layout templates: the built-in "Beginner" preset + the user's saved ones.
  const {
    templates: customTemplates,
    create: createTemplate,
    update: updateTemplate,
    remove: removeTemplate,
  } = useDashboardTemplates({ surface: 'assistant' });
  const allTemplates = useMemo(
    () => [...BUILTIN_ASSISTANT_TEMPLATES, ...customTemplates],
    [customTemplates]
  );
  const activeTemplateId = useMemo(() => {
    const match = allTemplates.find((t) =>
      templateMatches(t, layout.hiddenSections, layout.sectionOrder, layout.blockWidths)
    );
    return match ? match.id : null;
  }, [allTemplates, layout.hiddenSections, layout.sectionOrder, layout.blockWidths]);

  const handleApplyTemplate = (tpl) =>
    layout.applyLayout({ hidden: tpl.hidden, order: tpl.order, widths: tpl.widths });
  const handleSaveTemplate = (name) =>
    createTemplate({
      name,
      hidden: [...layout.hiddenSections],
      order: layout.sectionOrder,
      widths: [...layout.blockWidths],
    });
  const handleRenameTemplate = (id, name) => updateTemplate(id, { name });
  const handleDeleteTemplate = (id) => removeTemplate(id);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [briefReviewOpen, setBriefReviewOpen] = useState(false);
  const [editStep, setEditStep] = useState('channel');
  const [filterOpen, setFilterOpen] = useState(false);
  const [addContact, setAddContact] = useState({ open: false, type: 'phone' });
  // "New Setup" -> create a fresh assistant for another organization.
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newOrg, setNewOrg] = useState('');
  const [creating, setCreating] = useState(false);

  const openEdit = (step) => {
    setEditStep(step);
    setDialogOpen(true);
  };

  // "Explain?" guided tour state.
  const [tourOpen, setTourOpen] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const startTour = () => {
    setTourStep(0);
    setTourOpen(true);
  };
  const handleTourAction = (cta) => {
    if (!cta) return;
    setTourOpen(false);
    if (cta.step) openEdit(cta.step);
    else if (cta.to) navigate(cta.to);
  };

  const orgOptions = data.organizations || [];
  const handleCreateAssistant = async () => {
    if (creating || !createAssistant) return;
    setCreating(true);
    try {
      await createAssistant({ organizationId: newOrg || null, name: newName.trim() || undefined });
      setNewOpen(false);
      setNewName('');
      setNewOrg('');
      await refetch();
      openEdit('channel'); // walk the user through setting up the new assistant
    } finally {
      setCreating(false);
    }
  };
  const handleSwitch = async (id) => {
    if (switchAssistant) {
      await switchAssistant(id);
      await refetch();
    }
  };
  // No refetch: setup.save updates setup.config in place, so the Core/Voice card
  // re-renders with the new value immediately. Calling refetch() here would flip
  // `loading` true and blank the whole grid to a spinner on every dropdown change.
  const saveBrain = (patch) => save({ config: patch });
  const saveVoiceProfile = (profileId) =>
    save({ config: { voice: { ...(config.voice || {}), profileId } } });

  const filterCount = (demo ? 1 : 0) + layout.hiddenSections.size;

  // One node per block id; both layouts pick from this map.
  const blockNodes = {
    profile: (
      <ProfileBrainCard brain={data.brain} onEdit={() => openEdit('keys')} onChange={saveBrain} />
    ),
    channels: (
      <ChannelsCard
        channels={data.channels}
        onEdit={() => openEdit('channel')}
        onAddChannel={() => openEdit('channel')}
      />
    ),
    communication: <CommunicationActivityCard activity={data.activity} />,
    chat: <AssistantChatCard config={config} />,
    data: <DataKnowledgeCard data={data.data} onEdit={() => openEdit('data')} />,
    contacts: (
      <ContactsCard
        contacts={data.contacts}
        organizations={data.organizations}
        onEdit={() => openEdit('data')}
        onAdd={(type) => setAddContact({ open: true, type })}
      />
    ),
    conversations: (
      <ConversationHistoryCard
        conversations={data.conversations}
        onViewAll={() => navigate('/communicator')}
      />
    ),
    team: (
      <TeamCommsCard
        teamChat={data.teamChat}
        contributions={data.contributions}
        onOpenChat={() => navigate('/communicator')}
        onViewContributions={() => navigate('/knowledge-base')}
      />
    ),
    brief: (
      <BriefStatusCard
        brief={data.brief}
        onReview={() => setBriefReviewOpen(true)}
        onChange={() => openEdit('brief')}
      />
    ),
    arena: (
      <ArenaStatusCard
        arena={data.arena}
        onSetUp={() => navigate('/arena?setup=1')}
        onOpen={() => navigate('/arena')}
      />
    ),
    voice: (
      <VoiceSampleCard
        voice={data.voice}
        onEdit={() => openEdit('voice')}
        onProfileChange={saveVoiceProfile}
      />
    ),
    usage: <UsageCard usage={data.usage} />,
    insights: (
      <InsightsPanelCard insights={data.insights} onGenerate={() => openEdit('insights')} />
    ),
  };

  const visible = layout.navSections;
  const activeBlockId = tourOpen ? (visible[tourStep]?.id ?? null) : null;

  // Auto-run the tour once, on a user's first visit (and only once there are
  // visible blocks). Re-launchable via the "Explain?" header button.
  useEffect(() => {
    if (visible.length === 0) return;
    let seen = true;
    try {
      seen = Boolean(localStorage.getItem(EXPLAIN_SEEN_KEY));
    } catch {
      seen = true;
    }
    if (!seen) {
      try {
        localStorage.setItem(EXPLAIN_SEEN_KEY, '1');
      } catch {
        /* ignore */
      }
      startTour();
    }
  }, [visible.length]);

  return (
    <PageLayout showTitleBlock={false}>
      <AssistantHeaderActions
        onExplain={startTour}
        onOpenFilters={() => setFilterOpen(true)}
        filterCount={filterCount}
        assistants={assistants}
        currentId={currentId}
        onSwitch={handleSwitch}
        showSwitcher={!demo && assistants.length > 1}
        onNewAssistant={() => setNewOpen(true)}
        onFinishSetup={() => openEdit('channel')}
      />
      <HealthBanner data={data} onFix={openEdit} />
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={32} />
        </Box>
      ) : visible.length === 0 ? (
        <Box sx={{ py: 8, textAlign: 'center' }}>
          <Typography color="text.secondary">
            All blocks are hidden. Use Arrange to show them again.
          </Typography>
        </Box>
      ) : (
        // Both simple and advanced mode use the same 3-column bento so the
        // console keeps the exact structure shown in the screenshots (wide
        // blocks span two columns; collapses to 2 then 1 column on narrow
        // screens).
        <Box sx={GRID_SX}>
          {visible.map((b, i) => (
            <Box
              key={b.id}
              data-tour-block={b.id}
              sx={{
                minWidth: 0,
                gridColumn: blockGridColumn(ASSISTANT_BLOCK_SPAN[b.id]),
                // Fixed height per tier from `sm` up; `xs` stacks at natural
                // height. Overflow scrolls inside the card (BentoCard scrollBody).
                height: { xs: 'auto', sm: ASSISTANT_TIER_H[ASSISTANT_BLOCK_TIER[b.id]] },
                ...(b.id === activeBlockId && {
                  '& .MuiPaper-root': {
                    borderColor: 'primary.main',
                    boxShadow: createHoverGlowShadow(theme),
                    transition: prefersReducedMotion()
                      ? 'none'
                      : 'box-shadow .25s ease, border-color .25s ease',
                  },
                }),
              }}
            >
              <Reveal delay={Math.min(i, 8) * 60} sx={{ height: '100%' }}>
                {blockNodes[b.id]}
              </Reveal>
            </Box>
          ))}
        </Box>
      )}
      <Dialog
        open={newOpen}
        onClose={() => !creating && setNewOpen(false)}
        fullWidth
        maxWidth="xs"
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
          <AppIcon name="SmartToyOutlined" fallback={SmartToyOutlinedIcon} fontSize="small" /> New
          assistant
        </DialogTitle>
        <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Create a separate assistant for another organization (business). It starts fresh and
            becomes your current assistant.
          </Typography>
          <TextField
            label="Assistant name"
            size="small"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Fintech Assistant"
            fullWidth
          />
          <FormControl size="small" fullWidth>
            <InputLabel id="new-assistant-org">Organization</InputLabel>
            <Select
              labelId="new-assistant-org"
              label="Organization"
              value={newOrg}
              onChange={(e) => setNewOrg(e.target.value)}
              displayEmpty
            >
              <MenuItem value="">
                <em>No organization</em>
              </MenuItem>
              {orgOptions.map((o) => (
                <MenuItem key={o.id} value={o.id}>
                  {o.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button
            onClick={() => setNewOpen(false)}
            disabled={creating}
            sx={{ textTransform: 'none', fontWeight: 700 }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreateAssistant}
            disabled={creating}
            variant="contained"
            startIcon={
              creating ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <AppIcon name="AddRounded" fallback={AddRoundedIcon} />
              )
            }
            sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
          >
            Create &amp; set up
          </Button>
        </DialogActions>
      </Dialog>
      <AssistantFilterDialog
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        demo={demo}
        onDemoChange={toggleDemo}
        layout={layout}
        templates={allTemplates}
        activeTemplateId={activeTemplateId}
        onApplyTemplate={handleApplyTemplate}
        onSaveTemplate={handleSaveTemplate}
        onRenameTemplate={handleRenameTemplate}
        onDeleteTemplate={handleDeleteTemplate}
      />
      <BriefReviewDialog
        open={briefReviewOpen}
        onClose={() => setBriefReviewOpen(false)}
        onChange={() => {
          setBriefReviewOpen(false);
          openEdit('brief');
        }}
        fallbackBrief={data.brief}
      />
      <ExplainTour
        open={tourOpen}
        steps={visible}
        stepIndex={tourStep}
        content={ASSISTANT_EXPLAIN}
        onBack={() => setTourStep((s) => Math.max(0, s - 1))}
        onNext={() => {
          setTourStep((s) => {
            if (s >= visible.length - 1) {
              setTourOpen(false);
              return s;
            }
            return s + 1;
          });
        }}
        onAction={handleTourAction}
        onClose={() => setTourOpen(false)}
      />
      <AssistantSetupChatDialog
        open={dialogOpen}
        initialStep={editStep}
        onClose={() => {
          setDialogOpen(false);
          refetch();
        }}
      />
      <AddContactDialog
        open={addContact.open}
        type={addContact.type}
        organizations={data.organizations}
        onClose={() => setAddContact((s) => ({ ...s, open: false }))}
        onAdded={refetch}
      />
    </PageLayout>
  );
}
