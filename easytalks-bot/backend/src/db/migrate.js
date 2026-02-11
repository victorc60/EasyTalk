import fs from 'fs';
import path from 'path';
import db from './client.js';

const migrationsDir = path.join(path.dirname(new URL(import.meta.url).pathname), 'migrations');

const loadMigrations = () =>
  fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

db.exec(
  'CREATE TABLE IF NOT EXISTS migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, run_at INTEGER NOT NULL)',
);

const applied = new Set(db.prepare('SELECT name FROM migrations').all().map((row) => row.name));

const migrate = () => {
  const files = loadMigrations();
  const pending = files.filter((f) => !applied.has(f));

  if (pending.length === 0) {
    console.log('No pending migrations.');
    return;
  }

  for (const file of pending) {
    const fullPath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(fullPath, 'utf-8');
    const now = Date.now();

    const tx = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO migrations (name, run_at) VALUES (?, ?)').run(file, now);
    });

    tx();
    console.log(`Applied migration ${file}`);
  }
};

migrate();
