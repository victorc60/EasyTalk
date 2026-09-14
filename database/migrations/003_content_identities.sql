CREATE TABLE IF NOT EXISTS content_identities (
  fingerprint VARCHAR(64) NOT NULL PRIMARY KEY,
  queue_id INT NULL,
  used_at DATETIME NULL
);
