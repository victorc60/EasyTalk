import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import sequelize from '../database/database.js';
import ContentIdentity from '../models/ContentIdentity.js';
import ContentQueue from '../models/ContentQueue.js';
import DailyLog from '../models/DailyLog.js';
import ContentDelivery from '../models/ContentDelivery.js';
import User from '../models/User.js';
import DailyGameSession from '../models/DailyGameSession.js';
import DailyWordGame from '../models/DailyWordGame.js';
import { QUEUE_BANKS, synchronizeQueueBank } from '../services/queueImportService.js';
import { pickUnusedLegacyItem } from '../services/legacyBankSelectionService.js';
import { appendQueueRecord, queueFingerprint } from '../services/contentIdentityService.js';
import { prepareContentDelivery } from '../services/contentDeliveryService.js';
import { buildQueueRecord, loadBankToQueue, resetQueueIfNeeded } from '../services/queueService.js';
import { validateBankItem, contentFingerprint, selectEventQuestions } from '../services/bankContentRules.js';
import { mergeBankEntries } from '../utils/bankMerge.js';
import { pickFromBank } from '../utils/bankUtils.js';

const transaction = { LOCK: { UPDATE: 'UPDATE' } };
function identityHarness(context) {
  const identities = new Map();
  context.mock.method(ContentIdentity, 'findOrCreate', async ({ where, transaction: tx }) => {
    assert.ok(tx);
    const created = !identities.has(where.fingerprint);
    if (created) {
      const row = { ...where, queue_id: null, used_at: null, update: async (values, opts) => { assert.ok(opts.transaction); Object.assign(row, values); } };
      identities.set(where.fingerprint, row);
    }
    return [identities.get(where.fingerprint), created];
  });
  context.mock.method(ContentIdentity, 'findByPk', async (key, opts) => { assert.equal(opts.lock, 'UPDATE'); return identities.get(key); });
  // Serialize mock transactions; the real database provides row locks and rollback.
  let tail = Promise.resolve();
  context.mock.method(sequelize, 'transaction', callback => {
    const result = tail.then(() => callback(transaction));
    tail = result.catch(() => {}); return result;
  });
  return identities;
}

test('merge preserves live IDs, answers, history and custom rows across reorders', () => {
  const live = [{ id: 'old', word: 'Cat', translation: 'кот', isUsed: true }, { word: 'custom', isUsed: false }];
  const incoming = [{ word: 'new' }, { id: 'replacement', word: 'CAT!', translation: 'changed', isUsed: false }];
  const merged = mergeBankEntries(live, incoming);
  assert.deepEqual(merged, [...live, { word: 'new' }]);
  assert.deepEqual(mergeBankEntries(merged, incoming.reverse()), merged);
  assert.equal(live.length, 2);
});

test('a used duplicate cannot be revived by an unused alias', () => {
  const merged = mergeBankEntries([{ word: 'cat', isUsed: false }, { word: 'CAT', isUsed: true }], []);
  assert.ok(merged.every(item => item.isUsed));
});

test('fingerprints ignore IDs, case, punctuation and translation changes', () => {
  assert.equal(queueFingerprint('phrasal', { verb: '  LOOK—AFTER ', id: 'old' }), queueFingerprint('phrasal', { phrasalVerb: 'look after', translation: 'new' }));
  assert.notEqual(queueFingerprint('word', { word: 'cat' }), queueFingerprint('word', { word: 'dog' }));
});

test('reimport and concurrent imports create one queue record per text', async context => {
  identityHarness(context);
  const created = [];
  context.mock.method(ContentQueue, 'create', async record => { created.push(record); return { id: created.length }; });
  const bank = ['cat', 'dog', 'bird', 'fish'].map((word, i) => ({ word, translation: String(i) }));
  await Promise.all([loadBankToQueue('word', bank), loadBankToQueue('word', bank)]);
  await loadBankToQueue('word', bank.reverse().map(item => ({ ...item, id: 'changed_' + item.word, word: item.word.toUpperCase() })));
  assert.equal(created.length, 4);
  assert.equal(new Set(created.map(row => row.content_id)).size, 4);
});

