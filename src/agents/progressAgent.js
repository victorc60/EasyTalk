const progressStore = new Map();
const MAX_LAST_MISTAKES = 10;

function createDefaultProgress(userId) {
  return {
    userId,
    targetLanguage: 'en',
    level: 'A1',
    weakTopics: [],
    lastMistakes: [],
  };
}

function cloneProgress(progress) {
  return {
    userId: progress.userId,
    targetLanguage: progress.targetLanguage,
    level: progress.level,
    weakTopics: [...progress.weakTopics],
    lastMistakes: progress.lastMistakes.map((item) => ({ ...item })),
  };
}

function buildProgressKey(userId, targetLanguage = 'en') {
  return `${userId}:${targetLanguage}`;
}

export const progressAgent = {
  name: 'Progress Agent',

  async saveMistake({ userId, targetLanguage = 'en', topic, message, correctedText, userLevel } = {}) {
    try {
      const key = buildProgressKey(userId, targetLanguage);
      const existing = progressStore.get(key) || {
        ...createDefaultProgress(userId),
        targetLanguage,
      };
      const safeTopic = topic || 'General grammar';
      const safeLevel = userLevel || existing.level || 'A1';

      if (!existing.weakTopics.includes(safeTopic)) {
        existing.weakTopics.push(safeTopic);
      }

      existing.level = safeLevel;
      existing.lastMistakes.unshift({
        topic: safeTopic,
        message: message || '',
        correctedText: correctedText || '',
        createdAt: new Date().toISOString(),
      });
      existing.lastMistakes = existing.lastMistakes.slice(0, MAX_LAST_MISTAKES);

      progressStore.set(key, existing);
      return cloneProgress(existing);
    } catch (error) {
      console.error('[Progress Agent] Failed to save mistake:', error.message);
      return createDefaultProgress(userId);
    }
  },

  async getProgress({ userId, targetLanguage = 'en' } = {}) {
    try {
      const key = buildProgressKey(userId, targetLanguage);
      const progress = progressStore.get(key) || {
        ...createDefaultProgress(userId),
        targetLanguage,
      };
      if (!progressStore.has(key)) {
        progressStore.set(key, progress);
      }

      return cloneProgress(progress);
    } catch (error) {
      console.error('[Progress Agent] Failed to get progress:', error.message);
      return createDefaultProgress(userId);
    }
  },
};
