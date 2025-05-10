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
  
  // Экспорт конфигурации
  export const CONFIG = {
    DAILY_FACT_TIME: { hour: 17, minute: 30, tz: 'Europe/Moscow' },
    WORD_GAME_TIME: { hour: 18, minute: 30, tz: 'Europe/Moscow' },
    CLEANUP_TIME: '0 12 * * 0', // Каждое воскресенье в 12:00
    WORD_GAME_TIMEOUT: 300000, // 5 минут
    MAX_DIALOG_MESSAGES: 8,
    GPT_MODEL: 'gpt-4',
    OPENAI_MAX_TOKENS: 500
  };