test('historical identity without queue row is imported as used', async context => {
  const identities = identityHarness(context);
  const row = buildQueueRecord('word', { word: 'cat', translation: 'кот' }, 0, [{ word: 'cat', translation: 'кот' }]);
  let saved;
  context.mock.method(ContentQueue, 'create', async record => { saved = record; return { id: 1 }; });
  await ContentIdentity.findOrCreate({ where: { fingerprint: queueFingerprint('word', row.content) }, transaction });
  identities.values().next().value.used_at = new Date('2026-01-01');
  assert.equal(await appendQueueRecord(row, transaction), true);
  assert.equal(saved.used, true);
});

test('exhausted delivery queue never resets flags or creates a publication', async context => {
  identityHarness(context);
  context.mock.method(DailyLog, 'findOne', async () => null);
  context.mock.method(ContentQueue, 'findOne', async () => null);
  context.mock.method(ContentQueue, 'update', async () => { throw new Error('must not reset'); });
  context.mock.method(DailyLog, 'create', async () => { throw new Error('must not publish'); });
  assert.equal(await prepareContentDelivery('word', '2026-09-14'), null);
  assert.equal(await resetQueueIfNeeded('word'), false);
});

test('delivery skips a historical alias and records fresh content in same transaction', async context => {
  const identities = identityHarness(context);
  const rows = ['CAT', 'dog'].map((word, index) => {
    const row = { id: index + 1, content_id: String(index), content: { word }, used: false, update: async values => Object.assign(row, values) };
    return row;
  });
  const fingerprint = queueFingerprint('word', rows[0].content);
  await ContentIdentity.findOrCreate({ where: { fingerprint }, transaction });
  identities.get(fingerprint).used_at = new Date('2026-01-01');
  context.mock.method(DailyLog, 'findOne', async () => null);
  context.mock.method(ContentQueue, 'findOne', async () => rows.find(row => !row.used) || null);
  context.mock.method(DailyLog, 'create', async (values, opts) => { assert.equal(opts.transaction, transaction); return { ...values, id: 9 }; });
  context.mock.method(User, 'findAll', async () => [{ telegram_id: 123 }]);
  context.mock.method(ContentDelivery, 'bulkCreate', async (values, opts) => { assert.equal(opts.transaction, transaction); assert.equal(values[0].queue_id, 2); });
  assert.equal((await prepareContentDelivery('word', '2026-09-14')).content_id, '1');
  assert.ok(identities.get(queueFingerprint('word', rows[1].content)).used_at);
  assert.ok(rows.every(row => row.used));
});

