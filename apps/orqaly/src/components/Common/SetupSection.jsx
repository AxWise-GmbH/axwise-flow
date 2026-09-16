import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import AppIcon from '../icons/AppIcon';
import { useSetupSurface } from './SetupSurface';
import { openSectionSx, stepEntranceSx } from '../../theme/wizardGlow';
import { useSetupPanelMounted } from './SetupPanel';

/**
 * One collapsible section of a setup panel: icon badge, title, description, a
 * tick when it is settled, and a chevron.
 *
 * Built on MUI `Accordion` rather than a hand-rolled Box + Collapse. Four
 * things come free that the panels already depend on: a click anywhere in the
 * header toggles it (the summary is a ButtonBase, so tests and users can click
 * the title text itself), `mountOnEnter` keeps a closed section's contents out
 * of the tree entirely, the aria-expanded/controls/region wiring is paired for
 * us, and Enter/Space work. The only thing a custom shell would buy is escape
 * from the theme's `borderRadius: '12px !important'`, which is not worth
 * reimplementing four accessibility behaviours to get.
 *
 * Fully controlled: which sections are open is `useSetupSections`' business,
 * because that is the one place the two panels genuinely differ.
 */
export default function SetupSection({
  sectionKey,
  index = 0,
  title,
  icon,
  description = null,
  required = false,
  done = false,
  expanded = false,
  onToggle,
  keepContentMounted = false,
  children,
}) {
  const theme = useTheme();
  const tokens = useSetupSurface();
  const mounted = useSetupPanelMounted();

  return (
    // The entrance lives on a wrapper, not on the Accordion. Both
    // `stepEntranceSx` and `openSectionSx` write the `transition` shorthand, so
    // on one element the second silently erases the first - and the failure is
    // invisible: you get a section that either never fades or never glows.
    <Box sx={stepEntranceSx(mounted, index, { base: 0, step: 45 })}>
      <Accordion
        disableGutters
        expanded={expanded}
        onChange={(_, next) => onToggle?.(sectionKey, next)}
        slotProps={
          keepContentMounted
            ? undefined
            : { transition: { mountOnEnter: true, unmountOnExit: true } }
        }
        sx={{
          bgcolor: 'transparent',
          color: tokens.fg,
          border: '1px solid',
          boxShadow: 'none',
          '&:before': { display: 'none' },
          ...openSectionSx(theme, { open: expanded, restingBorderColor: tokens.hairline }),
        }}
      >
        <AccordionSummary
          expandIcon={
            <AppIcon
              name="ExpandMoreRounded"
              fallback={ExpandMoreRoundedIcon}
              sx={{ color: tokens.textDim, fontSize: 20 }}
            />
          }
          sx={{
            px: 1.25,
            minHeight: 48,
            '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1, my: 0.5 },
          }}
        >
          <Box
            sx={{
              width: 30,
              height: 30,
              flexShrink: 0,
              borderRadius: 1.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: alpha(theme.palette.primary.main, 0.15),
              color: 'primary.light',
            }}
          >
            <AppIcon fallback={icon} sx={{ fontSize: 18 }} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, color: tokens.fg }} noWrap>
              {title}
              {/* A separate element on purpose. Testing Library joins only an
                  element's direct text children, so `getByText('Core')` still
                  matches with the star beside it - `{title}{' *'}` would not. */}
              {required && <span style={{ color: theme.palette.primary.light }}> *</span>}
            </Typography>
          </Box>
          {done && (
            <AppIcon
              name="CheckCircleRounded"
              fallback={CheckCircleRoundedIcon}
              sx={{ fontSize: 18, color: theme.palette.success.light }}
            />
          )}
        </AccordionSummary>

        <AccordionDetails sx={{ px: 1.25, pt: 0, pb: 1.5 }}>
          {description && (
            <Typography
              variant="caption"
              sx={{ color: tokens.textDim, display: 'block', mb: 1.25 }}
            >
              {description}
            </Typography>
          )}
          {children}
        </AccordionDetails>
      </Accordion>
    </Box>
  );
}
