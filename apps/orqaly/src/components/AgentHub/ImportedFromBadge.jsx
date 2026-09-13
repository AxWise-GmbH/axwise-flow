import { Chip, Tooltip, useTheme, alpha } from '@mui/material';
import GitHubIcon from '@mui/icons-material/GitHub';

export default function ImportedFromBadge({ importedFrom }) {
  const theme = useTheme();

  if (importedFrom?.source !== 'github') return null;

  const { repo, path, url } = importedFrom;
  const linkProps = url
    ? {
        component: 'a',
        href: url,
        target: '_blank',
        rel: 'noopener',
        clickable: true,
        onClick: (e) => e.stopPropagation(),
      }
    : {};

  return (
    <Tooltip
      title={`Imported from GitHub${repo ? `: ${repo}` : ''}${path ? ` / ${path}` : ''}`}
    >
      <Chip
        size="small"
        icon={<GitHubIcon sx={{ fontSize: 12, ml: 0.5 }} />}
        label={(repo || 'GitHub').split('/').pop()}
        {...linkProps}
        sx={{
          height: 18,
          maxWidth: '100%',
          fontSize: '0.6rem',
          fontWeight: 700,
          borderRadius: 1.5,
          bgcolor: alpha(theme.palette.text.primary, 0.1),
          color: 'text.secondary',
          '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' },
        }}
      />
    </Tooltip>
  );
}
