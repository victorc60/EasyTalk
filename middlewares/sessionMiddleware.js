import { NodeCache } from 'node-cache';

const sessionCache = new NodeCache({ 
  stdTTL: 86400, // 24 часа
  checkperiod: 3600 // Проверка каждые 1 час
});

class SessionManager {
  // Сессии игр
  getWordGame(userId) {
    return sessionCache.get(`wordGame_${userId}`);
  }

  setWordGame(userId, data) {
    return sessionCache.set(`wordGame_${userId}`, data);
  }

  deleteWordGame(userId) {
    return sessionCache.del(`wordGame_${userId}`);
  }

  // Сессии диалогов
  getDialog(chatId) {
    return sessionCache.get(`dialog_${chatId}`);
  }

  setDialog(chatId, data) {
    return sessionCache.set(`dialog_${chatId}`, data);
  }

  deleteDialog(chatId) {
    return sessionCache.del(`dialog_${chatId}`);
  }

  // Режимы общения
  getMode(userId) {
    return sessionCache.get(`mode_${userId}`) || 'free_talk';
  }

  setMode(userId, mode) {
    const validModes = ['free_talk', 'correction', 'role_play'];
    if (validModes.includes(mode)) {
      sessionCache.set(`mode_${userId}`, mode);
    }
  }

  // Очистка всех сессий пользователя
  clearUserSessions(userId) {
    sessionCache.del(`wordGame_${userId}`);
    sessionCache.del(`mode_${userId}`);
    // Диалоги очищаются по chatId
  }

  // Проверка администратора
  isAdmin(userId) {
    return String(userId) === process.env.ADMIN_ID;
  }
}

export const sessionManager = new SessionManager();