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
const FRONTEND_ORIGINS = (process.env.FRONTEND_ORIGINS || process.env.FRONTEND_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const allowAllOrigins = FRONTEND_ORIGINS.length === 0;

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // same-origin / curl
    if (allowAllOrigins || FRONTEND_ORIGINS.includes(origin)) return callback(null, true);
    console.warn(`CORS blocked for origin: ${origin}`);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/auth/verify', (req, res) => {
  const { initData } = req.body || {};
  console.log('[BG] auth request (guest mode)', { hasInitData: Boolean(initData) });
  // Полный гостевой режим: никаких проверок не делаем
  res.json({
    ok: true,
    user: { id: 'guest', first_name: 'Guest', username: 'guest' },
    mode: 'guest',
  });
});

app.post('/api/session/start', (req, res) => {
  const { bossId } = req.body || {};
  const requestId = Date.now();
  
  console.log(`[BG:${requestId}] session/start request`, { 
    bossId, 
    body: req.body,
    headers: req.headers,
    timestamp: new Date().toISOString()
  });
  
  if (!bossId) {
    console.error(`[BG:${requestId}] session/start error: bossId is missing`, { body: req.body });
    return res.status(400).json({ ok: false, error: 'bossId is required' });
  }
  
  try {
    console.log(`[BG:${requestId}] creating session for bossId:`, bossId);
    const session = createSession({ bossId });
    
    console.log(`[BG:${requestId}] session created successfully`, { 
      sessionId: session.sessionId,
      boss: session.boss,
      seed: session.seed,
      serverNow: session.serverNow
    });
    
    res.json({ ok: true, ...session });
  } catch (err) {
    console.error(`[BG:${requestId}] session/start error`, {
      message: err?.message,
      stack: err?.stack,
      bossId,
      errorName: err?.name
    });
    res.status(400).json({ ok: false, error: err.message || 'Cannot create session' });
  }
});

app.get('/api/session/:id/nextTask', (req, res) => {
  const { id } = req.params;
  const requestId = Date.now();
  
  console.log(`[BG:${requestId}] nextTask request`, { sessionId: id });
  
  try {
    const payload = nextTask(id);
    
    if (payload.error) {
      console.error(`[BG:${requestId}] nextTask error`, { sessionId: id, error: payload.error });
      return res.status(400).json({ ok: false, error: payload.error });
    }
    
    console.log(`[BG:${requestId}] nextTask success`, { 
      sessionId: id, 
      hasTask: !!payload.task,
      done: payload.done 
    });
    
    return res.json({ ok: true, ...payload });
  } catch (err) {
    console.error(`[BG:${requestId}] nextTask exception`, {
      sessionId: id,
      error: err.message,
      stack: err.stack
    });
    return res.status(500).json({ ok: false, error: err.message || 'Internal server error' });
  }
});

app.post('/api/session/:id/answer', (req, res) => {
  const { id } = req.params;
  const { taskId, answer } = req.body || {};
  const requestId = Date.now();
  
  console.log(`[BG:${requestId}] answer request`, { sessionId: id, taskId, answer });
  
  if (!taskId || !answer) {
    console.error(`[BG:${requestId}] answer validation error`, { sessionId: id, body: req.body });
    return res.status(400).json({ ok: false, error: 'taskId and answer are required' });
  }
  
  try {
    const result = submitAnswer(id, { taskId, answer });
    
    if (result.error) {
      console.warn(`[BG:${requestId}] answer error`, { sessionId: id, error: result.error });
      return res.status(400).json({ ok: false, error: result.error });
    }
    
    console.log(`[BG:${requestId}] answer success`, { 
      sessionId: id, 
      isCorrect: result.isCorrect,
      done: result.done 
    });
    
    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error(`[BG:${requestId}] answer exception`, {
      sessionId: id,
      error: err.message,
      stack: err.stack
    });
    return res.status(500).json({ ok: false, error: err.message || 'Internal server error' });
  }
});

app.post('/api/session/:id/finish', (req, res) => {
  const { id } = req.params;
  const requestId = Date.now();
  
  console.log(`[BG:${requestId}] finish request`, { sessionId: id });
  
  try {
    const session = finishSession(id);
    
    if (!session) {
      console.warn(`[BG:${requestId}] finish not found`, { sessionId: id });
      return res.status(404).json({ ok: false, error: 'Session not found' });
    }

    console.log(`[BG:${requestId}] finish success`, { 
      sessionId: id,
      errorsCount: session.errors?.length || 0 
    });
    
    res.json({ ok: true, finishedAt: session.finished_at || session.finishedAt, errors: session.errors || [] });
  } catch (err) {
    console.error(`[BG:${requestId}] finish exception`, {
      sessionId: id,
      error: err.message,
      stack: err.stack
    });
    return res.status(500).json({ ok: false, error: err.message || 'Internal server error' });
  }
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
  console.log(
    `Backend running on http://localhost:${PORT} (CORS: ${
      allowAllOrigins ? 'all' : FRONTEND_ORIGINS.join(', ')
    })`,
  );
});
