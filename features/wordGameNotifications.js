// features/wordGameNotifications.js
import { sendAdminMessage, sendUserMessage } from '../utils/botUtils.js';
import {
  getDailyWordGameStats,
  getDailyIdiomGameStats,
  getDailyPhrasalVerbGameStats,
  getDailyQuizGameStats,
  recordWordGameParticipation,
} from '../services/wordGameServices.js';
import { getMiniEventDailySummary } from '../services/miniEventService.js';
import { CONFIG } from '../config.js';

const TZ_MOSCOW = 'Europe/Chisinau';

const MONTHS_RU = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

/** Сегодня по календарю Кишинёва (YYYY-MM-DD). */
export function getTodayMoscowDateString() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ_MOSCOW });
}

/** Вчера по календарю Кишинёва (YYYY-MM-DD) — для автоотчёта сразу после полуночи. */
export function getYesterdayMoscowDateString() {
  const moscowNow = new Date(new Date().toLocaleString('en-US', { timeZone: TZ_MOSCOW }));
  moscowNow.setDate(moscowNow.getDate() - 1);
  return moscowNow.toLocaleDateString('en-CA', { timeZone: TZ_MOSCOW });
}

function formatTimeLabel(time) {
  if (!time || time.hour === undefined || time.minute === undefined) return '';
  const h = String(time.hour).padStart(2, '0');
  const m = String(time.minute).padStart(2, '0');
  return `${h}:${m} Кишинёв`;
}

function formatReportHeadingDate(yyyyMmDd) {
  const [y, mo, d] = yyyyMmDd.split('-').map(Number);
  if (!y || !mo || !d) return yyyyMmDd;
  return `${d} ${MONTHS_RU[mo - 1]} ${y}`;
}

/**
 * Одна секция отчёта по данным WordGameParticipation.
 */
function formatGameSection(title, timeLabel, stats) {
  if (!stats) {
    return `${title}${timeLabel ? ` (${timeLabel})` : ''}\n• Данные недоступны\n`;
  }
  const answered = stats.answeredCount ?? 0;
  const correct = stats.correctCount ?? 0;
  const unanswered = stats.unansweredCount ?? Math.max(0, (stats.totalParticipants ?? 0) - answered);
  const accuracy = stats.accuracy ?? 0;
  const points = stats.totalPoints ?? 0;
  const joined = stats.totalParticipants ?? 0;

  let block = `<b>${title}</b>`;
  if (timeLabel) block += ` <i>(${timeLabel})</i>`;
  block += '\n';
  block += `• Сыграли (ответили): ${answered}\n`;
  block += `• Правильно: ${correct} (${accuracy}% от ответивших)\n`;
  block += `• Очков начислено: ${points}\n`;
  if (joined > answered) {
    block += `• Не ответили к концу дня: ${unanswered}\n`;
  }
  return `${block}\n`;
}

function collectAnsweredUserIds(stats) {
  const ids = new Set();
  if (!stats?.participants?.length) return ids;
  for (const p of stats.participants) {
    if (p.answered) ids.add(String(p.user_id));
  }
  return ids;
}

/**
 * Ежедневный отчёт по играм для администратора.
 *
 * @param {Object} bot
 * @param {Object} [options]
 * @param {string|null} [options.reportDate] — YYYY-MM-DD (Кишинёв). Если не задано — текущий день.
 * @param {boolean} [options.isScheduledRun] — пометка в тексте, что отчёт автоматический.
 */
