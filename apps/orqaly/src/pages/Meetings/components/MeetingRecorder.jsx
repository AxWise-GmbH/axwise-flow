import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Button,
  TextField,
  MenuItem,
  Chip,
  Stack,
  LinearProgress,
  alpha,
  Tooltip,
  Collapse,
  InputAdornment,
} from '@mui/material';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import StopIcon from '@mui/icons-material/Stop';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import TitleIcon from '@mui/icons-material/Title';
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined';
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutline';
import {
  MEETING_CHANNELS,
  MEETING_STATUS_LABELS,
  MEETING_STATUS_COLORS,
} from '../../../services/meetingService';

import AppIcon from '../../../components/icons/AppIcon';

const formatDuration = (seconds) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

// Pre-computed random offsets for audio level bars (avoids Math.random in render)
const BAR_OFFSETS = [0.65, 0.82, 0.53, 0.91, 0.74, 0.6, 0.88, 0.7];

/**
 * MeetingRecorder
 * ─────────────────────────────────────────
 * Browser-based audio recording using MediaRecorder API.
 * Provides: one-click start, live timer, pause/resume, stop,
 * and a post-recording form for metadata before transcription.
 *
 * Props:
 *   partnerId   – ID to attach meeting to
 *   partnerName – display name
 *   onRecordingComplete(meeting) – called after pipeline completes; receives full meeting (used to create tasks)
 *   onCreateMeeting(params) – creates meeting record
 *   onFinishRecording(meetingId, recordingBlob, onStatusChange) – triggers pipeline
 *   onUpdateMeeting(meetingId, data) – update meeting metadata
 *   onDeleteMeeting(meetingId) – clean up on cancel
 *   compact     – smaller inline mode (for table row)
 *   onClose     – close handler for dialog mode
 */
