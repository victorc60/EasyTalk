import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';
import { OpenAI } from 'openai';
import schedule from 'node-schedule';
import sequelize from './database/database.js';
import User from './models/User.js';

// === Конфигурация ===
const CONFIG = {
  DAILY_FACT_TIME: { hour: 17, minute: 30, tz: 'Europe/Moscow' },
  WORD_GAME_TIME: { hour: 18, minute: 30, tz: 'Europe/Moscow' },
  CLEANUP_TIME: '0 12 * * 0', // Каждое воскресенье в 12:00
  WORD_GAME_TIMEOUT: 300000, // 5 минут
  MAX_DIALOG_MESSAGES: 8,
  GPT_MODEL: 'gpt-4',
  OPENAI_MAX_TOKENS: 500 // Увеличиваем лимит токенов для больших ответов
};

// Проверка переменных окружения
['TELEGRAM_BOT_TOKEN', 'OPENAI_API_KEY', 'ADMIN_ID'].forEach(envVar => {
  if (!process.env[envVar]) {
    console.error(`ERROR: ${envVar} не установлен в .env`);
    process.exit(1);
  }
});

// Инициализация Telegram бота
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// === Хранилища состояний ===
const userSessions = {
  wordGames: new Map(),
  activeDialogs: new Map(),
  conversationModes: new Map()
};

// === Инициализация базы данных ===
async function initializeDatabase() {
  try {
    await sequelize.authenticate();
    await sequelize.sync({ alter: true });
    console.log('✅ База данных подключена');
  } catch (error) {
    console.error('❌ Ошибка базы данных:', error);
    process.exit(1);
  }
}

// === Генераторы контента ===
const contentGenerators = {
  async generateEnglishContent(prompt, format = 'text') {
    try {
      const { choices } = await openai.chat.completions.create({
        model: CONFIG.GPT_MODEL,
        messages: [{ role: 'system', content: prompt }],
        temperature: 0.8,
        max_tokens: CONFIG.OPENAI_MAX_TOKENS
      });

      const content = choices[0]?.message?.content;
      if (!content) {
        console.error('OpenAI вернул пустой ответ для prompt:', prompt);
        return null;
      }

      if (format === 'json') {
        try {
          const parsed = JSON.parse(content);
          if (!parsed || typeof parsed !== 'object') {
            console.error('OpenAI вернул некорректный JSON:', content);
            return null;
          }
          return parsed;
        } catch (error) {
          console.error('Ошибка парсинга JSON от OpenAI:', error.message, 'Content:', content);
          return null;
        }
      }
      return content;
    } catch (error) {
      console.error('Ошибка генерации контента:', error.message);
      return null;
    }
  },

  async dailyFact() {
    const prompt = `Generate an interesting English language fact with Russian translation. Include:
    - The fact in English
    - Translation in Russian
    - Brief explanation (1 sentence)
    Format:
    🇬🇧 [fact]
    🇷🇺 [translation]
    💡 [explanation]`;
    
    const fact = await this.generateEnglishContent(prompt);
    return fact || 
      `🇬🇧 "Goodbye" comes from "God be with ye"\n🇷🇺 "Goodbye" происходит от "God be with ye"\n💡 Старое английское выражение, сократившееся со временем`;
  },

  async wordOfTheDay() {
    const prompt = `Generate a B1-level English word with:
    - The word
    - Russian translation
    - Example sentence
    - Interesting fact about the word
    - Common mistakes with this word
    Return as JSON: {word, translation, example, fact, mistakes}`;
    
    const result = await this.generateEnglishContent(prompt, 'json');
    
    return result || {
      word: "serendipity",
      translation: "счастливая случайность",
      example: "Finding this cafe was pure serendipity.",
      fact: "Comes from Persian fairy tale 'The Three Princes of Serendip'",
      mistakes: "Often confused with 'luck' - but implies unexpected discovery"
    };
  },

  async randomCharacter() {
    const types = ["famous actor", "historical figure", "book character", "scientist"];
    const type = types[Math.floor(Math.random() * types.length)];
    const prompt = `Create a ${type} for English practice with:
    - Name
    - Short description (1 sentence)
    - Greeting message
    - Farewell message
    - 3 personality traits
    Return as JSON: {"name": "", "description": "", "greeting": "", "farewell": "", "traits": []}`;

    try {
      const result = await this.generateEnglishContent(prompt, 'json');
      if (!result || !result.name) {
        console.error('randomCharacter: Получен некорректный результат:', result);
        return {
          name: "Sherlock Holmes",
          description: "Famous detective from London",
          greeting: "Elementary, my dear friend. What brings you to Baker Street today?",
          farewell: "The game is afoot! I must go now.",
          traits: ["observant", "logical", "eccentric"]
        };
      }
      console.log('Сгенерирован персонаж:', result);
      return result;
    } catch (error) {
      console.error('randomCharacter: Ошибка генерации персонажа, используется резервный:', error.message);
      return {
        name: "Sherlock Holmes",
        description: "Famous detective from London",
        greeting: "Elementary, my dear friend. What brings you to Baker Street today?",
        farewell: "The game is afoot! I must go now.",
        traits: ["observant", "logical", "eccentric"]
      };
    }
  },

  async conversationTopic() {
    const prompt = `Generate an interesting conversation topic for English learners (B1 level) with:
    - topic: The topic title
    - questions: 3 related questions
    - vocabulary: Array of 5 objects with word and translation
    Return as JSON: {"topic": "", "questions": [], "vocabulary": [{"word": "", "translation": ""}, ...]}`;
    
    const result = await this.generateEnglishContent(prompt, 'json');
    return result || {
      topic: "Travel experiences",
      questions: [
        "What's the most interesting place you've visited?",
        "What do you usually pack in your suitcase?",
        "Do you prefer beaches or mountains for vacation?"
      ],
      vocabulary: [
        { word: "sightseeing", translation: "осмотр достопримечательностей" },
        { word: "itinerary", translation: "маршрут" },
        { word: "landmark", translation: "ориентир" },
        { word: "jet lag", translation: "джетлаг" },
        { word: "accommodation", translation: "жилье" }
      ]
    };
  }
};

