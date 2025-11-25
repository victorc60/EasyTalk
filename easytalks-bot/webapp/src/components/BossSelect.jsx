import { useEffect, useState } from 'react';
import { BOSSES } from '../data/mocks.js';

export function BossSelect({ onStart, loading }) {
  const [selectedBoss, setSelectedBoss] = useState(BOSSES[0]);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg?.MainButton) return;

    const handleStart = () => onStart(selectedBoss);

    tg.MainButton.setText('Начать бой');
    tg.MainButton.show();
    tg.MainButton.onClick(handleStart);

    return () => {
      tg.MainButton.offClick(handleStart);
      tg.MainButton.hide();
    };
  }, [onStart, selectedBoss]);

  return (
    <section className="card">
      <h2>Выбери босса</h2>
      <div className="boss-grid">
        {BOSSES.map((boss) => (
          <button
            key={boss.id}
            className={`boss-card ${selectedBoss.id === boss.id ? 'active' : ''}`}
            onClick={() => setSelectedBoss(boss)}
            >
            <div className="boss-name">{boss.name}</div>
            <div className="boss-hp">{boss.hp} HP</div>
          </button>
        ))}
      </div>
      <p className="note">Нажми «Начать бой» в Telegram MainButton или выбери босса и нажми кнопку выше.</p>
      <button className="primary" onClick={() => onStart(selectedBoss)} disabled={loading}>
        {loading ? 'Создаём бой...' : 'Начать бой'}
      </button>
    </section>
  );
}
