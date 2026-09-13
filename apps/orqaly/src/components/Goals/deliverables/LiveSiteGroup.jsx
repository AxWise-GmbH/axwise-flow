/**
 * [module: frontend]
 * LiveSiteGroup — renders one DeliverableRow per live deployed site
 * (workers.dev / pages.dev / github.io / vercel.app / netlify.app).
 *
 * Preview: thum.io free screenshot service fetch with a 🌐 icon tile
 * fallback on error.
 */
import { Box, Typography, alpha } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import GitHubIcon from '@mui/icons-material/GitHub';
import CodeIcon from '@mui/icons-material/Code';
import DeliverableRow from './DeliverableRow';
import IconTile from './IconTile';
import GroupHeader from './GroupHeader';
import { githubSourceViewUrl } from '../../../utils/deliverables/resolveGithubRepo';
import GlassIcon from '../../icons/GlassIcon';

function GithubMetaRow({ githubRepo, G }) {
  if (githubRepo?.url) {
    return (
      <Typography
        component="a"
        href={githubRepo.url}
        target="_blank"
        rel="noopener noreferrer"
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.5,
          mt: 0.35,
          fontSize: '0.7rem',
          fontFamily: 'monospace',
          color: G,
          textDecoration: 'none',
          lineHeight: 1.4,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: '100%',
          '&:hover': { textDecoration: 'underline' },
        }}
      >
        <GlassIcon name="Description" size={13} tone="neutral" sx={{ flexShrink: 0 }} />
        github.com/{githubRepo.fullName}
      </Typography>
    );
  }

  return (
    <Typography
      sx={{
        mt: 0.35,
        fontSize: '0.68rem',
        fontStyle: 'italic',
        color: alpha(G, 0.45),
        lineHeight: 1.4,
      }}
    >
      Repository not linked
    </Typography>
  );
}

function buildActions(item) {
  const actions = [
    {
      label: 'Open site',
      href: item.url,
      icon: <GlassIcon name="OpenInNew" size={12} tone="neutral" />,
    },
  ];

  if (item.githubRepo?.url) {
    actions.push({
      label: 'View repo',
      href: item.githubRepo.url,
      icon: <GlassIcon name="Description" size={12} tone="neutral" />,
    });
    const sourceUrl = githubSourceViewUrl(item.githubRepo);
    if (sourceUrl) {
      actions.push({
        label: 'View source',
        href: sourceUrl,
        icon: <GlassIcon name="Build" size={12} tone="neutral" />,
      });
    }
  }

  return actions;
}

export default function LiveSiteGroup({ items, icon, label, G, glassIconName }) {
  return (
    <Box>
      <GroupHeader
        icon={icon}
        glassIconName={glassIconName}
        label={label}
        count={items.length}
        G={G}
      />
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        {items.map((item) => (
          <DeliverableRow
            key={item.url}
            G={G}
            preview={<LiveSiteThumb url={item.url} G={G} />}
            title={item.taskTitle}
            meta={[item.url.replace(/^https?:\/\//, ''), `Hosted on ${item.host}`]}
            extraMeta={<GithubMetaRow githubRepo={item.githubRepo} G={G} />}
            actions={buildActions(item)}
            parentKind={item.parentKind}
            parentId={item.parentId}
            originalValue={item.originalContent || ''}
            originalUrl={item.url}
            artifactKind={item.artifactKind}
          />
        ))}
      </Box>
    </Box>
  );
}

function LiveSiteThumb({ url, G }) {
  const thumbUrl = `https://image.thum.io/get/width/280/crop/180/${url}`;
  return (
    <Box sx={{ width: '100%', height: '100%', position: 'relative' }}>
      <Box
        component="img"
        src={thumbUrl}
        alt="Live site preview"
        loading="lazy"
        onError={(e) => {
          e.currentTarget.style.display = 'none';
          if (e.currentTarget.nextSibling) e.currentTarget.nextSibling.style.display = 'flex';
        }}
        sx={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
        }}
      />
      <Box sx={{ display: 'none', position: 'absolute', inset: 0 }}>
        <IconTile emoji="🌐" label="Live" G={G} />
      </Box>
    </Box>
  );
}
