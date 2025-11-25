import db from '../db/client.js';

export function upsertMetric({ sessionId, bossId, durationMs, accuracy, win }) {
  // We don't have user_id in this flow yet; keep null for now
  db.prepare(
    `INSERT INTO metrics (user_id, boss_id, duration_ms, accuracy, win, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(null, bossId, durationMs, accuracy, win ? 1 : 0, Date.now());
}

export function getMetricsSummary({ from, to }) {
  const params = [];
  const where = [];

  if (from) {
    where.push('created_at >= ?');
    params.push(Number(from));
  }
  if (to) {
    where.push('created_at <= ?');
    params.push(Number(to));
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const row = db
    .prepare(
      `SELECT
         COUNT(*) as total,
         AVG(accuracy) as avgAccuracy,
         SUM(win) as wins,
         MIN(duration_ms) as minDuration,
         MAX(duration_ms) as maxDuration,
         AVG(duration_ms) as avgDuration
       FROM metrics
       ${whereClause}`,
    )
    .get(...params);

  const bosses = db
    .prepare(
      `SELECT boss_id, COUNT(*) as total, AVG(accuracy) as avgAccuracy, SUM(win) as wins
       FROM metrics
       ${whereClause}
       GROUP BY boss_id`,
    )
    .all(...params);

  return {
    total: row?.total || 0,
    avgAccuracy: Number(row?.avgAccuracy || 0),
    wins: Number(row?.wins || 0),
    minDuration: row?.minDuration || 0,
    maxDuration: row?.maxDuration || 0,
    avgDuration: Number(row?.avgDuration || 0),
    bosses,
  };
}