// === Сервисные функции ===
const services = {
  async sendToAllUsers(messageGenerator, errorHandler) {
    try {
      const users = await User.findAll({ 
        attributes: ['telegram_id']
      });
      let results = { success: 0, fails: 0 };

      if (users.length === 0) {
        console.log('Нет зарегистрированных пользователей для рассылки');
        await bot.sendMessage(
          process.env.ADMIN_ID,
          '⚠️ Рассылка не выполнена: нет зарегистрированных пользователей в базе данных'
        );
        return results;
      }

      console.log(`Найдено пользователей для рассылки: ${users.length}`);

      for (const user of users) {
        if (!user.telegram_id || isNaN(user.telegram_id)) {
          console.error(`Некорректный telegram_id для пользователя: ${JSON.stringify(user)}`);
          results.fails++;
          continue;
        }

        try {
          const content = await messageGenerator(user.telegram_id);
          if (!content) {
            console.error(`Пустой контент для пользователя ${user.telegram_id}`);
            results.fails++;
            continue;
          }

          await bot.sendMessage(user.telegram_id, content);
          await user.update({ last_activity: new Date() });
          results.success++;
          console.log(`Сообщение успешно отправлено пользователю ${user.telegram_id}`);
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          results.fails++;
          console.error(`Ошибка отправки пользователю ${user.telegram_id}:`, error.message);
          if (errorHandler) {
            errorHandler(error, user);
          }
          if (error.response?.statusCode === 403) {
            console.log(`Пользователь ${user.telegram_id} заблокировал бота`);
            await user.update({ isActive: false });
          }
        }
      }

      return results;
    } catch (error) {
      console.error('Ошибка массовой рассылки:', error.message);
      await bot.sendMessage(
        process.env.ADMIN_ID,
        `‼️ Ошибка массовой рассылки: ${error.message}`
      );
      return { success: 0, fails: 0 };
    }
  },

  async cleanupInactiveUsers() {
    const inactivePeriod = new Date();
    inactivePeriod.setMonth(inactivePeriod.getMonth() - 3);
    
    try {
      const users = await User.findAll({
        where: {
          last_activity: { [sequelize.Op.lt]: inactivePeriod }
        }
      });
      
      for (const user of users) {
        await user.update({ isActive: false });
        console.log(`Пользователь ${user.telegram_id} помечен как неактивный`);
      }
    } catch (error) {
      console.error('Ошибка очистки неактивных пользователей:', error.message);
    }
  },

  async awardPoints(userId, points) {
    try {
      await User.increment('points', {
        where: { telegram_id: userId },
        by: points
      });
      return true;
    } catch (error) {
      console.error('Ошибка начисления очков:', error.message);
      return false;
    }
  },

  async getLeaderboard() {
    try {
      return await User.findAll({
        where: {
          isActive: true,
          points: { [sequelize.Op.gt]: 0 }
        },
        order: [['points', 'DESC']],
        limit: 10,
        attributes: ['id', 'telegram_id', 'username', 'first_name', 'points']
      });
    } catch (error) {
      console.error('Ошибка при получении таблицы лидеров:', error);
      throw error;
    }
  }
};

