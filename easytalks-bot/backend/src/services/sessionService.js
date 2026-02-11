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
  // Сначала пробуем по code (быстрее с индексом), потом по id
  const stmt = db.prepare('SELECT * FROM bosses WHERE code = ? OR id = ? LIMIT 1');
  const boss = stmt.get(bossIdOrCode, bossIdOrCode);
  return boss;
};

const getTasksForSession = (bossId, seed, cefr, limit) => {
  // Используем индекс idx_tasks_boss_cefr для быстрого поиска
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
  console.log('[SessionService] createSession called', { bossId, timestamp: new Date().toISOString() });
  
  console.log('[SessionService] looking up boss:', bossId);
  const bossRow = getBoss(bossId);
  
  if (!bossRow) {
    console.error('[SessionService] boss not found', { bossId, searched: bossId });
    throw new Error(`Boss not found: ${bossId}`);
  }
  
  console.log('[SessionService] boss found', { 
    id: bossRow.id, 
    code: bossRow.code, 
    title: bossRow.title 
  });

  const sessionId = crypto.randomUUID();
  const seed = Math.floor(Math.random() * 1_000_000);
  const createdAt = Date.now();
  
  console.log('[SessionService] generating tasks', {
    bossId: bossRow.id,
    seed,
    cefr: DEFAULT_CONFIG.cefr,
    limit: DEFAULT_CONFIG.questionsPerSession
  });
  
  const tasks = getTasksForSession(
    bossRow.id,
    seed,
    DEFAULT_CONFIG.cefr,
    DEFAULT_CONFIG.questionsPerSession,
  );

  const total = tasks.length;
  console.log('[SessionService] tasks loaded', { total, taskIds: tasks.map(t => t.id) });
  
  if (total === 0) {
    console.error('[SessionService] no tasks available', {
      bossId: bossRow.id,
      cefr: DEFAULT_CONFIG.cefr
    });
    throw new Error(`No tasks for this boss/level (bossId: ${bossRow.id}, cefr: ${DEFAULT_CONFIG.cefr})`);
  }

  console.log('[SessionService] inserting session into database', {
    sessionId,
    bossId: bossRow.id,
    seed,
    total,
    hp: DEFAULT_CONFIG.hp
  });
  
  try {
    db.prepare(
      `INSERT INTO sessions (id, boss_id, seed, created_at, finished_at, hp, score, combo, current_index, total, correct)
       VALUES (?, ?, ?, ?, NULL, ?, 0, 0, 0, ?, 0)`,
    ).run(sessionId, bossRow.id, seed, createdAt, DEFAULT_CONFIG.hp, total);
    
    console.log('[SessionService] session created successfully', { sessionId });
  } catch (dbError) {
    console.error('[SessionService] database error', {
      message: dbError?.message,
      stack: dbError?.stack,
      sessionId,
      bossId: bossRow.id
    });
    throw new Error(`Database error: ${dbError?.message || 'Failed to create session'}`);
  }

  const result = {
    sessionId,
    boss: { id: bossRow.id, code: bossRow.code, title: bossRow.title, week: bossRow.week, hp: DEFAULT_CONFIG.hp },
    seed,
    serverNow: createdAt,
  };
  
  console.log('[SessionService] returning session data', result);
  return result;
}

export function finishSession(sessionId) {
  if (!sessionId || typeof sessionId !== 'string') {
    console.error('[SessionService] finishSession: invalid sessionId', { sessionId });
    return null;
  }
  
  console.log('[SessionService] finishSession called', { sessionId });
  const existing = getSessionRow(sessionId);
  
  if (!existing) {
    console.warn('[SessionService] finishSession: session not found', { sessionId });
    return null;
  }
  
  if (existing.finished_at) {
    console.log('[SessionService] finishSession: session already finished', { sessionId });
    const errors = getSessionErrors(sessionId);
    return { ...existing, errors };
  }
  
  const finishedAt = Date.now();
  
  try {
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
    
    console.log('[SessionService] finishSession success', { 
      sessionId, 
      duration, 
      errorsCount: errors.length 
    });
    
    return { ...existing, finished_at: finishedAt, errors };
  } catch (err) {
    console.error('[SessionService] finishSession error', {
      sessionId,
      error: err.message,
      stack: err.stack
    });
    throw new Error(`Failed to finish session: ${err.message}`);
  }
}

