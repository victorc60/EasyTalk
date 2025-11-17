// features/botFeatures.js
import { CONFIG } from '../config.js';
import { sendAdminMessage, sendUserMessage } from '../utils/botUtils.js';
import { dailyFact, wordOfTheDay, idiomOfTheDay, randomCharacter, conversationTopic, dailyHoroscope } from '../content/contentGenerators.js';
import { sendToAllUsers, getLeaderboard, awardPoints } from '../services/userServices.js';
import { recordWordGameParticipation, saveDailyWordData } from '../services/wordGameServices.js';
import { scheduleWordGameStatsNotification } from './wordGameNotifications.js';
import User from '../models/User.js';
import axios from 'axios';

export async function dailyFactBroadcast(bot) {
  try {
    console.log('Запуск рассылки ежедневного факта...');
    
    const fact = await dailyFact();
    if (!fact) {
      console.error('Не удалось сгенерировать ежедневный факт');
      await sendAdminMessage(bot, '⚠️ Не удалось сгенерировать ежедневный факт');
      return;
    }

    const { success, fails } = await sendToAllUsers(
      bot,
      async () => fact,
      (error, user) => {
        console.error(`Ошибка для пользователя ${user.telegram_id}: ${error.message}`);
        if (error.response?.statusCode === 403) {
          user.update({ isActive: false });
        }
      }
    );

    console.log(`Рассылка завершена. Успешно: ${success}, Ошибок: ${fails}`);
    
    await sendAdminMessage(
      bot,
      `📊 Ежедневный факт отправлен\n✅ Успешно: ${success}\n❌ Ошибок: ${fails}${success === 0 && fails === 0 ? '\nℹ️ Нет зарегистрированных пользователей в базе данных' : ''}`
    );
  } catch (error) {
    console.error('Ошибка в dailyFactBroadcast:', error.message);
    await sendAdminMessage(bot, `‼️ Ошибка рассылки ежедневного факта: ${error.message}`);
  }
}

export async function wordGameBroadcast(bot, userSessions) {
  try {
    const wordData = await wordOfTheDay();
    const saved = await saveDailyWordData(wordData);
    if (!saved) {
      console.warn('⚠️ Не удалось сохранить слово дня в базе');
    }
    const { success, fails } = await sendToAllUsers(
      bot,
      async (userId) => {
        const normalizedTranslation = wordData.translation.toLowerCase();
        const userWordData = {
          word: wordData.word,
          translation: wordData.translation,
          normalizedTranslation,
          options: [...wordData.options],
          example: wordData.example,
          fact: wordData.fact,
          mistakes: wordData.mistakes
        };

        let correctIndex = Number.isInteger(wordData.correctIndex)
          ? wordData.correctIndex
          : userWordData.options.findIndex(
              option => option.toLowerCase() === normalizedTranslation
            );
        if (correctIndex === -1) {
          correctIndex = Math.max(userWordData.options.indexOf(wordData.translation), 0);
        }

        // Создаем inline keyboard с вариантами ответов
        const keyboard = {
          inline_keyboard: userWordData.options.map((option, index) => [{
            text: `${index + 1}. ${option}`,
            callback_data: `word_game_${userId}_${index}`
          }])
        };

        const startTime = Date.now();
        
        // Calculate time until end of day (midnight Moscow time)
        const now = new Date();
        const moscowTime = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Moscow"}));
        const endOfDay = new Date(moscowTime);
        endOfDay.setHours(23, 59, 59, 999); // End of day
        const timeUntilEndOfDay = endOfDay.getTime() - moscowTime.getTime();
        
        userSessions.wordGames.set(userId, {
          ...userWordData,
          correctIndex,
          startTime: startTime,
          timer: CONFIG.WORD_GAME_TIMEOUT ? setTimeout(async () => {
            if (userSessions.wordGames.has(userId)) {
              // Record that user didn't answer
              await recordWordGameParticipation(
                userId, 
                wordData.word, 
                false, // didn't answer
                false, 
                0, 
                null
              );
              
              sendUserMessage(
                bot,
                userId,
                `⏰ Время вышло! Правильный перевод:\n${wordData.word} → ${wordData.translation}\n\n📝 Пример: ${wordData.example}\n💡 ${wordData.fact}\n⚠️ Частые ошибки: ${wordData.mistakes} \n\n<b>СОСТАВЬ ПРЕДЛОЖЕНИЕ С ЭТИМ СЛОВОМ И ЗАПОМНИ ЕГО НА ВСЕГДА</b>`,
                { parse_mode: 'HTML' }
              );
              userSessions.wordGames.delete(userId);
            }
          }, CONFIG.WORD_GAME_TIMEOUT) : setTimeout(async () => {
            if (userSessions.wordGames.has(userId)) {
              // Record that user didn't answer by end of day
              await recordWordGameParticipation(
                userId, 
                wordData.word, 
                false, // didn't answer
                false, 
                0, 
                null
              );
              
              sendUserMessage(
                bot,
                userId,
                `🌙 День закончился! Правильный перевод:\n${wordData.word} → ${wordData.translation}\n\n📝 Пример: ${wordData.example}\n💡 ${wordData.fact}\n⚠️ Частые ошибки: ${wordData.mistakes} \n\n<b>СОСТАВЬ ПРЕДЛОЖЕНИЕ С ЭТИМ СЛОВОМ И ЗАПОМНИ ЕГО НА ВСЕГДА</b>`,
                { parse_mode: 'HTML' }
              );
              userSessions.wordGames.delete(userId);
            }
          }, timeUntilEndOfDay)
        });

        return {
          text: `🎯 Слово дня: ${wordData.word}\n\n📝 Пример: ${wordData.example}\n💡 ${wordData.fact}\n\nВыберите правильный перевод:`,
          reply_markup: keyboard
        };
      }
    );

    console.log(`Слово дня отправлено. Успешно: ${success}, Ошибок: ${fails}`);
    await sendAdminMessage(
      bot,
      `📊 Слово дня отправлено\n✅ Успешно: ${success}\n❌ Ошибок: ${fails}`
    );
    
    // Note: Statistics will be sent automatically at 00:05 Moscow time
  } catch (error) {
    console.error('Ошибка в wordGameBroadcast:', error.message);
    await sendAdminMessage(bot, `‼️ Ошибка рассылки слова дня: ${error.message}`);
  }
}