// === Основные функции ===
const features = {
  async dailyFactBroadcast() {
    try {
      console.log('Запуск рассылки ежедневного факта...');
      
      const fact = await contentGenerators.dailyFact();
      if (!fact) {
        console.error('Не удалось сгенерировать ежедневный факт');
        await bot.sendMessage(
          process.env.ADMIN_ID,
          '⚠️ Не удалось сгенерировать ежедневный факт'
        );
        return;
      }

      const { success, fails } = await services.sendToAllUsers(
        async () => fact,
        (error, user) => {
          console.error(`Ошибка для пользователя ${user.telegram_id}: ${error.message}`);
          if (error.response?.statusCode === 403) {
            user.update({ isActive: false });
          }
        }
      );

      console.log(`Рассылка завершена. Успешно: ${success}, Ошибок: ${fails}`);
      
      await bot.sendMessage(
        process.env.ADMIN_ID,
        `📊 Ежедневный факт отправлен\n✅ Успешно: ${success}\n❌ Ошибок: ${fails}${success === 0 && fails === 0 ? '\nℹ️ Нет зарегистрированных пользователей в базе данных' : ''}`
      );
    } catch (error) {
      console.error('Ошибка в dailyFactBroadcast:', error.message);
      await bot.sendMessage(
        process.env.ADMIN_ID,
        `‼️ Ошибка рассылки ежедневного факта: ${error.message}`
      );
    }
  },

  async wordGameBroadcast() {
    try {
      const wordData = await contentGenerators.wordOfTheDay();
      const { success, fails } = await services.sendToAllUsers(
        async (userId) => {
          userSessions.wordGames.set(userId, {
            word: wordData.word,
            translation: wordData.translation.toLowerCase(),
            timer: setTimeout(() => {
              if (userSessions.wordGames.has(userId)) {
                bot.sendMessage(
                  userId,
                  `⏰ Время вышло! Правильный перевод:\n${wordData.word} → ${wordData.translation}\n\nПример: ${wordData.example}\n💡 ${wordData.fact}\n⚠️ Частые ошибки: ${wordData.mistakes}`
                );
                userSessions.wordGames.delete(userId);
              }
            }, CONFIG.WORD_GAME_TIMEOUT)
          });

          return `🎯 Слово дня: ${wordData.word}\n\n📝 Пример: ${wordData.example}\n💡 ${wordData.fact}\n\nНапишите перевод этого слова! Следующее сообщение будет считаться вашим ответом.`;
        }
      );

      console.log(`Слово дня отправлено. Успешно: ${success}, Ошибок: ${fails}`);
      await bot.sendMessage(
        process.env.ADMIN_ID,
        `📊 Слово дня отправлено\n✅ Успешно: ${success}\n❌ Ошибок: ${fails}`
      );
    } catch (error) {
      console.error('Ошибка в wordGameBroadcast:', error.message);
      await bot.sendMessage(
        process.env.ADMIN_ID,
        `‼️ Ошибка рассылки слова дня: ${error.message}`
      );
    }
  },

  async startRolePlay(chatId, character = null) {
    if (!character) {
      character = await contentGenerators.randomCharacter();
    }
    
    userSessions.activeDialogs.set(chatId, {
      character,
      messagesLeft: CONFIG.MAX_DIALOG_MESSAGES,
      dialogHistory: [
        { 
          role: "system", 
          content: `You are ${character.name}. ${character.description}. 
          Personality traits: ${character.traits?.join(', ') || 'none specified'}.
          Respond in character, keep answers under 2 sentences.`
        }
      ]
    });

    await bot.sendMessage(
      chatId,
      `🎭 <b>Role Play: ${character.name}</b>\n\n<i>${character.description}</i>\n\n${character.greeting}\n\nУ вас ${CONFIG.MAX_DIALOG_MESSAGES} сообщений для диалога.`,
      { parse_mode: 'HTML' }
    );
  },

  async sendConversationStarter(chatId) {
    const topic = await contentGenerators.conversationTopic();
    
    let message = `💬 <b>Тема для обсуждения:</b> ${topic.topic}\n\n`;
    message += `<b>Вопросы:</b>\n- ${topic.questions.join('\n- ')}\n\n`;
    message += `<b>Полезные слова:</b>\n${topic.vocabulary.map(v => `• ${v.word} - ${v.translation}`).join('\n')}`;
    
    await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
  },

  async showLeaderboard(chatId, userId) {
    try {
      const topUsers = await services.getLeaderboard();
      const currentUser = await User.findOne({ where: { telegram_id: userId } });

      let leaderboardMessage = '🏆 <b>Топ игроков:</b>\n\n';
      
      if (topUsers.length === 0) {
        leaderboardMessage += 'ℹ️ Пока нет игроков с очками.\nНачните практиковать английский, чтобы попасть в топ!';
      } else {
        leaderboardMessage += topUsers
          .map((user, index) => {
            const displayName = user.username || user.first_name || `Игрок ${index + 1}`;
            return `${index + 1}. ${displayName}: ${user.points} очков`;
          })
          .join('\n');
      }

      if (currentUser) {
        leaderboardMessage += `\n\n📊 <b>Ваши очки:</b> ${currentUser.points}`;
      } else {
        leaderboardMessage += `\n\nℹ️ Вы еще не зарегистрированы. Напишите /start`;
      }

      await bot.sendMessage(chatId, leaderboardMessage, { parse_mode: 'HTML' });
    } catch (error) {
      console.error('Ошибка при отображении таблицы лидеров:', error);
      await bot.sendMessage(
        chatId,
        '⚠️ Произошла ошибка при загрузке таблицы лидеров. Попробуйте позже.',
        { parse_mode: 'HTML' }
      );
    }
  }
};

