const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';
const REQUEST_TIMEOUT = 30000; // 30 секунд

const log = (step, payload = {}) => {
  // Простая консольная трассировка для диагностики
  console.info(`[BossApp] ${step}`, payload);
};

// Утилита для fetch с timeout
const fetchWithTimeout = async (url, options = {}, timeout = REQUEST_TIMEOUT) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeout}ms`);
    }
    throw err;
  }
};

export async function verify(initData) {
  log('verify:init', { hasInitData: Boolean(initData), api: API_BASE });
  // Полный гостевой режим: никаких сетевых запросов, сразу возвращаем гостя
  return { ok: true, user: { id: 'guest', username: 'guest' }, mode: 'guest' };
}

export async function startSession(bossId) {
  const url = `${API_BASE}/api/session/start`;
  const requestBody = { bossId };
  
  log('session:start:init', { bossId, api: API_BASE, url, requestBody });
  
  try {
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    
    log('session:start:response', { 
      status: res.status, 
      statusText: res.statusText,
      ok: res.ok,
      headers: Object.fromEntries(res.headers.entries())
    });
    
    if (!res.ok) {
      let errorData;
      try {
        errorData = await res.json();
      } catch (e) {
        errorData = { error: `HTTP ${res.status}: ${res.statusText}` };
      }
      
      log('session:start:error', { 
        status: res.status, 
        statusText: res.statusText,
        error: errorData,
        bossId,
        url
      });
      
      throw new Error(errorData.error || `Cannot start session (HTTP ${res.status})`);
    }
    
    const data = await res.json();
    log('session:start:success', { 
      sessionId: data.sessionId,
      boss: data.boss,
      seed: data.seed,
      serverNow: data.serverNow
    });
    
    return data;
  } catch (err) {
    log('session:start:exception', { 
      error: err.message,
      stack: err.stack,
      bossId,
      url
    });
    throw err;
  }
}

export async function nextTask(sessionId) {
  const url = `${API_BASE}/api/session/${sessionId}/nextTask`;
  log('task:next:init', { sessionId, url });
  
  try {
    const res = await fetchWithTimeout(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    
    log('task:next:response', { status: res.status, ok: res.ok });
    
    if (!res.ok) {
      let errorData;
      try {
        errorData = await res.json();
      } catch (e) {
        errorData = { error: `HTTP ${res.status}: ${res.statusText}` };
      }
      
      log('task:next:error', { status: res.status, error: errorData, sessionId });
      throw new Error(errorData.error || `Cannot load task (HTTP ${res.status})`);
    }
    
    const data = await res.json();
    log('task:next:success', { hasTask: !!data.task, done: data.done });
    return data;
  } catch (err) {
    log('task:next:exception', { error: err.message, stack: err.stack, sessionId });
    throw err;
  }
}

export async function answerTask(sessionId, payload) {
  const url = `${API_BASE}/api/session/${sessionId}/answer`;
  log('task:answer:init', { sessionId, payload, url });
  
  try {
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    
    log('task:answer:response', { status: res.status, ok: res.ok });
    
    if (!res.ok) {
      let errorData;
      try {
        errorData = await res.json();
      } catch (e) {
        errorData = { error: `HTTP ${res.status}: ${res.statusText}` };
      }
      
      log('task:answer:error', { status: res.status, error: errorData, sessionId, payload });
      throw new Error(errorData.error || `Cannot submit answer (HTTP ${res.status})`);
    }
    
    const data = await res.json();
    log('task:answer:success', { done: data.done, isCorrect: data.isCorrect });
    return data;
  } catch (err) {
    log('task:answer:exception', { error: err.message, stack: err.stack, sessionId, payload });
    throw err;
  }
}

export async function finishSession(sessionId) {
  const url = `${API_BASE}/api/session/${sessionId}/finish`;
  log('session:finish:init', { sessionId, url });
  
  try {
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    
    log('session:finish:response', { status: res.status, ok: res.ok });
    
    if (!res.ok) {
      let errorData;
      try {
        errorData = await res.json();
      } catch (e) {
        errorData = { error: `HTTP ${res.status}: ${res.statusText}` };
      }
      
      log('session:finish:error', { status: res.status, error: errorData, sessionId });
      throw new Error(errorData.error || `Cannot finish session (HTTP ${res.status})`);
    }
    
    const data = await res.json();
    log('session:finish:success', { errorsCount: data.errors?.length || 0 });
    return data;
  } catch (err) {
    log('session:finish:exception', { error: err.message, stack: err.stack, sessionId });
    throw err;
  }
}

export async function fetchDailyReview() {
  const url = `${API_BASE}/review/daily`;
  log('review:load:init', { url });
  
  try {
    const res = await fetchWithTimeout(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    
    log('review:load:response', { status: res.status, ok: res.ok });
    
    if (!res.ok) {
      let errorData;
      try {
        errorData = await res.json();
      } catch (e) {
        errorData = { error: `HTTP ${res.status}: ${res.statusText}` };
      }
      
      log('review:load:error', { status: res.status, error: errorData });
      throw new Error(errorData.error || `Cannot load review (HTTP ${res.status})`);
    }
    
    const data = await res.json();
    log('review:load:success', { cardsCount: data.cards?.length || 0 });
    return data;
  } catch (err) {
    log('review:load:exception', { error: err.message, stack: err.stack });
    throw err;
  }
}

export async function fetchAdminMetrics(token) {
  const url = `${API_BASE}/admin/metrics`;
  log('admin:metrics:init', { hasToken: Boolean(token), url });
  
  try {
    const res = await fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    
    log('admin:metrics:response', { status: res.status, ok: res.ok });
    
    if (!res.ok) {
      let errorData;
      try {
        errorData = await res.json();
      } catch (e) {
        errorData = { error: `HTTP ${res.status}: ${res.statusText}` };
      }
      
      log('admin:metrics:error', { status: res.status, error: errorData });
      throw new Error(errorData.error || `Cannot load metrics (HTTP ${res.status})`);
    }
    
    const data = await res.json();
    log('admin:metrics:success', { total: data.summary?.total || 0 });
    return data;
  } catch (err) {
    log('admin:metrics:exception', { error: err.message, stack: err.stack });
    throw err;
  }
}
