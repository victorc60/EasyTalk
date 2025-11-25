import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { verifyInitData } from './verifyInitData.js';
import { createSession, finishSession, nextTask, submitAnswer } from './services/sessionService.js';
import { getDailyReview } from './services/reviewService.js';
import { getMetricsSummary } from './services/statsService.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';

app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    credentials: true,
  }),
);
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/auth/verify', (req, res) => {
  const { initData } = req.body || {};
  const botToken = process.env.BOT_TOKEN;

  if (!botToken) {
    return res.status(500).json({ ok: false, error: 'BOT_TOKEN is not configured' });
  }

  const result = verifyInitData(initData, botToken);

  if (!result.ok) {
    return res.status(401).json({ ok: false, error: result.error });
  }

  const user = result.user
    ? {
        id: result.user.id,
        first_name: result.user.first_name,
        username: result.user.username,
      }
    : null;

  res.json({ ok: true, user });
});

app.post('/api/session/start', (req, res) => {
  const { bossId } = req.body || {};
  try {
    const session = createSession({ bossId });
    res.json({ ok: true, ...session });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || 'Cannot create session' });
  }
});

app.get('/api/session/:id/nextTask', (req, res) => {
  const { id } = req.params;
  const payload = nextTask(id);
  if (payload.error) return res.status(400).json({ ok: false, error: payload.error });
  return res.json({ ok: true, ...payload });
});

app.post('/api/session/:id/answer', (req, res) => {
  const { id } = req.params;
  const { taskId, answer } = req.body || {};
  const result = submitAnswer(id, { taskId, answer });
  if (result.error) return res.status(400).json({ ok: false, error: result.error });
  return res.json({ ok: true, ...result });
});

app.post('/api/session/:id/finish', (req, res) => {
  const { id } = req.params;
  const session = finishSession(id);
  if (!session) return res.status(404).json({ ok: false, error: 'Session not found' });

  res.json({ ok: true, finishedAt: session.finished_at || session.finishedAt, errors: session.errors || [] });
});

app.get('/review/daily', (req, res) => {
  const cards = getDailyReview(10);
  res.json({ ok: true, cards });
});

app.get('/admin/metrics', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  const { from, to } = req.query;
  const summary = getMetricsSummary({ from, to });
  res.json({ ok: true, summary });
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT} (CORS: ${FRONTEND_ORIGIN})`);
});
