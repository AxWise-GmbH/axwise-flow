/**
 * DocumentGroup — renders one DeliverableRow per markdown document
 * (design briefs, strategy docs, research, audits).
 *
 * Preview: generic 📝 icon tile. Actions: Download .md (client-side
 * Blob trigger) + Copy to clipboard.
 */
import { useState, useCallback } from 'react';
import { Box } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import DownloadIcon from '@mui/icons-material/Download';
import DeliverableRow from './DeliverableRow';
import IconTile from './IconTile';
import GroupHeader from './GroupHeader';
import GlassIcon from '../../icons/GlassIcon';
import { useDeliverableViewer } from './deliverableViewerContext';
import { VIEW_FORMAT } from './deliverableFormats';

export default function DocumentGroup({ items, icon, label, G, glassIconName }) {
  // activeContent[parentId] = the markdown the user currently has selected
  // (v1 original by default, or refined content from a v2/v3 pick). Download
  // + Copy actions read from this map so they always export the live version.
  const [activeContent, setActiveContent] = useState({});
  // Null wherever no popup is hosting a viewer, and then no View button is
  // offered - a button that opens nothing is worse than no button.
  const viewer = useDeliverableViewer();

  const handleVersionChange = useCallback((parentId, value) => {
    setActiveContent((prev) => ({ ...prev, [parentId]: value }));
  }, []);

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
        {items.map((doc, i) => {
          const rowKey = doc.parentId || `${doc.title}-${i}`;
          const liveOutput =
            doc.parentId && activeContent[doc.parentId] ? activeContent[doc.parentId] : doc.output;

          // One download, used by the row action and by the viewer's own header,
          // so both always write the version the user currently has selected.
          const download = () => {
            const blob = new Blob([liveOutput], { type: 'text/markdown;charset=utf-8' });
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = `${doc.title.replace(/[^a-z0-9-]+/gi, '-').toLowerCase()}.md`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);
          };

          return (
            <DeliverableRow
              key={rowKey}
              G={G}
              preview={<IconTile emoji="📝" label="MD" G={G} />}
              title={doc.title}
              meta={[
                `${doc.chars.toLocaleString()} chars`,
                doc.preview ? `${doc.preview}${doc.preview.length >= 140 ? '…' : ''}` : null,
              ]}
              actions={[
                {
                  label: 'Download .md',
                  icon: <GlassIcon name="Download" size={14} tone="neutral" />,
                  onClick: (e) => {
                    e.preventDefault();
                    download();
                  },
                  href: '#',
                },
                // Reading the thing it wrote is the question being asked at
                // this point, and until now every answer left the popup.
                ...(viewer
                  ? [
                      {
                        label: 'View',
                        icon: <GlassIcon name="Visibility" size={14} tone="neutral" />,
                        onClick: (e) => {
                          e.preventDefault();
                          viewer.view({
                            title: doc.title,
                            format: VIEW_FORMAT.markdown,
                            text: liveOutput,
                            onDownload: download,
                          });
                        },
                        href: '#',
                      },
                    ]
                  : []),
                {
                  label: 'Copy',
                  icon: <GlassIcon name="ContentCopy" size={12} tone="neutral" />,
                  onClick: (e) => {
                    e.preventDefault();
                    if (navigator.clipboard?.writeText) {
                      navigator.clipboard.writeText(liveOutput).catch(() => {});
                    }
                  },
                  href: '#',
                },
              ]}
              parentKind={doc.parentKind}
              parentId={doc.parentId}
              originalValue={doc.originalContent || doc.output}
              artifactKind={doc.artifactKind}
              onVersionChange={handleVersionChange}
            />
          );
        })}
      </Box>
    </Box>
  );
}
