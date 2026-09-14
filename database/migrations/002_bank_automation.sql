CREATE TABLE IF NOT EXISTS bank_maintenance_runs (
  id INTEGER NOT NULL AUTO_INCREMENT PRIMARY KEY,
  bank VARCHAR(32) NOT NULL,
  date DATE NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'processing',
  result JSON NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY bank_maintenance_runs_bank_date (bank, date)
);

CREATE TABLE IF NOT EXISTS generated_bank_items (
  id INTEGER NOT NULL AUTO_INCREMENT PRIMARY KEY,
  bank VARCHAR(32) NOT NULL,
  fingerprint VARCHAR(64) NOT NULL,
  content JSON NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY generated_bank_items_bank_fingerprint (bank, fingerprint)
);

CREATE TABLE IF NOT EXISTS mini_event_plans (
  event_date DATE NOT NULL PRIMARY KEY,
  questions JSON NOT NULL,
  reserve JSON NOT NULL,
  repeated INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);