// === Обработчики команд ===
const commandHandlers = {
  async start(msg) {
    try {
      const [user, created] = await User.findOrCreate({
        where: { telegram_id: msg.chat.id },
        defaults: {
          telegram_id: msg.chat.id,
          username: msg.from.username || `${msg.from.first_name}${msg.from.last_name ? ` ${msg.from.last_name}` : ''}`,
          first_name: msg.from.first_name,
          last_name: msg.from.last_name,
          first_activity: new Date(),
          last_activity: new Date(),
          points: 0,
          isActive: true
        }
      });

      if (created) {
        console.log(`Создан новый пользователь: ${msg.chat.id}`);
      } else {
        console.log(`Пользователь уже существует: ${msg.chat.id}, обновляем isActive`);
        await user.update({ isActive: true, last_activity: new Date() });
      }

      const welcomeMessage = `
👋 <b>Привет, ${msg.from.first_name}!</b> Я твой помощник в изучении английского.

📌 <b>Доступные режимы:</b>
1. <b>Свободное общение</b> - просто пиши мне на английском
2. <b>Ролевые игры</b> - общайся с разными персонажами
3. <b>Проверка ошибок</b> - я исправлю твои ошибки

🎮 <b>Игры и активность:</b>
🔤 Слово дня в 18:00
📚 Интересные факты в 17:00
💬 /topic - тема для обсуждения
🎭 /roleplay - ролевая игра

📊 /progress - твой прогресс
🏆 /top - таблица лидеров

Выбирай что тебе интересно и практикуй английский!`;

      await bot.sendMessage(msg.chat.id, welcomeMessage, { parse_mode: 'HTML' });
    } catch (error) {
      console.error('Ошибка при обработке команды /start:', error.message);
      await bot.sendMessage(msg.chat.id, '⚠️ Произошла ошибка при регистрации. Попробуйте еще раз.');
    }
  },

  async leaderboard(msg) {
    try {
      await features.showLeaderboard(msg.chat.id, msg.from.id);
    } catch (error) {
      console.error('Ошибка в команде /top:', error.message, error.stack);
      await bot.sendMessage(
        msg.chat.id,
        '⚠️ Не удалось загрузить таблицу лидеров. Попробуйте позже.',
        { parse_mode: 'HTML' }
      );
      await bot.sendMessage(
        process.env.ADMIN_ID,
        `‼️ Ошибка в команде /top:\n${error.message}\nStack: ${error.stack}`
      );
    }
  },

  async startRolePlay(msg) {
    await features.startRolePlay(msg.chat.id);
  },

  async conversationTopic(msg) {
    await features.sendConversationStarter(msg.chat.id);
  },

  async setMode(msg, mode) {
    const validModes = ['free_talk', 'role_play', 'correction'];
    if (!validModes.includes(mode)) {
      await bot.sendMessage(msg.chat.id, '⚠️ Неверный режим. Доступные: free_talk, role_play, correction');
      return;
    }
    
    userSessions.conversationModes.set(msg.from.id, mode);
    await bot.sendMessage(msg.chat.id, `✅ Режим установлен: ${mode}`);
  },

  async showProgress(msg) {
    try {
      const user = await User.findOne({ where: { telegram_id: msg.from.id } });
      if (!user) {
        await bot.sendMessage(msg.chat.id, 'ℹ️ Сначала запустите бота командой /start');
        return;
      }
      
      const progressMessage = `
📊 <b>Твой прогресс:</b>

🏅 Очков: ${user.points}
📅 Первый визит: ${user.first_activity.toLocaleDateString()}
🔄 Последняя активность: ${user.last_activity.toLocaleDateString()}

Продолжай практиковать английский!`;
      
      await bot.sendMessage(msg.chat.id, progressMessage, { parse_mode: 'HTML' });
    } catch (error) {
      console.error('Ошибка при отображении прогресса:', error.message);
      await bot.sendMessage(msg.chat.id, '⚠️ Произошла ошибка при загрузке прогресса.');
    }
  }
};

