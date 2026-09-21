import test from 'node:test';
import assert from 'node:assert/strict';
import sequelize from '../database/database.js';
import LearningItem from '../models/LearningItem.js';
import UserLearningItem from '../models/UserLearningItem.js';
import BankMaintenanceRun from '../models/BankMaintenanceRun.js';
import GeneratedBankItem from '../models/GeneratedBankItem.js';
import ContentQueue from '../models/ContentQueue.js';
import ContentIdentity from '../models/ContentIdentity.js';
import DailyLog from '../models/DailyLog.js';
import MiniEventDay from '../models/MiniEventDay.js';
import MiniEventPlan from '../models/MiniEventPlan.js';
import { dataFilePath } from '../utils/projectPaths.js';
import { acceptedCandidates, validateBankItem } from '../services/bankContentRules.js';
import { getAutofillSettings, getBankSupply, generateReviewedBatch, maintainBanks, publishReviewedBatch } from '../services/bankAutofillService.js';
import { LEARNING_BANK_SPECS, summarizeLearningSupply } from '../services/learningBankSupplyService.js';
import { BANK_SPECS, runDailyBankAuditAndAutofill } from '../services/bankLifecycleService.js';
import { pickUnusedLegacyItem } from '../services/legacyBankSelectionService.js';

const settings = getAutofillSettings({});
const item = { text: 'il biglietto', translation: 'билет', example: 'Compro un biglietto.',
  example_translation: 'Я покупаю билет.', level: 'A1', topic: 'travel', type: 'word' };
const transaction = { LOCK: { UPDATE: 'UPDATE' } };

function clientFor(items) {
  const calls = [];
  const client = { chat: { completions: { create: async (request, options) => {
    calls.push({ request, options });
    const payload = JSON.parse(request.messages[1].content);
    const content = payload.candidates
      ? { reviews: payload.candidates.map(candidate => ({ id: candidate.id, approved: true })) }
      : { items };
    return { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(content) } }] };
  } } } };
  return { client, calls };
}

function mockCatalog(context, items = []) {
  context.mock.method(LearningItem, 'findAll', async () => items);
  context.mock.method(UserLearningItem, 'findAll', async () => []);
}

function mockPublication(context) {
  const run = { id: 1, status: 'processing', update: async values => Object.assign(run, values) };
  context.mock.method(sequelize, 'transaction', async callback => callback(transaction));
  context.mock.method(BankMaintenanceRun, 'findByPk', async (_id, options) => {
    assert.equal(options.transaction, transaction); assert.equal(options.lock, 'UPDATE'); return run;
  });
  context.mock.method(GeneratedBankItem, 'findOrCreate', async options => {
    assert.equal(options.transaction, transaction); return [{}, true];
  });
  return run;
}

test('all supported language catalogs share the existing maintenance registry', () => {
  assert.deepEqual(Object.keys(LEARNING_BANK_SPECS), ['learning_en', 'learning_it', 'learning_de']);
  for (const spec of Object.values(LEARNING_BANK_SPECS)) assert.equal(BANK_SPECS[spec.key], spec);
});

test('catalog validation requires translated examples and supported types', () => {
  assert.equal(validateBankItem('catalog', item), true);
  for (const invalid of [{ ...item, example_translation: '' }, { ...item, type: 'admin' },
    { ...item, text: '<b>ciao</b>' }, { ...item, level: 'C9' }]) {
    assert.equal(validateBankItem('catalog', invalid), false);
  }
  const candidates = acceptedCandidates('catalog', [{ ...item, language_code: 'de', is_active: false }], [], 10);
  assert.equal(candidates[0].language_code, undefined);
  assert.equal(candidates[0].is_active, undefined);
  assert.equal(acceptedCandidates('catalog', [item], [{ text: 'IL BIGLIETTO!' }], 10).length, 0);
});

test('stock counts unique active texts and the learner with least unseen material', () => {
  const items = [
    { id: 1, text: 'ciao', level: 'A1', is_active: true },
    { id: 2, text: 'CIAO!', level: 'A1', is_active: true },
    { id: 3, text: 'grazie', level: 'A1', is_active: true },
    { id: 4, text: 'old', level: 'A1', is_active: false },
  ];
  const history = [{ user_id: 10, learning_item_id: 1 }, { user_id: 10, learning_item_id: 2 },
    { user_id: 20, learning_item_id: 3 }, { user_id: 10, learning_item_id: 4 }];
  const supply = summarizeLearningSupply(items, history);
  assert.deepEqual(supply.levels[0], { level: 'A1', total: 2, remaining: 1 });
  assert.equal(supply.level, 'A2');
});

test('catalog supply keeps language boundaries in both queries', async context => {
  context.mock.method(LearningItem, 'findAll', async options => {
    assert.deepEqual(options.where, { language_code: 'de' }); return [];
  });
  context.mock.method(UserLearningItem, 'findAll', async options => {
    assert.deepEqual(options.where, { target_language: 'de' }); return [];
  });
  assert.equal((await getBankSupply(LEARNING_BANK_SPECS.learning_de)).remaining, 0);
});

