#!/usr/bin/env node
/**
 * Unit-тесты для EasyTalk бота.
 * Запуск: node tests/run_tests.js
 *
 * Что делает:
 *  - Тестирует логику pickFromBank (isUsed, сброс, циклы)
 *  - Выводит подробные логи в консоль (видно на сервере)
 *  - Отправляет итоги тебе в Telegram (если запущен с токеном)
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env if dotenv is available (not needed in production where env vars are set directly)
try {
  const { default: dotenv } = await import('dotenv');
  dotenv.config({ path: path.join(__dirname, '..', '.env') });
} catch (_) {}

import { pickFromBank, readBankFile, writeJsonArray } from '../utils/bankUtils.js';
import { hasCompletedAllGames, BONUS_GAMES, BONUS_POINTS } from '../services/dailyBonusHelpers.js';

// ─── Инфраструктура ──────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const results = [];

function ok(condition, message) {
  if (!condition) throw new Error(message);
}

function eq(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message} — ожидалось "${expected}", получено "${actual}"`);
  }
}

async function test(name, fn) {
  try {
    await fn();
    passed++;
    const line = `  ✅  ${name}`;
    console.log(line);
    results.push(line);
  } catch (err) {
    failed++;
    const line = `  ❌  ${name}\n       → ${err.message}`;
    console.log(line);
    results.push(line);
  }
}

function tempBank(items) {
  const file = path.join(os.tmpdir(), `easytalk_test_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(file, JSON.stringify(items, null, 2), 'utf8');
  return file;
}

function cleanUp(file) {
  try { fs.unlinkSync(file); } catch (_) {}
}

// ─── Тесты ───────────────────────────────────────────────────────────────────

async function runAllTests() {
  console.log('\n' + '═'.repeat(50));
  console.log('🧪  EasyTalk — Unit Tests');
  console.log('═'.repeat(50));

  // ── pickFromBank ──────────────────────────────────────

  console.log('\n📦 pickFromBank\n');

  await test('возвращает элемент из непустого банка', () => {
    const f = tempBank([{ word: 'apple', isUsed: false }]);
    try {
      const result = pickFromBank(f);
      ok(result !== null, 'Результат не должен быть null');
      ok(result.word === 'apple', 'Должен вернуть единственный элемент');
    } finally { cleanUp(f); }
  });

  await test('возвращает null для пустого банка', () => {
    const f = tempBank([]);
    try {
      const result = pickFromBank(f);
      ok(result === null, 'Пустой банк → null');
    } finally { cleanUp(f); }
  });

  await test('сразу помечает выбранный элемент isUsed: true', () => {
    const f = tempBank([{ word: 'hello', isUsed: false }, { word: 'world', isUsed: false }]);
    try {
      const chosen = pickFromBank(f);
      const rows = readBankFile(f);
      const chosenRow = rows.find(r => r.word === chosen.word);
      ok(chosenRow.isUsed === true, 'Выбранный элемент должен быть isUsed: true');
    } finally { cleanUp(f); }
  });

  await test('не берёт элементы с isUsed: true', () => {
    const f = tempBank([
      { word: 'used', isUsed: true },
      { word: 'free', isUsed: false },
    ]);
    try {
      const result = pickFromBank(f);
      eq(result.word, 'free', 'Должен взять только свободный элемент');
    } finally { cleanUp(f); }
  });

  await test('когда все использованы — сбрасывает и берёт заново', () => {
    const f = tempBank([
      { word: 'x', isUsed: true },
      { word: 'y', isUsed: true },
    ]);
    try {
      const result = pickFromBank(f);
      ok(result !== null, 'После сброса должен вернуть элемент');
      const rows = readBankFile(f);
      const usedCount = rows.filter(r => r.isUsed).length;
      eq(usedCount, 1, 'После сброса ровно 1 элемент должен быть использован');
    } finally { cleanUp(f); }
  });

  await test('цикл из 3 слов — все разные, без повторов', () => {
    const f = tempBank([
      { word: 'alpha', isUsed: false },
      { word: 'beta',  isUsed: false },
      { word: 'gamma', isUsed: false },
    ]);
    try {
      const picked = new Set();
      picked.add(pickFromBank(f).word);
      picked.add(pickFromBank(f).word);
      picked.add(pickFromBank(f).word);
      eq(picked.size, 3, 'Все 3 вызова должны вернуть разные слова');
    } finally { cleanUp(f); }
  });

  await test('после полного цикла — на 4-й вызов слова начинаются заново', () => {
    const f = tempBank([
      { word: 'one',   isUsed: false },
      { word: 'two',   isUsed: false },
      { word: 'three', isUsed: false },
    ]);
    try {
      pickFromBank(f); // 1
      pickFromBank(f); // 2
      pickFromBank(f); // 3 — все использованы
      const result4 = pickFromBank(f); // 4 — сброс → снова берёт
      ok(result4 !== null, '4-й вызов после сброса должен вернуть элемент');
    } finally { cleanUp(f); }
  });

  await test('writeJsonArray и readBankFile симметричны', () => {
    const f = path.join(os.tmpdir(), `easytalk_rw_${Date.now()}.json`);
    try {
      const data = [{ word: 'test', isUsed: false }];
      writeJsonArray(f, data);
      const back = readBankFile(f);
      eq(back.length, 1, 'Прочитанный массив должен содержать 1 элемент');
      eq(back[0].word, 'test', 'Данные должны совпадать после записи и чтения');
    } finally { cleanUp(f); }
  });

  // ── hasCompletedAllGames (daily bonus logic) ──────────────────────────────

  console.log('\n🎯 hasCompletedAllGames (daily bonus)\n');

  await test('возвращает false если ни одной игры', () => {
    ok(hasCompletedAllGames([]) === false, 'Пустой массив → false');
  });

  await test('возвращает false если ответил только на 3 из 4 игр', () => {
    const participations = [
      { game_type: 'word',         answered: true },
      { game_type: 'idiom',        answered: true },
      { game_type: 'phrasal_verb', answered: true },
      // quiz отсутствует
    ];
    ok(hasCompletedAllGames(participations) === false, '3 игры → false');
  });

  await test('возвращает true если ответил на все 4 игры', () => {
    const participations = [
      { game_type: 'word',         answered: true },
      { game_type: 'idiom',        answered: true },
      { game_type: 'phrasal_verb', answered: true },
      { game_type: 'quiz',         answered: true },
    ];
    ok(hasCompletedAllGames(participations) === true, 'Все 4 игры → true');
  });

  await test('не считает игры с answered: false', () => {
    const participations = [
      { game_type: 'word',         answered: true  },
      { game_type: 'idiom',        answered: true  },
      { game_type: 'phrasal_verb', answered: true  },
      { game_type: 'quiz',         answered: false }, // не ответил
    ];
    ok(hasCompletedAllGames(participations) === false, 'answered:false не считается');
  });

  await test('игнорирует лишние типы игр (fact и др.)', () => {
    const participations = [
      { game_type: 'word',         answered: true },
      { game_type: 'idiom',        answered: true },
      { game_type: 'phrasal_verb', answered: true },
      { game_type: 'quiz',         answered: true },
      { game_type: 'fact',         answered: true }, // не входит в BONUS_GAMES
    ];
    ok(hasCompletedAllGames(participations) === true, 'Лишние типы не мешают');
  });

  await test('BONUS_GAMES содержит ровно 4 нужные игры', () => {
    eq(BONUS_GAMES.length, 4, 'Должно быть 4 игры');
    ok(BONUS_GAMES.includes('word'), 'word');
    ok(BONUS_GAMES.includes('idiom'), 'idiom');
    ok(BONUS_GAMES.includes('phrasal_verb'), 'phrasal_verb');
    ok(BONUS_GAMES.includes('quiz'), 'quiz');
  });

  await test(`BONUS_POINTS равен 20`, () => {
    eq(BONUS_POINTS, 20, 'Бонус должен быть 20 очков');
  });

  // ─── Итог ────────────────────────────────────────────────────────────────

  const separator = '─'.repeat(50);
  const summary = failed === 0
    ? `✅  Все тесты прошли!`
    : `⚠️  ${failed} тест(а/ов) упало!`;

  console.log('\n' + separator);
  console.log(`📊  ${summary}`);
  console.log(`    Прошло: ${passed}   Упало: ${failed}`);
  console.log(separator + '\n');

  await sendToTelegram(summary);

  process.exit(failed > 0 ? 1 : 0);
}

// ─── Telegram-уведомление ────────────────────────────────────────────────────

async function sendToTelegram(summary) {
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const ADMIN_ID  = process.env.ADMIN_ID;

  if (!BOT_TOKEN || !ADMIN_ID) {
    console.log('ℹ️  Telegram-уведомление пропущено (нет TELEGRAM_BOT_TOKEN или ADMIN_ID в .env)\n');
    return;
  }

  const lines = results.join('\n').replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
  const header = failed === 0 ? '✅ Все тесты прошли\\!' : `⚠️ ${failed} тест\\(а/ов\\) упало\\!`;
  const text =
    `🧪 *EasyTalk — Unit Tests*\n\n` +
    `${header}\n\n` +
    `${lines}\n\n` +
    `✅ ${passed} прошло   ❌ ${failed} упало`;

  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: ADMIN_ID,
        text,
        parse_mode: 'MarkdownV2',
      }),
    });
    const data = await res.json();
    if (data.ok) {
      console.log('📨  Результаты отправлены тебе в Telegram\n');
    } else {
      console.warn('⚠️  Telegram ответил ошибкой:', data.description);
    }
  } catch (err) {
    console.warn('⚠️  Не удалось отправить в Telegram:', err.message);
  }
}

runAllTests();