export async function idiomGameBroadcast(bot, userSessions) {
  try {
    const idiomData = await idiomOfTheDay();
    if (!idiomData) {
      console.warn('⚠️ Не удалось получить идиому дня');
      await sendAdminMessage(bot, '⚠️ Не удалось сгенерировать идиому дня');
      return;
    }

    const { success, fails } = await sendToAllUsers(
      bot,
      async (userId) => {
        const keyboard = {
          inline_keyboard: idiomData.options.map((option, index) => [{
            text: `${index + 1}. ${option}`,
            callback_data: `idiom_game_${userId}_${index}`
          }])
        };

        userSessions.idiomGames.set(userId, {
          idiom: idiomData.idiom,
          translation: idiomData.translation,
          meaning: idiomData.meaning,
          example: idiomData.example,
          hint: idiomData.hint,
          options: idiomData.options,
          correctIndex: idiomData.correctIndex,
          startTime: Date.now()
        });

        return {
          text: `🧩 <b>Idiom of the Day</b>\n${idiomData.idiom}\n\n📝 Пример: ${idiomData.example || '—'}\n💡 Hint: ${idiomData.hint || 'Попробуй вспомнить контекст'}\n\nВыбери правильный перевод:`,
          reply_markup: keyboard
        };
      },
      (error, user) => {
        console.error(`Ошибка отправки идиомы пользователю ${user.telegram_id}:`, error.message);
        if (error.response?.statusCode === 403) {
          user.update({ isActive: false });
        }
      },
      { parse_mode: 'HTML' }
    );

    await sendAdminMessage(
      bot,
      `📊 Идиома дня отправлена\n✅ Успешно: ${success}\n❌ Ошибок: ${fails}${success === 0 && fails === 0 ? '\nℹ️ Нет зарегистрированных пользователей' : ''}`
    );
  } catch (error) {
    console.error('Ошибка в idiomGameBroadcast:', error.message);
    await sendAdminMessage(bot, `‼️ Ошибка рассылки идиомы: ${error.message}`);
  }
}

export async function dailyHoroscopeBroadcast(bot) {
  try {
    console.log('Запуск рассылки ежедневного гороскопа...');
    const horoscope = await dailyHoroscope();
    if (!horoscope) {
      await sendAdminMessage(bot, '⚠️ Не удалось сгенерировать гороскоп');
      return;
    }
    const { success, fails } = await sendToAllUsers(
      bot,
      async () => horoscope,
      (error, user) => {
        console.error(`Ошибка для пользователя ${user.telegram_id}: ${error.message}`);
        if (error.response?.statusCode === 403) {
          user.update({ isActive: false });
        }
      },
      { parse_mode: 'HTML' }
    );
    await sendAdminMessage(bot, `📊 Гороскоп отправлен\n✅ Успешно: ${success}\n❌ Ошибок: ${fails}`);
  } catch (error) {
    console.error('Ошибка в dailyHoroscopeBroadcast:', error);
    await sendAdminMessage(bot, `‼️ Ошибка рассылки гороскопа: ${error.message}`);
  }
}