test('generation and review enforce the requested language and exact CEFR level', async () => {
  for (const [languageCode, language] of [['en', 'English'], ['it', 'Italian'], ['de', 'German']]) {
    const { client, calls } = clientFor([item, { ...item, text: 'other', level: 'B2' }]);
    const batch = await generateReviewedBatch(client, 'catalog', [], settings, 10, { languageCode, level: 'A1' });
    assert.equal(batch.approved.length, 1);
    for (const { request, options } of calls) {
      assert.match(request.messages[0].content, new RegExp(`Target language: ${language}`));
      assert.match(request.messages[0].content, /Exact CEFR level: A1/);
      assert.equal(options.maxRetries, 0);
    }
  }
});

test('catalog generation fails before spending for unsupported language', async () => {
  const { client, calls } = clientFor([item]);
  await assert.rejects(generateReviewedBatch(client, 'catalog', [], settings, 10, { languageCode: 'xx', level: 'A1' }));
  assert.equal(calls.length, 0);
});

test('low stock triggers a full bounded batch, not a daily single-item request', async context => {
  context.mock.method(GeneratedBankItem, 'findAll', async () => []);
  context.mock.method(ContentQueue, 'findAll', async () => Array.from({ length: 29 }, (_, i) => ({ content: { word: `word ${i}` }, used: false })));
  const run = mockPublication(context);
  context.mock.method(BankMaintenanceRun, 'create', async () => run);
  const { client, calls } = clientFor([]);
  const spec = { key: 'word', queueType: 'word', bankFile: dataFilePath('word_bank.json') };
  const result = await maintainBanks({ word: spec }, { openai: client, settings });
  assert.equal(result[0].status, 'completed');
  assert.equal(JSON.parse(calls[0].request.messages[1].content).count, 10);
});

test('catalog publication is atomic, does not enter English queues and cannot replay', async context => {
  mockCatalog(context);
  const run = mockPublication(context);
  const saved = [];
  context.mock.method(LearningItem, 'create', async (row, options) => {
    assert.equal(options.transaction, transaction); saved.push(row);
  });
  context.mock.method(ContentQueue, 'create', async () => { throw new Error('must not publish to English queue'); });
  const approved = acceptedCandidates('catalog', [item], [], 10);
  const batch = { existing: [], approved, candidates: approved, review: [] };
  assert.equal(await publishReviewedBatch(LEARNING_BANK_SPECS.learning_it, batch, run), 1);
  assert.equal(await publishReviewedBatch(LEARNING_BANK_SPECS.learning_it, batch, run), 0);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].language_code, 'it');
  assert.equal(saved[0].example_translation, item.example_translation);
  assert.equal(saved[0].difficulty, 1);
});

test('publication rechecks content imported while generation was running', async context => {
  mockCatalog(context, [{ text: 'IL BIGLIETTO!' }]);
  const run = mockPublication(context);
  context.mock.method(LearningItem, 'create', async () => { throw new Error('duplicate'); });
  const approved = acceptedCandidates('catalog', [item], [], 10);
  assert.equal(await publishReviewedBatch(LEARNING_BANK_SPECS.learning_it,
    { existing: [], approved, candidates: approved, review: [] }, run), 0);
});

test('a restart or parallel run cannot generate another level for the same language that day', async context => {
  mockCatalog(context);
  let claimed = false;
  const run = { id: 1, update: async () => {} };
  context.mock.method(BankMaintenanceRun, 'create', async ({ bank }) => {
    assert.equal(bank, 'learning_it');
    if (claimed) throw Object.assign(new Error('duplicate'), { name: 'SequelizeUniqueConstraintError' });
    claimed = true; return run;
  });
  let requests = 0;
  const client = { chat: { completions: { create: async () => { requests++; throw new Error('timeout'); } } } };
  const options = { openai: client, settings, now: new Date('2026-09-21T12:00:00Z') };
  const specs = { learning_it: LEARNING_BANK_SPECS.learning_it };
  const results = (await Promise.all([maintainBanks(specs, options), maintainBanks(specs, options)])).flat();
  assert.equal(requests, 1);
  assert.deepEqual(results.map(row => row.status).sort(), ['already_attempted_today', 'failed']);
});

test('healthy catalog does not allocate requests and generation can be disabled', async context => {
  const items = ['A1', 'A2', 'B1', 'B2'].flatMap(level => Array.from({ length: 30 }, (_, i) =>
    ({ id: `${level}${i}`, text: `${level} ${i}`, level, is_active: true })));
  mockCatalog(context, items);
  const { client, calls } = clientFor([]);
  const specs = { learning_it: LEARNING_BANK_SPECS.learning_it };
  assert.equal((await maintainBanks(specs, { openai: client, settings }))[0].status, 'stock_ok');
  assert.equal((await maintainBanks(specs, { openai: client, settings: { ...settings, catalogs: false } }))[0].status, 'catalogs_disabled');
  assert.equal(calls.length, 0);
  assert.equal(getAutofillSettings({ BANK_TARGET_REMAINING: '999' }).target, 90);
  assert.equal(getAutofillSettings({ BANK_MIN_REMAINING: '80', BANK_TARGET_REMAINING: '30' }).target, 80);
});

