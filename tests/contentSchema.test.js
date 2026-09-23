import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { ensureContentSchema } from '../database/ensureContentSchema.js';

const expected = ['content_deliveries', 'bank_maintenance_runs', 'generated_bank_items', 'mini_event_plans', 'content_identities'];

test('additive migrations create missing tables and preserve existing rows on repeated runs', async () => {
  const savedHistory = [{ fingerprint: 'used-word', used_at: '2026-09-14' }];
  const tables = new Map([['content_identities', savedHistory], ['users', [{ id: 123 }]]]);
  const queries = [];
  const database = { query: async sql => {
    const match = sql.match(/^CREATE TABLE IF NOT EXISTS ([a-z_]+)\s*\(/);
    assert.ok(match, 'only additive CREATE IF NOT EXISTS is permitted');
    assert.ok(!/\b(DROP|TRUNCATE|DELETE|ALTER)\b/i.test(sql));
    queries.push(match[1]);
    if (!tables.has(match[1])) tables.set(match[1], []);
  } };
  await ensureContentSchema(database);
  await ensureContentSchema(database);
  assert.deepEqual(queries, [...expected, ...expected]);
  assert.equal(tables.get('content_identities'), savedHistory);
  assert.deepEqual(tables.get('users'), [{ id: 123 }]);
});

test('migration errors stop initialization and identify the failing SQL file', async () => {
  let calls = 0;
  await assert.rejects(ensureContentSchema({ query: async () => {
    calls++;
    throw new Error('CREATE command denied');
  } }), /001_content_deliveries.sql.*CREATE command denied/);
  assert.equal(calls, 1);
});

test('partial migration failure is recoverable on a subsequent run', async () => {
  const tables = new Set();
  let fail = true;
  const database = { query: async sql => {
    const name = sql.match(/^CREATE TABLE IF NOT EXISTS ([a-z_]+)/)[1];
    if (name === 'generated_bank_items' && fail) throw new Error('connection lost');
    tables.add(name);
  } };
  await assert.rejects(ensureContentSchema(database), /002_bank_automation.sql/);
  assert.deepEqual([...tables], expected.slice(0, 2));
  fail = false;
  await ensureContentSchema(database);
  assert.deepEqual([...tables], expected);
});

// Exercise the real CLI entry point in a separate Node process without MySQL.
// A guarded queue read reproduces the deployment failure if migrations are late.
for (const mode of ['apply', 'dry-run', 'migration-failure']) {
  test(`queue:sync startup ${mode} respects schema readiness and read-only mode`, () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'easytalk-schema-'));
    try {
      const url = file => pathToFileURL(path.resolve(file)).href;
      const script = `
        import assert from 'node:assert/strict';
        import fs from 'node:fs';
        import db from ${JSON.stringify(url('database/database.js'))};
        import Queue from ${JSON.stringify(url('models/ContentQueue.js'))};
        import Sessions from ${JSON.stringify(url('models/DailyGameSession.js'))};
        import Words from ${JSON.stringify(url('models/DailyWordGame.js'))};
        import Log from ${JSON.stringify(url('models/DailyLog.js'))};
        let migrations = 0, queueReads = 0, closed = false;
        let identityReady = false;
        db.authenticate = async () => {};
        db.close = async () => { closed = true; };
        db.query = async sql => {
          migrations++;
          if (${JSON.stringify(mode)} === 'migration-failure') throw new Error('CREATE denied');
          if (/CREATE TABLE IF NOT EXISTS content_identities/.test(sql)) identityReady = true;
        };
        Queue.findAll = async () => {
          queueReads++;
          if (${JSON.stringify(mode)} === 'apply') assert.ok(identityReady, "Table railway.content_identities doesn't exist");
          return [];
        };
        Sessions.findAll = Words.findAll = Log.findAll = async () => [];
        const read = fs.readFileSync;
        fs.readFileSync = (file, ...args) => typeof file === 'string' && /word_(bank|history)\\.json$/.test(file) ? '[]' : read(file, ...args);
        process.argv = ['node', 'sync_content_queue.js', 'word', ...(${JSON.stringify(mode)} === 'dry-run' ? ['--dry-run'] : [])];
        await import(${JSON.stringify(url('scripts/sync_content_queue.js'))});
        assert.equal(closed, true);
        if (${JSON.stringify(mode)} === 'migration-failure') {
          assert.equal(process.exitCode, 1);
          assert.equal(queueReads, 0);
          process.exitCode = 0;
        } else {
          assert.notEqual(process.exitCode, 1);
          assert.ok(queueReads > 0);
          assert.equal(migrations, ${JSON.stringify(mode)} === 'apply' ? 5 : 0);
        }
      `;
      const file = path.join(directory, 'check.mjs');
      fs.writeFileSync(file, script);
      const result = spawnSync(process.execPath, [file], {
        cwd: directory, encoding: 'utf8', timeout: 15000,
        env: { PATH: process.env.PATH, DATABASE_URL: 'mysql://test:test@127.0.0.1:1/test' },
      });
      assert.equal(result.status, 0, result.stderr || result.error?.message);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });
}
