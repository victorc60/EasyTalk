const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

const log = (step, payload = {}) => {
  // Простая консольная трассировка для диагностики
  console.info(`[BossApp] ${step}`, payload);
};

export async function verify(initData) {
  log('verify:init', { hasInitData: Boolean(initData), api: API_BASE });
  // Полный гостевой режим: никаких сетевых запросов, сразу возвращаем гостя
  return { ok: true, user: { id: 'guest', username: 'guest' }, mode: 'guest' };
}

export async function startSession(bossId) {
  log('session:start', { bossId, api: API_BASE });
  const res = await fetch(`${API_BASE}/api/session/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bossId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    log('session:start:error', { status: res.status, err });
    throw new Error(err.error || 'Cannot start session');
  }
  log('session:start:ok');
  return res.json();
}

export async function nextTask(sessionId) {
  log('task:next', { sessionId });
  const res = await fetch(`${API_BASE}/api/session/${sessionId}/nextTask`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    log('task:next:error', { status: res.status, err });
    throw new Error(err.error || 'Cannot load task');
  }
  return res.json();
}

export async function answerTask(sessionId, payload) {
  log('task:answer', { sessionId, payload });
  const res = await fetch(`${API_BASE}/api/session/${sessionId}/answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    log('task:answer:error', { status: res.status, err });
    throw new Error(err.error || 'Cannot submit answer');
  }
  return res.json();
}

export async function finishSession(sessionId) {
  log('session:finish', { sessionId });
  const res = await fetch(`${API_BASE}/api/session/${sessionId}/finish`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    log('session:finish:error', { status: res.status, err });
    throw new Error(err.error || 'Cannot finish session');
  }
  return res.json();
}

export async function fetchDailyReview() {
  log('review:load');
  const res = await fetch(`${API_BASE}/review/daily`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    log('review:load:error', { status: res.status, err });
    throw new Error(err.error || 'Cannot load review');
  }
  return res.json();
}

export async function fetchAdminMetrics(token) {
  log('admin:metrics', { hasToken: Boolean(token) });
  const res = await fetch(`${API_BASE}/admin/metrics`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    log('admin:metrics:error', { status: res.status, err });
    throw new Error(err.error || 'Cannot load metrics');
  }
  return res.json();
}
