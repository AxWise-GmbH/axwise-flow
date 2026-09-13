/**
 * CodeGroup — renders one DeliverableRow per committed GitHub repo.
 *
 * Preview: generic 💻 icon tile (no API fetch — keeps render
 * deterministic and rate-limit-free). Metadata carries the owner/repo
 * slug + URL. Actions: Open on GitHub (new tab) + Clone URL (copies
 * the HTTPS clone URL to clipboard).
 */
import { Box } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import DeliverableRow from './DeliverableRow';
import IconTile from './IconTile';
import GroupHeader from './GroupHeader';
import GlassIcon from '../../icons/GlassIcon';

export default function CodeGroup({ items, icon, label, G, glassIconName }) {
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
            preview={<IconTile emoji="💻" label="Code" G={G} />}
            title={item.fullName}
            meta={[item.url.replace(/^https?:\/\//, ''), `GitHub repository · ${item.taskTitle}`]}
            actions={[
              {
                label: 'Open on GitHub',
                href: item.url,
                icon: <GlassIcon name="OpenInNew" size={12} tone="neutral" />,
              },
              // Render a Preview button only when the repo looks like a static
              // site (index.html committed). raw.githack.com proxies GitHub
              // raw files with proper MIME types so relative <link>/<script>
              // tags resolve — no deploy step needed. Works the moment the
              // file is committed, which makes the Result tab clickable even
              // for code goals that haven't enabled GitHub Pages yet.
              ...(item.hasIndexHtml
                ? [
                    {
                      label: 'Preview site',
                      href: `https://raw.githack.com/${item.owner}/${item.repo}/main/index.html`,
                      icon: <GlassIcon name="OpenInNew" size={12} tone="neutral" />,
                    },
                  ]
                : []),
              {
                label: 'Copy clone URL',
                href: '#',
                onClick: (e) => {
                  e.preventDefault();
                  const cloneUrl = `${item.url}.git`;
                  if (navigator.clipboard?.writeText) {
                    navigator.clipboard.writeText(cloneUrl).catch(() => {});
                  }
                },
              },
            ]}
          />
        ))}
      </Box>
    </Box>
  );
}
