import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Box, Button, Stack } from '@mui/material';
import AssistantMarkdown, { markdownBlockCount } from './AssistantMarkdown.jsx';

/**
 * Keeps long assistant documents compact without slicing raw Markdown. The
 * preview is limited at complete top-level AST nodes, so headings, lists,
 * tables, code blocks, and links stay valid and omitted content is not left in
 * the accessibility tree.
 */
export function CollapsibleMarkdownDocument({
  text,
  previewBlocks = 6,
  openLabel = 'Open full report',
  closeLabel = 'Show less',
  testId,
  variant = 'conversation',
  color,
  sx,
  endAction = null,
}) {
  const contentId = useId();
  const [expandedSource, setExpandedSource] = useState(null);
  const contentRef = useRef(null);
  const focusExpandedContent = useRef(false);
  const source = String(text || '');
  const blockCount = useMemo(() => markdownBlockCount(source), [source]);
  const canCollapse = blockCount > previewBlocks;
  const expanded = canCollapse && expandedSource === source;

  useEffect(() => {
    if (!expanded || !focusExpandedContent.current) return;
    focusExpandedContent.current = false;
    contentRef.current?.focus({ preventScroll: true });
  }, [expanded]);

  if (!source.trim()) return null;

  return (
    <Stack spacing={0.75} sx={sx}>
      <Box
        ref={contentRef}
        id={contentId}
        data-testid={testId}
        role={expanded ? 'region' : undefined}
        aria-label={expanded ? 'Full report' : undefined}
        tabIndex={expanded ? -1 : undefined}
        sx={{ minWidth: 0, overflowWrap: 'anywhere', outline: 'none' }}
      >
        <AssistantMarkdown
          text={source}
          color={color}
          variant={variant}
          maxBlocks={canCollapse && !expanded ? previewBlocks : undefined}
        />
      </Box>
      {canCollapse || endAction ? (
        <Stack direction="row" alignItems="center" gap={1.25} flexWrap="wrap">
          {canCollapse ? (
            <Button
              size="small"
              color="inherit"
              aria-expanded={expanded}
              aria-controls={contentId}
              onClick={() => {
                if (!expanded) focusExpandedContent.current = true;
                setExpandedSource(expanded ? null : source);
              }}
              sx={{
                minWidth: 0,
                px: 0,
                py: 0.25,
                color: 'text.secondary',
                fontWeight: 650,
                textTransform: 'none',
              }}
            >
              {expanded ? closeLabel : openLabel}
            </Button>
          ) : null}
          {endAction}
        </Stack>
      ) : null}
    </Stack>
  );
}

export default CollapsibleMarkdownDocument;
