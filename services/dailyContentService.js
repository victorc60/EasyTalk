// services/dailyContentService.js
import DailyLog from '../models/DailyLog.js';
import { escapeHtml, maskWordInText } from '../utils/botUtils.js';
import { prepareContentDelivery, deliverPendingContent } from './contentDeliveryService.js';

const LABELS = ['A', 'B', 'C', 'D'];

// ─── Message builders ────────────────────────────────────────────

function buildWordMessage(item) {
  const rawWord = item.word || '';
  const word = escapeHtml(rawWord);
  const pos = escapeHtml(item.partOfSpeech || '');
  const level = escapeHtml(item.level || '');
  const example = escapeHtml(maskWordInText(item.example || '', rawWord));

  let text = `📚 <b>Word of the Day</b>\n\n`;
  text += `🔤 <b>${word}</b>\n`;
  if (pos || level) text += `📝 ${[pos, level].filter(Boolean).join(' | ')}\n`;
  if (example) text += `\n💬 ${example}\n`;
  text += `\n❓ <b>Выберите правильный перевод слова "${word}":</b>`;

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
  const hint = escapeHtml(item.hint || '');

  let text = `🌿🔤 <b>Phrasal Verb of the Day</b>\n`;
  text += `${verb}\n\n`;
  if (example) text += `📝 Пример: ${example}\n`;
  if (hint) text += `💡 Подсказка: ${hint}\n`;
  text += `\nВыбери правильный перевод:`;

  return text;
}

function buildFactMessage(item) {
  const claim = escapeHtml(item.claim || '');
  const claimRu = item.claimRu ? escapeHtml(item.claimRu) : null;

  let text = `🌷✨ <b>Fact of the Day</b>\n\n`;
  text += `🇬🇧 ${claim}\n`;
  if (claimRu) text += `${claimRu}\n`;
  text += `\nВеришь или не веришь?`;

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

  const rows = buttons.map(button => [button]);

  if (type === 'word' && item.hint) {
    rows.push([{ text: '💡 Подсказка', callback_data: `aq_hint_word_${queueId}` }]);
  }

  return { inline_keyboard: rows };
}

// ─── Main function ────────────────────────────────────────────────

/**
 * Запускает ежедневную рассылку контента данного типа.
 * @param {TelegramBot} bot
 * @param {'word'|'quiz'|'idiom'|'phrasal'|'fact'} type
 */
async function deliverPublication(bot, publication) {
  await deliverPendingContent(bot, publication, queue => ({
    text: buildMessageText(publication.type, queue.content),
    reply_markup: buildInlineKeyboard(publication.type, queue.id, queue.content),
  }));
}

export async function runDailyContent(bot, type) {
  try {
    const date = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Chisinau' });
    const publication = await prepareContentDelivery(type, date);
    if (publication) await deliverPublication(bot, publication);
  } catch (error) {
    console.error('[DELIVERY] Broadcast failed:', error.message);
    throw error;
  }
}

export async function resumeDailyContent(bot) {
  const date = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Chisinau' });
  const publications = await DailyLog.findAll({ where: { date } });
  for (const publication of publications) await deliverPublication(bot, publication);
}
