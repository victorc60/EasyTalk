// index.js
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import TelegramBot from 'node-telegram-bot-api';
import { OpenAI } from 'openai';
import sequelize from './database/database.js';
import { sendAdminMessage } from './utils/botUtils.js';
import { setupBot } from './botSetup.js';
import { startBossGrammarWebhook } from './services/bossGrammarWebhook.js';
import './models/WordGameParticipation.js'; // Import to initialize the model
import './models/DailyWordGame.js';
import './models/DailyGameSession.js';
import './models/WeeklyLeaderboardReward.js';
import './models/Poll.js';
import './models/PollDelivery.js';
import './models/PollResponse.js';
import './models/MiniEventDay.js';
import './models/MiniEventParticipant.js';
import './models/MiniEventResponse.js';
import './models/ContentQueue.js';
import './models/DailyLog.js';
import './models/Streak.js';
import { initAllQueues } from './init/initQueues.js';
import fs from 'fs';
import { migrateStreaksFromJson } from './init/migrateStreaks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
app.use(express.json());

const botToken = process.env.TELEGRAM_BOT_TOKEN;
if (!botToken) {
  console.error('TELEGRAM_BOT_TOKEN is not set');
  process.exit(1);
}

const webhookPath = `/telegram/webhook/${botToken}`;
const webhookBase = process.env.TELEGRAM_WEBHOOK_URL || process.env.WEBHOOK_DOMAIN;
const webhookUrl = webhookBase ? `${webhookBase.replace(/\/$/, '')}${webhookPath}` : null;
const usePolling = !webhookUrl;

if (!webhookUrl) {
  console.warn('TELEGRAM_WEBHOOK_URL or WEBHOOK_DOMAIN is not configured; falling back to polling.');
}

// Создаём бота без автозапуска polling, чтобы не конкурировать с другим экземпляром (409)
// и не вызывать getUpdates до готовности приложения (БД, setup). Polling запустим ниже после init.
const bot = new TelegramBot(botToken, { polling: false });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const userSessions = {
  wordGames: new Map(),
  idiomGames: new Map(),
  phrasalVerbGames: new Map(),
  quizGames: new Map(),
  factGames: new Map(),
  activeDialogs: new Map(),
  conversationModes: new Map(),
  chatHistories: new Map(),  // { userId → { messages: [], lastAt: timestamp } }
  pollDrafts: new Map(),
  broadcastPending: false,
  broadcastContent: { text: null, photo: null },
  pendingStickerCategory: null
};

if (webhookUrl) {
  app.post(webhookPath, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
  });
}

// Повторные попытки подключения к БД (удобно при старте на Railway, когда MySQL ещё поднимается)
const DB_RETRY_ATTEMPTS = Number(process.env.DB_RETRY_ATTEMPTS) || 10;
const DB_RETRY_DELAY_MS = Number(process.env.DB_RETRY_DELAY_MS) || 5000;
const DB_SYNC_MODE = process.env.DB_SYNC_MODE || 'safe';

function getSyncOptions() {
  switch (DB_SYNC_MODE) {
    case 'alter':
      return { alter: true };
    case 'force':
      return { force: true };
    case 'off':
      return null;
    case 'safe':
    default:
      return {};
  }
}

async function runMigrations() {
  const migrations = [
    // Удаляем старые индексы которые блокировали запись нескольких игр в один день
    // (оставлен только правильный uq_wgp_user_date_type_slot)
    `ALTER TABLE word_game_participation DROP INDEX \`word_game_participation_user_id_game_date\``,
    `ALTER TABLE word_game_participation DROP INDEX \`word_game_participation_user_id_game_date_game_type\``,
  ];
  for (const sql of migrations) {
    try {
      await sequelize.query(sql);
      console.log(`✅ Миграция выполнена: ${sql.slice(0, 60)}...`);
    } catch (err) {
      // Индекс уже удалён или не существует — это нормально
      if (['ER_CANT_DROP_FIELD_OR_KEY', 'ER_DROP_INDEX_FK'].includes(err.original?.code) || err.message?.includes("Can't DROP") || err.message?.includes("check that column/key exists")) {
        console.log(`ℹ️ Миграция пропущена (уже применена): ${sql.slice(0, 60)}...`);
      } else {
        console.error(`⚠️ Ошибка миграции: ${err.message}`);
      }
    }
  }
}

