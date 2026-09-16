import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Paper,
  Stack,
  TextField,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import GraphicEqRoundedIcon from '@mui/icons-material/GraphicEqRounded';
import MicNoneOutlinedIcon from '@mui/icons-material/MicNoneOutlined';
import MicRoundedIcon from '@mui/icons-material/MicRounded';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';
import SendRoundedIcon from '@mui/icons-material/SendRounded';

import type { BlockRegistry } from '../registry/blockRegistry';
import type { BuilderMode, ParserContext } from '../types';
import { parseTranscriptDeterministic } from '../intent/parser';
import { applyIntentToReactFlow } from '../canvas/canvasStateManager';
import { useVoiceIntake } from '../voice/useVoiceIntake';
import { useBrowserSpeechRecognition } from '../voice/useBrowserSpeechRecognition';

type RFNode = { id: string; data?: Record<string, unknown> };
type RFEdge = { id: string; data?: Record<string, unknown> };

export interface VoiceAssistantPanelProps {
  mode: BuilderMode;
  registry: BlockRegistry;
  getNodes: () => RFNode[];
  getEdges: () => RFEdge[];
  setNodes: (updater: (prev: RFNode[]) => RFNode[]) => void;
  setEdges: (updater: (prev: RFEdge[]) => RFEdge[]) => void;
  defaultEdgeFactory: (args: { source: string; target: string }) => Record<string, unknown>;
  launcher?: 'pill' | 'none';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  createCustomBlock?: (
    name: string,
    description?: string
  ) =>
    | Promise<{ id: string; label: string; description?: string } | null>
    | { id: string; label: string; description?: string }
    | null;
}

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  metaJson?: string;
  ts: number;
};

