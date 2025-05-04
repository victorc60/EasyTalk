export const CONFIG = {
    DAILY_FACT_TIME: { hour: 16, minute: 30, tz: 'Europe/Moscow' },
    WORD_GAME_TIME: { hour: 18, minute: 30, tz: 'Europe/Moscow' },
    CLEANUP_TIME: '0 12 * * 0',
    WORD_GAME_TIMEOUT: 300000,
    MAX_DIALOG_MESSAGES: 6,
    GPT_MODEL: 'gpt-4'
  };
  
  export const COMMANDS = [
    { command: 'start', description: 'Главное меню' },
    { command: 'roleplay', description: 'Ролевая игра' },
    { command: 'topic', description: 'Тема для обсуждения' },
    { command: 'progress', description: 'Твой прогресс' },
    { command: 'leaders', description: 'Таблица лидеров' },
    { command: 'correction', description: 'Режим исправления' }
  ];