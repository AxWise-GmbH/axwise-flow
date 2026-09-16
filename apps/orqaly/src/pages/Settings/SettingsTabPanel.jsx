import { useEffect, useRef } from 'react';
import { Box } from '@mui/material';
import SetupSection from '../../components/Common/SetupSection';
import SetupSurface from '../../components/Common/SetupSurface';
import { SetupPanelMounted } from '../../components/Common/SetupPanel';
import useSetupSections from '../../components/Common/useSetupSections';
import { paneSwapSx } from '../../theme/settingsMotion';

/**
 * One Settings tab on screen: its blocks as `SetupSection`s, in the same
 * language as the Assistant and Goal setup panels on /home.
 *
 * All sections start open. Settings is a set of things to see at once, not a
 * sequence to work through - the same reason Goal setup uses 'multi' - and the
 * tab itself is already the disclosure, so collapsing inside it would be a
 * second one over the same content.
 *
 * `bodies` maps a block key to its controls. A tab with no bodies yet renders
 * `legacy` instead, which is what lets the page be migrated a tab at a time
 * without a broken commit in between.
 */
export default function SettingsTabPanel({
  tab,
  ctx = {},
  bodies = null,
  legacy = null,
  focusBlockKey = null,
  onFocusHandled = null,
}) {
  const { isExpanded, toggle } = useSetupSections({ mode: 'multi' });
  const paneRef = useRef(null);

  // Arriving from search: open the block that was asked for and bring it into
  // view. The scroll waits a frame because the pane is mid-entrance and the
  // section it names may only have just been mounted.
  useEffect(() => {
    if (!focusBlockKey) return undefined;
    toggle(focusBlockKey, true);
    const frame = requestAnimationFrame(() => {
      paneRef.current
        ?.querySelector(`[data-settings-block="${focusBlockKey}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      onFocusHandled?.();
    });
    return () => cancelAnimationFrame(frame);
  }, [focusBlockKey, toggle, onFocusHandled]);

  if (!tab) return null;

  const blocks = bodies ? (tab.blocks || []).filter((block) => bodies[block.key]) : [];

  return (
    <Box
      ref={paneRef}
      role="tabpanel"
      id={`settings-panel-${tab.id}`}
      aria-labelledby={`settings-tab-${tab.id}`}
      key={tab.id}
      sx={paneSwapSx()}
    >
      {blocks.length === 0 ? (
        legacy
      ) : (
        <SetupSurface mode="auto">
          <SetupPanelMounted>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
              {blocks.map((block, index) => (
                <Box key={block.key} data-settings-block={block.key}>
                  <SetupSection
                    sectionKey={block.key}
                    index={index}
                    title={block.title}
                    icon={block.icon}
                    description={block.desc}
                    done={Boolean(block.done?.(ctx))}
                    expanded={isExpanded(block.key)}
                    onToggle={toggle}
                  >
                    {bodies[block.key]}
                  </SetupSection>
                </Box>
              ))}
            </Box>
          </SetupPanelMounted>
        </SetupSurface>
      )}
    </Box>
  );
}
