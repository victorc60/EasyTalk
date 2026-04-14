// services/dailyContentService.js
import User from '../models/User.js';
import { sendUserMessage, escapeHtml } from '../utils/botUtils.js';
import { getNextItem, markAsUsed, alreadySentToday, logDaily } from './queueService.js';

const LABELS = ['A', 'B', 'C', 'D'];
const BROADCAST_DELAY_MS = 300;

// ─── Message builders ────────────────────────────────────────────

function buildWordMessage(item) {
  const word = escapeHtml(item.word || '');
  const translation = escapeHtml(item.translation || '');
  const pos = escapeHtml(item.partOfSpeech || '');
  const level = escapeHtml(item.level || '');
  const example = escapeHtml(item.example || '');

  let text = `📚 <b>Word of the Day</b>\n\n`;
  text += `🔤 <b>${word}</b>\n`;
  text += `🇷🇺 ${translation}\n`;
  if (pos || level) text += `📝 ${[pos, level].filter(Boolean).join(' | ')}\n`;
  if (example) text += `\n💬 ${example}\n`;
  text += `\n❓ <b>What does "${word}" mean?</b>`;

  return text;
}

function buildQuizMessage(item) {
  const question = escapeHtml(item.question || '');
  const level = item.level ? ` (${escapeHtml(item.level)})` : '';
  return `📝 <b>Daily Quiz${level}</b>\n\n❓ ${question}`;
}

function buildIdiomMessage(item) {
  const idiom = escapeHtml(item.idiom || '');
  const example = escapeHtml(item.example || '');

  let text = `🌷 <b>Idiom of the Day</b>\n\n`;
  text += `💬 <b>${idiom}</b>\n`;
  if (example) text += `\n📝 ${example}\n`;
  text += `\n❓ <b>What does "${idiom}" mean?</b>`;

  return text;
}

function buildPhrasalMessage(item) {
  const verb = escapeHtml(item.verb || item.phrasalVerb || '');
  const example = escapeHtml(item.example || '');

  let text = `⚡ <b>Phrasal Verb of the Day</b>\n\n`;
  text += `💬 <b>${verb}</b>\n`;
  if (example) text += `\n📝 ${example}\n`;
  text += `\n❓ <b>What does "${verb}" mean?</b>`;

  return text;
}

function buildFactMessage(item) {
  const claim = escapeHtml(item.claim || '');
  const claimRu = item.claimRu ? escapeHtml(item.claimRu) : null;

  let text = `🧠 <b>True or False?</b>\n\n`;
  text += `"${claim}"`;
  if (claimRu) text += `\n«${claimRu}»`;

  return text;
}

function buildMessageText(type, item) {
  switch (type) {
    case 'word':    return buildWordMessage(item);
    case 'quiz':    return buildQuizMessage(item);
    case 'idiom':   return buildIdiomMessage(item);
    case 'phrasal': return buildPhrasalMessage(item);
    case 'fact':    return buildFactMessage(item);
    default: return `[${type}] content`;
  }
}

// ─── Inline keyboard builder ─────────────────────────────────────

function buildInlineKeyboard(type, queueId, item) {
  // callback format: aq_{type}_{queueId}_{answer}
  if (type === 'fact') {
    return {
      inline_keyboard: [[
        { text: '✅ True',  callback_data: `aq_fact_${queueId}_true`  },
        { text: '❌ False', callback_data: `aq_fact_${queueId}_false` }
      ]]
    };
  }

  const options = item.options || [];
  const buttons = options.slice(0, 4).map((opt, idx) => ({
    text: `${LABELS[idx]}. ${opt}`,
    callback_data: `aq_${type}_${queueId}_${idx}`
  }));

  // 2×2 grid
  const rows = [];
  for (let i = 0; i < buttons.length; i += 2) {
    rows.push(buttons.slice(i, i + 2));
  }

  return { inline_keyboard: rows };
}

// ─── Main function ────────────────────────────────────────────────

/**
 * Запускает ежедневную рассылку контента данного типа.
 * @param {TelegramBot} bot
 * @param {'word'|'quiz'|'idiom'|'phrasal'|'fact'} type
 */
export async function runDailyContent(bot, type) {
  try {
    console.log(`[CRON] Запуск рассылки контента типа "${type}"...`);

    // 1. Защита от двойного запуска
    if (await alreadySentToday(type)) {
      console.log(`[CRON] "${type}" уже отправлен сегодня, пропускаем`);
      return;
    }

    // 2. Получить следующий элемент очереди
    const result = await getNextItem(type);
    if (!result) {
      console.error(`[CRON] Нет доступного контента для типа "${type}"`);
      return;
    }

    const { item, queueId, contentId } = result;

    // 3. Сформировать сообщение и кнопки
    const text = buildMessageText(type, item);
    const replyMarkup = buildInlineKeyboard(type, queueId, item);

    // 4. Разослать всем активным пользователям
    const users = await User.findAll({
      where: { is_active: true },
      attributes: ['telegram_id']
    });

    console.log(`[CRON] Рассылка "${type}" для ${users.length} активных пользователей...`);
    let sent = 0;
    let failed = 0;

    for (const user of users) {
      try {
        await sendUserMessage(bot, user.telegram_id, text, {
          parse_mode: 'HTML',
          reply_markup: replyMarkup
        });
        sent++;
        await new Promise(r => setTimeout(r, BROADCAST_DELAY_MS));
      } catch (err) {
        failed++;
        if (err.response?.statusCode === 403) {
          await user.update({ is_active: false });
          console.log(`[CRON] Пользователь ${user.telegram_id} заблокировал бота — деактивирован`);
        }
      }
    }

    console.log(`[CRON] Рассылка "${type}" завершена: ${sent} успешно, ${failed} ошибок`);

    // 5. Пометить как использованный
    await markAsUsed(queueId);

    // 6. Записать в daily_log
    await logDaily(type, contentId);

    console.log(`[CRON] ✅ "${type}" успешно отправлен (queueId=${queueId}, contentId=${contentId})`);
  } catch (error) {
    console.error(`[CRON] Критическая ошибка рассылки "${type}":`, error.message);
  }
}
