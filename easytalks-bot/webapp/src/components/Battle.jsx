import { useEffect, useState } from 'react';

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

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => Math.max(prev - 1, 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (timeLeft === 0) {
      onFinish(calcResult({ boss, progress, attempts }));
    }
  }, [timeLeft, progress, attempts, onFinish, boss]);

  useEffect(() => {
    const fetchTask = async () => {
      setLoading(true);
      try {
        const payload = await loadNextTask(sessionId);
        if (payload.done) {
          onFinish(calcResult({ boss, progress: payload.progress || progress, attempts: payload.attempts || attempts }));
          return;
        }
        setTask(payload.task);
        setProgress(payload.progress);
        setAttempts(payload.attempts || attempts);
      } finally {
        setLoading(false);
      }
    };
    fetchTask();
  }, [sessionId, loadNextTask, onFinish, boss]);

  const handleAnswer = async (option) => {
    if (!task) return;
    setLoading(true);
    try {
      const result = await sendAnswer(sessionId, { taskId: task.id, answer: option });
      setProgress(result.progress);
      setAttempts(result.attempts || attempts);
      if (result.done) {
        onFinish(calcResult({ boss, progress: result.progress, attempts: result.attempts || attempts }));
      } else if (result.nextTask) {
        setTask(result.nextTask);
      }
    } finally {
      setLoading(false);
    }
  };

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

      {!loading && task && (
        <div className="task">
          <p className="prompt">{task.prompt}</p>
          <div className="options">
            {task.options.map((opt) => (
              <button key={opt} className="option" onClick={() => handleAnswer(opt)}>
                {opt}
              </button>
            ))}
          </div>
        </div>
      )}

      {!loading && !task && <p>Бой завершён, считаем результат…</p>}
    </section>
  );
}