test('legacy JSON picker marks all same-text aliases and never cycles', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bank-pick-'));
  try {
    const file = path.join(directory, 'bank.json');
    fs.writeFileSync(file, JSON.stringify([{ word: 'cat' }, { word: 'CAT!' }]));
    assert.ok(pickFromBank(file));
    assert.equal(pickFromBank(file), null);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('mini-event snapshots exclude reuploaded questions even with new IDs', () => {
  const q = { id: 'new', question: 'Which animal says meow?', options: ['cat', 'dog', 'bird', 'fish'], correctIndex: 0, explanation: 'Cats meow.' };
  assert.throws(() => selectEventQuestions([q], [{ questions: [{ ...q, id: 'old' }] }], 1), /Not enough unused/);
});

test('new release has 127 valid distinct items and correct MCQ answer positions', () => {
  const manifest = JSON.parse(fs.readFileSync('content/releases/2026-09-14.json'));
  let total = 0;
  const questionText = new Set();
  for (const [bank, info] of Object.entries(manifest.banks)) {
    const items = JSON.parse(fs.readFileSync('data/' + info.file));
    const fresh = items.filter(item => info.ids.includes(item.id));
    assert.equal(fresh.length, info.added);
    const seen = new Set(items.filter(item => !info.ids.includes(item.id)).map(item => contentFingerprint(bank, item)));
    for (const item of fresh) {
      assert.ok(validateBankItem(bank, item), item.id);
      const key = contentFingerprint(bank, item);
      assert.ok(!seen.has(key), item.id); seen.add(key);
      if (item.question) { assert.ok(!questionText.has(item.question)); questionText.add(item.question); }
    }
    total += fresh.length;
  }
  assert.equal(total, 127);
});

test('Docker bootstrap merges live volume twice without overwriting history; corruption fails closed', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bank-volume-'));
  try {
    for (const dir of ['scripts', 'utils', 'services', 'data', 'data_defaults']) fs.mkdirSync(path.join(root, dir));
    for (const file of ['scripts/init-data.js', 'utils/bankMerge.js', 'services/bankContentRules.js']) fs.copyFileSync(file, path.join(root, file));
    fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
    const live = path.join(root, 'data/word_bank.json');
    fs.writeFileSync(live, '[{"word":"cat","isUsed":true}]');
    fs.writeFileSync(path.join(root, 'data_defaults/word_bank.json'), '[{"word":"CAT","isUsed":false},{"word":"dog"}]');
    const history = path.join(root, 'data/word_history.json');
    fs.writeFileSync(history, '["cat"]');
    fs.writeFileSync(path.join(root, 'data_defaults/word_history.json'), '[]');
    const run = () => spawnSync(process.execPath, ['scripts/init-data.js'], { cwd: root, encoding: 'utf8' });
    assert.equal(run().status, 0);
    const first = fs.readFileSync(live, 'utf8');
    assert.equal(run().status, 0);
    assert.equal(fs.readFileSync(live, 'utf8'), first);
    assert.equal(fs.readFileSync(history, 'utf8'), '["cat"]');
    assert.deepEqual(JSON.parse(first), [{ word: 'cat', isUsed: true }, { word: 'dog' }]);
    fs.writeFileSync(live, '{broken');
    assert.notEqual(run().status, 0);
    assert.equal(fs.readFileSync(live, 'utf8'), '{broken');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('startup backfills publication and legacy history without replacing existing questions', async context => {
  const identities = identityHarness(context);
  const row = { id: 1, content_id: 'old-appointment', content: { word: 'appointment', options: ['original'] }, used: false, update: async values => Object.assign(row, values) };
  const queue = [row];
  context.mock.method(ContentQueue, 'findAll', async () => [...queue]);
  context.mock.method(ContentQueue, 'create', async values => {
    const item = { ...values, id: queue.length + 1, update: async update => Object.assign(item, update) };
    queue.push(item); return item;
  });
  context.mock.method(DailyLog, 'findAll', async () => [{ content_id: row.content_id }]);
  context.mock.method(DailyGameSession, 'findAll', async () => [{ prompt: 'receipt' }]);
  context.mock.method(DailyWordGame, 'findAll', async () => [{ word: 'refund' }]);
  const spec = QUEUE_BANKS.find(bank => bank.type === 'word');
  const first = await synchronizeQueueBank(spec);
  assert.equal(first.added, first.source - 1);
  assert.equal((await synchronizeQueueBank(spec)).added, 0);
  assert.deepEqual(row.content.options, ['original']);
  for (const word of ['appointment', 'receipt', 'refund']) {
    assert.ok(identities.get(queueFingerprint('word', { word })).used_at);
    assert.equal(queue.find(item => item.content.word === word).used, true);
  }
});

test('legacy selection uses the same durable publication history as scheduled games', async context => {
  context.mock.method(ContentQueue, 'findOne', async () => null);
  const identities = identityHarness(context);
  const fingerprint = queueFingerprint('word', { word: 'cat' });
  await ContentIdentity.findOrCreate({ where: { fingerprint }, transaction });
  identities.get(fingerprint).used_at = new Date('2026-01-01');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bank-legacy-'));
  try {
    const file = path.join(directory, 'bank.json');
    fs.writeFileSync(file, JSON.stringify([{ word: 'CAT', isUsed: false }]));
    assert.equal(await pickUnusedLegacyItem('word', file), null);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('failed queue insertion does not leave a canonical queue pointer', async context => {
  const identities = identityHarness(context);
  const row = buildQueueRecord('word', { word: 'cat' }, 0, [{ word: 'cat' }]);
  context.mock.method(ContentQueue, 'create', async () => { throw new Error('insert failed'); });
  await assert.rejects(appendQueueRecord(row, transaction), /insert failed/);
  assert.equal(identities.get(queueFingerprint('word', row.content)).queue_id, null);
});
