import test from 'node:test';
import assert from 'node:assert/strict';
import sequelize from '../database/database.js';
import User from '../models/User.js';
import ContentQueue from '../models/ContentQueue.js';
import DailyLog from '../models/DailyLog.js';
import DailyBonus from '../models/DailyBonus.js';
import WordGameParticipation from '../models/WordGameParticipation.js';
import ContentDelivery from '../models/ContentDelivery.js';
import DailySession from '../models/DailySession.js';
import SessionExercise from '../models/SessionExercise.js';
import { submitQueueAnswer } from '../services/queueAnswerService.js';
import { checkAndAwardDailyBonus } from '../services/dailyBonusService.js';
import { prepareContentDelivery, deliverPendingContent } from '../services/contentDeliveryService.js';
import { submitSessionAnswer, formatSessionExerciseMessage } from '../services/dailySessionService.js';
import { evaluateQueueAnswer } from '../services/answerRules.js';
import { acknowledgeCallback } from '../utils/callbackUtils.js';
import { hasCompletedAllGames } from '../services/dailyBonusHelpers.js';

const date = '2026-09-13';
const question = { id: 8, type: 'word', content_id: 'word_8', content: { word: 'cat', options: ['cat', 'dog'], correctIndex: 0 } };
const request = { userId: 1, type: 'word', queueId: 8, answer: '0', gameDate: date };

function transactionHarness(context) {
  let state = { points: 0, participation: null, bonus: null };
  let tail = Promise.resolve();
  context.mock.method(sequelize, 'transaction', async callback => {
    const previous = tail;
    let release;
    tail = new Promise(resolve => { release = resolve; });
    await previous;
    const snapshot = structuredClone(state);
    try { return await callback({ LOCK: { UPDATE: 'UPDATE' } }); }
    catch (error) { state = snapshot; throw error; }
    finally { release(); }
  });
  context.mock.method(User, 'findOne', async options => {
    assert.equal(options.lock, 'UPDATE');
    assert.ok(options.transaction);
    return { increment: async (_field, options) => { assert.ok(options.transaction); state.points += options.by; } };
  });
  context.mock.method(User, 'increment', async (_field, options) => { assert.ok(options.transaction); state.points += options.by; });
  context.mock.method(ContentQueue, 'findByPk', async () => question);
  context.mock.method(DailyLog, 'findOne', async () => ({ id: 1 }));
  context.mock.method(WordGameParticipation, 'findOne', async () => state.participation);
  context.mock.method(WordGameParticipation, 'create', async (values, options) => {
    assert.ok(options.transaction); state.participation = { ...values }; return state.participation;
  });
  context.mock.method(WordGameParticipation, 'findAll', async () => state.participation ? [state.participation] : []);
  context.mock.method(DailyBonus, 'findOne', async () => state.bonus);
  context.mock.method(DailyBonus, 'create', async (values, options) => { assert.ok(options.transaction); state.bonus = values; });
  return () => state;
}

test('parallel queue answers award points only once', async context => {
  const state = transactionHarness(context);
  const results = await Promise.all([submitQueueAnswer(request), submitQueueAnswer(request)]);
  assert.equal(results.filter(result => result.duplicate).length, 1);
  assert.equal(state().points, 5);
  assert.equal(state().participation.points_earned, 5);
});

test('failed points update rolls back answer and permits retry', async context => {
  const state = transactionHarness(context);
  const lookup = User.findOne;
  context.mock.method(User, 'findOne', async options => {
    const user = await lookup(options);
    const increment = user.increment;
    user.increment = async (...args) => { await increment(...args); throw new Error('database failure'); };
    return user;
  });
  await assert.rejects(submitQueueAnswer(request), /database failure/);
  assert.equal(state().points, 0);
  assert.equal(state().participation, null);
  context.mock.method(User, 'findOne', lookup);
  await submitQueueAnswer(request);
  assert.equal(state().points, 5);
});

test('unpublished questions and mismatched types cannot award points', async context => {
  const state = transactionHarness(context);
  await assert.rejects(submitQueueAnswer({ ...request, type: 'quiz' }), /Question not found/);
  context.mock.method(DailyLog, 'findOne', async () => null);
  await assert.rejects(submitQueueAnswer(request), /not active today/);
  assert.equal(state().points, 0);
});

test('queue and legacy game types jointly qualify for bonus', () => {
  assert.equal(hasCompletedAllGames(['q_word', 'idiom', 'q_phrasal', 'q_quiz'].map(game_type => ({ game_type, answered: true }))), true);
  assert.equal(hasCompletedAllGames(['q_word', 'word', 'q_phrasal', 'q_quiz'].map(game_type => ({ game_type, answered: true }))), false);
});

