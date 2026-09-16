import { memo, useEffect, useRef, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { HandleWithNumber, useHandleNumbers } from './HandleWithNumber';
import {
  Box,
  Typography,
  Popover,
  TextField,
  Button,
  IconButton,
  Divider,
  Stack,
  Tooltip,
  Collapse,
  alpha,
  useTheme,
} from '@mui/material';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ExtensionOutlinedIcon from '@mui/icons-material/ExtensionOutlined';
import LinkOffRoundedIcon from '@mui/icons-material/LinkOffRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import DataObjectRoundedIcon from '@mui/icons-material/DataObjectRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import { getCustomBlockIconById } from './customBlockIcons';
import { createHoverGlowShadow } from '../../../theme/hoverGlow';

import AppIcon from '../../../components/icons/AppIcon';

/**
 * Node for Playground custom blocks. Editable name and description; connectable via handles.
 */
function CustomBlockNode({ id, data, selected }) {
  const theme = useTheme();
  const [anchorEl, setAnchorEl] = useState(null);
  const [isHovered, setIsHovered] = useState(false);
  const auxInitRef = useRef(false);
  const [showAuxHandles, setShowAuxHandles] = useState(Boolean(data?.justAdded));
  const open = Boolean(anchorEl);
  const { leftNumber, rightNumber, topNumber, bottomNumber } = useHandleNumbers(id);
  const [jsonExpanded, setJsonExpanded] = useState(false);
  const label = data?.label ?? 'Custom block';
  const description = (data?.description ?? '').trim();
  const jsonConfig = data?.jsonConfig ?? '';
  const iconId = data?.iconId || 'extension';
  const onRename = data?.onRename;
  const onDescriptionChange = data?.onDescriptionChange;
  const onJsonConfigChange = data?.onJsonConfigChange;
  const onRemove = data?.onRemove;
  const nodeId = data?.nodeId;
  const incomingCount = data?.incomingCount ?? 0;
  const outgoingCount = data?.outgoingCount ?? 0;
  const onDisconnectIncoming = data?.onDisconnectIncoming;
  const onDisconnectOutgoing = data?.onDisconnectOutgoing;
  const incomingConnections = Array.isArray(data?.incomingConnections)
    ? data.incomingConnections
    : [];
  const outgoingConnections = Array.isArray(data?.outgoingConnections)
    ? data.outgoingConnections
    : [];

  const handleOpen = (e) => {
    e.stopPropagation();
    setAnchorEl(e.currentTarget);
    if (jsonConfig) setJsonExpanded(true);
  };

  const handleClose = () => setAnchorEl(null);

  const handleRename = (e) => {
    const value = e.target.value;
    if (typeof onRename === 'function') onRename(value);
  };

  const handleDescriptionChange = (e) => {
    const value = e.target.value;
    if (typeof onDescriptionChange === 'function') onDescriptionChange(value);
  };

  const handleJsonConfigChange = (e) => {
    const value = e.target.value;
    if (typeof onJsonConfigChange === 'function') onJsonConfigChange(value);
  };

  const jsonValid = (() => {
    if (!jsonConfig) return null; // empty = neutral
    try {
      JSON.parse(jsonConfig);
      return true;
    } catch {
      return false;
    }
  })();

  const Icon = getCustomBlockIconById(iconId)?.Icon || ExtensionOutlinedIcon;

  useEffect(() => {
    if (auxInitRef.current) return;
    if (!data?.justAdded) return;
    auxInitRef.current = true;
    setShowAuxHandles(true);
    const t = setTimeout(() => setShowAuxHandles(false), 2200);
    return () => clearTimeout(t);
  }, [data?.justAdded]);

  const handlesVisible = isHovered || showAuxHandles || selected;
  const handleVisibilityStyle = handlesVisible
    ? { opacity: 1, pointerEvents: 'auto' }
    : { opacity: 0, pointerEvents: 'none' };
  const legacyHandleStyle = { opacity: 0, pointerEvents: 'none' };

  const MAX_DESC_CHARS = 20;
  const hasDescription = Boolean(description);
  const showDescription = hasDescription ? description : 'Custom block';
  const isTruncated = showDescription.length > MAX_DESC_CHARS;
  const visibleDescription = isTruncated
    ? `${showDescription.slice(0, MAX_DESC_CHARS)}…`
    : showDescription;

  return (
    <>
      <Box
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        sx={{
          minWidth: 220,
          height: 68,
          borderRadius: 3,
          border: '1px solid',
          borderColor: selected ? 'primary.main' : 'divider',
          bgcolor: 'background.paper',
          boxShadow: selected
            ? `0 4px 12px ${alpha(theme.palette.primary.main, 0.2)}`
            : '0 2px 6px rgba(0,0,0,0.04)',
          overflow: 'visible',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          px: 2,
          transition: 'all 0.2s ease',
          '&:hover': {
            borderColor: 'primary.main',
            boxShadow: createHoverGlowShadow(theme),
            transform: 'translateY(-1px)',
          },
        }}
      >
        {/* Left side: allow start+end connections reliably (target + source overlapped). */}
        <Handle
          type="source"
          id="left-in"
          position={Position.Left}
          isConnectableStart
          isConnectableEnd
          style={{
            left: -7,
            top: '50%',
            transform: 'translateY(-50%)',
            ...legacyHandleStyle,
          }}
          className="workflow-handle"
        />
        <HandleWithNumber
          number={leftNumber}
          sx={{
            position: 'absolute',
            left: -7,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 14,
            height: 14,
          }}
        >
          <Handle
            type="source"
            id="left-out"
            position={Position.Left}
            isConnectableStart
            isConnectableEnd
            style={{
              left: -7,
              top: '50%',
              transform: 'translateY(-50%)',
              ...handleVisibilityStyle,
              transition: 'opacity 140ms ease',
            }}
            className="workflow-handle"
          />
        </HandleWithNumber>

        {/* Top/bottom auxiliary handles (hidden by default). */}
        <Handle
          type="source"
          id="top-in"
          position={Position.Top}
          isConnectableStart
          isConnectableEnd
          style={{
            top: -7,
            left: '50%',
            transform: 'translateX(-50%)',
            ...legacyHandleStyle,
          }}
          className="workflow-handle workflow-handle-aux"
        />
        <HandleWithNumber
          number={topNumber}
          badgePosition="above"
          sx={{
            position: 'absolute',
            top: -7,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 14,
            height: 14,
          }}
        >
          <Handle
            type="source"
            id="top-out"
            position={Position.Top}
            isConnectableStart
            isConnectableEnd
            style={{
              top: -7,
              left: '50%',
              transform: 'translateX(-50%)',
              ...handleVisibilityStyle,
              transition: 'opacity 140ms ease',
            }}
            className="workflow-handle workflow-handle-aux"
          />
        </HandleWithNumber>

        <Box
          sx={{
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: alpha(theme.palette.primary.main, 0.12),
            color: 'primary.main',
            borderRadius: 2,
            mr: 1.5,
            flexShrink: 0,
            '& svg': { fontSize: 24 },
          }}
        >
          <AppIcon fallback={Icon} />
        </Box>

        <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <Typography
            variant="subtitle2"
            sx={{
              fontWeight: 700,
              fontSize: '0.85rem',
              lineHeight: 1.2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </Typography>
          <Box
            sx={{
              mt: 0.25,
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              minWidth: 0,
            }}
          >
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                display: 'block',
                fontSize: '0.7rem',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0,
                flex: 1,
              }}
            >
              {visibleDescription}
            </Typography>
            {isTruncated && isHovered && (
              <Tooltip title={showDescription} arrow>
                <IconButton
                  size="small"
                  className="nodrag nopan"
                  sx={{
                    p: 0.25,
                    color: 'text.secondary',
                    '&:hover': {
                      color: 'primary.main',
                      bgcolor: alpha(theme.palette.primary.main, 0.1),
                    },
                  }}
                >
                  <AppIcon name="InfoOutlined" fallback={InfoOutlinedIcon} sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        </Box>

        <IconButton
          size="small"
          onClick={handleOpen}
          sx={{
            ml: 1,
            color: 'text.secondary',
            '& svg': { fontSize: 22 },
            '&:hover': {
              color: 'primary.main',
              bgcolor: alpha(theme.palette.primary.main, 0.08),
            },
          }}
        >
          <AppIcon name="SettingsOutlined" fallback={SettingsOutlinedIcon} fontSize="small" />
        </IconButton>

        {/* Right side: allow start+end connections reliably (target + source overlapped). */}
        <Handle
          type="source"
          id="right-in"
          position={Position.Right}
          isConnectableStart
          isConnectableEnd
          style={{
            left: 'auto',
            right: -7,
            top: '50%',
            transform: 'translateY(-50%)',
            ...legacyHandleStyle,
          }}
          className="workflow-handle"
        />
        <HandleWithNumber
          number={rightNumber}
          sx={{
            position: 'absolute',
            left: 'auto',
            right: -7,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 14,
            height: 14,
          }}
        >
          <Handle
            type="source"
            id="right-out"
            position={Position.Right}
            isConnectableStart
            isConnectableEnd
            style={{
              left: 'auto',
              right: -7,
              top: '50%',
              transform: 'translateY(-50%)',
              ...handleVisibilityStyle,
              transition: 'opacity 140ms ease',
            }}
            className="workflow-handle"
          />
        </HandleWithNumber>

        <Handle
          type="source"
          id="bottom-in"
          position={Position.Bottom}
          isConnectableStart
          isConnectableEnd
          style={{
            bottom: -7,
            left: '50%',
            transform: 'translateX(-50%)',
            ...legacyHandleStyle,
          }}
          className="workflow-handle workflow-handle-aux"
        />
        <HandleWithNumber
          number={bottomNumber}
          badgePosition="below"
          sx={{
            position: 'absolute',
            bottom: -7,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 14,
            height: 14,
          }}
        >
          <Handle
            type="source"
            id="bottom-out"
            position={Position.Bottom}
            isConnectableStart
            isConnectableEnd
            style={{
              bottom: -7,
              left: '50%',
              transform: 'translateX(-50%)',
              ...handleVisibilityStyle,
              transition: 'opacity 140ms ease',
            }}
            className="workflow-handle workflow-handle-aux"
          />
        </HandleWithNumber>
      </Box>
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
        slotProps={{ paper: { sx: { minWidth: 300, maxWidth: 360, p: 2, borderRadius: 2 } } }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
          Edit block
        </Typography>
        <TextField
          size="small"
          label="Name"
          value={label}
          onChange={handleRename}
          fullWidth
          sx={{ mb: 1.5, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
        />
        <TextField
          size="small"
          label="Description"
          value={description}
          onChange={handleDescriptionChange}
          fullWidth
          multiline
          rows={2}
          placeholder="Optional description"
          sx={{ mb: 1.5, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
        />

        {/* JSON Configuration */}
        <Button
          size="small"
          startIcon={
            <AppIcon
              name="DataObjectRounded"
              fallback={DataObjectRoundedIcon}
              sx={{ fontSize: 16 }}
            />
          }
          endIcon={
            <AppIcon
              name="ExpandMoreRounded"
              fallback={ExpandMoreRoundedIcon}
              sx={{
                fontSize: 16,
                transition: 'transform 0.2s',
                transform: jsonExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
              }}
            />
          }
          onClick={() => setJsonExpanded((p) => !p)}
          sx={{
            textTransform: 'none',
            fontWeight: 600,
            fontSize: '0.78rem',
            color: jsonConfig ? 'primary.main' : 'text.secondary',
            justifyContent: 'flex-start',
            mb: jsonExpanded ? 0 : 1.5,
          }}
        >
          {jsonConfig ? 'JSON Configuration' : 'Add JSON'}
        </Button>
        <Collapse in={jsonExpanded}>
          <TextField
            size="small"
            label="JSON Configuration"
            value={jsonConfig}
            onChange={handleJsonConfigChange}
            fullWidth
            multiline
            rows={4}
            placeholder={'{\n  "apiKey": "...",\n  "endpoint": "..."\n}'}
            error={jsonValid === false}
            helperText={
              jsonValid === false ? 'Invalid JSON' : jsonValid === true ? 'Valid JSON' : ''
            }
            FormHelperTextProps={{
              sx: { color: jsonValid ? 'success.main' : undefined },
            }}
            sx={{
              mb: 1.5,
              '& .MuiOutlinedInput-root': { borderRadius: 2 },
            }}
            slotProps={{
              input: { sx: { fontFamily: 'monospace', fontSize: 12 } },
            }}
          />
        </Collapse>

        <Divider sx={{ mb: 2 }} />

        <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
          <Tooltip
            title={
              incomingCount > 0
                ? incomingCount > 1
                  ? `Disconnect ${incomingCount} incoming connections`
                  : 'Disconnect incoming connection'
                : 'No incoming connections'
            }
          >
            <span>
              <Button
                size="small"
                variant="outlined"
                color="inherit"
                startIcon={
                  <AppIcon
                    name="LinkOffRounded"
                    fallback={LinkOffRoundedIcon}
                    sx={{ fontSize: 18 }}
                  />
                }
                disabled={
                  !nodeId || incomingCount === 0 || typeof onDisconnectIncoming !== 'function'
                }
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDisconnectIncoming?.(nodeId);
                }}
                sx={{ flex: 1, textTransform: 'none', fontWeight: 700, borderRadius: 1.5 }}
              >
                Incoming {incomingCount ? `(${incomingCount})` : ''}
              </Button>
            </span>
          </Tooltip>

          <Tooltip
            title={
              outgoingCount > 0
                ? outgoingCount > 1
                  ? `Disconnect ${outgoingCount} outgoing connections`
                  : 'Disconnect outgoing connection'
                : 'No outgoing connections'
            }
          >
            <span>
              <Button
                size="small"
                variant="outlined"
                color="inherit"
                startIcon={
                  <AppIcon
                    name="LinkOffRounded"
                    fallback={LinkOffRoundedIcon}
                    sx={{ fontSize: 18 }}
                  />
                }
                disabled={
                  !nodeId || outgoingCount === 0 || typeof onDisconnectOutgoing !== 'function'
                }
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDisconnectOutgoing?.(nodeId);
                }}
                sx={{ flex: 1, textTransform: 'none', fontWeight: 700, borderRadius: 1.5 }}
              >
                Outgoing {outgoingCount ? `(${outgoingCount})` : ''}
              </Button>
            </span>
          </Tooltip>
        </Stack>

        {(incomingConnections.length > 0 || outgoingConnections.length > 0) && (
          <>
            <Divider sx={{ mb: 2 }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>
              Connections
            </Typography>

            {incomingConnections.length > 0 && (
              <Box sx={{ mb: 1.25 }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', mb: 0.5 }}
                >
                  Incoming
                </Typography>
                <Stack spacing={0.5}>
                  {incomingConnections.map((c) => (
                    <Box
                      key={c.edgeId}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 1,
                        px: 1,
                        py: 0.75,
                        borderRadius: 1.5,
                        border: '1px solid',
                        borderColor: alpha(theme.palette.divider, 0.85),
                        bgcolor: alpha(theme.palette.background.paper, 0.5),
                      }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '0.8rem' }}
                          noWrap
                        >
                          {c.connectionId || c.edgeId}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap>
                          From {c.fromLabel || c.fromNodeId}
                        </Typography>
                      </Box>
                      <Typography
                        variant="caption"
                        sx={{
                          color: 'text.secondary',
                          textTransform: 'uppercase',
                          fontWeight: 800,
                        }}
                      >
                        {c.connectionType || '-'}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              </Box>
            )}

            {outgoingConnections.length > 0 && (
              <Box sx={{ mb: 0.5 }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', mb: 0.5 }}
                >
                  Outgoing
                </Typography>
                <Stack spacing={0.5}>
                  {outgoingConnections.map((c) => (
                    <Box
                      key={c.edgeId}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 1,
                        px: 1,
                        py: 0.75,
                        borderRadius: 1.5,
                        border: '1px solid',
                        borderColor: alpha(theme.palette.divider, 0.85),
                        bgcolor: alpha(theme.palette.background.paper, 0.5),
                      }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '0.8rem' }}
                          noWrap
                        >
                          {c.connectionId || c.edgeId}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap>
                          To {c.toLabel || c.toNodeId}
                        </Typography>
                      </Box>
                      <Typography
                        variant="caption"
                        sx={{
                          color: 'text.secondary',
                          textTransform: 'uppercase',
                          fontWeight: 800,
                        }}
                      >
                        {c.connectionType || '-'}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              </Box>
            )}
          </>
        )}

        <Button
          size="small"
          variant="outlined"
          color="error"
          startIcon={
            <AppIcon name="DeleteOutline" fallback={DeleteOutlineIcon} sx={{ fontSize: 16 }} />
          }
          fullWidth
          onClick={() => {
            handleClose();
            onRemove?.();
          }}
          sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 1.5 }}
        >
          Remove from canvas
        </Button>
      </Popover>
    </>
  );
}

export default memo(CustomBlockNode);
