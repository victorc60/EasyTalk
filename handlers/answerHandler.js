// handlers/answerHandler.js
//
// Единый обработчик ответов на вопросы системы очередей контента.
// callback_data формат: aq_{type}_{queueId}_{answer}
//   Примеры:
//     aq_word_42_2       — тип word, id очереди 42, ответ 2 (индекс)
//     aq_quiz_17_1       — тип quiz, id очереди 17, ответ 1
//     aq_fact_5_true     — тип fact, id очереди 5, ответ true
//     aq_fact_5_false    — тип fact, id очереди 5, ответ false

import ContentQueue from '../models/ContentQueue.js';
import { submitQueueAnswer } from '../services/queueAnswerService.js';
import { acknowledgeCallback } from '../utils/callbackUtils.js';
import { sendUserMessage, escapeHtml, maskWordInText } from '../utils/botUtils.js';

const TZ = 'Europe/Chisinau';

function getTodayDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}

async function disableKeyboard(bot, callbackQuery) {
  try {
    await bot.editMessageReplyMarkup(
      { inline_keyboard: [] },
      {
        chat_id: callbackQuery.message?.chat?.id,
        message_id: callbackQuery.message?.message_id
      }
    );
  } catch (err) {
    const desc = err?.response?.body?.description || err?.message || '';
    if (
      !desc.includes('message is not modified') &&
      !desc.includes('message to edit not found') &&
      !desc.includes("message can't be edited")
    ) {
      console.warn(`[ANSWER] Не удалось убрать кнопки: ${desc}`);
    }
  }
}

function buildResultMessage(type, item, isCorrect, points) {
  let msg = isCorrect ? `✅ <b>Верно!</b>` : `❌ <b>Неверно.</b>`;
  if (points > 0) msg += ` +${points} очков`;
  msg += `\n\n`;

  switch (type) {
    case 'word':
      msg += `🔤 <b>${escapeHtml(item.word)}</b>\n`;
      msg += `🇷🇺 Перевод: <b>${escapeHtml(item.translation)}</b>\n`;
      if (item.example) msg += `📝 ${escapeHtml(item.example)}`;
      break;

    case 'idiom':
      msg += `🌷 <b>${escapeHtml(item.idiom)}</b>\n`;
      msg += `🎯 Перевод: <b>${escapeHtml(item.translation)}</b>\n`;
      if (item.meaning) msg += `ℹ️ ${escapeHtml(item.meaning)}\n`;
      if (item.example) msg += `📝 ${escapeHtml(item.example)}`;
      break;

    case 'phrasal':
      msg += `⚡ <b>${escapeHtml(item.verb || item.phrasalVerb || '')}</b>\n`;
      msg += `🎯 Перевод: <b>${escapeHtml(item.translation)}</b>\n`;
      if (item.meaning) msg += `ℹ️ ${escapeHtml(item.meaning)}\n`;
      if (item.example) msg += `📝 ${escapeHtml(item.example)}`;
      break;

    case 'quiz':
      msg += `📝 <b>${escapeHtml(item.question || '')}</b>\n`;
      msg += `✔️ Правильный ответ: <b>${escapeHtml(item.options?.[item.correctIndex] || '')}</b>\n`;
      if (item.explanation) msg += `ℹ️ ${escapeHtml(item.explanation)}`;
      break;

    case 'fact': {
      const claim = escapeHtml(item.claim || '');
      const claimRu = item.claimRu ? escapeHtml(item.claimRu) : null;
      const correctLabel = item.isTrue ? 'True' : 'False';
      msg += `🌷✨ <b>Fact of the Day</b>\n`;
      msg += `🇬🇧 ${claim}\n`;
      if (claimRu) msg += `${claimRu}\n`;
      msg += `\n🎯 Правильный ответ: <b>${correctLabel}</b>\n\n`;
      if (item.explanation) msg += escapeHtml(item.explanation);
      break;
    }
  }

  return msg;
}

function clampCallbackText(text) {
  const value = String(text || '');
  return value.length > 190 ? `${value.slice(0, 187)}...` : value;
}

async function handleQueueHintCallback(bot, callbackQuery) {
  const parts = callbackQuery.data.split('_');
  if (parts.length !== 4 || parts[0] !== 'aq' || parts[1] !== 'hint') {
    return;
  }

  const type = parts[2];
  const queueId = parseInt(parts[3], 10);

  if (type !== 'word' || isNaN(queueId)) {
    await acknowledgeCallback(bot, callbackQuery.id, {
      text: 'Подсказка недоступна',
      show_alert: true
    });
    return;
  }

  const queueRow = await ContentQueue.findByPk(queueId);
  if (!queueRow || queueRow.type !== 'word') {
    await acknowledgeCallback(bot, callbackQuery.id, {
      text: 'Вопрос больше недоступен',
      show_alert: true
    });
    return;
  }

  const item = queueRow.content || {};
  const rawHint = item.hint || '';
  const maskedHint = maskWordInText(rawHint, item.word || '').trim();
  const hintText = maskedHint
    ? `💡 Подсказка: ${maskedHint}`
    : 'Подсказка пока недоступна';

  await acknowledgeCallback(bot, callbackQuery.id, {
    text: clampCallbackText(hintText),
    show_alert: true
  });
}

/**
 * Обработчик callback_query с prefix "aq_".
 * Вызывается из setupCallbacks в botSetup.js.
 */
export async function handleAnswerCallback(bot, callbackQuery) {
  const userId = callbackQuery.from.id;
  if (callbackQuery.data.startsWith('aq_hint_')) {
    await handleQueueHintCallback(bot, callbackQuery);
    return;
  }
  await acknowledgeCallback(bot, callbackQuery.id);
  let saved = false;
  try {
    const match = callbackQuery.data.match(/^aq_(word|quiz|idiom|phrasal|fact)_(\d+)_(true|false|[0-3])$/);
    if (!match) throw new Error('Invalid answer');
    const [, type, queueId, answer] = match;
    const messageDate = new Date(callbackQuery.message.date * 1000).toLocaleDateString('en-CA', { timeZone: TZ });
    if (messageDate !== getTodayDate()) throw new Error('Question expired');
    const result = await submitQueueAnswer({ userId, type, queueId: Number(queueId), answer, gameDate: getTodayDate() });
    saved = true;
    await disableKeyboard(bot, callbackQuery);
    const message = result.duplicate
      ? 'ℹ️ Ответ уже сохранён. Повторные очки не начислены.'
      : buildResultMessage(type, result.item, result.correct, result.points) + (result.bonus ? '\n\n🎁 Ежедневный бонус: +20 очков!' : '');
    await sendUserMessage(bot, userId, message, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('[ANSWER] Failed:', error.message);
    if (!saved) {
      await sendUserMessage(bot, userId, '⚠️ Ответ не сохранён. Попробуй снова или открой актуальный вопрос.')
        .catch(error => console.warn('[ANSWER] Notification failed:', error.message));
    }
  }
}
