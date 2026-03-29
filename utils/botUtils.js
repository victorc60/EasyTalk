// utils/botUtils.js
export function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatTelegramError(error) {
  const parts = [];
  const responseBody = error?.response?.body;

  if (error?.message) {
    parts.push(error.message);
  }

  if (error?.response?.statusCode) {
    parts.push(`status=${error.response.statusCode}`);
  }

  if (responseBody?.error_code) {
    parts.push(`telegram_code=${responseBody.error_code}`);
  }

  if (responseBody?.description) {
    parts.push(`description=${responseBody.description}`);
  }

  return parts.join(' | ') || 'Unknown Telegram API error';
}

export async function sendAdminMessage(bot, message, options = {}) {
  try {
    await bot.sendMessage(process.env.ADMIN_ID, message, options);
    console.log('Сообщение отправлено админу:', message);
  } catch (error) {
    console.error(`Ошибка отправки сообщения админу: ${formatTelegramError(error)}`);
    if (error?.response?.body) {
      console.error('Telegram response body:', error.response.body);
    }
  }
}

export async function sendUserMessage(bot, chatId, message, options = {}) {
  try {
    await bot.sendMessage(chatId, message, options);
    console.log(`Сообщение отправлено пользователю ${chatId}`);
  } catch (error) {
    console.error(`Ошибка отправки сообщения пользователю ${chatId}: ${formatTelegramError(error)}`);
    if (error?.response?.body) {
      console.error('Telegram response body:', error.response.body);
    }
    throw error;
  }
}
