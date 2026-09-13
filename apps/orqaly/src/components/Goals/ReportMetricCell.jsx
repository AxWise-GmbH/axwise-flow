/**
 * ReportMetricCell — stacked $ cost + token count with optional info popup.
 */
import { useState } from 'react';
import { Box, Typography, IconButton } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import PropTypes from 'prop-types';
import FormDialog from '../Common/FormDialog';
import { formatTokensOrZero } from '../../utils/formatTokens';

import AppIcon from '../icons/AppIcon';

function MetricLine({ label, info, onInfo }) {
  return (
    <Box
      sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, justifyContent: 'inherit' }}
    >
      <Typography
        component="span"
        variant="caption"
        sx={{ fontWeight: 600, fontSize: 'inherit', lineHeight: 1.3 }}
      >
        {label}
      </Typography>
      {info && (
        <IconButton
          size="small"
          aria-label="Why is this value zero?"
          onClick={(e) => {
            e.stopPropagation();
            onInfo(info);
          }}
          sx={{ p: 0.15, color: 'text.disabled', '&:hover': { color: 'info.main' } }}
        >
          <AppIcon name="InfoOutlined" fallback={InfoOutlinedIcon} sx={{ fontSize: 14 }} />
        </IconButton>
      )}
    </Box>
  );
}

export default function ReportMetricCell({
  costUsd = 0,
  tokens = 0,
  costInfo = null,
  tokenInfo = null,
  align = 'right',
  compact = false,
  showTokens = true,
  showCost = true,
}) {
  const [dialogInfo, setDialogInfo] = useState(null);
  const costNum = Number(costUsd || 0);
  const tokenNum = Number(tokens || 0);
  const tokenLabel = `${formatTokensOrZero(tokenNum)} tokens`;

  return (
    <>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: align === 'right' ? 'flex-end' : 'flex-start',
          gap: 0.15,
        }}
      >
        {showCost && (
          <MetricLine
            label={`$${costNum.toFixed(4)}`}
            info={costNum <= 0 ? costInfo : null}
            onInfo={setDialogInfo}
          />
        )}
        {showTokens && (
          <MetricLine
            label={tokenLabel}
            info={tokenNum <= 0 ? tokenInfo : null}
            onInfo={setDialogInfo}
          />
        )}
      </Box>

      <FormDialog
        open={Boolean(dialogInfo)}
        onClose={() => setDialogInfo(null)}
        title={dialogInfo?.title || 'Metric info'}
        icon={InfoOutlinedIcon}
        iconVariant="info"
        maxWidth="xs"
        contentDividers={false}
        primaryLabel="Close"
        onPrimary={() => setDialogInfo(null)}
        hideCancel
      >
        <Typography
          variant="body2"
          sx={{
            fontSize: compact ? '0.76rem' : '0.82rem',
            lineHeight: 1.55,
            color: 'text.secondary',
          }}
        >
          {dialogInfo?.body}
        </Typography>
      </FormDialog>
    </>
  );
}

ReportMetricCell.propTypes = {
  costUsd: PropTypes.number,
  tokens: PropTypes.number,
  costInfo: PropTypes.shape({ title: PropTypes.string, body: PropTypes.string }),
  tokenInfo: PropTypes.shape({ title: PropTypes.string, body: PropTypes.string }),
  align: PropTypes.oneOf(['left', 'right', 'center']),
  compact: PropTypes.bool,
  showTokens: PropTypes.bool,
  showCost: PropTypes.bool,
};

export { MetricLine };
