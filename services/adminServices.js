import { contentGenerators } from './contentGenerators.js';
import { userServices } from './userServices.js';
import logger from '../utils/logger.js';
import { bot } from '../index.js'; // Или импортируйте бота из нужного места

export const adminServices = {
  /**
   * Рассылка ежедневного факта всем пользователям
   */
  async dailyFactBroadcast() {
    try {
      const fact = await contentGenerators.dailyFact();
      const { success, fails } = await userServices.broadcastMessage(
        bot,
        () => fact
      );
      
      logger.info(`Daily fact broadcasted. Success: ${success}, Failed: ${fails}`);
      
      // Уведомление админа
      await bot.sendMessage(
        process.env.ADMIN_ID,
        `📢 Ежедневный факт отправлен\n` +
        `✅ Успешно: ${success}\n` +
        `❌ Ошибок: ${fails}`
      );
    } catch (error) {
      logger.error('Daily fact broadcast failed:', error);
    }
  },

  /**
   * Рассылка игры "Слово дня"
   */
  async wordGameBroadcast() {
    try {
      const { success, fails } = await userServices.broadcastMessage(
        bot,
        async (userId) => {
          const wordData = await contentGenerators.wordOfTheDay();
          // Здесь должна быть логика старта игры для каждого пользователя
          // Возвращаем сообщение для пользователя
          return `🎯 Новое слово дня: ${wordData.word}\nУгадайте перевод!`;
        }
      );
      
      logger.info(`Word game broadcasted. Success: ${success}, Failed: ${fails}`);
      
      await bot.sendMessage(
        process.env.ADMIN_ID,
        `🎮 Игра "Слово дня" запущена\n` +
        `✅ Успешно: ${success}\n` +
        `❌ Ошибок: ${fails}`
      );
    } catch (error) {
      logger.error('Word game broadcast failed:', error);
    }
  },

  /**
   * Очистка неактивных пользователей
   */
  async cleanupInactiveUsers() {
    try {
      const inactiveDays = 90; // 3 месяца
      const count = await userServices.deactivateInactiveUsers(inactiveDays);
      
      logger.info(`Deactivated ${count} inactive users`);
      
      await bot.sendMessage(
        process.env.ADMIN_ID,
        `🧹 Очистка неактивных пользователей\n` +
        `Отключено: ${count} аккаунтов`
      );
    } catch (error) {
      logger.error('Cleanup inactive users failed:', error);
    }
  },

  /**
   * Получение статистики бота
   */
  async getBotStats() {
    try {
      const activeUsers = await userServices.getActiveUsersCount();
      const topUsers = await userServices.getLeaderboard(5);
      
      return {
        activeUsers,
        topUsers: topUsers.map(user => ({
          name: user.first_name || user.username,
          points: user.points
        }))
      };
    } catch (error) {
      logger.error('Get bot stats failed:', error);
      throw error;
    }
  }
};

// Для совместимости с вашим schedule.js
export const { 
  dailyFactBroadcast, 
  wordGameBroadcast, 
  cleanupInactiveUsers 
} = adminServices;