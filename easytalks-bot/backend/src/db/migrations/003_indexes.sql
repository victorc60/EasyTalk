-- Индексы для улучшения производительности запросов

-- Индекс для поиска боссов по code (уже есть UNIQUE, но добавим для явности)
CREATE INDEX IF NOT EXISTS idx_bosses_code ON bosses(code);

-- Индекс для поиска задач по boss_id и cefr (часто используется вместе)
CREATE INDEX IF NOT EXISTS idx_tasks_boss_cefr ON tasks(boss_id, cefr);

-- Индекс для поиска сессий по boss_id (для статистики)
CREATE INDEX IF NOT EXISTS idx_sessions_boss_id ON sessions(boss_id);

-- Индекс для поиска сессий по created_at (для временных запросов)
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at);

-- Индекс для поиска попыток по session_id (часто используется)
CREATE INDEX IF NOT EXISTS idx_attempts_session_id ON attempts(session_id);

-- Индекс для поиска попыток по task_id (для review)
CREATE INDEX IF NOT EXISTS idx_attempts_task_id ON attempts(task_id);

-- Индекс для поиска попыток по is_correct и at_ms (для daily review)
CREATE INDEX IF NOT EXISTS idx_attempts_correct_time ON attempts(is_correct, at_ms);

-- Индекс для метрик по boss_id и created_at (для статистики)
CREATE INDEX IF NOT EXISTS idx_metrics_boss_created ON metrics(boss_id, created_at);

-- Индекс для метрик по created_at (для временных запросов)
CREATE INDEX IF NOT EXISTS idx_metrics_created_at ON metrics(created_at);

