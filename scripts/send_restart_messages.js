#!/usr/bin/env node
/**
 * Скрипт для отправки сообщений пользователям с просьбой нажать /start.
 * Используется после восстановления базы данных.
 *
 * Запуск: node scripts/send_restart_messages.js
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error('Ошибка: TELEGRAM_BOT_TOKEN не задан в .env');
  process.exit(1);
}

const USER_IDS = [
  340048933,
];

const MESSAGE = `👋 Привет!

Мы обновили нашу систему, и нам нужно, чтобы ты заново активировал бота.

Пожалуйста, нажми кнопку ниже или введи команду /start, чтобы продолжить пользоваться EasyTalk. 🚀`;

// Пауза между отправками, чтобы не получить flood limit (рекомендуется ~50мс)
const DELAY_MS = 100;

async function sendMessage(chatId, text) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_markup: {
        inline_keyboard: [
          [{ text: '▶️ Запустить бота', callback_data: 'start' }],
        ],
      },
    }),
  });

  const data = await response.json();
  return data;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log(`Начинаю отправку сообщений для ${USER_IDS.length} пользователей...\n`);

  let successCount = 0;
  let failCount = 0;

  for (const userId of USER_IDS) {
    try {
      const result = await sendMessage(userId, MESSAGE);

      if (result.ok) {
        console.log(`✅ [${userId}] — отправлено`);
        successCount++;
      } else {
        console.log(`❌ [${userId}] — ошибка: ${result.description}`);
        failCount++;
      }
    } catch (err) {
      console.log(`❌ [${userId}] — исключение: ${err.message}`);
      failCount++;
    }

    await sleep(DELAY_MS);
  }

  console.log(`\nГотово! Успешно: ${successCount}, Ошибок: ${failCount}`);
}

main();
