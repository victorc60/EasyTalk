// config.js
const requiredEnvVars = [
    'TELEGRAM_BOT_TOKEN',
    'OPENAI_API_KEY',
    'ADMIN_ID',
    'DATABASE_URL',
    'DB_HOST',
    'DB_NAME',
    'DB_USER',
    'MYSQLPASSWORD'
  ];
  
  // Проверка наличия всех необходимых переменных окружения
  requiredEnvVars.forEach(envVar => {
    if (!process.env[envVar]) {
      console.error(`ERROR: ${envVar} не установлен в переменных окружения`);
      process.exit(1);
    }
  });
  
  // Новая конфигурация
export const CONFIG = {
  DAILY_FACT_TIME: { hour: 17, minute: 30, tz: 'Europe/Moscow' },
  WORD_GAME_TIMES: [  
    { hour: 18, minute: 30, tz: 'Europe/Moscow' },
    { hour: 20, minute: 0, tz: 'Europe/Moscow' }
  ],
  WORD_GAME_STATS_TIME: { hour: 0, minute: 5, tz: 'Europe/Moscow' }, // Stats notification at 00:05
  CLEANUP_TIME: '0 12 * * 0',
  WORD_GAME_TIMEOUT: null, // Set to null to disable timeout (run until end of day)
  MAX_DIALOG_MESSAGES: 5,
  GPT_MODEL: 'gpt-3.5-turbo',
  OPENAI_MAX_TOKENS: 500
};