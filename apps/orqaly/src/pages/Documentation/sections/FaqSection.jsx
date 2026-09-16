import {
  Stack,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
  useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HelpOutlineOutlinedIcon from '@mui/icons-material/HelpOutlineOutlined';
import BentoCard from '../../../components/Common/BentoCard';
import AppIcon from '../../../components/icons/AppIcon';
import { FAQ_ITEMS } from '../data/faq';
import { docId } from '../data/searchIndex';
import { useAnchorHighlight } from '../hooks/useAnchorHighlight';

export default function FaqSection({ highlightId }) {
  const theme = useTheme();
  const p = theme.palette;
  useAnchorHighlight(highlightId, alpha(p.primary.main, 0.15));

  return (
    <BentoCard
      title="Frequently asked questions"
      subtitle={`${FAQ_ITEMS.length} answers for operators and new team members`}
      icon={HelpOutlineOutlinedIcon}
      iconColor={p.primary.main}
      minHeight={100}
    >
      <Stack spacing={0.5}>
        {FAQ_ITEMS.map((item, i) => (
          <Accordion
            key={i}
            id={docId('faq', i)}
            disableGutters
            elevation={0}
            defaultExpanded={i === 0}
            sx={{
              '&:before': { display: 'none' },
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: '8px !important',
              overflow: 'hidden',
              '&:not(:last-of-type)': { mb: 0.5 },
            }}
          >
            <AccordionSummary
              expandIcon={<AppIcon name="ExpandMore" fallback={ExpandMoreIcon} />}
              sx={{ px: 2, py: 0.25, minHeight: 44, '& .MuiAccordionSummary-content': { my: 0.75 } }}
            >
              <Typography variant="subtitle2" fontWeight={600} sx={{ fontSize: '0.82rem' }}>
                {item.q}
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 2, pt: 0, pb: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7, fontSize: '0.82rem' }}>
                {item.a}
              </Typography>
            </AccordionDetails>
          </Accordion>
        ))}
      </Stack>
    </BentoCard>
  );
}
