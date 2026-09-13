/**
 * CompanyBriefCard - Step 4 (semantic mapping). The assistant interviews the
 * company one question at a time. Each "Next" stores the answer and asks the
 * server for the next question, which adapts to what was said so far (a
 * clarifying follow-up when an answer is thin, otherwise a new topic). The
 * server returns `done` once it has enough or the cap is reached.
 *
 * Graceful fallback: if the backend doesn't support `next-question` yet (older
 * deployment), the card falls back once to the legacy fixed-batch endpoint and
 * serves those questions locally, so the brief still works end to end.
 */
import { useEffect, useRef, useState } from 'react';
import { Box, TextField, Typography, LinearProgress } from '@mui/material';
import QuizRoundedIcon from '@mui/icons-material/QuizRounded';
import {
  nextBriefQuestion,
  generateBriefQuestions,
  answerBriefQuestion,
} from '../../../services/companyBriefService';
import SetupCardShell from './SetupCardShell';

export default function CompanyBriefCard({ onComplete, onSkip, embedded }) {
  const [briefId, setBriefId] = useState(null);
  const [question, setQuestion] = useState(null); // { id, text } | null when done/failed
  const [index, setIndex] = useState(0);
  const [max, setMax] = useState(0);
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [failed, setFailed] = useState(false); // load failed -> show retry, not "done"

  const mode = useRef('server'); // 'server' | 'fallback'
  const queue = useRef([]); // fallback question batch
  const pos = useRef(0); // fallback cursor

  // Pull the next question. Server-driven by default; on the first server error
  // (e.g. a backend without next-question) switch once to the legacy batch.
  const pullNext = async (id) => {
    if (mode.current === 'fallback') {
      const q = queue.current[pos.current];
      if (!q) return { briefId: id, done: true, index: pos.current, max: queue.current.length };
      pos.current += 1;
      return {
        briefId: id,
        question: q,
        index: pos.current,
        max: queue.current.length,
        done: false,
      };
    }
    try {
      return await nextBriefQuestion({ briefId: id });
    } catch {
      const r = await generateBriefQuestions(); // throws if this also fails
      mode.current = 'fallback';
      queue.current = Array.isArray(r.questions) ? r.questions : [];
      pos.current = 0;
      const q = queue.current[pos.current];
      if (!q) return { briefId: r.briefId, done: true, index: 0, max: 0 };
      pos.current += 1;
      return { briefId: r.briefId, question: q, index: 1, max: queue.current.length, done: false };
    }
  };

  const applyNext = (r) => {
    if (r.briefId) setBriefId(r.briefId);
    if (r.max) setMax(r.max);
    const isDone = r.done || !r.question;
    setIndex(r.index ?? (isDone ? index : index + 1));
    setQuestion(isDone ? null : r.question);
    return isDone;
  };

  const load = async (id) => {
    setError(null);
    setFailed(false);
    setLoading(true);
    try {
      applyNext(await pullNext(id));
    } catch (err) {
      setError(err.message || 'Could not start the brief.');
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      if (active) await load(null);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = () => onComplete({ config: { brief: { answered: index } } });

  const handleNext = async () => {
    if (!question) {
      finish();
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await answerBriefQuestion({
        briefId,
        questionId: question.id,
        question: question.text,
        answer: answer.trim(),
      });
      const r = await pullNext(briefId);
      setAnswer('');
      if (applyNext(r)) onComplete({ config: { brief: { answered: r.index ?? index } } });
    } catch (err) {
      setError(err.message || 'Could not save your answer.');
    } finally {
      setBusy(false);
    }
  };

  const progress = max ? Math.min(100, Math.round((index / max) * 100)) : 0;
  const primaryLabel = loading
    ? 'Loading...'
    : failed
      ? 'Try again'
      : question
        ? 'Next'
        : 'Finish brief';
  const onPrimary = failed ? () => load(briefId) : handleNext;

  return (
    <SetupCardShell
      title="Company brief"
      icon={QuizRoundedIcon}
      embedded={embedded}
      primaryLabel={primaryLabel}
      onPrimary={onPrimary}
      primaryDisabled={loading}
      busy={busy}
      onSkip={onSkip}
      error={error}
    >
      {loading ? (
        <LinearProgress sx={{ borderRadius: 1 }} />
      ) : failed ? (
        <Typography variant="body2" color="text.secondary">
          I couldn&apos;t start the brief just now. Try again, or skip this for now.
        </Typography>
      ) : question ? (
        <Box>
          <Typography variant="caption" color="text.secondary">
            Question {index}
            {max ? ` of up to ${max}` : ''}
          </Typography>
          {max ? (
            <LinearProgress
              variant="determinate"
              value={progress}
              sx={{ borderRadius: 1, my: 0.5 }}
            />
          ) : null}
          <Typography sx={{ fontWeight: 600, my: 0.75 }}>{question.text}</Typography>
          <TextField
            size="small"
            fullWidth
            multiline
            minRows={2}
            maxRows={5}
            autoFocus
            placeholder="Your answer (you can skip any you're unsure about)"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
        </Box>
      ) : (
        <Typography variant="body2" color="text.secondary">
          That&apos;s everything I need for now - thanks. You can finish this step.
        </Typography>
      )}
    </SetupCardShell>
  );
}
