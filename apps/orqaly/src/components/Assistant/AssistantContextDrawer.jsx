/**
 * AssistantContextDrawer — the single setup surface for the AI assistant, docked
 * to the right of the chat. It is the full editor (the modal wizard remains only
 * for first-run onboarding); both write through the same useAssistantSetup state,
 * so a change here shows in the wizard and vice versa.
 *
 * Top to bottom: pick / rename / add the current agent, choose the org scope,
 * then work through the setup steps (Core, Data, Brief, Insights, Channel, Voice)
 * as sections that embed the exact same step cards the wizard uses. The Data
 * step also surfaces live "what the assistant knows" counts (KB docs, phone and
 * mail contacts) with deep-links into the knowledge base.
 *
 * The drawer frame, the sections and the rows are Common/Setup* — shared with
 * Goal setup, which used to be a fork of this file. Anything visual belongs
 * there, not here; this file is the assistant's own wiring.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Divider,
  Select,
  MenuItem,
  FormControl,
  Switch,
  Chip,
  Link,
  IconButton,
  TextField,
  Tooltip,
  Menu,
  alpha,
  useTheme,
} from '@mui/material';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import AlternateEmailIcon from '@mui/icons-material/AlternateEmail';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import { listOrganizations } from '../../services/organizationService';
import { listDocuments } from '../../services/knowledgeBaseService';
import { listContacts } from '../../services/contactsService';
import { ASSISTANT_SETUP_STEPS } from './setupSteps';
import { persistAssistantStep } from './persistAssistantStep';
import SetupPanel, { SetupPanelItem } from '../Common/SetupPanel';
import SetupSection from '../Common/SetupSection';
import SetupRow from '../Common/SetupRow';
import useSetupSections from '../Common/useSetupSections';
import { panelSurfaceTokens } from '../../theme/panelSurface';

export default function AssistantContextDrawer({
  open,
  onClose,
  // shared setup state (single useAssistantSetup instance, lifted in AssistantSurface)
  config = {},
  steps = {},
  activated = false,
  save,
  assistants = [],
  currentId = null,
  current = null,
  createAssistant,
  switchAssistant,
  renameAssistant,
  removeAssistant,
  // session-scoped context
  orgId,
  onOrgChange,
  onOpenEntity,
  voiceEnabled = false,
  onToggleVoice,
}) {
  const theme = useTheme();
  const tokens = panelSurfaceTokens(theme);
  const [orgs, setOrgs] = useState([]);
  const [docs, setDocs] = useState([]);
  const [phoneCount, setPhoneCount] = useState(0);
  const [mailCount, setMailCount] = useState(0);
  // One step at a time: this is a sequence you work through, unlike Goal setup.
  const { isExpanded, toggle } = useSetupSections({ mode: 'single', initial: 'keys' });

  // Rename + agent actions
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [menuAnchor, setMenuAnchor] = useState(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      try {
        const o = await listOrganizations().catch(() => []);
        if (alive) setOrgs(Array.isArray(o) ? o : o?.organizations || []);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      alive = false;
    };
  }, [open]);

  // Live "what the assistant knows" counts (docs + phone/mail contacts).
  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      const [d, phone, mail] = await Promise.all([
        listDocuments(orgId ? { organization_id: orgId, limit: 50 } : { limit: 50 }).catch(
          () => []
        ),
        listContacts({ contact_type: 'phone', limit: 500 }).catch(() => []),
        listContacts({ contact_type: 'mail', limit: 500 }).catch(() => []),
      ]);
      if (!alive) return;
      setDocs(Array.isArray(d) ? d : d?.documents || []);
      setPhoneCount(Array.isArray(phone) ? phone.length : 0);
      setMailCount(Array.isArray(mail) ? mail.length : 0);
    })();
    return () => {
      alive = false;
    };
  }, [open, orgId]);

  const briefDocs = useMemo(
    () => docs.filter((d) => Array.isArray(d.tags) && d.tags.includes('brief')),
    [docs]
  );

  const startRename = () => {
    setNameDraft(current?.name || '');
    setRenaming(true);
  };
  const commitRename = () => {
    const next = nameDraft.trim();
    if (next && next !== current?.name && currentId) {
      renameAssistant?.(currentId, next);
    }
    setRenaming(false);
  };

  const handleStepComplete = (stepKey) => (patch) => persistAssistantStep(save, stepKey, patch);

  const header = (
    <>
      {/* Agent selector + rename + new + delete */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1.25 }}>
        {renaming ? (
          <TextField
            autoFocus
            fullWidth
            size="small"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') setRenaming(false);
            }}
            inputProps={{ 'aria-label': 'Assistant name', maxLength: 120 }}
            sx={{
              '.MuiInputBase-input': { color: tokens.fg },
              '.MuiOutlinedInput-notchedOutline': { borderColor: alpha(tokens.fg, 0.2) },
            }}
          />
        ) : (
          <FormControl fullWidth size="small">
            <Select
              value={currentId || ''}
              displayEmpty
              onChange={(e) => switchAssistant?.(e.target.value)}
              sx={tokens.fieldSx}
              MenuProps={{ slotProps: tokens.menuSlotProps }}
              aria-label="Select assistant"
            >
              {assistants.length === 0 && <MenuItem value="">My Assistant</MenuItem>}
              {assistants.map((a) => (
                <MenuItem key={a.id} value={a.id}>
                  {a.name || 'My Assistant'}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
        <Tooltip title="Rename">
          <span>
            <IconButton
              size="small"
              onClick={startRename}
              disabled={!currentId}
              sx={{ color: tokens.textDim }}
              aria-label="Rename assistant"
            >
              <EditRoundedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="New assistant">
          <IconButton
            size="small"
            onClick={() => createAssistant?.({})}
            sx={{ color: tokens.textDim }}
            aria-label="New assistant"
          >
            <AddRoundedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <IconButton
          size="small"
          onClick={(e) => setMenuAnchor(e.currentTarget)}
          sx={{ color: tokens.textDim }}
          aria-label="Assistant actions"
        >
          <MoreVertRoundedIcon fontSize="small" />
        </IconButton>
        <Menu
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={() => setMenuAnchor(null)}
          slotProps={tokens.menuSlotProps}
        >
          <MenuItem
            disabled={assistants.length <= 1 || !currentId}
            onClick={() => {
              setMenuAnchor(null);
              if (currentId) removeAssistant?.(currentId);
            }}
          >
            <DeleteOutlineRoundedIcon fontSize="small" sx={{ mr: 1 }} />
            Delete assistant
          </MenuItem>
        </Menu>
      </Box>
      <Box sx={{ mt: 1 }}>
        <Chip
          size="small"
          icon={activated ? <CheckCircleRoundedIcon sx={{ fontSize: 15 }} /> : undefined}
          label={activated ? 'Ready' : 'Set Core to finish'}
          sx={{
            height: 22,
            bgcolor: activated ? alpha(theme.palette.success.main, 0.18) : alpha(tokens.fg, 0.08),
            color: activated ? theme.palette.success.light : alpha(tokens.fg, 0.7),
            '& .MuiChip-icon': { color: theme.palette.success.light },
          }}
        />
      </Box>
    </>
  );

  return (
    <SetupPanel
      open={open}
      onClose={onClose}
      title="Assistant setup"
      closeLabel="Close setup"
      headerContent={header}
    >
      <SetupPanelItem index={0}>
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" sx={{ ...tokens.labelSx, display: 'block', mb: 0.75 }}>
            ORGANIZATION
          </Typography>
          <FormControl fullWidth size="small">
            <Select
              displayEmpty
              value={orgId || ''}
              onChange={(e) => onOrgChange?.(e.target.value || null)}
              sx={tokens.fieldSx}
              MenuProps={{ slotProps: tokens.menuSlotProps }}
              aria-label="Organization scope"
            >
              <MenuItem value="">All / personal</MenuItem>
              {orgs.map((o) => (
                <MenuItem key={o.id} value={o.id}>
                  {o.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        <Divider sx={{ borderColor: tokens.hairline, mb: 1.5 }} />
      </SetupPanelItem>

      {/* Setup steps as sections (one open at a time) reusing the wizard cards. */}
      {ASSISTANT_SETUP_STEPS.map((step, i) => {
        const Card = step.Card;
        return (
          <SetupSection
            key={step.key}
            sectionKey={step.key}
            index={i + 1}
            title={step.short}
            icon={step.icon}
            description={step.desc}
            required={step.required}
            done={!!steps[step.key]}
            expanded={isExpanded(step.key)}
            onToggle={toggle}
          >
            {step.key === 'data' && (
              <Box sx={{ display: 'flex', flexDirection: 'column', mb: 1.25 }}>
                <SetupRow
                  icon={MenuBookOutlinedIcon}
                  title="Knowledge Base"
                  subtitle={`${docs.length} docs · ${briefDocs.length} briefs`}
                  action={
                    <Tooltip title="Open">
                      <IconButton
                        size="small"
                        onClick={() => onOpenEntity?.({ route: '/knowledge-base' })}
                        sx={{ color: tokens.textFaint }}
                        aria-label="Open Knowledge Base"
                      >
                        <ChevronRightRoundedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  }
                />
                <SetupRow
                  icon={PhoneAndroidIcon}
                  title="Phone Contacts"
                  subtitle={`${phoneCount} contact${phoneCount === 1 ? '' : 's'}`}
                  action={
                    <Tooltip title="Open">
                      <IconButton
                        size="small"
                        onClick={() =>
                          onOpenEntity?.({ route: '/knowledge-base?tab=phone-contacts' })
                        }
                        sx={{ color: tokens.textFaint }}
                        aria-label="Open Phone Contacts"
                      >
                        <ChevronRightRoundedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  }
                />
                <SetupRow
                  icon={AlternateEmailIcon}
                  title="Mail Contacts"
                  subtitle={`${mailCount} contact${mailCount === 1 ? '' : 's'}`}
                  action={
                    <Tooltip title="Open">
                      <IconButton
                        size="small"
                        onClick={() =>
                          onOpenEntity?.({ route: '/knowledge-base?tab=mail-contacts' })
                        }
                        sx={{ color: tokens.textFaint }}
                        aria-label="Open Mail Contacts"
                      >
                        <ChevronRightRoundedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  }
                />
              </Box>
            )}

            {step.key === 'voice' && (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  mb: 1.25,
                }}
              >
                <Typography variant="body2" sx={{ color: tokens.textMuted }}>
                  Speak replies (this session)
                </Typography>
                <Switch
                  checked={!!voiceEnabled}
                  onChange={(e) => onToggleVoice?.(e.target.checked)}
                  size="small"
                />
              </Box>
            )}

            <Card config={config} onComplete={handleStepComplete(step.key)} embedded />
          </SetupSection>
        );
      })}

      <SetupPanelItem index={ASSISTANT_SETUP_STEPS.length + 1}>
        <Link
          component="button"
          onClick={() => onOpenEntity?.({ route: '/settings?section=api-keys' })}
          sx={{
            color: theme.palette.primary.light,
            fontSize: '0.72rem',
            mt: 1,
            display: 'inline-block',
          }}
        >
          Add / manage keys
        </Link>
      </SetupPanelItem>
    </SetupPanel>
  );
}