async function initializeDatabase() {
  for (let attempt = 1; attempt <= DB_RETRY_ATTEMPTS; attempt++) {
    try {
      await sequelize.authenticate();
      const syncOptions = getSyncOptions();
      if (syncOptions) {
        await sequelize.sync(syncOptions);
        console.log(`🗄️ Схема БД синхронизирована в режиме "${DB_SYNC_MODE}"`);
      } else {
        console.log('🗄️ Синхронизация схемы БД отключена (DB_SYNC_MODE=off)');
      }
      await runMigrations();
      console.log('✅ База данных подключена');
      return;
    } catch (error) {
      console.error(`❌ БД попытка ${attempt}/${DB_RETRY_ATTEMPTS}:`, error.message);
      if (attempt === DB_RETRY_ATTEMPTS) {
        console.error('❌ Не удалось подключиться к базе данных после всех попыток');
        process.exit(1);
      }
      console.log(`⏳ Повтор через ${DB_RETRY_DELAY_MS / 1000} сек...`);
      await new Promise((r) => setTimeout(r, DB_RETRY_DELAY_MS));
    }
  }
}

process.on('SIGTERM', async () => {
  console.log('Получен сигнал SIGTERM. Завершаем работу...');
  try {
    bot.stopPolling?.();
    await sendAdminMessage(bot, '🛑 Бот останавливается (SIGTERM)');
    await sequelize.close();
    console.log('Соединение с базой данных закрыто');
    process.exit(0);
  } catch (error) {
    console.error('Ошибка при завершении работы:', error);
    process.exit(1);
  }
});

// ─── STARTUP DIAGNOSTICS ─────────────────────────────────────────────────────
async function runStartupDiagnostics() {
  console.log('\n════════════════════════════════════════');
  console.log('🔍 STARTUP DIAGNOSTICS');
  console.log('════════════════════════════════════════');

  // 1. Банки контента — какие файлы есть и сколько в них элементов
  const bankFiles = [
    { label: 'word_bank.json',          path: path.join(__dirname, 'data/word_bank.json') },
    { label: 'idiom_bank.json',         path: path.join(__dirname, 'data/idiom_bank.json') },
    { label: 'phrasal_verbs_bank.json', path: path.join(__dirname, 'data/phrasal_verbs_bank.json') },
    { label: 'quiz_bank.json',          path: path.join(__dirname, 'data/quiz_bank.json') },
    { label: 'facts_bank.json',         path: path.join(__dirname, 'data/facts_bank.json') },
    { label: 'src/words_bank.json',     path: path.join(__dirname, 'src/data/words_bank.json') },
    { label: 'src/idioms_bank.json',    path: path.join(__dirname, 'src/data/idioms_bank.json') },
    { label: 'src/quiz_bank.json',      path: path.join(__dirname, 'src/data/quiz_bank.json') },
    { label: 'src/phrasal_bank.json',   path: path.join(__dirname, 'src/data/phrasal_bank.json') },
    { label: 'src/facts_bank.json',     path: path.join(__dirname, 'src/data/facts_bank.json') },
  ];

  console.log('\n📁 БАНКИ КОНТЕНТА:');
  for (const { label, path: filePath } of bankFiles) {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(raw);
      const count = Array.isArray(data) ? data.length : Object.keys(data).length;
      const firstKey = Array.isArray(data) && data[0]
        ? (data[0].word || data[0].idiom || data[0].phrasalVerb || data[0].verb || data[0].question || data[0].claim || data[0].id || '?')
        : '?';
      console.log(`  ✅ ${label}: ${count} элементов | первый: "${firstKey}"`);
    } catch {
      console.log(`  ❌ ${label}: файл не найден`);
    }
  }

  // 2. Таблица content_queue — что в ней сейчас
  console.log('\n🗄️  ТАБЛИЦА content_queue:');
  try {
    const [rows] = await sequelize.query(
      `SELECT type,
              COUNT(*) AS total,
              SUM(CASE WHEN \`used\` = 1 THEN 1 ELSE 0 END) AS used_count,
              SUM(CASE WHEN \`used\` = 0 THEN 1 ELSE 0 END) AS pending_count
       FROM content_queue
       GROUP BY type
       ORDER BY type`
    );
    if (rows.length === 0) {
      console.log('  ⚠️  Таблица content_queue пуста');
    } else {
      for (const row of rows) {
        console.log(`  ${row.type}: всего=${row.total} | использовано=${row.used_count} | в очереди=${row.pending_count}`);
      }
    }

    // Первый элемент каждого типа который ещё не использован
    const [nextRows] = await sequelize.query(
      `SELECT type,
              content_id,
              CAST(content AS CHAR) AS content_preview
       FROM content_queue
       WHERE \`used\` = 0
       GROUP BY type
       ORDER BY type, id ASC`
    );
    if (nextRows.length > 0) {
      console.log('\n  ➡️  Следующие в очереди (used=0):');
      for (const row of nextRows) {
        try {
          const c = JSON.parse(row.content_preview);
          const label = c.word || c.idiom || c.verb || c.question || c.claim || row.content_id;
          console.log(`     ${row.type}: "${label}" (content_id: ${row.content_id})`);
        } catch {
          console.log(`     ${row.type}: content_id=${row.content_id}`);
        }
      }
    }
  } catch (err) {
    console.log(`  ℹ️  Таблица content_queue не существует или недоступна: ${err.message}`);
  }

  // 3. Индексные файлы
  console.log('\n📌 ИНДЕКСЫ И ИСТОРИЯ:');
  const indexFiles = [
    path.join(__dirname, 'data/word_index.json'),
    path.join(__dirname, 'data/word_history.json'),
    path.join(__dirname, 'data/idiom_history.json'),
  ];
  for (const filePath of indexFiles) {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const label = path.basename(filePath);
      const data = JSON.parse(raw);
      const info = Array.isArray(data) ? `${data.length} записей` : JSON.stringify(data);
      console.log(`  ✅ ${label}: ${info}`);
    } catch {
      console.log(`  ❌ ${path.basename(filePath)}: не найден`);
    }
  }

  console.log('\n════════════════════════════════════════\n');
}
// ─────────────────────────────────────────────────────────────────────────────