export default function MeetingRecorder({
  partnerId,
  partnerName,
  onRecordingComplete,
  onCreateMeeting,
  onFinishRecording,
  onUpdateMeeting,
  onDeleteMeeting,
  compact = false,
  onClose,
}) {
  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [recordingError, setRecordingError] = useState(null);

  // Post-recording form
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    channel: 'Google Meet',
    participants: '',
  });

  // Pipeline progress
  const [pipelineStatus, setPipelineStatus] = useState(null);
  const [pipelineProgress, setPipelineProgress] = useState(0);
  const [pipelineComplete, setPipelineComplete] = useState(false);
  const [pipelineFailed, setPipelineFailed] = useState(false);

  // Refs
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const audioCtxRef = useRef(null);
  const animFrameRef = useRef(null);
  const meetingIdRef = useRef(null);
  const startTimeRef = useRef(null);
  const stoppingRef = useRef(false);
  const handleStopRecordingRef = useRef(null);

  // Pre-fill form with partner name and suggested title when recording stops
  useEffect(() => {
    if (showForm) {
      setFormData((prev) => ({
        ...prev,
        title: prev.title || `Meeting with ${partnerName || 'Partner'}`,
        participants: prev.participants || partnerName || '',
      }));
    }
  }, [showForm, partnerName]);

  // Escape key stops recording (works even if button clicks are blocked)
  useEffect(() => {
    if (!isRecording) return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleStopRecordingRef.current?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  // Audio level monitoring via AnalyserNode
  const startAudioMonitoring = useCallback((stream) => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateLevel = () => {
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        setAudioLevel(avg / 128); // Normalize 0–2 range
        animFrameRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();
    } catch {
      // Audio context not available - skip monitoring
    }
  }, []);

  // Stable bar heights derived from audioLevel (no Math.random in render)
  const barHeights = useMemo(
    () => BAR_OFFSETS.map((offset) => Math.max(4, audioLevel * 12 * offset)),
    [audioLevel]
  );

  // ─── Start Recording ──────────────────────────────────────────────────────
  const handleStartRecording = useCallback(async () => {
    setRecordingError(null);
    setPipelineStatus(null);
    setPipelineComplete(false);
    setPipelineFailed(false);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onerror = (e) => {
        setRecordingError(`Recording error: ${e.error?.message || 'Unknown error'}`);
        setIsRecording(false);
      };

      recorder.start(1000); // Collect data every second
      startTimeRef.current = Date.now();
      stoppingRef.current = false;
      setIsRecording(true);
      setIsPaused(false);
      setDuration(0);

      // Start timer
      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);

      // Start audio level monitoring
      startAudioMonitoring(stream);

      // Create meeting record in storage
      if (onCreateMeeting) {
        const meeting = await onCreateMeeting({
          title: `Recording - ${new Date().toLocaleString()}`,
          channel: 'Other',
          participants: [],
        });
        meetingIdRef.current = meeting.id;
      }
    } catch (err) {
      const name = err?.name || '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setRecordingError(
          'Microphone access denied. Please allow microphone access in your browser settings, then click Try again.'
        );
      } else if (name === 'NotFoundError') {
        setRecordingError('No microphone found. Please connect a microphone and try again.');
      } else {
        setRecordingError(`Could not start recording: ${err?.message || 'Unknown error'}`);
      }
    }
  }, [onCreateMeeting, startAudioMonitoring]);

  // ─── Pause / Resume ───────────────────────────────────────────────────────
  const handlePauseResume = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    try {
      if (recorder.state === 'paused') {
        if (typeof recorder.resume === 'function') recorder.resume();
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = setInterval(() => setDuration((prev) => prev + 1), 1000);
        setIsPaused(false);
      } else if (recorder.state === 'recording') {
        if (typeof recorder.pause === 'function') recorder.pause();
        if (timerRef.current) clearInterval(timerRef.current);
        setIsPaused(true);
      }
    } catch (err) {
      setRecordingError(
        'Pause/resume is not supported in this browser. Use Stop to end the recording.'
      );
    }
  }, []);

  // ─── Stop Recording ───────────────────────────────────────────────────────
  // Update UI immediately so the recording bar disappears; clean up MediaRecorder/stream async.
  const handleStopRecording = useCallback(() => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;

    const recorder = mediaRecorderRef.current;
    const stream = streamRef.current;
    const audioCtx = audioCtxRef.current;

    // 1. Stop timer and animation frame
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = null;

    // 2. Update UI immediately - do not wait for MediaRecorder 'stop' event
    mediaRecorderRef.current = null;
    streamRef.current = null;
    audioCtxRef.current = null;
    setIsRecording(false);
    setIsPaused(false);
    setAudioLevel(0);
    setShowForm(true);
    stoppingRef.current = false;

    // 3. Clean up recorder/stream in background (chunks already in chunksRef)
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch (_) {}
    }
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
    }
    if (audioCtx && audioCtx.state !== 'closed') {
      audioCtx.close().catch(() => {});
    }
  }, []);

  useEffect(() => {
    handleStopRecordingRef.current = handleStopRecording;
  }, [handleStopRecording]);

  // ─── Submit Recording ─────────────────────────────────────────────────────
  const handleSubmitRecording = useCallback(async () => {
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' });

    setShowForm(false);
    setPipelineStatus('uploading');
    setPipelineProgress(10);

    try {
      const meetingId = meetingIdRef.current;

      // FIX: Save form metadata + duration to meeting BEFORE pipeline
      if (meetingId && onUpdateMeeting) {
        const participantsList = formData.participants
          ? formData.participants
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : [];
        await onUpdateMeeting(meetingId, {
          title: formData.title || `Recording - ${new Date().toLocaleString()}`,
          channel: formData.channel || 'Other',
          participants: participantsList,
          durationSeconds: duration,
        });
      }

      // Trigger transcription pipeline
      if (meetingId && onFinishRecording) {
        const finalMeeting = await onFinishRecording(meetingId, blob, (status, progress) => {
          setPipelineStatus(status);
          setPipelineProgress(progress);
        });
        if (finalMeeting) {
          setPipelineComplete(true);
          onRecordingComplete?.(finalMeeting);
        }
      }
    } catch (err) {
      setPipelineFailed(true);
      setPipelineStatus('failed');
      setRecordingError(`Pipeline failed: ${err.message}`);
    }
  }, [onFinishRecording, onUpdateMeeting, onRecordingComplete, formData, duration]);

  // ─── Cancel Recording ─────────────────────────────────────────────────────
  const handleCancel = useCallback(() => {
    if (isRecording) handleStopRecording();

    // FIX: Clean up orphaned meeting record if one was created
    if (meetingIdRef.current && onDeleteMeeting) {
      onDeleteMeeting(meetingIdRef.current).catch(() => {});
      meetingIdRef.current = null;
    }

    setShowForm(false);
    setPipelineStatus(null);
    setPipelineComplete(false);
    setPipelineFailed(false);
    setDuration(0);
    setAudioLevel(0);
    setRecordingError(null);
    chunksRef.current = [];
    onClose?.();
  }, [isRecording, handleStopRecording, onDeleteMeeting, onClose]);

  // ─── Compact Mode (icon button for table row) ────────────────────────────
  if (compact && !isRecording && !showForm && !pipelineStatus) {
    return (
      <Tooltip title={`Record meeting with ${partnerName || 'Partner'}`}>
        <IconButton
          size="small"
          onClick={handleStartRecording}
          sx={{
            color: '#EF4444',
            '&:hover': { bgcolor: alpha('#EF4444', 0.08) },
          }}
        >
          <AppIcon name="Mic" fallback={MicIcon} fontSize="small" />
        </IconButton>
      </Tooltip>
    );
  }

  // ─── Recording Indicator Bar (inline JSX - NOT a function component) ─────
  const recordingBarJsx = (
    <Box
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 1.5,
        p: 1.5,
        borderRadius: 2,
        bgcolor: alpha('#EF4444', 0.06),
        border: '1px solid',
        borderColor: alpha('#EF4444', 0.2),
        position: 'relative',
        zIndex: 10,
        isolation: 'isolate',
      }}
    >
      {/* Left: status + timer + levels - click to stop (or use Stop button / Esc) */}
      <Box
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          handleStopRecordingRef.current?.();
        }}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          flex: '1 1 auto',
          minWidth: 0,
          cursor: 'pointer',
          borderRadius: 1,
          '&:hover': { bgcolor: alpha('#EF4444', 0.08) },
        }}
      >
        <Box
          sx={{
            width: 12,
            height: 12,
            flexShrink: 0,
            borderRadius: '50%',
            bgcolor: isPaused ? '#F59E0B' : '#EF4444',
            animation: isPaused ? 'none' : 'pulse 1.5s ease-in-out infinite',
            '@keyframes pulse': {
              '0%, 100%': { opacity: 1, transform: 'scale(1)' },
              '50%': { opacity: 0.4, transform: 'scale(0.8)' },
            },
          }}
        />
        <Typography
          variant="body2"
          sx={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '1rem', minWidth: 52 }}
        >
          {formatDuration(duration)}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, height: 20 }}>
          {barHeights.map((h, i) => (
            <Box
              key={i}
              sx={{
                width: 3,
                height: h,
                bgcolor: audioLevel > 0.3 ? '#10B981' : '#94A3B8',
                borderRadius: 1,
                transition: 'height 0.15s ease-out',
              }}
            />
          ))}
        </Box>
      </Box>

      {/* Right: controls */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          flexShrink: 0,
          position: 'relative',
          zIndex: 2,
        }}
      >
        <Tooltip title={isPaused ? 'Resume' : 'Pause'}>
          <IconButton
            type="button"
            size="small"
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              handlePauseResume();
            }}
            aria-label={isPaused ? 'Resume' : 'Pause'}
          >
            {isPaused ? (
              <AppIcon name="PlayArrow" fallback={PlayArrowIcon} fontSize="small" />
            ) : (
              <AppIcon name="Pause" fallback={PauseIcon} fontSize="small" />
            )}
          </IconButton>
        </Tooltip>
        <Tooltip title="Stop recording (or press Esc)">
          <button
            type="button"
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              handleStopRecordingRef.current?.();
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              fontSize: 14,
              fontWeight: 600,
              color: '#fff',
              backgroundColor: '#EF4444',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#DC2626';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#EF4444';
            }}
          >
            <AppIcon name="Stop" fallback={StopIcon} sx={{ fontSize: 18 }} />
            Stop
          </button>
        </Tooltip>
        <Typography
          component="span"
          variant="caption"
          sx={{ color: 'text.secondary', ml: 0.5, display: { xs: 'none', sm: 'inline' } }}
        >
          or Esc
        </Typography>
        {!compact && (
          <Tooltip title="Cancel">
            <IconButton
              type="button"
              size="small"
              onMouseDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                handleCancel();
              }}
              sx={{ color: 'text.secondary' }}
              aria-label="Cancel"
            >
              <AppIcon name="Close" fallback={CloseIcon} fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    </Box>
  );

  // ─── Pipeline Progress (inline JSX - NOT a function component) ────────────
  const pipelineProgressJsx = (
    <Box sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        {pipelineComplete ? (
          <AppIcon
            name="CheckCircleOutline"
            fallback={CheckCircleOutlineIcon}
            sx={{ color: '#10B981' }}
          />
        ) : pipelineFailed ? (
          <AppIcon name="ErrorOutline" fallback={ErrorOutlineIcon} sx={{ color: '#EF4444' }} />
        ) : (
          <Box
            sx={{
              width: 20,
              height: 20,
              border: '2px solid',
              borderColor: MEETING_STATUS_COLORS[pipelineStatus] || '#3B82F6',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              '@keyframes spin': { '100%': { transform: 'rotate(360deg)' } },
            }}
          />
        )}
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {pipelineComplete
            ? 'Meeting processed successfully!'
            : pipelineFailed
              ? 'Processing failed. Try uploading the recording manually.'
              : MEETING_STATUS_LABELS[pipelineStatus] || 'Processing…'}
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={pipelineProgress}
        sx={{
          height: 6,
          borderRadius: 3,
          bgcolor: alpha(MEETING_STATUS_COLORS[pipelineStatus] || '#3B82F6', 0.12),
          '& .MuiLinearProgress-bar': {
            bgcolor: pipelineComplete
              ? '#10B981'
              : pipelineFailed
                ? '#EF4444'
                : MEETING_STATUS_COLORS[pipelineStatus] || '#3B82F6',
            borderRadius: 3,
          },
        }}
      />
      {(pipelineComplete || pipelineFailed) && (
        <Button
          size="small"
          onClick={() => {
            setPipelineStatus(null);
            setPipelineComplete(false);
            setPipelineFailed(false);
            setRecordingError(null);
            setDuration(0);
            meetingIdRef.current = null;
            onClose?.();
          }}
          sx={{ mt: 1 }}
        >
          {pipelineComplete ? 'Done' : 'Close'}
        </Button>
      )}
    </Box>
  );

  // ─── Compact Recording Mode ───────────────────────────────────────────────
  if (compact) {
    return (
      <Box sx={{ minWidth: 220 }}>
        {isRecording && recordingBarJsx}
        {showForm && (
          <Box sx={{ p: 1 }}>
            <Typography variant="caption" sx={{ fontWeight: 600, mb: 0.5, display: 'block' }}>
              {formatDuration(duration)} recorded
            </Typography>
            <Button
              size="small"
              variant="contained"
              onClick={handleSubmitRecording}
              sx={{ mr: 0.5 }}
            >
              Process
            </Button>
            <Button size="small" onClick={handleCancel}>
              Cancel
            </Button>
          </Box>
        )}
        {pipelineStatus && pipelineProgressJsx}
      </Box>
    );
  }

  // ─── Full Dialog Mode ─────────────────────────────────────────────────────
  return (
    <Box>
      {/* Error */}
      {recordingError && (
        <Box
          sx={{
            p: 1.5,
            mb: 2,
            borderRadius: 2,
            bgcolor: alpha('#EF4444', 0.06),
            border: '1px solid',
            borderColor: alpha('#EF4444', 0.15),
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 1,
          }}
        >
          <AppIcon
            name="MicOff"
            fallback={MicOffIcon}
            sx={{ color: '#EF4444', fontSize: 20, flexShrink: 0 }}
          />
          <Typography
            variant="body2"
            sx={{ color: '#EF4444', fontSize: '0.85rem', flex: 1, minWidth: 0 }}
          >
            {recordingError}
          </Typography>
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              setRecordingError(null);
              handleStartRecording();
            }}
            sx={{
              borderColor: '#EF4444',
              color: '#EF4444',
              '&:hover': { borderColor: '#DC2626', bgcolor: alpha('#EF4444', 0.08) },
            }}
          >
            Try again
          </Button>
        </Box>
      )}
      {/* Not Recording State */}
      {!isRecording && !showForm && !pipelineStatus && (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <IconButton
            onClick={handleStartRecording}
            sx={{
              width: 80,
              height: 80,
              bgcolor: alpha('#EF4444', 0.08),
              '&:hover': { bgcolor: alpha('#EF4444', 0.15) },
              mb: 2,
            }}
          >
            <AppIcon
              name="FiberManualRecord"
              fallback={FiberManualRecordIcon}
              sx={{ color: '#EF4444', fontSize: 40 }}
            />
          </IconButton>
          <Typography variant="body1" sx={{ fontWeight: 600, mb: 0.5 }}>
            Start Recording
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 300, mx: 'auto' }}>
            Click to begin recording. Your microphone will be used to capture audio.
            {partnerName && ` This meeting will be attached to ${partnerName}.`}
          </Typography>
        </Box>
      )}
      {/* Recording State */}
      {isRecording && recordingBarJsx}
      {/* Post-Recording Form */}
      <Collapse in={showForm}>
        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700, fontSize: '0.9rem' }}>
            Meeting Details
          </Typography>
          <Chip
            label={`Duration: ${formatDuration(duration)}`}
            size="small"
            sx={{
              mb: 2.5,
              fontFamily: 'monospace',
              fontWeight: 600,
              bgcolor: alpha('#3B82F6', 0.08),
              color: '#3B82F6',
            }}
          />
          <Stack spacing={2.5}>
            <TextField
              label="Meeting Title"
              size="small"
              fullWidth
              value={formData.title}
              onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
              placeholder="e.g. Q1 Campaign Review"
              InputLabelProps={{ shrink: true, sx: { fontSize: '0.8125rem', fontWeight: 600 } }}
              InputProps={{
                sx: { fontSize: '0.9375rem' },
                startAdornment: (
                  <InputAdornment position="start" sx={{ color: 'text.secondary', mr: 0 }}>
                    <AppIcon name="Title" fallback={TitleIcon} sx={{ fontSize: 18 }} />
                  </InputAdornment>
                ),
              }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
            <TextField
              label="Channel"
              size="small"
              fullWidth
              select
              value={formData.channel}
              onChange={(e) => setFormData((p) => ({ ...p, channel: e.target.value }))}
              InputLabelProps={{ sx: { fontSize: '0.8125rem', fontWeight: 600 } }}
              InputProps={{
                sx: { fontSize: '0.9375rem' },
                startAdornment: (
                  <InputAdornment position="start" sx={{ color: 'text.secondary', mr: 0 }}>
                    <AppIcon
                      name="VideocamOutlined"
                      fallback={VideocamOutlinedIcon}
                      sx={{ fontSize: 18 }}
                    />
                  </InputAdornment>
                ),
              }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            >
              {MEETING_CHANNELS.map((ch) => (
                <MenuItem key={ch} value={ch}>
                  {ch}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Participants (comma-separated)"
              size="small"
              fullWidth
              value={formData.participants}
              onChange={(e) => setFormData((p) => ({ ...p, participants: e.target.value }))}
              placeholder="e.g. Alex, Sarah, Mike"
              InputLabelProps={{ shrink: true, sx: { fontSize: '0.8125rem', fontWeight: 600 } }}
              InputProps={{
                sx: { fontSize: '0.9375rem' },
                startAdornment: (
                  <InputAdornment position="start" sx={{ color: 'text.secondary', mr: 0 }}>
                    <AppIcon
                      name="PeopleOutline"
                      fallback={PeopleOutlineIcon}
                      sx={{ fontSize: 18 }}
                    />
                  </InputAdornment>
                ),
              }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
          </Stack>
          <Box sx={{ display: 'flex', gap: 1.5, mt: 3, justifyContent: 'flex-end' }}>
            <Button
              onClick={handleCancel}
              sx={{
                fontSize: '0.875rem',
                fontWeight: 600,
                color: 'text.secondary',
                textTransform: 'none',
              }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleSubmitRecording}
              disableElevation
              sx={{
                fontSize: '0.875rem',
                fontWeight: 600,
                px: 3,
                py: 1,
                borderRadius: 2,
                textTransform: 'none',
              }}
            >
              Process Recording
            </Button>
          </Box>
        </Box>
      </Collapse>
      {/* Pipeline Progress */}
      {pipelineStatus && pipelineProgressJsx}
    </Box>
  );
}
