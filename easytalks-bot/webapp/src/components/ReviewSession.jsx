import { useEffect, useState, useMemo, useCallback } from 'react';

export function ReviewSession({ cards, onExit }) {
  const [index, setIndex] = useState(0);
  const [feedback, setFeedback] = useState(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [startAt] = useState(Date.now());

  const card = useMemo(() => cards[index], [cards, index]);
  
  const done = useMemo(() => index >= cards.length, [index, cards.length]);
  const durationSec = useMemo(() => Math.round((Date.now() - startAt) / 1000), [startAt]);

  // Сбрасываем feedback при смене карточки
  useEffect(() => {
    setFeedback(null);
  }, [index]);

  useEffect(() => {
    setFeedback(null);
  }, [index]);

  const handleAnswer = useCallback((option) => {
    if (!card || feedback) return; // Предотвращаем повторные клики
    const isCorrect = option === card.answer;
    setFeedback({ isCorrect, option, correct: card.answer, hint: card.ruleHint });
    if (isCorrect) setCorrectCount((c) => c + 1);
  }, [card, feedback]);

  const next = useCallback(() => {
    setIndex((i) => i + 1);
    setFeedback(null);
  }, []);

  return (
    <section className="card">
      <div className="battle-header">
        <div>
          <h2>Повторение</h2>
          <p className="note">
            Карточка {Math.min(index + 1, cards.length)} / {cards.length}
          </p>
        </div>
        <div className="note">~2–3 мин</div>
      </div>

      {done ? (
        <>
          <p>Сессия завершена за {durationSec}s</p>
          <p>
            Точность: {cards.length ? Math.round((correctCount / cards.length) * 100) : 0}% ({correctCount}/
            {cards.length})
          </p>
          <button className="primary" onClick={onExit}>
            К результатам
          </button>
        </>
      ) : (
        <>
          <p className="prompt">{card.prompt}</p>
          <div className="options">
            {card.options.map((opt) => (
              <button key={opt} className="option" onClick={() => handleAnswer(opt)} disabled={!!feedback}>
                {opt}
              </button>
            ))}
          </div>
          {feedback && (
            <div className="review">
              <p className="note">{feedback.isCorrect ? 'Верно!' : 'Неверно'}</p>
              {!feedback.isCorrect && <p className="note">Правильно: {feedback.correct}</p>}
              {feedback.hint && <p className="note">{feedback.hint}</p>}
              <button className="primary" onClick={next}>
                Далее
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
