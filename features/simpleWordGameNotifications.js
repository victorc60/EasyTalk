// features/simpleWordGameNotifications.js - Simple version without database dependency
import { sendAdminMessage } from '../utils/botUtils.js';

/**
 * Simple notification function that works without database
 * @param {Object} bot - Экземпляр Telegram бота
 * @param {Object} userSessions - Сессии пользователей
 */
export async function notifySimpleWordGameStats(bot, userSessions) {
  try {
    console.log('Getting simple word game stats...');
    
    // Get stats from active sessions instead of database
    const activeGames = Array.from(userSessions.wordGames.values())
      .reduce((sum, gameMap) => sum + (gameMap?.size || 0), 0);
    let answeredCount = 0;
    let correctCount = 0;
    
    // Count active games (these are users who haven't answered yet)
    // This is a simplified approach - in real scenario we'd track this properly
    
    // For now, just show basic info
    let message = `📊 <b>Статистика ежедневной игры со словами</b>\n`;
    message += `📅 Дата: ${new Date().toLocaleDateString()}\n\n`;
    
    message += `🎮 <b>Текущее состояние:</b>\n`;
    message += `• Активных игр: ${activeGames}\n`;
    message += `• Пользователей с активными играми: ${userSessions.wordGames.size}\n\n`;
    
    message += `ℹ️ <i>Полная статистика будет доступна после завершения игры</i>`;
    
    await sendAdminMessage(bot, message, { parse_mode: 'HTML' });
    console.log('Simple word game stats sent to admin');
    
  } catch (error) {
    console.error('Ошибка отправки простой статистики:', error.message);
    await sendAdminMessage(bot, `‼️ Ошибка получения статистики: ${error.message}`, { parse_mode: 'HTML' });
  }
}

/**
 * Test function to verify bot and admin message functionality
 * @param {Object} bot - Экземпляр Telegram бота
 */
export async function testAdminMessage(bot) {
  try {
    console.log('Testing admin message...');
    await sendAdminMessage(bot, '🧪 Тестовое сообщение для проверки функциональности', { parse_mode: 'HTML' });
    console.log('Test message sent successfully');
  } catch (error) {
    console.error('Ошибка отправки тестового сообщения:', error.message);
    throw error;
  }
}
