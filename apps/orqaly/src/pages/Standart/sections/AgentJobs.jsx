/**
 * The chip selector and the phone beside it.
 *
 * The chips are use cases rather than the product's internal seat names. A
 * business owner is picking a job to hand over, not a role on a review panel -
 * and the internal names appear a section earlier anyway, where they are the
 * point.
 *
 * The phone re-keys on the message, so switching chips replays the thread rather
 * than swapping the words under one that has already finished animating. The
 * fact list beneath is what actually carries the claims; the phone is the part
 * that makes them feel like something that happens rather than something offered.
 */
import { useState } from 'react';
import { Box } from '@mui/material';
import { JOBS } from '../standartCopy';
import { INK, TYPE } from '../standartTokens';
import { PANE_SWAP_MS, REDUCED_MOTION, SETTLE } from '../standartMotion';
import SectionShell from '../primitives/SectionShell';
import SectionReveal from '../primitives/SectionReveal';
import ChipTabs, { ChipTabPanel } from '../primitives/ChipTabs';
import MockRoomThread from '../mocks/MockRoomThread';

export default function AgentJobs() {
  const [jobId, setJobId] = useState(JOBS.jobs[0].id);
  const job = JOBS.jobs.find((j) => j.id === jobId) ?? JOBS.jobs[0];

  return (
    <SectionShell id="work" heading={JOBS.heading}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr 340px' },
          gap: { xs: 4, md: 6 },
          alignItems: 'start',
        }}
      >
        <SectionReveal index={0} sx={{ display: 'grid', gap: 3, minWidth: 0 }}>
          <ChipTabs
            items={JOBS.jobs.map((j) => ({ id: j.id, label: j.label }))}
            value={jobId}
            onChange={setJobId}
            idPrefix="standart-jobs"
            label="Jobs an agent can take"
          />

          <ChipTabPanel idPrefix="standart-jobs" value={jobId}>
            <Box
              // Keyed on the job so the pane replays rather than cross-fading
              // into itself, which reads as a flicker.
              key={jobId}
              sx={{
                display: 'grid',
                gap: 2,
                animation: `standartPaneIn ${PANE_SWAP_MS}ms ${SETTLE} both`,
                '@keyframes standartPaneIn': {
                  from: { opacity: 0, transform: 'translateY(8px)' },
                  to: { opacity: 1, transform: 'none' },
                },
                [REDUCED_MOTION]: { animation: 'none', opacity: 1, transform: 'none' },
              }}
            >
              <Box component="p" sx={{ ...TYPE.lead, color: INK.dim, m: 0, maxWidth: 520 }}>
                {job.body}
              </Box>
              <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1 }}>
                {job.facts.map((fact) => (
                  <Box
                    component="li"
                    key={fact}
                    sx={{ display: 'flex', gap: 1.25, alignItems: 'baseline' }}
                  >
                    <Box
                      aria-hidden="true"
                      sx={{
                        width: 4,
                        height: 4,
                        borderRadius: '50%',
                        bgcolor: INK.dimmer,
                        flexShrink: 0,
                        transform: 'translateY(-3px)',
                      }}
                    />
                    <Box sx={{ ...TYPE.body, color: INK.dim }}>{fact}</Box>
                  </Box>
                ))}
              </Box>
            </Box>
          </ChipTabPanel>
        </SectionReveal>

        <SectionReveal index={1}>
          <MockRoomThread speaker={job.label} message={job.message} />
        </SectionReveal>
      </Box>
    </SectionShell>
  );
}
