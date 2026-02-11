import { useEffect, useState, useRef, useCallback } from 'react';

const calcResult = ({ boss, progress, attempts }) => {
  const answered = progress.answered || attempts.length;
  const correct = progress.correct || attempts.filter((a) => a.isCorrect).length;
  const total = progress.total || answered;
  const accuracy = total ? Math.round((correct / total) * 100) : 0;
  return {
    boss,
    score: progress.score || 0,
    accuracy,
    history: attempts,
    total,
    correct,
  };
};

export function Battle({ boss, sessionId, loadNextTask, sendAnswer, onFinish }) {
  const [timeLeft, setTimeLeft] = useState(60);
  const [task, setTask] = useState(null);
  const [progress, setProgress] = useState({
    current: 0,
    total: 0,
    hp: boss.hp,
    score: 0,
    combo: 0,
    answered: 0,
    correct: 0,
  });
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isFinished, setIsFinished] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Используем ref для предотвращения повторных вызовов onFinish
  const finishedRef = useRef(false);
  const timerRef = useRef(null);

  // Таймер с правильной очисткой
  useEffect(() => {
    if (isFinished) return;
    
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        const next = Math.max(prev - 1, 0);
        if (next === 0 && !finishedRef.current) {
          finishedRef.current = true;
          setIsFinished(true);
        }
        return next;
      });
    }, 1000);
    
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isFinished]);

  // Завершение игры при истечении времени
  useEffect(() => {
    if (isFinished && !finishedRef.current) {
      finishedRef.current = true;
      const result = calcResult({ boss, progress, attempts });
      onFinish(result);
    }
  }, [isFinished, boss, progress, attempts, onFinish]);

  // Загрузка первой задачи при монтировании
  useEffect(() => {
    let cancelled = false;
    
    const fetchTask = async () => {
      if (cancelled || finishedRef.current) return;
      
      setLoading(true);
      try {
        console.log('[Battle] Loading initial task for session:', sessionId);
        const payload = await loadNextTask(sessionId);
        
        if (cancelled) return;
        
        if (payload.done) {
          finishedRef.current = true;
          setIsFinished(true);
          onFinish(calcResult({ boss, progress: payload.progress || progress, attempts: payload.attempts || attempts }));
          return;
        }
        
        setTask(payload.task);
        setProgress(payload.progress);
        setAttempts(payload.attempts || []);
      } catch (err) {
        console.error('[Battle] Failed to load task:', err);
        if (!cancelled) {
          alert(`Ошибка загрузки задачи: ${err?.message || 'unknown error'}`);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    
    fetchTask();
    
    return () => {
      cancelled = true;
    };
  }, [sessionId]); // Убираем лишние зависимости

  const handleAnswer = useCallback(async (option) => {
    if (!task || isSubmitting || isFinished || finishedRef.current) {
      console.log('[Battle] Answer blocked:', { hasTask: !!task, isSubmitting, isFinished });
      return;
    }
    
    setIsSubmitting(true);
    setLoading(true);
    
    try {
      console.log('[Battle] Submitting answer:', { taskId: task.id, answer: option });
      const result = await sendAnswer(sessionId, { taskId: task.id, answer: option });
      
      setProgress(result.progress);
      setAttempts(result.attempts || []);
      
      if (result.done) {
        finishedRef.current = true;
        setIsFinished(true);
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        onFinish(calcResult({ boss, progress: result.progress, attempts: result.attempts || [] }));
      } else if (result.nextTask) {
        setTask(result.nextTask);
      }
    } catch (err) {
      console.error('[Battle] Failed to submit answer:', err);
      alert(`Ошибка отправки ответа: ${err?.message || 'unknown error'}`);
    } finally {
      setIsSubmitting(false);
      setLoading(false);
    }
  }, [task, isSubmitting, isFinished, sessionId, sendAnswer, boss, onFinish]);

  const total = progress.total || 0;

  return (
    <section className="card">
      <div className="battle-header">
        <div>
          <h2>{boss.name}</h2>
          <p className="note">
            Вопрос {Math.min(progress.current, total) || 1} / {total || '?'}
          </p>
        </div>
        <div className="timer">⏱ {timeLeft}s</div>
      </div>

      <div className="hp-bar">
        <div className="hp-bar-fill" style={{ width: `${(progress.hp / boss.hp) * 100 || 0}%` }} />
        <span className="hp-label">{progress.hp ?? boss.hp} HP</span>
      </div>

      {loading && <p>Загружаем задачу…</p>}

      {!loading && task && !isFinished && (
        <div className="task">
          <p className="prompt">{task.prompt}</p>
          <div className="options">
            {task.options.map((opt) => (
              <button 
                key={opt} 
                className="option" 
                onClick={() => handleAnswer(opt)} 
                disabled={isSubmitting || isFinished}
              >
                {opt}
              </button>
            ))}
          </div>
          {isSubmitting && <p className="note">Отправляем ответ...</p>}
        </div>
      )}

      {!loading && !task && !isFinished && <p>Бой завершён, считаем результат…</p>}
    </section>
  );
}
