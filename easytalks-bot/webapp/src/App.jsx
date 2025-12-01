import { useEffect, useMemo, useState, useCallback } from 'react';
import './App.css';
import { BossSelect } from './components/BossSelect.jsx';
import { Battle } from './components/Battle.jsx';
import { Result } from './components/Result.jsx';
import { ReviewSession } from './components/ReviewSession.jsx';
import { BOSSES } from './data/mocks.js';
import { answerTask, finishSession, nextTask, startSession, fetchDailyReview, fetchAdminMetrics } from './services/api.js';
import { AdminPanel } from './components/AdminPanel.jsx';

const ADMIN_TOKEN = import.meta.env.VITE_ADMIN_TOKEN;
const adminEnabled = Boolean(ADMIN_TOKEN);

const readInitData = () => {
  const fromTelegram = window.Telegram?.WebApp?.initData;
  const mock = import.meta.env.VITE_MOCK_INIT_DATA;

  if (fromTelegram && fromTelegram.length > 0) return fromTelegram;
  if (mock) return mock;
  return '';
};

const logApp = (step, payload = {}) => {
  console.info(`[BossApp] ${step}`, payload);
};

function App() {
  // Никакой аутентификации не требуется - всегда гостевой режим
  const [user, setUser] = useState({ username: 'guest', first_name: 'Guest' });
  const [screen, setScreen] = useState('boss-select');
  const [activeBoss, setActiveBoss] = useState(BOSSES[0]);
  const [result, setResult] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [reviewCards, setReviewCards] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [debugInfo, setDebugInfo] = useState('');
  const initData = useMemo(readInitData, []);

  useEffect(() => {
    const telegramApp = window.Telegram?.WebApp;

    if (telegramApp) {
      telegramApp.ready();
      telegramApp.expand();
      logApp('telegram.ready', { initData: Boolean(telegramApp.initData) });
    } else {
      console.warn('Telegram WebApp SDK not detected');
    }
  }, []);

  // Инициализация: гарантируем, что user установлен и показываем debug info
  useEffect(() => {
    setUser({ username: 'guest', first_name: 'Guest' });
    const info = `guest-mode (no auth required) | initData=${Boolean(initData)} | api=${import.meta.env.VITE_API_BASE || 'n/a'}`;
    setDebugInfo(info);
    logApp('auth.guest-mode', { 
      initData: Boolean(initData), 
      api: import.meta.env.VITE_API_BASE,
      mode: 'guest (no auth required)'
    });
  }, [initData]);

  const startBattle = async (boss) => {
    const selectedBoss = boss || BOSSES[0];
    setActiveBoss(selectedBoss);
    setLoading(true);
    
    const apiBase = import.meta.env.VITE_API_BASE || 'http://localhost:4000';
    
    logApp('battle.start.init', { 
      bossId: selectedBoss.id, 
      bossName: selectedBoss.name,
      apiBase,
      timestamp: new Date().toISOString(),
      user: user?.username || 'guest'
    });
    
    try {
      const url = `${apiBase}/api/session/start`;
      logApp('battle.start.request', { 
        bossId: selectedBoss.id,
        url,
        method: 'POST',
        body: { bossId: selectedBoss.id }
      });
      
      const payload = await startSession(selectedBoss.id);
      
      if (!payload || !payload.sessionId) {
        throw new Error('Invalid response from server: missing sessionId');
      }
      
      logApp('battle.start.success', { 
        sessionId: payload.sessionId,
        boss: payload.boss,
        seed: payload.seed,
        serverNow: payload.serverNow
      });
      
      setSessionId(payload.sessionId);
      setScreen('battle');
    } catch (err) {
      const errorDetails = {
        message: err?.message,
        stack: err?.stack,
        name: err?.name,
        bossId: selectedBoss.id,
        apiBase,
        timestamp: new Date().toISOString(),
        errorType: err?.name || 'UnknownError'
      };
      
      console.error('[BossApp] battle.start.failed', errorDetails);
      logApp('battle.start.error', errorDetails);
      
      // Более информативное сообщение об ошибке
      let errorMessage = 'Не удалось создать бой';
      if (err?.message) {
        if (err.message.includes('CORS')) {
          errorMessage = 'Ошибка CORS: проверьте настройки сервера';
        } else if (err.message.includes('timeout')) {
          errorMessage = 'Превышено время ожидания ответа от сервера';
        } else if (err.message.includes('Failed to fetch') || err.message.includes('network')) {
          errorMessage = 'Ошибка сети: проверьте подключение к интернету и URL сервера';
        } else {
          errorMessage = `Ошибка: ${err.message}`;
        }
      }
      
      alert(errorMessage);
    } finally {
      setLoading(false);
      logApp('battle.start.complete', { loading: false });
    }
  };

  const handleFinish = useCallback(
    async (battleResult) => {
      if (sessionId) {
        try {
          const finish = await finishSession(sessionId);
          if (finish?.errors?.length) {
            battleResult.history = battleResult.history?.length ? battleResult.history : finish.errors.map((e) => ({
              isCorrect: false,
              taskId: e.taskId,
              selected: e.userAnswer,
              task: { answer: e.correct, explanation: e.ruleHint },
            }));
          }
        } catch (err) {
          console.warn('Finish session failed', err);
        }
      }
      setResult(battleResult);
      setScreen('result');
    },
    [sessionId],
  );

  const loadNextTask = useCallback((id) => nextTask(id), []);
  const sendAnswer = useCallback((id, payload) => answerTask(id, payload), []);

  const loadReview = async () => {
    try {
      const res = await fetchDailyReview();
      setReviewCards(res.cards || []);
      setScreen('review');
    } catch (err) {
      console.error(err);
      alert('Не удалось загрузить повторение');
    }
  };

  const loadMetrics = async () => {
    if (!adminEnabled) {
      alert('Admin панель отключена (нет токена).');
      return;
    }
    try {
      const res = await fetchAdminMetrics(ADMIN_TOKEN);
      setMetrics(res.summary || null);
      setScreen('admin');
    } catch (err) {
      console.error(err);
      alert('Не удалось загрузить метрики');
    }
  };

  return (
    <main className="app">
      <header className="app-header">
        <div>
          <h1>Boss Grammar</h1>
          <p className="note">Мини-игра грамматики для Telegram.</p>
        </div>
        <div className="auth-pill">
          <span className="dot" data-status="ok" />
          @{user?.username || user?.first_name || 'guest'}
        </div>
      </header>
      {debugInfo && (
        <div className="card" style={{ border: '1px dashed #94a3b8', fontSize: '0.85rem', color: '#475569' }}>
          Debug: {debugInfo}
        </div>
      )}

      {screen === 'boss-select' && <BossSelect onStart={startBattle} loading={loading} />}

      {screen === 'battle' && sessionId && (
        <Battle
          boss={activeBoss}
          sessionId={sessionId}
          loadNextTask={loadNextTask}
          sendAnswer={sendAnswer}
          onFinish={handleFinish}
        />
      )}

      {screen === 'result' && result && (
        <Result
          result={result}
          onRetry={() => startBattle(activeBoss)}
          onBack={() => setScreen('boss-select')}
          onPractice={loadReview}
          onAdmin={adminEnabled ? loadMetrics : undefined}
          adminEnabled={adminEnabled}
        />
      )}

      {screen === 'review' && (
        <ReviewSession cards={reviewCards} onExit={() => setScreen('result')} />
      )}

      {screen === 'admin' && (
        <AdminPanel metrics={metrics} onBack={() => setScreen('boss-select')} />
      )}
    </main>
  );
}

export default App;
