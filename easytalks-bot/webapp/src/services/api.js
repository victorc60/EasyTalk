const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

export async function verify(initData) {
  const res = await fetch(`${API_BASE}/api/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Auth failed');
  }
  return res.json();
}

export async function startSession(bossId) {
  const res = await fetch(`${API_BASE}/api/session/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bossId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Cannot start session');
  }
  return res.json();
}

export async function nextTask(sessionId) {
  const res = await fetch(`${API_BASE}/api/session/${sessionId}/nextTask`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Cannot load task');
  }
  return res.json();
}

export async function answerTask(sessionId, payload) {
  const res = await fetch(`${API_BASE}/api/session/${sessionId}/answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Cannot submit answer');
  }
  return res.json();
}

export async function finishSession(sessionId) {
  const res = await fetch(`${API_BASE}/api/session/${sessionId}/finish`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Cannot finish session');
  }
  return res.json();
}

export async function fetchDailyReview() {
  const res = await fetch(`${API_BASE}/review/daily`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Cannot load review');
  }
  return res.json();
}

export async function fetchAdminMetrics(token) {
  const res = await fetch(`${API_BASE}/admin/metrics`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Cannot load metrics');
  }
  return res.json();
}
