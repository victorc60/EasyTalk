import db from '../db/client.js';

const mapTask = (row) => {
  const payload = row?.payload_json ? JSON.parse(row.payload_json) : {};
  return {
    taskId: row.id,
    type: row.type,
    prompt: payload.prompt,
    options: payload.options || [],
    answer: row.answer_key,
    ruleHint: payload.explanation,
    bossId: row.boss_id,
    cefr: row.cefr,
  };
};

export function getSessionErrors(sessionId) {
  const rows = db
    .prepare(
      `SELECT a.task_id, a.selected as userAnswer, t.answer_key as correct, t.payload_json
       FROM attempts a
       JOIN tasks t ON t.id = a.task_id
       WHERE a.session_id = ? AND a.is_correct = 0`,
    )
    .all(sessionId);

  return rows.map((r) => {
    const payload = r.payload_json ? JSON.parse(r.payload_json) : {};
    return {
      taskId: r.task_id,
      userAnswer: r.userAnswer,
      correct: r.correct,
      ruleHint: payload.explanation,
    };
  });
}

export function getDailyReview(limit = 10) {
  // Latest incorrect attempts, distinct tasks
  const rows = db
    .prepare(
      `SELECT t.*
       FROM attempts a
       JOIN tasks t ON t.id = a.task_id
       WHERE a.is_correct = 0
       GROUP BY a.task_id
       ORDER BY MAX(a.at_ms) DESC
       LIMIT ?`,
    )
    .all(limit);

  return rows.map(mapTask);
}