export function nextTask(sessionId) {
  if (!sessionId || typeof sessionId !== 'string') {
    console.error('[SessionService] nextTask: invalid sessionId', { sessionId });
    return { error: 'Invalid sessionId' };
  }
  
  console.log('[SessionService] nextTask called', { sessionId });
  const session = getSessionRow(sessionId);
  
  if (!session) {
    console.warn('[SessionService] nextTask: session not found', { sessionId });
    return { error: 'Session not found' };
  }

  try {
    const tasks = getTasksForSession(
      session.boss_id,
      session.seed,
      DEFAULT_CONFIG.cefr,
      DEFAULT_CONFIG.questionsPerSession,
    );
    const { current_index: currentIndex } = session;

    if (currentIndex >= tasks.length) {
      console.log('[SessionService] nextTask: session done', { sessionId, currentIndex, total: tasks.length });
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
    
    if (!task) {
      console.error('[SessionService] nextTask: task not found', { 
        sessionId, 
        currentIndex, 
        tasksLength: tasks.length 
      });
      return { error: 'Task not found' };
    }

    console.log('[SessionService] nextTask success', { 
      sessionId, 
      taskId: task.id, 
      currentIndex: currentIndex + 1 
    });

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
  } catch (err) {
    console.error('[SessionService] nextTask error', {
      sessionId,
      error: err.message,
      stack: err.stack
    });
    return { error: err.message || 'Failed to get next task' };
  }
}

export function submitAnswer(sessionId, { taskId, answer }) {
  if (!sessionId || typeof sessionId !== 'string') {
    console.error('[SessionService] submitAnswer: invalid sessionId', { sessionId });
    return { error: 'Invalid sessionId' };
  }
  
  if (!taskId || !answer) {
    console.error('[SessionService] submitAnswer: missing taskId or answer', { sessionId, taskId, answer });
    return { error: 'taskId and answer are required' };
  }
  
  console.log('[SessionService] submitAnswer called', { sessionId, taskId, answer });
  const session = getSessionRow(sessionId);
  
  if (!session) {
    console.warn('[SessionService] submitAnswer: session not found', { sessionId });
    return { error: 'Session not found' };
  }
  
  if (session.finished_at) {
    console.warn('[SessionService] submitAnswer: session already finished', { sessionId });
    return { error: 'Session already finished' };
  }

  try {
    const tasks = getTasksForSession(
      session.boss_id,
      session.seed,
      DEFAULT_CONFIG.cefr,
      DEFAULT_CONFIG.questionsPerSession,
    );
    const currentIndex = session.current_index;
    
    if (currentIndex >= tasks.length) {
      console.warn('[SessionService] submitAnswer: all tasks completed', { sessionId, currentIndex });
      return { error: 'Session already finished' };
    }
    
    const task = tasks[currentIndex];
    if (!task) {
      console.error('[SessionService] submitAnswer: task not found', { sessionId, currentIndex });
      return { error: 'Task not found' };
    }
    
    if (String(task.id) !== String(taskId)) {
      console.error('[SessionService] submitAnswer: task mismatch', { 
        sessionId, 
        expected: task.id, 
        received: taskId 
      });
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

    console.log('[SessionService] submitAnswer success', {
      sessionId,
      isCorrect,
      done,
      nextHp,
      nextScore
    });

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
  } catch (err) {
    console.error('[SessionService] submitAnswer error', {
      sessionId,
      taskId,
      error: err.message,
      stack: err.stack
    });
    return { error: err.message || 'Failed to submit answer' };
  }
}
