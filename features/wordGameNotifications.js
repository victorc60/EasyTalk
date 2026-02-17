// features/wordGameNotifications.js
import { sendAdminMessage, sendUserMessage } from '../utils/botUtils.js';
import {
  getDailyWordGameStats,
  getDailyIdiomGameStats,
  getDailyPhrasalVerbGameStats,
  getDailyWordGameLeaderboard,
  recordWordGameParticipation
} from '../services/wordGameServices.js';

/**
 * Отправляет уведомление администратору о статистике участия в ежедневной игре со словами
 * @param {Object} bot - Экземпляр Telegram бота
 * @param {string} date - Дата для получения статистики (по умолчанию сегодня)
 */
export async function notifyDailyWordGameStats(bot, date = null) {
  try {
    console.log('Получение статистики ежедневных игр (слово + идиома)...');

    const [wordStats, idiomStats, phrasalStats, leaderboard] = await Promise.all([
      getDailyWordGameStats(date),
      getDailyIdiomGameStats(date),
      getDailyPhrasalVerbGameStats(date),
      getDailyWordGameLeaderboard(date, 5)
    ]);

    if (!wordStats && !idiomStats && !phrasalStats) {
      await sendAdminMessage(bot, '⚠️ Не удалось получить статистику игр за сегодня');
      return;
    }

    const reportDate =
      wordStats?.date ||
      idiomStats?.date ||
      phrasalStats?.date ||
      date ||
      new Date().toISOString().split('T')[0];
    let message = `📊 <b>Отчет по ежедневным играм</b>\n`;
    message += `📅 Дата: ${reportDate}\n\n`;

    message += buildWordGameSection(wordStats, leaderboard);
    message += '\n';
    message += buildIdiomGameSection(idiomStats);
    message += '\n';
    message += buildPhrasalVerbSection(phrasalStats);
    message += '\n';
    message += buildWhoPlayedSection(wordStats, idiomStats, phrasalStats);

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

function getParticipantName(participant) {
  const user = participant.User;
  if (user?.username) {
    return `@${user.username}`;
  }
  if (user?.first_name) {
    return user.first_name;
  }
  return `ID:${participant.user_id}`;
}

/** Имя пользователя из объекта { user: { username, first_name } } или userId */
function getUserDisplayName(entry) {
  const u = entry.user;
  if (u?.username) return `@${u.username}`;
  if (u?.first_name) return u.first_name;
  return `ID:${entry.userId}`;
}

/**
 * Секция отчёта: показывает всех участников каждой игры отдельно.
 * Только те, кто играл — тех, кто не играл, не показываем.
 */
function buildWhoPlayedSection(wordStats, idiomStats, phrasalStats) {
  const lines = ['👤 <b>Кто играл (по играм)</b>', ''];
  
  // Слово дня
  if (wordStats?.participants?.length > 0) {
    console.log(`[Отчёт] Слово дня: найдено ${wordStats.participants.length} участников из ${wordStats.totalParticipants}`);
    if (wordStats.participants.length !== wordStats.totalParticipants) {
      console.warn(`[Отчёт] ВНИМАНИЕ: количество участников не совпадает! participants.length=${wordStats.participants.length}, totalParticipants=${wordStats.totalParticipants}`);
    }
    lines.push(`🔤 <b>Слово дня</b> (${wordStats.totalParticipants} участников):`);
    // Сортируем: сначала ответившие правильно, потом неправильно, потом не ответившие
    const sorted = [...wordStats.participants].sort((a, b) => {
      if (a.answered !== b.answered) return b.answered - a.answered;
      if (a.correct !== b.correct) return b.correct - a.correct;
      return (b.points_earned || 0) - (a.points_earned || 0);
    });
    const wordParticipants = sorted
      .map(p => {
        const name = getParticipantName(p);
        const status = p.answered ? (p.correct ? '✅' : '❌') : '⏳';
        const points = p.points_earned ? ` (+${p.points_earned})` : '';
        return `${status} ${name}${points}`;
      })
      .join(', ');
    lines.push(wordParticipants);
    lines.push('');
  }
  
  // Идиома дня
  if (idiomStats?.participants?.length > 0) {
    console.log(`[Отчёт] Идиома дня: найдено ${idiomStats.participants.length} участников из ${idiomStats.totalParticipants}`);
    if (idiomStats.participants.length !== idiomStats.totalParticipants) {
      console.warn(`[Отчёт] ВНИМАНИЕ: количество участников не совпадает! participants.length=${idiomStats.participants.length}, totalParticipants=${idiomStats.totalParticipants}`);
    }
    lines.push(`🧩 <b>Идиома дня</b> (${idiomStats.totalParticipants} участников):`);
    const sorted = [...idiomStats.participants].sort((a, b) => {
      if (a.answered !== b.answered) return b.answered - a.answered;
      if (a.correct !== b.correct) return b.correct - a.correct;
      return (b.points_earned || 0) - (a.points_earned || 0);
    });
    const idiomParticipants = sorted
      .map(p => {
        const name = getParticipantName(p);
        const status = p.answered ? (p.correct ? '✅' : '❌') : '⏳';
        const points = p.points_earned ? ` (+${p.points_earned})` : '';
        return `${status} ${name}${points}`;
      })
      .join(', ');
    lines.push(idiomParticipants);
    lines.push('');
  }
  
  // Phrasal Verb
  if (phrasalStats?.participants?.length > 0) {
    console.log(`[Отчёт] Phrasal Verb: найдено ${phrasalStats.participants.length} участников из ${phrasalStats.totalParticipants}`);
    if (phrasalStats.participants.length !== phrasalStats.totalParticipants) {
      console.warn(`[Отчёт] ВНИМАНИЕ: количество участников не совпадает! participants.length=${phrasalStats.participants.length}, totalParticipants=${phrasalStats.totalParticipants}`);
    }
    lines.push(`🔡 <b>Phrasal Verb</b> (${phrasalStats.totalParticipants} участников):`);
    const sorted = [...phrasalStats.participants].sort((a, b) => {
      if (a.answered !== b.answered) return b.answered - a.answered;
      if (a.correct !== b.correct) return b.correct - a.correct;
      return (b.points_earned || 0) - (a.points_earned || 0);
    });
    const phrasalParticipants = sorted
      .map(p => {
        const name = getParticipantName(p);
        const status = p.answered ? (p.correct ? '✅' : '❌') : '⏳';
        const points = p.points_earned ? ` (+${p.points_earned})` : '';
        return `${status} ${name}${points}`;
      })
      .join(', ');
    lines.push(phrasalParticipants);
    lines.push('');
  }
  
  // Если нет участников вообще
  if (!wordStats?.participants?.length && !idiomStats?.participants?.length && !phrasalStats?.participants?.length) {
    console.log('[Отчёт] Нет участников ни в одной игре');
    return '👤 <b>Кто играл</b>\nℹ️ Нет участников за этот день.\n';
  }
  
  const result = lines.join('\n') + '\n';
  console.log(`[Отчёт] Длина секции "Кто играл": ${result.length} символов`);
  return result;
}

function buildGameSection({ title, prefix, stats, leaderboard = null }) {
  if (!stats) {
    return `${prefix} <b>${title}</b>\n⚠️ Не удалось получить статистику.`;
  }

  if (stats.totalParticipants === 0) {
    return `${prefix} <b>${title}</b>\nℹ️ Пока нет ответов.`;
  }

  // Вычисление процента участия
  const participationRate = stats.totalParticipants > 0
    ? Math.round((stats.answeredCount / stats.totalParticipants) * 100)
    : 0;

  // Вычисление среднего времени ответа
  const answeredParticipants = stats.participants?.filter(p => p.answered && p.response_time) || [];
  const avgResponseTime = answeredParticipants.length > 0
    ? Math.round(answeredParticipants.reduce((sum, p) => sum + (p.response_time || 0), 0) / answeredParticipants.length)
    : null;

  const lines = [
    `${prefix} <b>${title}</b>`,
    `👥 Получили: ${stats.totalParticipants}`,
    `✅ Ответили: ${stats.answeredCount} (${participationRate}%)`,
    `❌ Не ответили: ${stats.unansweredCount ?? stats.totalParticipants - stats.answeredCount}`,
    stats.correctCount !== undefined ? `🎯 Правильных: ${stats.correctCount}` : null,
    stats.accuracy !== undefined ? `📊 Точность: ${stats.accuracy}%` : null,
    avgResponseTime ? `⏱ Среднее время ответа: ${Math.round(avgResponseTime / 1000)}с` : null,
    `⭐️ Очки: ${stats.totalPoints}`,
    ''
  ].filter(Boolean);

  let section = lines.join('\n');

  if (leaderboard?.length) {
    section += `🏆 <b>Топ-${leaderboard.length}:</b>\n`;
    leaderboard.forEach((participant, index) => {
      const timeInfo = participant.response_time 
        ? ` (${Math.round(participant.response_time / 1000)}с)` 
        : '';
      section += `${index + 1}. ${getParticipantName(participant)} - ${participant.points_earned} оч.${timeInfo}\n`;
    });
    section += '\n';
  }

  return section;
}

function buildWordGameSection(stats, leaderboard) {
  return buildGameSection({ title: 'Слово дня', prefix: '🔤', stats, leaderboard });
}

function buildIdiomGameSection(stats) {
  return buildGameSection({ title: 'Идиома дня', prefix: '🧩', stats });
}

function buildPhrasalVerbSection(stats) {
  return buildGameSection({ title: 'Phrasal Verb', prefix: '🔡', stats });
}
