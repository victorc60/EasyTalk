// services/dailyBonusHelpers.js
// Pure functions — no DB, no side effects. Importable in tests.

export const BONUS_GAMES = ['word', 'idiom', 'phrasal_verb', 'quiz'];
export const BONUS_POINTS = 20;

const GAME_LABELS = {
  word:         '📖 слово дня',
  idiom:        '💬 идиома',
  phrasal_verb: '🔗 phrasal verb',
  quiz:         '🧩 квиз',
};

/**
 * Returns true if the participations array contains answered=true
 * for all 4 required game types.
 * @param {Array<{game_type: string, answered: boolean|number}>} participations
 */
export function hasCompletedAllGames(participations) {
  const answeredTypes = new Set(
    participations
      .filter(p => p.answered === true || p.answered === 1)
      .map(p => p.game_type)
  );
  return BONUS_GAMES.every(g => answeredTypes.has(g));
}

/**
 * Builds a progress line to show after each game answer.
 * Returns null if bonus already awarded (nothing to show).
 *
 * @param {string[]} answeredGames - game_types the user already answered today
 * @param {boolean}  bonusAlreadyAwarded
 * @returns {string|null}
 */
export function buildBonusProgressLine(answeredGames, bonusAlreadyAwarded) {
  if (bonusAlreadyAwarded) return null;

  const answered = new Set(answeredGames);
  const remaining = BONUS_GAMES.filter(g => !answered.has(g));
  const done = BONUS_GAMES.length - remaining.length;

  if (remaining.length === 0) return null; // just awarded — handled separately

  const remainingLabels = remaining.map(g => GAME_LABELS[g]).join(', ');
  const doneStr = `${done}/${BONUS_GAMES.length}`;

  if (done === 0) {
    return (
      `\n\n🎯 <b>Ежедневный бонус +20 очков</b>\n` +
      `Ответь на все 4 игры сегодня!\n` +
      `Осталось: ${remainingLabels}`
    );
  }

  if (remaining.length === 1) {
    return (
      `\n\n🔥 <b>Последний шаг! ${doneStr}</b>\n` +
      `Ответь на ${remainingLabels} — и <b>+20 бонусных очков</b> твои!`
    );
  }

  return (
    `\n\n💪 <b>Прогресс: ${doneStr}</b>\n` +
    `Осталось: ${remainingLabels}\n` +
    `Ответь на все — получи <b>+20 бонусных очков!</b>`
  );
}
