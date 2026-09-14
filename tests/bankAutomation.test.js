import test from 'node:test';
import ContentIdentity from '../models/ContentIdentity.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import sequelize from '../database/database.js';
import BankMaintenanceRun from '../models/BankMaintenanceRun.js';
import GeneratedBankItem from '../models/GeneratedBankItem.js';
import ContentQueue from '../models/ContentQueue.js';
import LearningItem from '../models/LearningItem.js';
import MiniEventPlan from '../models/MiniEventPlan.js';
import { dataFilePath } from '../utils/projectPaths.js';
import { acceptedCandidates, contentFingerprint, validateBankItem, nextSaturday, selectEventQuestions } from '../services/bankContentRules.js';
import { generateReviewedBatch, getAutofillSettings, maintainBanks, publishReviewedBatch } from '../services/bankAutofillService.js';
import { prepareMiniEventPlan, getPlannedQuestion, prepareUpcomingMiniEvent } from '../services/miniEventPlanService.js';

const word = { word: 'lantern', translation: 'фонарь', example: 'Bring a lantern.', hint: 'A portable light', level: 'A2', topic: 'travel' };
const quiz = { question: 'She ___ a book every day.', options: ['reads', 'read', 'reading', 'to read'], correctIndex: 0, explanation: 'Third-person singular uses reads.', level: 'A2', topic: 'habits' };
const settings = getAutofillSettings({});
const spec = { key: 'word', queueType: 'word', bankFile: dataFilePath('word_bank.json') };

function clientFor(items, reviewTransform = entries => entries.map(item => ({ id: item.id, approved: true }))) {
  const calls = [];
  const client = { chat: { completions: { create: async (request, options) => {
    calls.push({ request, options });
    const payload = JSON.parse(request.messages[1].content);
    const content = payload.candidates ? { reviews: reviewTransform(payload.candidates) } : { items };
    return { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(content) } }] };
  } } } };
  return { client, calls };
}

test('normalization rejects duplicate spelling/punctuation variants', () => {
  assert.equal(contentFingerprint('word', word), contentFingerprint('word', { word: ' LANTERN! ' }));
  assert.deepEqual(acceptedCandidates('word', [word], [{ word: 'Lantern' }], 10), []);
});

test('malformed, HTML and ambiguous options fail structural checks', () => {
  assert.equal(validateBankItem('quiz', quiz), true);
  assert.equal(validateBankItem('quiz', { ...quiz, correctIndex: '0' }), false);
  assert.equal(validateBankItem('quiz', { ...quiz, options: ['reads', 'Reads!', 'reading', 'read'] }), false);
  assert.equal(validateBankItem('word', { ...word, example: '<script>test</script>' }), false);
});

test('candidate size is capped and model-supplied IDs/override fields are removed', () => {
  const candidates = acceptedCandidates('word', [{ ...word, id: 'unsafe', translations: ['wrong'], isUsed: true }, { ...word, word: 'torch' }], [], 1);
  assert.equal(candidates.length, 1);
  assert.match(candidates[0].id, /^auto_[a-f0-9]{32}$/);
  assert.equal(candidates[0].translations, undefined);
  assert.equal(candidates[0].isUsed, false);
});

test('generation publishes only explicitly approved unique reviews', async () => {
  const { client, calls } = clientFor([word], entries => [{ id: entries[0].id, approved: 'true' }]);
  const result = await generateReviewedBatch(client, 'word', [], settings, 10);
  assert.equal(result.approved.length, 0);
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.options.timeout, 45000);
    assert.equal(call.options.maxRetries, 0);
    assert.equal(call.request.max_tokens, 4000);
  }
});

test('duplicate review decisions cannot approve an item', async () => {
  const { client } = clientFor([word], entries => [{ id: entries[0].id, approved: true }, { id: entries[0].id, approved: true }]);
  assert.equal((await generateReviewedBatch(client, 'word', [], settings, 10)).approved.length, 0);
});

test('invalid generation does not spend a second review request', async () => {
  const { client, calls } = clientFor([{ word: 'invalid' }]);
  assert.equal((await generateReviewedBatch(client, 'word', [], settings, 10)).approved.length, 0);
  assert.equal(calls.length, 1);
});

test('malformed or truncated model response fails closed', async () => {
  for (const response of [
    { choices: [{ finish_reason: 'length', message: { content: '{}' } }] },
    { choices: [{ finish_reason: 'stop', message: { content: 'not json' } }] },
  ]) {
    const client = { chat: { completions: { create: async () => response } } };
    await assert.rejects(generateReviewedBatch(client, 'word', [], settings, 10));
  }
});

test('settings cap batch size and allow disabling spending', () => {
  assert.equal(getAutofillSettings({ BANK_AUTOFILL_BATCH_SIZE: '900' }).batchSize, 10);
  assert.equal(getAutofillSettings({ BANK_AUTOFILL_BATCH_SIZE: '-1' }).batchSize, 10);
  assert.equal(getAutofillSettings({ BANK_AUTOFILL_ENABLED: 'false' }).enabled, false);
  assert.equal(settings.facts, false);
});

