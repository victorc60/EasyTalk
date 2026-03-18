// features/wordGameNotifications.js
import { sendAdminMessage, sendUserMessage } from '../utils/botUtils.js';
import {
  getDailyWordGameStats,
  getDailyIdiomGameStats,
  getDailyPhrasalVerbGameStats,
  recordWordGameParticipation
} from '../services/wordGameServices.js';

/**
 * Отправляет уведомление администратору о статистике участия в ежедневной игре со словами
 * @param {Object} bot - Экземпляр Telegram бота
 * @param {string} date - Дата для получения статистики (по умолчанию "прошедший день" относительно Москвы)
 */
const TZ_MOSCOW = 'Europe/Moscow';

function getMoscowDateString(date = new Date()) {
  return date.toLocaleDateString('en-CA', { timeZone: TZ_MOSCOW });
}

function getYesterdayMoscowDateString() {
  const moscowNow = new Date(new Date().toLocaleString('en-US', { timeZone: TZ_MOSCOW }));
  moscowNow.setDate(moscowNow.getDate() - 1);
  return getMoscowDateString(moscowNow);
}

export async function notifyDailyWordGameStats(bot, date = null) {
  try {
    console.log('Получение статистики ежедневных игр (слово + идиома)...');

    // Важно: планировщик отправляет отчёт в 00:05 по Москве.
    // В этот момент "сегодня" уже наступил, но игра относится к предыдущему дню.
    const reportDay = date || getYesterdayMoscowDateString();
    console.log(`📅 Daily report day: ${reportDay}`);

    const [wordStats, idiomStats, phrasalStats] = await Promise.all([
      getDailyWordGameStats(reportDay),
      getDailyIdiomGameStats(reportDay),
      getDailyPhrasalVerbGameStats(reportDay)
    ]);

    if (!wordStats && !idiomStats && !phrasalStats) {
      await sendAdminMessage(bot, `⚠️ Не удалось получить статистику игр за ${reportDay}`);
      return;
    }

    const reportDate = reportDay;
    let message = `📊 <b>Отчет по ежедневным играм</b>\n`;
    message += `📅 Дата: ${reportDate}\n\n`;

    // Совокупная статистика по всем играм
    const allParticipants = [
      ...(wordStats?.participants || []),
      ...(idiomStats?.participants || []),
      ...(phrasalStats?.participants || [])
    ];
    const uniqueUserIds = new Set(allParticipants.map(p => p.user_id));
    const totalPlayersAll = uniqueUserIds.size;
    const totalPointsAll =
      (wordStats?.totalPoints || 0) +
      (idiomStats?.totalPoints || 0) +
      (phrasalStats?.totalPoints || 0);

    message += `👥 <b>Всего игроков (все игры):</b> ${totalPlayersAll}\n`;
    message += `⭐️ <b>Всего очков (все игры):</b> ${totalPointsAll}\n\n`;

    // Краткая статистика по каждой игре
    if (wordStats) {
      message += '🔤 <b>Слово дня</b>\n';
      message += `• Игроков: ${wordStats.totalParticipants}\n`;
      message += `• Очков: ${wordStats.totalPoints}\n\n`;
    }

    if (idiomStats) {
      message += '🧩 <b>Идиома дня</b>\n';
      message += `• Игроков: ${idiomStats.totalParticipants}\n`;
      message += `• Очков: ${idiomStats.totalPoints}\n\n`;
    }

    if (phrasalStats) {
      message += '🔡 <b>Phrasal Verb</b>\n';
      message += `• Игроков: ${phrasalStats.totalParticipants}\n`;
      message += `• Очков: ${phrasalStats.totalPoints}\n\n`;
    }

    await sendAdminMessage(bot, message.trim(), { parse_mode: 'HTML' });
    console.log('Комплексная статистика игр отправлена администратору');
  } catch (error) {
    console.error('Ошибка отправки статистики игры:', error.message);
    await sendAdminMessage(bot, `‼️ Ошибка получения статистики игры: ${error.message}`, { parse_mode: 'HTML' });
  }
}

/**
 * Обрабатывает завершение дня для активных игр со словами
 * @param {Object} bot - Экземпляр Telegram бота
 * @param {Object} userSessions - Сессии пользователей
 */
export async function handleEndOfDayWordGames(bot, userSessions) {
  try {
    console.log('Обработка завершения дня для активных игр со словами...');
    
    const activeGames = [];
    for (const [userId, gameMap] of userSessions.wordGames.entries()) {
      for (const [gameId, gameSession] of gameMap.entries()) {
        activeGames.push({ userId, gameId, gameSession });
      }
    }

    console.log(`Найдено ${activeGames.length} активных игр для завершения`);
    
    for (const { userId, gameId, gameSession } of activeGames) {
      // Record that user didn't answer by end of day
      await recordWordGameParticipation(
        userId, 
        gameSession.word, 
        false, // didn't answer
        false, 
        0, 
        null,
        gameSession.slot || 'default'
      );
      
      // Clear the timer
      if (gameSession.timer) {
        clearTimeout(gameSession.timer);
      }
      
      // Send end of day message
      await sendUserMessage(
        bot,
        userId,
        `🌙 День закончился! Правильный перевод:\n${gameSession.word} → ${gameSession.translation}\n\n📝 Пример: ${gameSession.example}\n💡 ${gameSession.fact}\n⚠️ Частые ошибки: ${gameSession.mistakes} \n\n<b>СОСТАВЬ ПРЕДЛОЖЕНИЕ С ЭТИМ СЛОВОМ И ЗАПОМНИ ЕГО НА ВСЕГДА</b>`,
        { parse_mode: 'HTML' }
      );
      
      const map = userSessions.wordGames.get(userId);
      if (map) {
        map.delete(gameId);
        if (map.size === 0) {
          userSessions.wordGames.delete(userId);
        }
      }
    }
    
    console.log(`Завершено ${activeGames.length} активных игр`);
    
  } catch (error) {
    console.error('Ошибка при завершении дня для игр:', error.message);
  }
}

/**
 * Отправляет уведомление о статистике с задержкой после окончания игры
 * @param {Object} bot - Экземпляр Telegram бота
 * @param {number} delayMinutes - Задержка в минутах (по умолчанию 10)
 */
export async function scheduleWordGameStatsNotification(bot, delayMinutes = 10) {
  const delayMs = delayMinutes * 60 * 1000;
  
  setTimeout(async () => {
    await notifyDailyWordGameStats(bot);
  }, delayMs);
  
  console.log(`Запланировано уведомление о статистике игры через ${delayMinutes} минут`);
}
