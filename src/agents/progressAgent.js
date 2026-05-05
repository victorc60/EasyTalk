const progressStore = new Map();
const MAX_LAST_MISTAKES = 10;

function createDefaultProgress(userId) {
  return {
    userId,
    level: 'A1',
    weakTopics: [],
    lastMistakes: [],
  };
}

function cloneProgress(progress) {
  return {
    userId: progress.userId,
    level: progress.level,
    weakTopics: [...progress.weakTopics],
    lastMistakes: progress.lastMistakes.map((item) => ({ ...item })),
  };
}

export const progressAgent = {
  name: 'Progress Agent',

  async saveMistake({ userId, topic, message, correctedText, userLevel } = {}) {
    try {
      const existing = progressStore.get(userId) || createDefaultProgress(userId);
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

      progressStore.set(userId, existing);
      return cloneProgress(existing);
    } catch (error) {
      console.error('[Progress Agent] Failed to save mistake:', error.message);
      return createDefaultProgress(userId);
    }
  },

  async getProgress({ userId } = {}) {
    try {
      const progress = progressStore.get(userId) || createDefaultProgress(userId);
      if (!progressStore.has(userId)) {
        progressStore.set(userId, progress);
      }

      return cloneProgress(progress);
    } catch (error) {
      console.error('[Progress Agent] Failed to get progress:', error.message);
      return createDefaultProgress(userId);
    }
  },
};