// === Настройка бота ===
async function setupBot() {
  schedule.scheduleJob(CONFIG.DAILY_FACT_TIME, features.dailyFactBroadcast);
  schedule.scheduleJob(CONFIG.WORD_GAME_TIME, features.wordGameBroadcast);
  schedule.scheduleJob(CONFIG.CLEANUP_TIME, services.cleanupInactiveUsers);

  bot.onText(/\/start/, commandHandlers.start);
  bot.onText(/\/top/, commandHandlers.leaderboard);
  bot.onText(/\/roleplay/, commandHandlers.startRolePlay);
  bot.onText(/\/topic/, commandHandlers.conversationTopic);
  bot.onText(/\/progress/, commandHandlers.showProgress);
  bot.onText(/\/mode_(.+)/, (msg, match) => commandHandlers.setMode(msg, match[1]));

  bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return;

    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text.trim();
    const userMode = userSessions.conversationModes.get(userId) || 'free_talk';

    try {
      await User.update(
        { last_activity: new Date() },
        { where: { telegram_id: userId } }
      );

      if (userSessions.wordGames.has(userId)) {
        const session = userSessions.wordGames.get(userId);
        const isCorrect = text.toLowerCase() === session.translation;
        
        clearTimeout(session.timer);
        userSessions.wordGames.delete(userId);

        if (isCorrect) {
          await services.awardPoints(userId, 15);
          await bot.sendMessage(
            chatId,
            `🎉 Поздравляем! Вы правильно перевели слово "${session.word}" как "${session.translation}"! +15 баллов!`
          );
        } else {
          await bot.sendMessage(
            chatId,
            `🤔 Неверный перевод. Правильный ответ: "${session.word}" → "${session.translation}". Не переживайте, в следующий раз получится!`
          );
        }
        return;
      }

      if (userSessions.activeDialogs.has(chatId)) {
        const dialog = userSessions.activeDialogs.get(chatId);
        dialog.messagesLeft--;
        dialog.dialogHistory.push({ role: "user", content: text });

        await bot.sendChatAction(chatId, 'typing');
        
        const { choices } = await openai.chat.completions.create({
          model: CONFIG.GPT_MODEL,
          messages: dialog.dialogHistory,
          temperature: 0.9,
          max_tokens: 150
        });

        const response = choices[0]?.message?.content;
        dialog.dialogHistory.push({ role: "assistant", content: response });

        if (dialog.messagesLeft <= 0) {
          userSessions.activeDialogs.delete(chatId);
          await services.awardPoints(userId, 30);
          await bot.sendMessage(
            chatId,
            `👋 ${dialog.character.farewell}\n\nДиалог завершен! +30 очков за практику!`
          );
        } else {
          await bot.sendMessage(
            chatId,
            `${response}\n\n(Осталось сообщений: ${dialog.messagesLeft})`
          );
        }
        return;
      }

      await bot.sendChatAction(chatId, 'typing');
      
      let systemPrompt = '';
      switch (userMode) {
        case 'free_talk':
          systemPrompt = `You're a friendly English teacher. Respond naturally to the student, keeping answers under 3 sentences. 
          If they make mistakes, provide the correct version subtly in your response. 
          Ask follow-up questions to continue the conversation.`;
          break;
        case 'correction':
          systemPrompt = `You're an English corrector. Identify and correct any errors in the student's message. 
          Provide the corrected version first, then briefly explain the mistakes in Russian. 
          Keep explanations simple and clear.`;
          break;
        case 'role_play':
          await features.startRolePlay(chatId);
          return;
      }

      const { choices } = await openai.chat.completions.create({
        model: CONFIG.GPT_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text }
        ],
        temperature: 0.7,
        max_tokens: 200
      });

      await bot.sendMessage(chatId, choices[0]?.message?.content);
      await services.awardPoints(userId, 1);

    } catch (error) {
      console.error('Ошибка обработки сообщения:', error.message);
      await bot.sendMessage(chatId, '⚠️ Произошла ошибка. Пожалуйста, попробуйте позже.');
    }
  });

  await bot.setMyCommands([
    { command: 'start', description: 'Главное меню' },
    { command: 'roleplay', description: 'Ролевая игра с персонажем' },
    { command: 'topic', description: 'Тема для обсуждения' },
    { command: 'progress', description: 'Твой прогресс' },
    { command: 'top', description: 'Таблица лидеров' }
  ]);

  console.log('🤖 Бот запущен и готов к работе!');
}

