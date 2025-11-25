import crypto from 'crypto';
import db from '../db/client.js';
import { getSessionErrors } from './reviewService.js';
import { upsertMetric } from './statsService.js';

const DEFAULT_CONFIG = {
  timeLimit: 60,
  hp: 100,
  comboBonus: 10,
  baseDamage: 25,
  missPenalty: 15,
  cefr: 'A2',
  questionsPerSession: 5,
};

const seededShuffle = (array, seed) => {
  const result = [...array];
  let s = seed;
  for (let i = result.length - 1; i > 0; i -= 1) {
    s = (s * 9301 + 49297) % 233280;
    const rand = s / 233280;
    const j = Math.floor(rand * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

const mapTaskRow = (row) => {
  const payload = row?.payload_json ? JSON.parse(row.payload_json) : {};
  return {
    id: row.id,
    bossId: row.boss_id,
    type: row.type,
    cefr: row.cefr,
    prompt: payload.prompt,
    options: payload.options || [],
    explanation: payload.explanation,
    answer: row.answer_key,
  };
};

const getBoss = (bossIdOrCode) => {
  const stmt = db.prepare('SELECT * FROM bosses WHERE code = ? OR id = ? LIMIT 1');
  return stmt.get(bossIdOrCode, bossIdOrCode);
};

const getTasksForSession = (bossId, seed, cefr, limit) => {
  const rows = db.prepare('SELECT * FROM tasks WHERE boss_id = ? AND cefr = ? ORDER BY id').all(bossId, cefr);
  const mapped = rows.map(mapTaskRow);
  return seededShuffle(mapped, seed).slice(0, limit);
};

const getSessionRow = (sessionId) => db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);

const getAttemptsForSession = (sessionId) =>
  db.prepare('SELECT * FROM attempts WHERE session_id = ? ORDER BY id').all(sessionId).map((row) => ({
    id: row.id,
    sessionId,
    taskId: row.task_id,
    selected: row.selected,
    isCorrect: !!row.is_correct,
    at: row.at_ms,
    task: row.task_snapshot ? JSON.parse(row.task_snapshot) : null,
  }));

export function createSession({ bossId }) {
  const bossRow = getBoss(bossId);
  if (!bossRow) {
    throw new Error('Boss not found');
  }

  const sessionId = crypto.randomUUID();
  const seed = Math.floor(Math.random() * 1_000_000);
  const createdAt = Date.now();
  const tasks = getTasksForSession(
    bossRow.id,
    seed,
    DEFAULT_CONFIG.cefr,
    DEFAULT_CONFIG.questionsPerSession,
  );

  const total = tasks.length;
  if (total === 0) {
    throw new Error('No tasks for this boss/level');
  }

  db.prepare(
    `INSERT INTO sessions (id, boss_id, seed, created_at, finished_at, hp, score, combo, current_index, total, correct)
     VALUES (?, ?, ?, ?, NULL, ?, 0, 0, 0, ?, 0)`,
  ).run(sessionId, bossRow.id, seed, createdAt, DEFAULT_CONFIG.hp, total);

  return {
    sessionId,
    boss: { id: bossRow.id, code: bossRow.code, title: bossRow.title, week: bossRow.week, hp: DEFAULT_CONFIG.hp },
    seed,
    serverNow: createdAt,
  };
}

export function finishSession(sessionId) {
  const existing = getSessionRow(sessionId);
  if (!existing) return null;
  const finishedAt = Date.now();
  db.prepare('UPDATE sessions SET finished_at = ? WHERE id = ?').run(finishedAt, sessionId);
  const errors = getSessionErrors(sessionId);
  const duration = finishedAt - existing.created_at;
  upsertMetric({
    sessionId,
    bossId: existing.boss_id,
    durationMs: duration,
    accuracy: existing.total ? Math.round((existing.correct / existing.total) * 100) : 0,
    win: existing.correct === existing.total,
  });
  return { ...existing, finished_at: finishedAt, errors };
}

export function nextTask(sessionId) {
  const session = getSessionRow(sessionId);
  if (!session) return { error: 'Session not found' };

  const tasks = getTasksForSession(
    session.boss_id,
    session.seed,
    DEFAULT_CONFIG.cefr,
    DEFAULT_CONFIG.questionsPerSession,
  );
  const { current_index: currentIndex } = session;

  if (currentIndex >= tasks.length) {
    return {
      done: true,
      attempts: getAttemptsForSession(sessionId),
      progress: {
        current: session.current_index,
        total: session.total,
        hp: session.hp,
        score: session.score,
        combo: session.combo,
        answered: session.current_index,
        correct: session.correct,
      },
    };
  }

  const task = tasks[currentIndex];

  return {
    task: { ...task, answer: undefined },
    attempts: getAttemptsForSession(sessionId),
    progress: {
      current: currentIndex + 1,
      total: tasks.length,
      hp: session.hp,
      score: session.score,
      combo: session.combo,
      answered: session.current_index,
      correct: session.correct,
    },
  };
}

export function submitAnswer(sessionId, { taskId, answer }) {
  const session = getSessionRow(sessionId);
  if (!session) return { error: 'Session not found' };

  const tasks = getTasksForSession(
    session.boss_id,
    session.seed,
    DEFAULT_CONFIG.cefr,
    DEFAULT_CONFIG.questionsPerSession,
  );
  const currentIndex = session.current_index;
  if (currentIndex >= tasks.length) {
    return { error: 'Session already finished' };
  }
  const task = tasks[currentIndex];
  if (!task || String(task.id) !== String(taskId)) {
    return { error: 'Task mismatch' };
  }

  const isCorrect = answer === task.answer;
  const damage = isCorrect ? DEFAULT_CONFIG.baseDamage + session.combo * 5 : 0;
  const penalty = isCorrect ? 0 : DEFAULT_CONFIG.missPenalty;

  const nextHp = Math.max(session.hp - penalty, 0);
  const nextScore = session.score + (isCorrect ? 100 + session.combo * DEFAULT_CONFIG.comboBonus : 0);
  const nextCombo = isCorrect ? session.combo + 1 : 0;
  const nextCorrect = session.correct + (isCorrect ? 1 : 0);
  const answeredCount = currentIndex + 1;
  const done = answeredCount >= tasks.length;

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE sessions
       SET hp = ?, score = ?, combo = ?, current_index = ?, correct = ?, finished_at = CASE WHEN ? THEN ? ELSE finished_at END
       WHERE id = ?`,
    ).run(
      nextHp,
      nextScore,
      nextCombo,
      answeredCount,
      nextCorrect,
      done ? 1 : 0,
      done ? Date.now() : null,
      sessionId,
    );

    db.prepare(
      `INSERT INTO attempts (session_id, task_id, selected, is_correct, at_ms, task_snapshot)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(sessionId, task.id, answer, isCorrect ? 1 : 0, Date.now(), JSON.stringify(task));
  });

  tx();

  const attempts = getAttemptsForSession(sessionId);

  return {
    done,
    isCorrect,
    damage,
    penalty,
    progress: {
      current: answeredCount,
      total: tasks.length,
      hp: nextHp,
      score: nextScore,
      combo: nextCombo,
      answered: answeredCount,
      correct: nextCorrect,
    },
    attempts,
    nextTask: done ? null : { ...tasks[currentIndex + 1], answer: undefined },
  };
}