test('legacy games can consume generated database content even when seed file is absent', async context => {
  context.mock.method(sequelize, 'transaction', async callback => callback(transaction));
  const row = { content: { word: 'lantern', translation: 'фонарь' }, used: false,
    update: async (values, options) => { assert.equal(options.transaction, transaction); Object.assign(row, values); } };
  context.mock.method(ContentQueue, 'findOne', async options => {
    assert.equal(options.lock, 'UPDATE'); return row.used ? null : row;
  });
  const identity = { used_at: null, update: async values => Object.assign(identity, values) };
  context.mock.method(ContentIdentity, 'findOrCreate', async () => [identity, false]);
  context.mock.method(ContentIdentity, 'findByPk', async () => identity);
  assert.equal((await pickUnusedLegacyItem('word', '/not/a/bank.json')).word, 'lantern');
  assert.equal(row.used, true);
  assert.ok(identity.used_at);
});

test('legacy selection skips consumed aliases before choosing fresh generated content', async context => {
  context.mock.method(sequelize, 'transaction', async callback => callback(transaction));
  const rows = ['old', 'fresh'].map(word => {
    const row = { content: { word }, used: false, update: async values => Object.assign(row, values) }; return row;
  });
  context.mock.method(ContentQueue, 'findOne', async () => rows.find(row => !row.used));
  let next = 0;
  context.mock.method(ContentIdentity, 'findOrCreate', async () => [{}, false]);
  context.mock.method(ContentIdentity, 'findByPk', async () => ({ used_at: next++ === 0 ? new Date() : null, update: async () => {} }));
  assert.equal((await pickUnusedLegacyItem('word', '/not/a/bank.json')).word, 'fresh');
  assert.ok(rows.every(row => row.used));
});

test('read-only audit covers all nine banks without claiming runs or calling AI', async context => {
  mockCatalog(context);
  context.mock.method(GeneratedBankItem, 'count', async () => 0);
  context.mock.method(GeneratedBankItem, 'findAll', async () => []);
  context.mock.method(ContentQueue, 'count', async () => 0);
  context.mock.method(DailyLog, 'findOne', async () => null);
  context.mock.method(MiniEventDay, 'findAll', async () => []);
  context.mock.method(MiniEventPlan, 'findAll', async () => []);
  context.mock.method(BankMaintenanceRun, 'create', async () => { throw new Error('read-only'); });
  const { client, calls } = clientFor([]);
  const result = await runDailyBankAuditAndAutofill(null, { generate: false, openai: client });
  assert.equal(result.coverage.length, 9);
  assert.equal(result.coverage.filter(row => row.catalog && row.levels.length === 4).length, 3);
  assert.equal(result.maintenance.length, 0);
  assert.equal(result.eventPlan, null);
  assert.equal(calls.length, 0);
});

test('catalog maintenance publishes the depleted level through the complete pipeline', async context => {
  mockCatalog(context, [{ id: 1, ...item, is_active: true }]);
  const run = mockPublication(context);
  context.mock.method(BankMaintenanceRun, 'create', async ({ bank }) => {
    assert.equal(bank, 'learning_it'); return run;
  });
  const saved = [];
  context.mock.method(LearningItem, 'create', async row => saved.push(row));
  const { client, calls } = clientFor([{ ...item, text: 'la prenotazione', level: 'A2' }]);
  const result = await maintainBanks({ learning_it: LEARNING_BANK_SPECS.learning_it }, { openai: client, settings });
  assert.equal(result[0].level, 'A2');
  assert.equal(result[0].published, 1);
  assert.equal(saved[0].language_code, 'it');
  assert.equal(saved[0].level, 'A2');
  assert.equal(calls.length, 2);
  assert.equal(run.status, 'completed');
});

test('a failed language does not prevent maintaining other languages', async context => {
  mockCatalog(context);
  let id = 0;
  const runs = new Map();
  context.mock.method(sequelize, 'transaction', async callback => callback(transaction));
  context.mock.method(BankMaintenanceRun, 'create', async ({ bank }) => {
    const run = { id: ++id, bank, status: 'processing', update: async values => Object.assign(run, values) };
    runs.set(run.id, run); return run;
  });
  context.mock.method(BankMaintenanceRun, 'findByPk', async id => runs.get(id));
  const client = { chat: { completions: { create: async request => {
    const payload = JSON.parse(request.messages[1].content);
    if (payload.languageCode === 'it') throw new Error('timeout');
    return { choices: [{ finish_reason: 'stop', message: { content: '{"items":[]}' } }] };
  } } } };
  const result = await maintainBanks({ it: LEARNING_BANK_SPECS.learning_it, de: LEARNING_BANK_SPECS.learning_de }, { openai: client, settings });
  assert.deepEqual(result.map(row => row.status), ['failed', 'completed']);
});
