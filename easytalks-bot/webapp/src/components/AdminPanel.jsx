export function AdminPanel({ metrics, onBack }) {
  if (!metrics) {
    return (
      <section className="card">
        <h2>Admin</h2>
        <p>Нет данных. Убедитесь, что задан VITE_ADMIN_TOKEN и есть завершённые бои.</p>
        <button onClick={onBack}>Назад</button>
      </section>
    );
  }

  return (
    <section className="card">
      <h2>Admin метрики</h2>
      <p>Всего боёв: {metrics.total}</p>
      <p>Точность средн.: {Math.round(metrics.avgAccuracy || 0)}%</p>
      <p>Побед: {metrics.wins}</p>
      <p>Длительность (сек): min {Math.round((metrics.minDuration || 0) / 1000)}, max {Math.round((metrics.maxDuration || 0) / 1000)}, avg {Math.round((metrics.avgDuration || 0) / 1000)}</p>
      <div className="review">
        <h3>По боссам</h3>
        {metrics.bosses?.map((b) => (
          <p key={b.boss_id || b.bossId}>
            Boss {b.boss_id || b.bossId}: {b.total} боёв, acc {Math.round(b.avgAccuracy || 0)}%, побед {b.wins}
          </p>
        ))}
      </div>
      <button onClick={onBack}>Назад</button>
    </section>
  );
}
