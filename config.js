// config.js

export function hasDatabaseConfig() {
  if (process.env.DATABASE_URL || process.env.MYSQL_URL) return true;
  if (
    process.env.MYSQLHOST &&
    process.env.MYSQLUSER &&
    process.env.MYSQLPASSWORD &&
    process.env.MYSQLDATABASE
  )
    return true;
  if (
    process.env.DB_HOST &&
    process.env.DB_NAME &&
    process.env.DB_USER &&
    process.env.MYSQLPASSWORD
  )
    return true;
  return false;
}

export function validateEnv() {
  const required = ['TELEGRAM_BOT_TOKEN', 'OPENAI_API_KEY', 'ADMIN_ID'];
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`${key} не установлен в переменных окружения`);
    }
  }
  if (!hasDatabaseConfig()) {
    throw new Error(
      'Нет конфигурации БД. Нужно: DATABASE_URL или MYSQL_URL, либо (MYSQLHOST+MYSQLUSER+MYSQLPASSWORD+MYSQLDATABASE), либо (DB_HOST+DB_NAME+DB_USER+MYSQLPASSWORD)'
    );
  }
}

export const CONFIG = {
  DAILY_FACT_TIME: { hour: 17, minute: 30, tz: 'Europe/Chisinau' },
  WORD_GAME_TIMES: [{ hour: 18, minute: 30, tz: 'Europe/Chisinau' }],
  IDIOM_GAME_TIME: { hour: 13, minute: 0, tz: 'Europe/Chisinau' },
  PHRASAL_VERB_GAME_TIME: { hour: 20, minute: 0, tz: 'Europe/Chisinau' },
  QUIZ_GAME_TIME: { hour: 8, minute: 30, tz: 'Europe/Chisinau' },
  WEEKLY_LEADERBOARD_TIME: { dayOfWeek: 0, hour: 21, minute: 5, tz: 'Europe/Chisinau' },
  WORD_GAME_STATS_TIME: { hour: 23, minute: 0, tz: 'Europe/Chisinau' },
  CLEANUP_TIME: { dayOfWeek: 0, hour: 12, minute: 0, tz: 'Europe/Chisinau' },
  WORD_GAME_TIMEOUT: null,
  MAX_DIALOG_MESSAGES: 5,
  GPT_MODEL: 'gpt-3.5-turbo',
  OPENAI_MAX_TOKENS: 500,
};