export async function notifyDailyWordGameStats(bot, options = {}) {
  try {
    const { reportDate: explicitDate, isScheduledRun = false } = options;
    const reportDay = explicitDate || getTodayMoscowDateString();

    console.log(`📅 Daily admin report (games): ${reportDay}`);

    const [quizStats, idiomStats, wordStats, phrasalStats, miniEventSummary] = await Promise.all([
      getDailyQuizGameStats(reportDay),
      getDailyIdiomGameStats(reportDay),
      getDailyWordGameStats(reportDay),
      getDailyPhrasalVerbGameStats(reportDay),
      getMiniEventDailySummary(reportDay),
    ]);

    const sections = [quizStats, idiomStats, wordStats, phrasalStats];
    const hasAnyWordGameSection = sections.some(Boolean);
    const hasMiniEvent = miniEventSummary && miniEventSummary.joined > 0;

    if (!hasAnyWordGameSection && !hasMiniEvent) {
      await sendAdminMessage(
        bot,
        `⚠️ Нет данных по играм за <b>${formatReportHeadingDate(reportDay)}</b>`,
        { parse_mode: 'HTML' },
      );
      return;
    }

    const quizTime = formatTimeLabel(CONFIG.QUIZ_GAME_TIME);
    const idiomTime = formatTimeLabel(CONFIG.IDIOM_GAME_TIME);
    const phrasalTime = formatTimeLabel(CONFIG.PHRASAL_VERB_GAME_TIME);
    const wordTimes = (CONFIG.WORD_GAME_TIMES || [])
      .map((t) => formatTimeLabel(t))
      .filter(Boolean);
    const wordTimeLabel = wordTimes.length ? wordTimes.join(', ') : '';

    let message = `📊 <b>Ежедневный отчёт по играм</b>\n`;
    message += `📅 Дата (Кишинёв): <b>${formatReportHeadingDate(reportDay)}</b>\n`;
    if (isScheduledRun) {
      message += `<i>Автоотчёт в 23:00 по Кишинёву — день закрыт и статистика зафиксирована.</i>\n`;
    }
    message += `\n`;

    message += formatGameSection('🌅 Утренний мини-квиз', quizTime, quizStats);
    message += formatGameSection('🧩 Идиома дня', idiomTime, idiomStats);
    message += formatGameSection('🔤 Слово дня', wordTimeLabel, wordStats);
    message += formatGameSection('🔡 Phrasal verb дня', phrasalTime, phrasalStats);

    if (hasMiniEvent) {
      message += `<b>🎮 Субботний мини-ивент</b>\n`;
      message += `• Нажали «Участвовать»: ${miniEventSummary.joined}\n`;
      message += `• Сыграли (≥1 ответ): ${miniEventSummary.played}\n`;
      message += `• Завершили все вопросы: ${miniEventSummary.completed}\n`;
      message += `• Очков (итого по участникам): ${miniEventSummary.totalPoints}\n`;
      if (!miniEventSummary.anyFinalized) {
        message +=
          `<i>Ивент ещё не финализован — в сумме quiz; после 23:00 начислятся награды за место и участие.</i>\n`;
      }
      message += `\n`;
    }

    const uniqueAnswered = new Set();
    [quizStats, idiomStats, wordStats, phrasalStats].forEach((s) => {
      collectAnsweredUserIds(s).forEach((id) => uniqueAnswered.add(id));
    });
    if (miniEventSummary?.playedUserIds?.length) {
      miniEventSummary.playedUserIds.forEach((id) => uniqueAnswered.add(String(id)));
    }

    const totalPointsAll =
      (quizStats?.totalPoints || 0) +
      (idiomStats?.totalPoints || 0) +
      (wordStats?.totalPoints || 0) +
      (phrasalStats?.totalPoints || 0) +
      (hasMiniEvent ? miniEventSummary.totalPoints : 0);

    message += `────────────\n`;
    message += `👥 <b>Всего уникальных игроков</b> (ответили хотя бы в одной активности): ${uniqueAnswered.size}\n`;
    message += `⭐️ <b>Всего очков</b> (все блоки выше): ${totalPointsAll}\n`;

    await sendAdminMessage(bot, message.trim(), { parse_mode: 'HTML' });
    console.log('Ежедневный отчёт по играм отправлен администратору');
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
      await recordWordGameParticipation(
        userId,
        gameSession.word,
        false,
        false,
        0,
        null,
        gameSession.slot || 'default',
      );

      if (gameSession.timer) {
        clearTimeout(gameSession.timer);
      }

      await sendUserMessage(
        bot,
        userId,
        `🌙 День закончился! Правильный перевод:\n${gameSession.word} → ${gameSession.translation}\n\n📝 Пример: ${gameSession.example}\n💡 ${gameSession.fact}\n⚠️ Частые ошибки: ${gameSession.mistakes} \n\n<b>СОСТАВЬ ПРЕДЛОЖЕНИЕ С ЭТИМ СЛОВОМ И ЗАПОМНИ ЕГО НА ВСЕГДА</b>`,
        { parse_mode: 'HTML' },
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
    await notifyDailyWordGameStats(bot, { reportDate: getTodayMoscowDateString() });
  }, delayMs);

  console.log(`Запланировано уведомление о статистике игры через ${delayMinutes} минут`);
}
