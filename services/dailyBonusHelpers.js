// services/dailyBonusHelpers.js
// Pure functions — no DB, no side effects. Importable in tests.

export const BONUS_GAMES = ['word', 'idiom', 'phrasal_verb', 'quiz'];
export const BONUS_POINTS = 20;

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
