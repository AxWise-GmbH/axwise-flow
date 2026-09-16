import { Box, Typography, Chip, Button, useTheme } from '@mui/material';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import BentoCard from '../../../components/Common/BentoCard';
import { StatusDot } from './_shared';

import AppIcon from '../../../components/icons/AppIcon';

const STATUS_LABEL = { complete: 'Complete', in_progress: 'In progress', empty: 'Not started' };

/**
 * Company Brief — slim status strip on the Assistant Console. Shows state +
 * Q&A count + a one-line summary, with Review (read-only viewer) and Change
 * (re-run the interview) actions. Sized to the `strip` tier; the summary
 * truncates so the strip never grows.
 */
export default function BriefStatusCard({ brief = {}, onReview, onChange }) {
  const theme = useTheme();
  const status = brief.status || 'empty';
  const isComplete = status === 'complete';
  const count = brief.questionCount || 0;
  const dotColor =
    {
      complete: theme.palette.success.main,
      in_progress: theme.palette.warning.main,
      empty: theme.palette.text.disabled,
    }[status] || theme.palette.text.disabled;

  return (
    <BentoCard noHeader sx={{ justifyContent: 'center' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.25,
          height: '100%',
          flexWrap: { xs: 'wrap', sm: 'nowrap' },
        }}
      >
        <StatusDot color={dotColor} />
        <Typography sx={{ fontWeight: 800, whiteSpace: 'nowrap' }}>Company Brief</Typography>
        <Chip
          size="small"
          icon={
            isComplete ? (
              <AppIcon name="CheckCircleRounded" fallback={CheckCircleRoundedIcon} />
            ) : undefined
          }
          label={STATUS_LABEL[status] || status}
          color={isComplete ? 'success' : 'default'}
          variant="outlined"
          sx={{ fontWeight: 700, flexShrink: 0 }}
        />
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}
        >
          {count} Q&amp;A
        </Typography>

        {brief.summary && (
          <Typography
            variant="body2"
            color="text.secondary"
            noWrap
            sx={{ flex: 1, minWidth: 0, fontStyle: 'italic', display: { xs: 'none', sm: 'block' } }}
          >
            &ldquo;{brief.summary}&rdquo;
          </Typography>
        )}

        <Box sx={{ display: 'flex', gap: 0.75, flexShrink: 0, ml: { xs: 'auto', sm: 0 } }}>
          <Button
            size="small"
            variant="outlined"
            onClick={onReview}
            startIcon={
              <AppIcon
                name="VisibilityOutlined"
                fallback={VisibilityOutlinedIcon}
                sx={{ fontSize: 16 }}
              />
            }
            sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
          >
            Review
          </Button>
          <Button
            size="small"
            variant="contained"
            onClick={onChange}
            startIcon={
              <AppIcon name="EditOutlined" fallback={EditOutlinedIcon} sx={{ fontSize: 16 }} />
            }
            sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
          >
            Change
          </Button>
        </Box>
      </Box>
    </BentoCard>
  );
}
