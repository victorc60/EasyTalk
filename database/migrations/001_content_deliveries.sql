CREATE TABLE IF NOT EXISTS content_deliveries (
  id INTEGER NOT NULL AUTO_INCREMENT PRIMARY KEY,
  daily_log_id INTEGER NOT NULL,
  queue_id INTEGER NOT NULL,
  user_id BIGINT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  retry_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  message_id BIGINT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY content_deliveries_daily_log_id_user_id (daily_log_id, user_id),
  KEY content_deliveries_daily_log_id_status (daily_log_id, status)
);