export async function startRolePlay(bot, chatId, userSessions, character = null) {
  if (!character) {
    character = await randomCharacter();
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

  await sendUserMessage(
    bot,
    chatId,
    `🎭 <b>Role Play: ${character.name}</b>\n\n<i>${character.description}</i>\n\n${character.greeting}\n\nУ вас ${CONFIG.MAX_DIALOG_MESSAGES} сообщений для диалога.`,
    { parse_mode: 'HTML' }
  );
}
// Функция проверки, является ли URL действительным изображением
async function isValidImageUrl(url) {
  try {
    const response = await axios.head(url, { timeout: 5000 });
    const contentType = response.headers['content-type'];
    return contentType?.startsWith('image/') && ['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/webp'].includes(contentType);
  } catch (error) {
    console.error('Ошибка проверки URL картинки:', error.message);
    return false;
  }
}
// Функция проверки размера файла по URL
async function getFileSize(url) {
  try {
    const response = await axios.head(url, { timeout: 5000 });
    return parseInt(response.headers['content-length'] || 0);
  } catch (error) {
    console.error('Ошибка получения размера файла:', error.message);
    return 0;
  }
}

export async function broadcastMessage(bot, content) {
  try {
    const users = await User.findAll({ where: { is_active: true } });
    let successCount = 0;
    let errorCount = 0;

    // Проверяем валидность фото, если оно есть
    let isPhotoValid = true;
    if (content.photo) {
      // Проверяем, является ли content.photo File ID (Telegram File ID обычно начинается с AgAC или содержит много символов)
      const isFileId = /^[A-Za-z0-9_-]{20,}$/.test(content.photo);
      if (!isFileId) {
        // Проверяем, является ли URL валидным изображением
        isPhotoValid = await isValidImageUrl(content.photo);
        if (!isPhotoValid) {
          await sendAdminMessage(bot, `⚠️ Рассылка не выполнена: некорректный формат фото (${content.photo}). Поддерживаются JPEG, PNG, GIF, BMP, WEBP до 10 МБ.`);
          console.error(`Некорректный формат фото: ${content.photo}`);
          return;
        }
        // Проверяем размер файла
        const fileSize = await getFileSize(content.photo);
        if (fileSize > 10 * 1024 * 1024) { // 10 МБ
          await sendAdminMessage(bot, `⚠️ Рассылка не выполнена: размер фото (${fileSize / 1024 / 1024} МБ) превышает 10 МБ.`);
          console.error(`Слишком большой файл: ${fileSize} байт`);
          return;
        }
      }
    }

    for (const user of users) {
      try {
        if (content.photo && isPhotoValid) {
          await bot.sendPhoto(
            user.telegram_id,
            content.photo, // Может быть File ID или URL
            {
              caption: content.text || undefined,
              parse_mode: 'HTML'
            }
          );
        } else if (content.text) {
          await sendUserMessage(
            bot,
            user.telegram_id,
            content.text,
            { parse_mode: 'HTML' }
          );
        }
        successCount++;
      } catch (error) {
        console.error(`Ошибка отправки сообщения пользователю ${user.telegram_id}:`, error.message);
        errorCount++;
      }
      await new Promise(resolve => setTimeout(resolve, 100)); // Задержка 100 мс для избежания лимитов
    }

    const summary = `📢 Рассылка завершена:\n✅ Успешно отправлено: ${successCount} пользователям\n❌ Ошибок: ${errorCount}`;
    await sendAdminMessage(bot, summary);
    console.log(summary);
  } catch (error) {
    console.error('Ошибка при выполнении рассылки:', error);
    await sendAdminMessage(bot, `‼️ Ошибка рассылки: ${error.message}`);
  }
}

export async function sendConversationStarter(bot, chatId) {
  const topic = await conversationTopic();
  
  let message = `💬 <b>Тема для обсуждения:</b> ${topic.topic}\n\n`;
  message += `<b>Вопросы:</b>\n- ${topic.questions.join('\n- ')}\n\n`;
  message += `<b>Полезные слова:</b>\n${topic.vocabulary.map(v => `• ${v.word} - ${v.translation}`).join('\n')}`;
  
  await sendUserMessage(bot, chatId, message, { parse_mode: 'HTML' });
}


export async function showLeaderboard(bot, chatId, userId) {
  try {
    const topUsers = await getLeaderboard();
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

    await sendUserMessage(bot, chatId, leaderboardMessage, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('Ошибка при отображении таблицы лидеров:', error);
    await sendUserMessage(bot, chatId, '⚠️ Произошла ошибка при загрузке таблицы лидеров. Попробуйте позже.', { parse_mode: 'HTML' });
    await sendAdminMessage(bot, `‼️ Ошибка в команде /top:\n${error.message}\nStack: ${error.stack}`);
  }
}