// === Обработка SIGTERM ===
process.on('SIGTERM', async () => {
  console.log('Получен сигнал SIGTERM. Завершаем работу...');
  try {
    await bot.sendMessage(
      process.env.ADMIN_ID,
      '🛑 Бот останавливается (SIGTERM)'
    );
    await sequelize.close();
    console.log('Соединение с базой данных закрыто');
    process.exit(0);
  } catch (error) {
    console.error('Ошибка при завершении работы:', error.message);
    process.exit(1);
  }
});

// === Запуск приложения ===
(async () => {
  try {
    await initializeDatabase();
    await setupBot();
    
    await bot.sendMessage(
      process.env.ADMIN_ID, 
      `🟢 Бот запущен\n⏰ Время сервера: ${new Date().toLocaleString()}`
    );
  } catch (error) {
    console.error('Ошибка запуска:', error);
    await bot.sendMessage(
      process.env.ADMIN_ID,
      `‼️ Ошибка запуска бота: ${error.message}`
    ).catch(err => console.error('Не удалось отправить сообщение админу:', err));
    process.exit(1);
  }
})();

// Обработка ошибок
process.on('unhandledRejection', (error) => {
  console.error('Необработанная ошибка:', error);
  bot.sendMessage(process.env.ADMIN_ID, `‼️ Критическая ошибка: ${error.message}`)
    .catch(err => console.error('Не удалось отправить сообщение об ошибке:', err));
});