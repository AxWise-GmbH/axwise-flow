/**
 * AssistantSurface — the mountable unit used everywhere (home card, "Let's talk",
 * Communicator). Composes the shared AssistantChat with the toggle
 * AssistantContextDrawer and owns the shared state (Brain, Organization, Voice).
 *
 * Brain (provider/model) is the SINGLE source of truth shared with the /assistant
 * control center: it reads and writes the server-backed `assistant_setup.config`
 * via useAssistantSetup — the same store /assistant's Profile/Brain card uses. So
 * changing the model here updates /assistant and every other chat surface, and
 * vice versa. Organization + voice remain per-session selections here.
 */
import { useCallback, useRef, useState } from 'react';
import { Box } from '@mui/material';
import AssistantChat from './AssistantChat.jsx';
import AssistantContextDrawer from './AssistantContextDrawer.jsx';
import { useAssistantSetup } from '../../hooks/useAssistantSetup';

export default function AssistantSurface({
  variant = 'full',
  greetingName = '',
  onOpenEntity,
  pageContext = null,
  inputTopSlot = null,
  emptyTitle = null,
  emptySubtitle = null,
  emptyOrbSize = null,
  emptyOrb = null,
  suggestions = undefined,
  // Reopening a past conversation. Passed straight through; AssistantChat reads
  // both once at mount, so the host keys this surface by conversation id.
  conversationId = null,
  onHasChatChange = null,
  initialMessages = null,
}) {
  const chatRef = useRef(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const {
    config,
    steps,
    activated,
    save,
    assistants,
    currentId,
    current,
    createAssistant,
    switchAssistant,
    renameAssistant,
    removeAssistant,
  } = useAssistantSetup();
  const provider = config?.provider;
  const model = config?.model;
  const [orgId, setOrgId] = useState(null);
  const [voice, setVoice] = useState(false);

  const handleModelChange = useCallback(
    ({ provider: nextProvider, model: nextModel }) => {
      // Persist to the shared server config (merge to preserve tone/temperature/etc.).
      save({ config: { ...(config || {}), provider: nextProvider, model: nextModel } }).catch(
        () => {
          /* non-fatal: keep the optimistic UI */
        }
      );
    },
    [save, config]
  );

  const handleToggleTemplates = useCallback(
    (next) => {
      // "User templates" filter: persist to the shared config (same store as the
      // model chip). The backend reads config.useTemplates via resolveAssistantLlm.
      save({ config: { ...(config || {}), useTemplates: next } }).catch(() => {
        /* non-fatal: keep the optimistic UI */
      });
    },
    [save, config]
  );

  return (
    <Box sx={{ display: 'flex', height: '100%', minHeight: 0, minWidth: 0 }}>
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <AssistantChat
          ref={chatRef}
          variant={variant}
          greetingName={greetingName}
          provider={provider}
          model={model}
          onModelChange={handleModelChange}
          useTemplates={config?.useTemplates === true}
          onToggleTemplates={handleToggleTemplates}
          orgId={orgId}
          onOpenEntity={onOpenEntity}
          onToggleDrawer={() => setDrawerOpen(true)}
          pageContext={pageContext}
          inputTopSlot={inputTopSlot}
          emptyTitle={emptyTitle}
          emptySubtitle={emptySubtitle}
          emptyOrbSize={emptyOrbSize}
          emptyOrb={emptyOrb}
          conversationId={conversationId}
          onHasChatChange={onHasChatChange}
          initialMessages={initialMessages}
          {...(suggestions !== undefined ? { suggestions } : {})}
        />
      </Box>
      <AssistantContextDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        config={config}
        steps={steps}
        activated={activated}
        save={save}
        assistants={assistants}
        currentId={currentId}
        current={current}
        createAssistant={createAssistant}
        switchAssistant={switchAssistant}
        renameAssistant={renameAssistant}
        removeAssistant={removeAssistant}
        orgId={orgId}
        onOrgChange={setOrgId}
        onOpenEntity={onOpenEntity}
        voiceEnabled={voice}
        onToggleVoice={setVoice}
      />
    </Box>
  );
}
