import { useState } from 'react';

export function Result({ result, onRetry, onBack, onPractice, onAdmin, adminEnabled }) {
  const [showReview, setShowReview] = useState(false);

  const mistakes = (result.history || []).filter((h) => !h.isCorrect);

  return (
    <section className="card">
      <h2>Результат боя</h2>
      <p>Босс: {result.boss.name}</p>
      <p>Очки: {result.score}</p>
      <p>Точность: {result.accuracy}% ({result.correct}/{result.total})</p>

      <div className="actions-row">
        <button onClick={() => setShowReview((v) => !v)}>Разбор ошибок</button>
        <button className="primary" onClick={onRetry}>Повторить</button>
      </div>
      <button className="primary" onClick={onPractice}>Повторение (2–3 мин)</button>
      {adminEnabled && <button className="ghost" onClick={onAdmin}>Admin</button>}
      <button className="ghost" onClick={onBack}>К выбору боссов</button>

      {showReview && (
        <div className="review">
          {mistakes.length === 0 && <p>Ошибок нет — красиво!</p>}
          {mistakes.map((m) => (
            <div key={m.task.id} className="mistake">
              <p className="prompt">{m.task.prompt}</p>
              <p className="note">Твой ответ: {m.selected || '—'}</p>
              <p className="note">Правильно: {m.task.answer}</p>
              {m.task.explanation && <p className="note">{m.task.explanation}</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
