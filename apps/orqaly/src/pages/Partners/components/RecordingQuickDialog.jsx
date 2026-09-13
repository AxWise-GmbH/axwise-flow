import { useState, useCallback, useEffect } from 'react';
import { Typography, Box, Button, Stack, Chip, alpha, useTheme, Alert } from '@mui/material';
import FormDialog from '../../../components/Common/FormDialog';
import MicIcon from '@mui/icons-material/Mic';
import TopicIcon from '@mui/icons-material/Topic';
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutline';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import PublicIcon from '@mui/icons-material/Public';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import LinkIcon from '@mui/icons-material/Link';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import MeetingRecorder from '../../Meetings/components/MeetingRecorder';
import { useMeetings } from '../../../hooks/useMeetings';
import { partnerService } from '../../../services/partnerService';
import { meetingService } from '../../../services/meetingService';
import { deriveSuggestedPartnerUpdates } from '../../../utils/meetingToPartnerUpdates';

import AppIcon from '../../../components/icons/AppIcon';

/**
 * Quick recording dialog triggered from the Partners table mic icon.
 * Creates a meeting, records audio, runs the transcription pipeline,
 * creates tasks, derives suggested partner updates, and shows a post-meeting summary.
 */
export default function RecordingQuickDialog({ open, partner, onClose }) {
  const theme = useTheme();
  const partnerId = partner?.id;
  const [completedMeeting, setCompletedMeeting] = useState(null);
  const { createMeeting, updateMeeting, finishRecording, deleteMeeting } = useMeetings(partnerId);

  // Reset completed meeting when dialog re-opens or partner changes
  useEffect(() => {
    if (open) setCompletedMeeting(null);
  }, [open, partnerId]);

  const handleRecordingComplete = useCallback(
    async (meeting) => {
      if (meeting?.transcriptStructured && partnerId) {
        await partnerService.createTasksFromMeeting(partnerId, meeting).catch(() => {});
        try {
          const p = await partnerService.getById(partnerId);
          const suggested = deriveSuggestedPartnerUpdates(meeting, p);
          if (suggested.length > 0) {
            await meetingService.update(meeting.id, { suggestedPartnerUpdates: suggested });
          }
        } catch {
          // ignore
        }
      }
      setCompletedMeeting(meeting);
    },
    [partnerId]
  );

  const handleClose = () => {
    setCompletedMeeting(null);
    onClose?.();
  };

  if (!partner) return null;

  const structured = completedMeeting?.transcriptStructured || {};
  const meetingTopic = structured.meeting_topic || completedMeeting?.title || '';
  const summary = structured.summary || '';
  const topics = structured.topics || [];
  const geographicFocus = structured.geographic_focus || [];
  const campaigns = structured.campaigns || [];
  const materialsRequested = structured.materials_requested || [];
  const trafficDiscussion = structured.traffic_discussion || [];
  const detectedParticipants = structured.participants || [];
  const formParticipants = completedMeeting?.participants || [];
  const displayParticipants =
    detectedParticipants.length > 0
      ? detectedParticipants
      : formParticipants.length > 0
        ? formParticipants
        : [partner.name, 'Meeting Participant'];

  const sectionLabel = {
    fontWeight: 700,
    color: 'text.secondary',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    fontSize: '0.7rem',
  };
  const chipSection = (items, colorKey = 'primary') => (
    <Stack direction="row" flexWrap="wrap" gap={0.75}>
      {items.map((item, i) => (
        <Chip
          key={i}
          label={typeof item === 'string' ? item : item.name || String(item)}
          size="small"
          sx={{
            borderRadius: 1.5,
            fontWeight: 500,
            bgcolor: alpha(theme.palette[colorKey].main, 0.08),
            color: `${colorKey}.main`,
          }}
        />
      ))}
    </Stack>
  );

  return (
    <FormDialog
      open={open}
      onClose={handleClose}
      title={completedMeeting ? 'Meeting Processed' : 'Record Meeting'}
      subtitle={
        completedMeeting
          ? `Recording for ${partner.name}`
          : `Recording for ${partner.name} (${partner.userId})`
      }
      icon={completedMeeting ? CheckCircleOutlineIcon : MicIcon}
      iconVariant={completedMeeting ? 'success' : 'error'}
      hideFooter={!completedMeeting}
      actions={
        completedMeeting ? (
          <Button
            onClick={handleClose}
            variant="contained"
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
            Done
          </Button>
        ) : undefined
      }
      contentSx={{ px: 3, py: completedMeeting ? 3 : 2 }}
    >
      {completedMeeting ? (
        /* ─── Post-meeting summary (professional layout) ───────────────── */
        <Stack spacing={2.5}>
          {/* Sample data warning - transcription did not run */}
          {completedMeeting.transcriptSource === 'sample' && (
            <Alert severity="warning" sx={{ borderRadius: 2 }} icon={false}>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                Sample data shown - your recording was not transcribed.
              </Typography>
              {completedMeeting.transcriptError && (
                <Typography variant="body2" sx={{ mb: 1, color: 'error.dark' }}>
                  {completedMeeting.transcriptError}
                </Typography>
              )}
              <Typography
                variant="caption"
                component="div"
                sx={{ color: 'text.secondary', fontWeight: 600 }}
              >
                To enable transcription (free):
              </Typography>
              <Box
                component="ol"
                sx={{ m: 0.5, pl: 2, typography: 'caption', color: 'text.secondary' }}
              >
                <li>
                  Vercel → Project → <strong>Settings</strong> →{' '}
                  <strong>Environment Variables</strong>
                </li>
                <li>
                  Add <code>ASSEMBLYAI_API_KEY</code> and <code>GROQ_API_KEY</code> (both free, no
                  card)
                </li>
                <li>
                  Select <strong>Production</strong>, Save, then <strong>Redeploy</strong>
                </li>
              </Box>
              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                  mt: 0.5,
                  '& a': { color: 'primary.main', textDecoration: 'underline' },
                }}
              >
                Keys:{' '}
                <a href="https://www.assemblyai.com/" target="_blank" rel="noopener noreferrer">
                  AssemblyAI
                </a>
                ,{' '}
                <a href="https://console.groq.com/" target="_blank" rel="noopener noreferrer">
                  Groq
                </a>
              </Typography>
            </Alert>
          )}
          {/* 1. Meeting Topic */}
          {meetingTopic && (
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
                <AppIcon
                  name="Topic"
                  fallback={TopicIcon}
                  sx={{ fontSize: 16, color: 'primary.main' }}
                />
                <Typography variant="caption" sx={sectionLabel}>
                  Meeting Topic
                </Typography>
              </Box>
              <Box
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  bgcolor: alpha(theme.palette.primary.main, 0.04),
                  border: '1px solid',
                  borderColor: alpha(theme.palette.primary.main, 0.12),
                }}
              >
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  {meetingTopic}
                </Typography>
              </Box>
            </Box>
          )}
          {/* 2. Executive Summary */}
          {summary && (
            <Box>
              <Typography variant="caption" sx={{ ...sectionLabel, mb: 0.75, display: 'block' }}>
                Executive Summary
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.7 }}>
                {summary}
              </Typography>
            </Box>
          )}
          {/* 3. Geographic Focus (e.g. Germany, DACH) */}
          {geographicFocus.length > 0 && (
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
                <AppIcon
                  name="Public"
                  fallback={PublicIcon}
                  sx={{ fontSize: 16, color: 'primary.main' }}
                />
                <Typography variant="caption" sx={sectionLabel}>
                  Geographic Focus
                </Typography>
              </Box>
              {chipSection(geographicFocus)}
            </Box>
          )}
          {/* 4. Campaigns */}
          {campaigns.length > 0 && (
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
                <AppIcon
                  name="CampaignOutlined"
                  fallback={CampaignOutlinedIcon}
                  sx={{ fontSize: 16, color: 'primary.main' }}
                />
                <Typography variant="caption" sx={sectionLabel}>
                  Campaigns
                </Typography>
              </Box>
              {chipSection(campaigns)}
            </Box>
          )}
          {/* 5. Materials Requested (landing pages, links, creatives) */}
          {materialsRequested.length > 0 && (
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
                <AppIcon
                  name="Link"
                  fallback={LinkIcon}
                  sx={{ fontSize: 16, color: 'primary.main' }}
                />
                <Typography variant="caption" sx={sectionLabel}>
                  Materials Requested
                </Typography>
              </Box>
              {chipSection(materialsRequested, 'info')}
            </Box>
          )}
          {/* 6. Traffic Discussion */}
          {trafficDiscussion.length > 0 && (
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
                <AppIcon
                  name="TrendingUp"
                  fallback={TrendingUpIcon}
                  sx={{ fontSize: 16, color: 'primary.main' }}
                />
                <Typography variant="caption" sx={sectionLabel}>
                  Traffic & Performance
                </Typography>
              </Box>
              {chipSection(trafficDiscussion)}
            </Box>
          )}
          {/* 7. Key Topics */}
          {topics.length > 0 && (
            <Box>
              <Typography variant="caption" sx={{ ...sectionLabel, mb: 0.75, display: 'block' }}>
                Key Topics
              </Typography>
              {chipSection(topics.slice(0, 10))}
            </Box>
          )}
          {/* 8. Participants */}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
              <AppIcon
                name="PeopleOutline"
                fallback={PeopleOutlineIcon}
                sx={{ fontSize: 16, color: 'primary.main' }}
              />
              <Typography variant="caption" sx={sectionLabel}>
                Participants
              </Typography>
            </Box>
            <Stack direction="row" flexWrap="wrap" gap={0.75}>
              {displayParticipants.map((p, i) => (
                <Chip
                  key={i}
                  label={typeof p === 'string' ? p : p.name || String(p)}
                  size="small"
                  variant="outlined"
                  sx={{ borderRadius: 1.5, fontWeight: 500 }}
                />
              ))}
            </Stack>
          </Box>
          {/* No transcript fallback */}
          {!meetingTopic &&
            !summary &&
            topics.length === 0 &&
            geographicFocus.length === 0 &&
            campaigns.length === 0 &&
            materialsRequested.length === 0 &&
            trafficDiscussion.length === 0 && (
              <Box
                sx={{
                  p: 2,
                  borderRadius: 2,
                  bgcolor: alpha(theme.palette.warning.main, 0.06),
                  border: '1px solid',
                  borderColor: alpha(theme.palette.warning.main, 0.2),
                  textAlign: 'center',
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                  Meeting recorded successfully
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  Transcript details will appear once processing completes. You can view the full
                  meeting from the Meetings page.
                </Typography>
              </Box>
            )}
        </Stack>
      ) : (
        /* ─── Recording flow ────────────────────────────────────────── */
        <MeetingRecorder
          partnerId={partnerId}
          partnerName={partner.name}
          onCreateMeeting={createMeeting}
          onUpdateMeeting={updateMeeting}
          onFinishRecording={finishRecording}
          onDeleteMeeting={deleteMeeting}
          onRecordingComplete={handleRecordingComplete}
          onClose={handleClose}
        />
      )}
    </FormDialog>
  );
}
