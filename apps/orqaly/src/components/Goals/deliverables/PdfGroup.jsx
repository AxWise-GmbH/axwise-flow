/**
 * PdfGroup — renders one DeliverableRow per downloadable PDF.
 *
 * Preview: generic 📄 icon tile (no pdf.js bundle). Actions:
 * Download (href + download attr) + Open (new tab, native PDF viewer).
 */
import { Box } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import DownloadIcon from '@mui/icons-material/Download';
import DeliverableRow from './DeliverableRow';
import IconTile from './IconTile';
import GroupHeader from './GroupHeader';
import GlassIcon from '../../icons/GlassIcon';
import { useDeliverableViewer } from './deliverableViewerContext';
import { VIEW_FORMAT } from './deliverableFormats';

export default function PdfGroup({ items, icon, label, G, glassIconName }) {
  const viewer = useDeliverableViewer();
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
            preview={<IconTile emoji="📄" label="PDF" G={G} />}
            title={item.taskTitle}
            meta={[item.filename, 'PDF document']}
            actions={[
              {
                label: 'Download',
                href: item.url,
                download: true,
                icon: <GlassIcon name="Download" size={14} tone="neutral" />,
              },
              ...(viewer
                ? [
                    {
                      label: 'View',
                      icon: <GlassIcon name="Visibility" size={14} tone="neutral" />,
                      href: '#',
                      onClick: (e) => {
                        e.preventDefault();
                        viewer.view({
                          title: item.taskTitle || item.filename,
                          format: VIEW_FORMAT.pdf,
                          url: item.url,
                        });
                      },
                    },
                  ]
                : []),
              {
                label: 'Open',
                href: item.url,
                icon: <GlassIcon name="OpenInNew" size={12} tone="neutral" />,
              },
            ]}
            parentKind={item.parentKind}
            parentId={item.parentId}
            originalUrl={item.url}
            artifactKind={item.artifactKind}
          />
        ))}
      </Box>
    </Box>
  );
}
