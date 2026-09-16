import { Box } from '@mui/material';
import LibraryBooksOutlinedIcon from '@mui/icons-material/LibraryBooksOutlined';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import GatedBlock from './blocks/GatedBlock';
import MaterialsBlock from './blocks/MaterialsBlock';
import ToolsBlock from './blocks/ToolsBlock';
import DestinationBlock from './blocks/DestinationBlock';
import { AUTO_DEFAULTS, DESTINATION_LABELS, TOOL_LABELS } from './newGoalConstants';

/**
 * Blocks 2, 3 and 4 of Step 1, shared by both modes.
 *
 * Setup: Auto locks all three. They stay visible and keep showing what Auto
 * chose, so the user learns what the controls are without being able to break
 * anything, and switching to Manual is one tap rather than a different form.
 */
export default function Step1Blocks({ manual, form, layout = 'stack', numbered = true }) {
  const materialCount = form.attachments.length + form.kbSelectedIds.length;
  const row = layout === 'row';

  return (
    <Box
      sx={{
        display: 'grid',
        gap: 1.25,
        gridTemplateColumns: row ? { xs: '1fr', sm: 'repeat(3, 1fr)' } : '1fr',
        alignItems: 'start',
      }}
    >
      <GatedBlock
        index={numbered ? 2 : undefined}
        title="Materials"
        icon="LibraryBooksOutlined"
        iconFallback={LibraryBooksOutlinedIcon}
        locked={!manual}
        data-testid="materials-block"
        summary={materialCount > 0 ? `${materialCount} selected` : 'None'}
        lockedSummary={AUTO_DEFAULTS.materialsSummary}
      >
        <MaterialsBlock
          attachments={form.attachments}
          onUpload={form.onUpload}
          onRemoveAttachment={form.onRemoveAttachment}
          uploadingFile={form.uploadingFile}
          onLoadPastGoals={form.onLoadPastGoals}
          kbSelectedIds={form.kbSelectedIds}
          onToggleKbDocument={form.onToggleKbDocument}
          remainingSlots={form.remainingSlots}
        >
          {form.pastGoalPicker}
        </MaterialsBlock>
      </GatedBlock>

      <GatedBlock
        index={numbered ? 3 : undefined}
        title="Tools"
        icon="BuildOutlined"
        iconFallback={BuildOutlinedIcon}
        locked={!manual}
        data-testid="tools-block"
        summary={TOOL_LABELS[form.toolMode] || 'None'}
        lockedSummary={TOOL_LABELS[AUTO_DEFAULTS.toolMode]}
      >
        <ToolsBlock
          value={form.toolMode}
          onChange={form.onToolModeChange}
          groundedResearchConflict={form.groundedResearchConflict}
        />
      </GatedBlock>

      <GatedBlock
        index={numbered ? 4 : undefined}
        title="Destination"
        icon="BusinessOutlined"
        iconFallback={BusinessOutlinedIcon}
        // Auto cannot pick a workspace that does not exist. When there is none,
        // this block unlocks even in Auto so the user can create one, instead
        // of facing a disabled Start with the only remedy behind a lock.
        locked={!manual && !form.organizationLoadError}
        // The remedy for a failed workspace load lives inside this block, so it
        // opens itself rather than hiding the reason behind a chevron.
        defaultOpen={Boolean(form.organizationLoadError)}
        data-testid="destination-block"
        summary={DESTINATION_LABELS[form.goalDest] || 'Standalone'}
        lockedSummary={DESTINATION_LABELS[AUTO_DEFAULTS.goalDest]}
      >
        <DestinationBlock
          value={form.goalDest}
          onChange={form.onGoalDestChange}
          orgName={form.destOrgName}
          onOrgNameChange={form.onDestOrgNameChange}
          industry={form.destIndustry}
          onIndustryChange={form.onDestIndustryChange}
          organizations={form.organizations}
          organizationsLoading={form.organizationsLoading}
          organizationLoadError={form.organizationLoadError}
          selectedOrgId={form.selectedOrgId}
          onSelectedOrgIdChange={form.onSelectedOrgIdChange}
        />
      </GatedBlock>
    </Box>
  );
}