test('only one parallel daily maintenance attempt allocates API requests', async context => {
  context.mock.method(GeneratedBankItem, 'findAll', async () => []);
  context.mock.method(ContentQueue, 'findAll', async () => []);
  let claimed = false;
  const run = { id: 1, status: 'processing', update: async values => Object.assign(run, values) };
  context.mock.method(BankMaintenanceRun, 'create', async () => {
    if (claimed) throw Object.assign(new Error('duplicate'), { name: 'SequelizeUniqueConstraintError' });
    claimed = true; return run;
  });
  let requests = 0;
  const client = { chat: { completions: { create: async () => { requests++; throw new Error('timeout'); } } } };
  const options = { openai: client, now: new Date('2026-09-14T12:00:00Z'), settings };
  const results = await Promise.all([maintainBanks({ word: spec }, options), maintainBanks({ word: spec }, options)]);
  assert.equal(requests, 1);
  assert.equal(run.status, 'failed');
  assert.deepEqual(results.flat().map(result => result.status).sort(), ['already_attempted_today', 'failed']);
  await maintainBanks({ word: spec }, options);
  assert.equal(requests, 1);
});

test('sufficient stock never claims run or calls OpenAI', async context => {
  context.mock.method(GeneratedBankItem, 'findAll', async () => []);
  context.mock.method(ContentQueue, 'findAll', async () => Array.from({ length: 30 }, (_, index) => ({ content: { ...word, word: 'item ' + index }, used: false })));
  context.mock.method(BankMaintenanceRun, 'create', async () => { throw new Error('unexpected claim'); });
  const { client, calls } = clientFor([word]);
  assert.equal((await maintainBanks({ word: spec }, { openai: client, settings }))[0].status, 'stock_ok');
  assert.equal(calls.length, 0);
});

test('publication shares transaction and cannot replay a completed run', async context => {
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };
  context.mock.method(sequelize, 'transaction', async callback => callback(transaction));
  const run = { id: 1, status: 'processing', update: async (values, options) => { assert.equal(options.transaction, transaction); Object.assign(run, values); } };
  context.mock.method(BankMaintenanceRun, 'findByPk', async (_id, options) => { assert.equal(options.lock, 'UPDATE'); return run; });
  const identity = { queue_id: null, used_at: null, update: async values => Object.assign(identity, values) };
  context.mock.method(ContentIdentity, 'findOrCreate', async () => [identity, true]);
  context.mock.method(ContentIdentity, 'findByPk', async () => identity);
  let publications = 0;
  context.mock.method(GeneratedBankItem, 'findOrCreate', async options => { assert.equal(options.transaction, transaction); return [{}, true]; });
  context.mock.method(ContentQueue, 'create', async (row, options) => {
    assert.equal(options.transaction, transaction); assert.equal(row.content.options[row.content.correctIndex], word.translation); publications++; return { id: publications };
  });
  context.mock.method(LearningItem, 'create', async (_row, options) => assert.equal(options.transaction, transaction));
  const existing = [{ ...word, word: 'one', translation: 'один' }, { ...word, word: 'two', translation: 'два' }, { ...word, word: 'three', translation: 'три' }];
  const approved = acceptedCandidates('word', [word], existing, 10);
  const batch = { existing, approved, candidates: approved, review: [] };
  assert.equal(await publishReviewedBatch(spec, batch, run), 1);
  assert.equal(await publishReviewedBatch(spec, batch, run), 0);
  assert.equal(publications, 1);
});

test('Saturday calculation follows Chisinau calendar across UTC midnight', () => {
  assert.equal(nextSaturday(new Date('2026-09-18T22:30:00Z')), '2026-09-19');
  assert.equal(nextSaturday(new Date('2026-09-19T22:30:00Z')), '2026-09-26');
});

test('event selection prefers unused items and keeps distinct reserve', () => {
  const bank = Array.from({ length: 25 }, (_, index) => ({ ...quiz, id: `q${index}`, question: `Question ${index}?` }));
  const plan = selectEventQuestions(bank, [{ event_date: '2026-09-12', question_ids: bank.slice(0, 10).map(item => item.id) }]);
  assert.equal(plan.questions.length, 10);
  assert.equal(plan.reserve.length, 5);
  assert.equal(plan.repeated, 0);
  assert.equal(new Set([...plan.questions, ...plan.reserve].map(item => item.id)).size, 15);
});

test('exhausted seed refuses repeats when generation fails', () => {
  const seed = JSON.parse(fs.readFileSync(dataFilePath('mini_event_questions.json'), 'utf8'));
  assert.throws(() => selectEventQuestions(seed, [{ event_date: '2026-09-12', question_ids: seed.map(item => item.id) }]), /Not enough unused/);
  assert.throws(() => selectEventQuestions(seed.slice(0, 9), []), /Not enough/);
});

test('saved plan is reused and question snapshot wins over bank updates', async context => {
  const plan = { event_date: '2026-09-19', questions: [{ ...quiz, id: 'saved' }], reserve: [] };
  context.mock.method(MiniEventPlan, 'findByPk', async () => plan);
  context.mock.method(GeneratedBankItem, 'findAll', async () => { throw new Error('must not read mutable bank'); });
  assert.equal(await prepareMiniEventPlan('2026-09-19'), plan);
  assert.equal((await getPlannedQuestion('saved', '2026-09-19')).question, quiz.question);
  assert.equal(await getPlannedQuestion('other', '2026-09-19'), null);
});

test('automatic plan preparation waits until Thursday', async () => {
  assert.equal((await prepareUpcomingMiniEvent(new Date('2026-09-14T12:00:00Z'))).status, 'waiting_until_thursday');
});
