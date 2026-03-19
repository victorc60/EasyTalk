import db from '../db/client.js';

export function upsertMetric({ sessionId, bossId, durationMs, accuracy, win }) {
  // We don't have user_id in this flow yet; keep null for now
  db.prepare(
    `INSERT INTO metrics (user_id, boss_id, duration_ms, accuracy, win, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(null, bossId, durationMs, accuracy, win ? 1 : 0, Date.now());
}

const normalizeTimestamp = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  // Accept both seconds and milliseconds timestamps from clients.
  return n < 1_000_000_000_000 ? n * 1000 : n;
};

export function getMetricsSummary({ from, to }) {
  const params = [];
  const where = [];
  const normalizedFrom = normalizeTimestamp(from);
  const normalizedTo = normalizeTimestamp(to);

  // We count only sessions where at least one answer was submitted.
  where.push('current_index > 0');

  if (normalizedFrom !== null) {
    where.push('COALESCE(finished_at, created_at) >= ?');
    params.push(normalizedFrom);
  }
  if (normalizedTo !== null) {
    where.push('COALESCE(finished_at, created_at) <= ?');
    params.push(normalizedTo);
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const row = db
    .prepare(
      `SELECT
         COUNT(*) as total,
         AVG(CASE WHEN total > 0 THEN (correct * 100.0) / total ELSE 0 END) as avgAccuracy,
         SUM(CASE WHEN finished_at IS NOT NULL AND correct = total THEN 1 ELSE 0 END) as wins,
         MIN(CASE WHEN finished_at IS NOT NULL THEN (finished_at - created_at) END) as minDuration,
         MAX(CASE WHEN finished_at IS NOT NULL THEN (finished_at - created_at) END) as maxDuration,
         AVG(CASE WHEN finished_at IS NOT NULL THEN (finished_at - created_at) END) as avgDuration
       FROM sessions
       ${whereClause}`,
    )
    .get(...params);

  const bosses = db
    .prepare(
      `SELECT
         boss_id,
         COUNT(*) as total,
         AVG(CASE WHEN total > 0 THEN (correct * 100.0) / total ELSE 0 END) as avgAccuracy,
         SUM(CASE WHEN finished_at IS NOT NULL AND correct = total THEN 1 ELSE 0 END) as wins
       FROM sessions
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