function newMsgId() {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function VoiceAssistantPanel(props: VoiceAssistantPanelProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const launcher = props.launcher ?? 'pill';
  const [internalOpen, setInternalOpen] = useState(false);
  const open = props.open ?? internalOpen;
  const setOpen = props.onOpenChange ?? setInternalOpen;
  const [ctx, setCtx] = useState<ParserContext>({ mode: props.mode });
  const [errors, setErrors] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<{
    open: boolean;
    blockId?: string;
    label?: string;
  }>({ open: false });

  const [chat, setChat] = useState<ChatMessage[]>(() => [
    {
      id: newMsgId(),
      role: 'assistant',
      text: 'Welcome. Tap the microphone to talk, or type a command.',
      ts: Date.now(),
    },
  ]);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Keep context mode in sync with current tab.
  useEffect(() => {
    setCtx((p) => ({ ...p, mode: props.mode }));
  }, [props.mode]);

  const pillBg = isDark
    ? alpha(theme.palette.background.paper, 0.42)
    : alpha(theme.palette.background.paper, 0.76);
  const pillBorder = isDark ? alpha('#2dd4bf', 0.22) : alpha('#0ea5e9', 0.16);

  const runFinalTranscript = useCallback(
    async (finalTextRaw: string) => {
      const finalText = String(finalTextRaw || '').trim();
      if (!finalText) return;

      const nodesNow = props.getNodes();
      const edgesNow = props.getEdges();
      const blocksForResolve = nodesNow.map((n) => ({
        id: n.id,
        label: String(n.data?.label || 'Block'),
        type: typeof n.data?.blockType === 'string' ? String(n.data?.blockType) : undefined,
      }));
      const connectionsForResolve = edgesNow.map((e) => ({
        id: e.id,
        connectionId:
          typeof e.data?.connectionId === 'string' ? String(e.data?.connectionId) : undefined,
      }));

      setChat((prev) =>
        prev.concat({ id: newMsgId(), role: 'user', text: finalText, ts: Date.now() })
      );

      const parsed = parseTranscriptDeterministic({
        transcript: finalText,
        ctx,
        registry: props.registry,
        blocks: blocksForResolve,
        connections: connectionsForResolve,
      });

      if (!parsed.ok || !parsed.command) {
        const msg = (parsed.errors || ['Sorry, I could not understand that.'])[0];
        setErrors([msg]);
        setChat((prev) =>
          prev.concat({ id: newMsgId(), role: 'assistant', text: msg, ts: Date.now() })
        );
        if (parsed.nextContext) setCtx(parsed.nextContext);
        return;
      }

      setErrors([]);
      const cmdJson = JSON.stringify(parsed.command, null, 2);
      const nextCtx = parsed.nextContext || ctx;
      if (parsed.nextContext) setCtx(parsed.nextContext);

      if (parsed.command.action === 'delete_block') {
        const blockId = parsed.command.blockId;
        const label = blocksForResolve.find((b) => b.id === blockId)?.label || blockId || 'block';
        setConfirmDelete({ open: true, blockId, label });
        setChat((prev) =>
          prev.concat({
            id: newMsgId(),
            role: 'assistant',
            text: `Confirm delete: "${label}"`,
            metaJson: cmdJson,
            ts: Date.now(),
          })
        );
        return;
      }

      const res = await applyIntentToReactFlow(props.registry, nextCtx, parsed.command, {
        mode: props.mode,
        getNodes: props.getNodes,
        getEdges: props.getEdges,
        setNodes: props.setNodes,
        setEdges: props.setEdges,
        defaultEdgeFactory: ({ source, target }) =>
          props.defaultEdgeFactory({ source, target }) as any,
        createCustomBlock: props.createCustomBlock,
      });

      if (!res.ok) {
        const msg = (res.errors || ['Command failed'])[0];
        setErrors([msg]);
        setChat((prev) =>
          prev.concat({
            id: newMsgId(),
            role: 'assistant',
            text: msg,
            metaJson: cmdJson,
            ts: Date.now(),
          })
        );
        return;
      }

      if (res.nextContext) setCtx(res.nextContext);
      setChat((prev) =>
        prev.concat({
          id: newMsgId(),
          role: 'assistant',
          text: 'Done.',
          metaJson: cmdJson,
          ts: Date.now(),
        })
      );
    },
    [ctx, props, props.registry]
  );

  const intake = useVoiceIntake(
    {
      onFinal: (t) => {
        runFinalTranscript(t);
      },
    },
    { partialDebounceMs: 250, finalizeAfterMs: 900 }
  );

  const speech = useBrowserSpeechRecognition(
    {
      onPartial: (t) => intake.pushPartial(t),
      onFinal: (t) => intake.pushFinal(t),
      onError: (msg) => setErrors([msg]),
    },
    { continuous: true, interimResults: true, lang: 'en-US' }
  );

  useEffect(() => {
    if (!open && speech.listening) speech.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [open, chat.length, intake.state.partial]);

  const pillSubtitle = useMemo(() => {
    if (!speech.supported) return `Voice assistant • ${props.mode} • voice unsupported`;
    if (speech.listening) return intake.state.partial ? intake.state.partial : 'Listening…';
    return `Voice assistant • ${props.mode}`;
  }, [intake.state.partial, props.mode, speech.listening, speech.supported]);

  return (
    <>
      {launcher === 'pill' && (
        <Paper
          variant="outlined"
          onClick={() => setOpen(true)}
          sx={{
            width: { xs: 320, sm: 560, md: 640 },
            maxWidth: 'min(720px, calc(100vw - 24px))',
            borderRadius: 999,
            px: 1.25,
            py: 1.0,
            cursor: 'pointer',
            borderColor: pillBorder,
            bgcolor: pillBg,
            backdropFilter: 'blur(14px)',
            boxShadow: `0 18px 60px ${alpha('#000', 0.28)}`,
            display: 'flex',
            alignItems: 'center',
            gap: 1.25,
          }}
        >
          {/* Glow orb */}
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              bgcolor: alpha('#2dd4bf', isDark ? 0.26 : 0.18),
              boxShadow: `0 0 0 6px ${alpha('#2dd4bf', isDark ? 0.1 : 0.08)}, 0 0 26px ${alpha('#2dd4bf', 0.28)}`,
              position: 'relative',
              flexShrink: 0,
              '&::after': speech.listening
                ? {
                    content: '""',
                    position: 'absolute',
                    inset: -6,
                    borderRadius: '50%',
                    border: `2px solid ${alpha('#2dd4bf', 0.55)}`,
                    animation: 'pulse 1.2s ease-in-out infinite',
                  }
                : undefined,
              '@keyframes pulse': {
                '0%': { transform: 'scale(0.92)', opacity: 0.55 },
                '70%': { transform: 'scale(1.12)', opacity: 0.12 },
                '100%': { transform: 'scale(1.12)', opacity: 0 },
              },
            }}
          />

          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, color: 'text.primary' }} noWrap>
              Let&apos;s talk
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              {pillSubtitle}
            </Typography>
          </Box>

          <Chip
            size="small"
            label={props.mode}
            sx={{
              borderRadius: 999,
              fontWeight: 900,
              textTransform: 'uppercase',
              letterSpacing: 0.4,
              bgcolor: alpha(theme.palette.background.paper, isDark ? 0.25 : 0.65),
            }}
          />
        </Paper>
      )}

      {/* Full "Let's Talk" dialog */}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        fullWidth
        maxWidth="md"
        slotProps={{ paper: { sx: { borderRadius: 4, overflow: 'hidden' } } }}
      >
        <Box
          sx={{
            px: 2,
            py: 1.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            bgcolor: alpha(theme.palette.background.paper, isDark ? 0.42 : 0.82),
            borderBottom: '1px solid',
            borderColor: alpha(theme.palette.divider, 0.8),
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <MicNoneOutlinedIcon sx={{ color: 'text.secondary' }} />
            <Typography sx={{ fontWeight: 900, letterSpacing: 0.6 }}>LET&apos;S TALK</Typography>
            <Chip size="small" label={props.mode} sx={{ borderRadius: 999, fontWeight: 900 }} />
          </Box>
          <Button
            size="small"
            onClick={() => setOpen(false)}
            startIcon={<CloseRoundedIcon />}
            sx={{ textTransform: 'none', fontWeight: 800, borderRadius: 999 }}
          >
            Close
          </Button>
        </Box>

        <DialogContent
          sx={{
            p: 0,
            bgcolor: isDark ? '#0b1220' : alpha(theme.palette.background.default, 0.55),
          }}
        >
          <Box
            ref={scrollRef}
            sx={{
              height: 420,
              overflow: 'auto',
              px: 2,
              py: 2,
              display: 'flex',
              flexDirection: 'column',
              gap: 1.25,
            }}
          >
            {chat.map((m) => (
              <Box
                key={m.id}
                sx={{
                  alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: 'min(680px, 92%)',
                }}
              >
                <Paper
                  variant="outlined"
                  sx={{
                    p: 1.25,
                    borderRadius: 3,
                    borderColor: alpha(theme.palette.divider, 0.65),
                    bgcolor:
                      m.role === 'user'
                        ? alpha(theme.palette.success.main, isDark ? 0.16 : 0.1)
                        : alpha(theme.palette.background.paper, isDark ? 0.28 : 0.72),
                  }}
                >
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                    {m.text}
                  </Typography>
                  {m.metaJson && (
                    <Box
                      component="pre"
                      sx={{
                        mt: 1,
                        mb: 0,
                        p: 1,
                        borderRadius: 2,
                        fontSize: '0.72rem',
                        overflow: 'auto',
                        bgcolor: alpha(theme.palette.common.black, isDark ? 0.35 : 0.06),
                      }}
                    >
                      {m.metaJson}
                    </Box>
                  )}
                </Paper>
              </Box>
            ))}

            {speech.listening && intake.state.partial && (
              <Box sx={{ alignSelf: 'flex-start', maxWidth: 'min(680px, 92%)' }}>
                <Paper
                  variant="outlined"
                  sx={{
                    p: 1.25,
                    borderRadius: 3,
                    borderColor: alpha('#2dd4bf', 0.35),
                    bgcolor: alpha('#2dd4bf', isDark ? 0.1 : 0.08),
                  }}
                >
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <GraphicEqRoundedIcon sx={{ color: alpha('#2dd4bf', 0.95) }} />
                    <Typography variant="body2" color="text.secondary">
                      {intake.state.partial}
                    </Typography>
                  </Stack>
                </Paper>
              </Box>
            )}
          </Box>

          <Divider />

          <Box sx={{ p: 1.5, display: 'flex', gap: 1, alignItems: 'center' }}>
            <Button
              variant={speech.listening ? 'contained' : 'outlined'}
              color={speech.listening ? 'success' : 'inherit'}
              disabled={!speech.supported && !speech.listening}
              onClick={() => (speech.listening ? speech.stop() : speech.start())}
              startIcon={<MicRoundedIcon />}
              sx={{ textTransform: 'none', fontWeight: 900, borderRadius: 999, px: 2 }}
            >
              {speech.listening ? 'Listening' : 'Talk'}
            </Button>

            <TextField
              fullWidth
              size="small"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder='Try: "add webhook", "connect A to B", "disconnect incoming of Campaign"'
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  const t = String(draft || '').trim();
                  if (!t) return;
                  setDraft('');
                  intake.pushFinal(t);
                }
              }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 999 } }}
            />

            <Button
              variant="contained"
              onClick={() => {
                const t = String(draft || '').trim();
                if (!t) return;
                setDraft('');
                intake.pushFinal(t);
              }}
              startIcon={<SendRoundedIcon />}
              sx={{ textTransform: 'none', fontWeight: 900, borderRadius: 999, px: 2 }}
            >
              Send
            </Button>

            <Button
              variant="outlined"
              onClick={() => {
                setErrors([]);
                setDraft('');
                intake.reset();
                setChat((prev) => (prev.length ? [prev[0]] : prev));
              }}
              startIcon={<RestartAltRoundedIcon />}
              sx={{ textTransform: 'none', fontWeight: 800, borderRadius: 999 }}
            >
              Reset
            </Button>
          </Box>

          {errors.length > 0 && (
            <Box sx={{ px: 1.5, pb: 1.5 }}>
              <Alert severity="error" sx={{ borderRadius: 2 }}>
                {errors[0]}
              </Alert>
            </Box>
          )}

          {!speech.supported && (
            <Box sx={{ px: 1.5, pb: 1.5 }}>
              <Alert severity="info" sx={{ borderRadius: 2 }}>
                Voice recognition is not available in this browser. You can still type commands.
              </Alert>
            </Box>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation (destructive) */}
      <Dialog
        open={Boolean(confirmDelete.open)}
        onClose={() => setConfirmDelete({ open: false })}
        maxWidth="xs"
        fullWidth
        slotProps={{ paper: { sx: { borderRadius: 3 } } }}
      >
        <DialogTitle sx={{ fontWeight: 900 }}>Confirm delete</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Delete {confirmDelete.label ? `"${confirmDelete.label}"` : 'this block'} and its
            connections?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button
            onClick={() => setConfirmDelete({ open: false })}
            sx={{ textTransform: 'none', fontWeight: 800 }}
          >
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            startIcon={<DeleteOutlineRoundedIcon />}
            onClick={async () => {
              const blockId = confirmDelete.blockId;
              const label = confirmDelete.label || blockId || 'block';
              setConfirmDelete({ open: false });
              if (!blockId) return;

              const cmd = { mode: props.mode, action: 'delete_block' as const, blockId };
              const cmdJson = JSON.stringify(cmd, null, 2);
              const res = await applyIntentToReactFlow(props.registry, ctx, cmd as any, {
                mode: props.mode,
                getNodes: props.getNodes,
                getEdges: props.getEdges,
                setNodes: props.setNodes,
                setEdges: props.setEdges,
                defaultEdgeFactory: ({ source, target }) =>
                  props.defaultEdgeFactory({ source, target }) as any,
                createCustomBlock: props.createCustomBlock,
              });
              if (!res.ok) {
                const msg = (res.errors || ['Delete failed'])[0];
                setErrors([msg]);
                setChat((prev) =>
                  prev.concat({
                    id: newMsgId(),
                    role: 'assistant',
                    text: msg,
                    metaJson: cmdJson,
                    ts: Date.now(),
                  })
                );
              } else {
                setErrors([]);
                setChat((prev) =>
                  prev.concat({
                    id: newMsgId(),
                    role: 'assistant',
                    text: `Deleted "${label}".`,
                    metaJson: cmdJson,
                    ts: Date.now(),
                  })
                );
              }
            }}
            sx={{ textTransform: 'none', fontWeight: 900, borderRadius: 2 }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