test('concurrent daily bonus calls pay exactly once', async context => {
  const state = transactionHarness(context);
  context.mock.method(WordGameParticipation, 'findAll', async () => ['q_word', 'q_idiom', 'q_phrasal', 'q_quiz'].map(game_type => ({ game_type, answered: true })));
  const results = await Promise.all([checkAndAwardDailyBonus(1, date), checkAndAwardDailyBonus(1, date)]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(state().points, 20);
});

test('bonus payment failure does not leave a paid marker', async context => {
  const state = transactionHarness(context);
  context.mock.method(WordGameParticipation, 'findAll', async () => ['word', 'idiom', 'phrasal_verb', 'quiz'].map(game_type => ({ game_type, answered: true })));
  context.mock.method(User, 'increment', async () => { throw new Error('offline'); });
  await assert.rejects(checkAndAwardDailyBonus(1, date), /offline/);
  assert.equal(state().bonus, null);
  assert.equal(state().points, 0);
});

test('expired callback acknowledgement does not throw', async () => {
  const result = await acknowledgeCallback({ answerCallbackQuery: async () => { throw new Error('query is too old and response timeout expired'); } }, 'old');
  assert.equal(result, false);
});

test('invalid option and malformed fact answers are rejected', () => {
  for (const answer of ['0x', '-1', '3', '', 'NaN']) assert.throws(() => evaluateQueueAnswer('word', question.content, answer));
  assert.throws(() => evaluateQueueAnswer('fact', { isTrue: false }, 'garbage'));
  assert.deepEqual(evaluateQueueAnswer('fact', { isTrue: false }, 'false'), { correct: true, points: 10 });
});

test('existing publication is not recreated on restart', async context => {
  transactionHarness(context);
  context.mock.method(DailyLog, 'findOne', async () => ({ id: 42 }));
  context.mock.method(ContentQueue, 'findOne', async () => { throw new Error('must not select new content'); });
  assert.equal((await prepareContentDelivery('word', date)).id, 42);
});

function deliveryHarness(context) {
  const row = { id: 1, queue_id: 8, user_id: 1, status: 'pending', update: async values => Object.assign(row, values) };
  context.mock.method(ContentDelivery, 'findAll', async () => row.status === 'pending' ? [row] : []);
  context.mock.method(ContentQueue, 'findByPk', async () => question);
  context.mock.method(ContentDelivery, 'update', async values => {
    if (row.status !== 'pending') return [0];
    Object.assign(row, values); return [1];
  });
  return row;
}
const buildMessage = () => ({ text: 'Question', reply_markup: {} });

test('parallel broadcast workers claim recipient once; restart skips sent', async context => {
  const row = deliveryHarness(context);
  let sent = 0;
  const bot = { sendMessage: async () => { sent++; return { message_id: 99 }; } };
  await Promise.all([deliverPendingContent(bot, { id: 1 }, buildMessage), deliverPendingContent(bot, { id: 1 }, buildMessage)]);
  await deliverPendingContent(bot, { id: 1 }, buildMessage);
  assert.equal(sent, 1);
  assert.equal(row.status, 'sent');
});

test('ambiguous Telegram failure is not retried automatically', async context => {
  const row = deliveryHarness(context);
  let calls = 0;
  const bot = { sendMessage: async () => { calls++; throw new Error('connection reset'); } };
  await deliverPendingContent(bot, { id: 1 }, buildMessage);
  await deliverPendingContent(bot, { id: 1 }, buildMessage);
  assert.equal(row.status, 'unknown');
  assert.equal(calls, 1);
});

test('crash after delivery claim does not resend on restart', async context => {
  const row = deliveryHarness(context);
  row.status = 'sending';
  let calls = 0;
  await deliverPendingContent({ sendMessage: async () => { calls++; } }, { id: 1 }, buildMessage);
  assert.equal(calls, 0);
  assert.equal(row.status, 'sending');
});

test('Telegram retry_after is preserved for a rejected delivery', async context => {
  const row = deliveryHarness(context);
  const now = Date.now();
  const bot = { sendMessage: async () => { throw { response: { body: { error_code: 429, parameters: { retry_after: 120 } } } }; } };
  await deliverPendingContent(bot, { id: 1 }, buildMessage);
  assert.equal(row.status, 'pending');
  assert.ok(row.retry_at.getTime() >= now + 120000);
});

test('foreign session rejected before loading exercise', async context => {
  context.mock.method(DailySession, 'findByPk', async () => ({ id: 1, status: 'active', user_id: 2 }));
  await assert.rejects(submitSessionAnswer({ sessionId: 1, exerciseId: 10, userId: 1, answer: 0 }), /not active/);
});

test('old exercise ID rejected without updating progress', async context => {
  context.mock.method(DailySession, 'findByPk', async () => ({ id: 1, status: 'active', user_id: 1, current_position: 1 }));
  context.mock.method(SessionExercise, 'findOne', async () => ({ id: 11 }));
  await assert.rejects(submitSessionAnswer({ sessionId: 1, exerciseId: 10, userId: 1, answer: 0 }), /expired/);
});

test('session keyboard carries exercise identity', () => {
  const message = formatSessionExerciseMessage({ id: 1, target_language: 'en', current_position: 0, total_exercises: 2 }, {
    id: 10, exercise_type: 'translation_choice', prompt: { question: 'Choose', options: ['yes', 'no'] },
  });
  assert.equal(message.reply_markup.inline_keyboard[0][0].callback_data, 'session_answer_1_10_0');
});
