// features/wordGameNotifications.js
import { sendAdminMessage } from '../utils/botUtils.js';
import { getDailyWordGameStats, getDailyWordGameLeaderboard } from '../services/wordGameServices.js';

/**
 * Отправляет уведомление администратору о статистике участия в ежедневной игре со словами
 * @param {Object} bot - Экземпляр Telegram бота
 * @param {string} date - Дата для получения статистики (по умолчанию сегодня)
 */
export async function notifyDailyWordGameStats(bot, date = null) {
  try {
    console.log('Получение статистики ежедневной игры со словами...');
    
    const stats = await getDailyWordGameStats(date);
    if (!stats) {
      await sendAdminMessage(bot, '⚠️ Не удалось получить статистику ежедневной игры');
      return;
    }
    
    // Handle case when no participants
    if (stats.totalParticipants === 0) {
      await sendAdminMessage(bot, `📊 <b>Статистика ежедневной игры со словами</b>\n📅 Дата: ${stats.date}\n\n⚠️ Сегодня никто не участвовал в игре со словами.`, { parse_mode: 'HTML' });
      return;
    }
    
    const leaderboard = await getDailyWordGameLeaderboard(date, 5);
    
    // Формируем сообщение со статистикой
    let message = `📊 <b>Статистика ежедневной игры со словами</b>\n`;
    message += `📅 Дата: ${stats.date}\n\n`;
    
    message += `👥 <b>Участие:</b>\n`;
    message += `• Всего получили игру: ${stats.totalParticipants}\n`;
    message += `• Ответили: ${stats.answeredCount}\n`;
    message += `• Не ответили: ${stats.unansweredCount}\n`;
    
    // Safe division for participation percentage
    const participationRate = stats.totalParticipants > 0 
      ? Math.round((stats.answeredCount / stats.totalParticipants) * 100) 
      : 0;
    message += `• Процент участия: ${participationRate}%\n\n`;
    
    message += `🎯 <b>Результаты:</b>\n`;
    message += `• Правильных ответов: ${stats.correctCount}\n`;
    message += `• Точность: ${stats.accuracy}%\n`;
    message += `• Всего очков заработано: ${stats.totalPoints}\n\n`;
    
    if (leaderboard && leaderboard.length > 0) {
      message += `🏆 <b>Топ-${leaderboard.length} участников:</b>\n`;
      leaderboard.forEach((participant, index) => {
        if (participant.User) {
          const user = participant.User;
          const username = user.username ? `@${user.username}` : (user.first_name || `ID:${user.telegram_id}`);
          message += `${index + 1}. ${username} - ${participant.points_earned} очков\n`;
        }
      });
    }
    
    await sendAdminMessage(bot, message, { parse_mode: 'HTML' });
    console.log('Статистика ежедневной игры отправлена администратору');
    
  } catch (error) {
    console.error('Ошибка отправки статистики игры:', error.message);
    await sendAdminMessage(bot, `‼️ Ошибка получения статистики игры: ${error.message}`, { parse_mode: 'HTML' });
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
