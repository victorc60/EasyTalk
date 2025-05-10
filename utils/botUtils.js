// utils/botUtils.js
export async function sendAdminMessage(bot, message) {
    try {
      await bot.sendMessage(process.env.ADMIN_ID, message);
      console.log('Сообщение отправлено админу:', message);
    } catch (error) {
      console.error('Ошибка отправки сообщения админу:', error.message);
    }
  }
  
  export async function sendUserMessage(bot, chatId, message, options = {}) {
    try {
      await bot.sendMessage(chatId, message, options);
      console.log(`Сообщение отправлено пользователю ${chatId}`);
    } catch (error) {
      console.error(`Ошибка отправки сообщения пользователю ${chatId}:`, error.message);
      throw error; // Пробрасываем ошибку для обработки в вызывающем коде
    }
  }