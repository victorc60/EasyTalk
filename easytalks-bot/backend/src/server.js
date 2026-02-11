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

// КРИТИЧЕСКИ ВАЖНО: Обработка OPTIONS должна быть САМОЙ ПЕРВОЙ
// Express обрабатывает роуты в порядке их регистрации, поэтому app.options должен быть ПЕРВЫМ

// Функция для установки CORS заголовков
const setCorsHeaders = (req, res) => {
  const origin = req.headers.origin;
  
  // Разрешаем все origins
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Access-Control-Allow-Credentials', 'false');
};

// ЯВНАЯ ОБРАБОТКА OPTIONS ДЛЯ ВСЕХ ПУТЕЙ - ДО ВСЕХ ДРУГИХ РОУТОВ
app.options('*', (req, res) => {
  setCorsHeaders(req, res);
  console.log(`[CORS] OPTIONS handler for: ${req.headers.origin || 'no origin'} to ${req.path}`);
  res.status(204).end();
});

// Обрабатываем OPTIONS запросы в middleware - ДО всех других middleware
app.use((req, res, next) => {
  setCorsHeaders(req, res);
  
  // Если это OPTIONS запрос, сразу отвечаем (на случай если app.options не сработал)
  if (req.method === 'OPTIONS') {
    console.log(`[CORS] Middleware OPTIONS from: ${req.headers.origin || 'no origin'} to ${req.path}`);
    return res.status(204).end();
  }
  
  next();
});

// Применяем CORS middleware как дополнительную защиту
app.use(cors({
  origin: true, // Разрешаем все origins
  credentials: false,
  methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  maxAge: 86400
}));

// Middleware для логирования запросов
app.use((req, res, next) => {
  const origin = req.headers.origin;
  
  // Логирование всех запросов
  if (req.method !== 'OPTIONS') {
    console.log(`[Request] ${req.method} ${req.path}`, {
      origin: origin || 'no origin',
      userAgent: req.headers['user-agent']?.substring(0, 50),
      contentType: req.headers['content-type']
    });
  } else {
    console.log(`[CORS] Preflight OPTIONS request from: ${origin || 'no origin'} to ${req.path}`);
  }
  
  next();
});

app.use(express.json());

// Middleware для обработки ошибок CORS
app.use((err, req, res, next) => {
  if (err.message && err.message.includes('CORS')) {
    const origin = req.headers.origin;
    console.error(`[CORS Error] ${req.method} ${req.path}`, {
      origin,
      error: err.message
    });
    return res.status(403).json({
      ok: false,
      error: 'CORS policy violation',
      message: `Origin ${origin} is not allowed`
    });
  }
  next(err);
});

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

// Явная обработка OPTIONS для конкретных API путей (на случай если app.options('*') не сработает)
app.options('/api/session/start', (req, res) => {
  setCorsHeaders(req, res);
  console.log(`[CORS] OPTIONS /api/session/start from: ${req.headers.origin || 'no origin'}`);
  res.status(204).end();
});

app.options('/api/session/:id/nextTask', (req, res) => {
  setCorsHeaders(req, res);
  res.status(204).end();
});

app.options('/api/session/:id/answer', (req, res) => {
  setCorsHeaders(req, res);
  res.status(204).end();
});

app.options('/api/session/:id/finish', (req, res) => {
  setCorsHeaders(req, res);
  res.status(204).end();
});

app.post('/api/session/start', (req, res) => {
  const { bossId } = req.body || {};
  const requestId = Date.now();
  const origin = req.headers.origin;
  
  // CORS заголовки уже установлены в middleware выше
  
  console.log(`[BG:${requestId}] session/start request`, { 
    bossId, 
    body: req.body,
    origin,
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
  console.log(`[Server] Backend running on http://localhost:${PORT}`);
  console.log(`[CORS] Configuration:`, {
    allowAllOrigins,
    allowedOrigins: allowAllOrigins ? 'ALL (wildcard)' : FRONTEND_ORIGINS,
    vercelDomains: '*.vercel.app (auto-allowed)'
  });
});