process.on('unhandledRejection', (error) => {
  console.error('Необработанная ошибка:', error);
  sendAdminMessage(bot, `‼️ Критическая ошибка: ${error.message}`)
    .catch(err => console.error('Не удалось отправить сообщение об ошибке:', err));
});

(async () => {
  try {
    await initializeDatabase();
    await migrateStreaksFromJson();
    await initAllQueues();
    await runStartupDiagnostics();
    await setupBot(bot, userSessions, openai);

    if (webhookUrl) {
      await bot.setWebHook(webhookUrl, { drop_pending_updates: true });
      console.log(`Webhook set to ${webhookUrl}`);
    }

    startBossGrammarWebhook(bot, app);

    const port = Number(process.env.PORT || 3000);
    app.get('/health', (req, res) => res.json({ ok: true }));
    const server = app.listen(port, () => {
      console.log(`Server listening on port ${port}`);
    });

    if (usePolling) {
      bot.startPolling();
      console.log('Polling запущен (убедитесь, что не работает другой экземпляр этого бота).');
    }
    if (webhookUrl) {
      await sendAdminMessage(bot, `🟢 Бот запущен (webhook)\n🔗 ${webhookUrl}\n⏰ Время сервера: ${new Date().toLocaleString()}`);
    } else {
      await sendAdminMessage(bot, `🟢 Бот запущен (polling)\n⏰ Время сервера: ${new Date().toLocaleString()}`);
    }

    const shutdown = async (signal) => {
      console.log(`${signal} получен, останавливаем бота...`);
      try {
        if (usePolling) {
          await bot.stopPolling();
          console.log('Polling остановлен');
        }
        server.close(() => {
          console.log('HTTP сервер закрыт');
          process.exit(0);
        });
        setTimeout(() => process.exit(0), 5000);
      } catch (err) {
        console.error('Ошибка при остановке:', err.message);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    console.error('Ошибка запуска:', error);
    await sendAdminMessage(bot, `‼️ Ошибка запуска бота: ${error.message}`)
      .catch(err => console.error('Не удалось отправить сообщение админу:', err));
    process.exit(1);
  }
})();
