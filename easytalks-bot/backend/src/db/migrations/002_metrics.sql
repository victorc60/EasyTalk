PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  boss_id INTEGER,
  duration_ms INTEGER,
  accuracy INTEGER,
  win INTEGER,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
  FOREIGN KEY (boss_id) REFERENCES bosses(id) ON DELETE SET NULL
);
