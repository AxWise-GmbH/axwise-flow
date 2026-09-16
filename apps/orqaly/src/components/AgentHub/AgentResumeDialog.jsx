/**
 * AgentResumeDialog — Professional resume viewer popup with PDF download.
 */
import { Box, Typography, Chip, Button, Divider, alpha, useTheme } from '@mui/material';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import WorkOutlineIcon from '@mui/icons-material/WorkOutline';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import FormDialog from '../Common/FormDialog';
import { printAgentResume } from '../../utils/agentResumePdf';

import AppIcon from '../icons/AppIcon';

export default function AgentResumeDialog({ open, onClose, agent }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const resume = agent?.resume;

  if (!agent) return null;

  const skills = Array.isArray(resume?.skills) ? resume.skills : [];
  const experience = Array.isArray(resume?.experience) ? resume.experience : [];
  const stats = resume?.stats || {};
  const certs = Array.isArray(resume?.certifications) ? resume.certifications : [];
  const hasResume = resume && (resume.headline || resume.summary || skills.length > 0);

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title={`${agent.role || agent.name || 'Agent'} — Resume`}
      subtitle={agent.category ? agent.category.toUpperCase() : undefined}
      icon={DescriptionOutlinedIcon}
      contentSx={{ pt: 3, pb: 2 }}
      actions={
        <>
          <Button onClick={onClose} sx={{ textTransform: 'none' }}>
            Close
          </Button>
          {hasResume && (
            <Button
              variant="contained"
              startIcon={
                <AppIcon name="PictureAsPdfOutlined" fallback={PictureAsPdfOutlinedIcon} />
              }
              onClick={() => printAgentResume(agent, resume)}
              sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2, px: 3 }}
            >
              Download PDF
            </Button>
          )}
        </>
      }
    >
      {!hasResume ? (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <AppIcon
            name="DescriptionOutlined"
            fallback={DescriptionOutlinedIcon}
            sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }}
          />
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            No resume generated yet. Use "Generate Resume" in the edit form to create one.
          </Typography>
        </Box>
      ) : (
        <Box>
          {resume.headline && (
            <Typography variant="body1" sx={{ fontWeight: 600, color: 'primary.main', mb: 2 }}>
              {resume.headline}
            </Typography>
          )}

          {resume.summary && (
            <Box sx={{ mb: 2.5 }}>
              <Typography
                variant="overline"
                sx={{
                  color: 'text.secondary',
                  fontWeight: 700,
                  fontSize: '0.7rem',
                  letterSpacing: '0.08em',
                }}
              >
                Summary
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5, lineHeight: 1.6, color: 'text.primary' }}>
                {resume.summary}
              </Typography>
            </Box>
          )}

          {skills.length > 0 && (
            <Box sx={{ mb: 2.5 }}>
              <Typography
                variant="overline"
                sx={{
                  color: 'text.secondary',
                  fontWeight: 700,
                  fontSize: '0.7rem',
                  letterSpacing: '0.08em',
                }}
              >
                Skills
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 0.5 }}>
                {skills.map((s) => (
                  <Chip
                    key={s}
                    label={s}
                    size="small"
                    sx={{
                      fontWeight: 500,
                      fontSize: '0.72rem',
                      bgcolor: alpha(theme.palette.primary.main, isDark ? 0.12 : 0.08),
                      color: 'primary.main',
                    }}
                  />
                ))}
              </Box>
            </Box>
          )}

          <Divider sx={{ my: 2 }} />

          {experience.length > 0 && (
            <Box sx={{ mb: 2.5 }}>
              <Typography
                variant="overline"
                sx={{
                  color: 'text.secondary',
                  fontWeight: 700,
                  fontSize: '0.7rem',
                  letterSpacing: '0.08em',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                }}
              >
                <AppIcon name="WorkOutline" fallback={WorkOutlineIcon} sx={{ fontSize: 14 }} />{' '}
                Experience
              </Typography>
              <Box sx={{ mt: 1 }}>
                {experience.map((e, i) => (
                  <Box
                    key={i}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      py: 0.75,
                      borderBottom: i < experience.length - 1 ? '1px solid' : 'none',
                      borderColor: 'divider',
                    }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {e.title}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 2 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {e.count || 0} tasks
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{
                          color: e.successRate >= 90 ? 'success.main' : 'text.secondary',
                          fontWeight: 600,
                        }}
                      >
                        {e.successRate != null ? `${e.successRate}%` : '—'}
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>
          )}

          <Box sx={{ mb: 2.5 }}>
            <Typography
              variant="overline"
              sx={{
                color: 'text.secondary',
                fontWeight: 700,
                fontSize: '0.7rem',
                letterSpacing: '0.08em',
              }}
            >
              Performance
            </Typography>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
                gap: 1.5,
                mt: 1,
              }}
            >
              {[
                { label: 'Total Tasks', value: stats.totalTasks ?? 0 },
                { label: 'Completed', value: stats.completedTasks ?? 0 },
                {
                  label: 'Success Rate',
                  value: stats.successRate != null ? `${stats.successRate}%` : '—',
                },
                { label: 'Avg Cost', value: `$${Number(stats.avgCostPerTask || 0).toFixed(4)}` },
                { label: 'Total Cost', value: `$${Number(stats.totalCostUsd || 0).toFixed(2)}` },
              ].map((s) => (
                <Box
                  key={s.label}
                  sx={{
                    textAlign: 'center',
                    p: 1,
                    borderRadius: 2,
                    bgcolor: alpha(theme.palette.background.default, isDark ? 0.3 : 1),
                    border: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '1rem' }}>
                    {s.value}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ color: 'text.disabled', fontSize: '0.65rem', textTransform: 'uppercase' }}
                  >
                    {s.label}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>

          {certs.length > 0 && (
            <Box sx={{ mb: 1 }}>
              <Typography
                variant="overline"
                sx={{
                  color: 'text.secondary',
                  fontWeight: 700,
                  fontSize: '0.7rem',
                  letterSpacing: '0.08em',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                }}
              >
                <AppIcon
                  name="CheckCircleOutline"
                  fallback={CheckCircleOutlineIcon}
                  sx={{ fontSize: 14 }}
                />{' '}
                Certifications
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 0.5 }}>
                {certs.map((c) => (
                  <Chip
                    key={c}
                    label={c}
                    size="small"
                    variant="outlined"
                    sx={{ fontWeight: 500, fontSize: '0.72rem' }}
                  />
                ))}
              </Box>
            </Box>
          )}
        </Box>
      )}
    </FormDialog>
  );
}
