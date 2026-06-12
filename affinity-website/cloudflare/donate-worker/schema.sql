-- Donor submissions (contact info + status)
CREATE TABLE IF NOT EXISTS submissions (
  id          TEXT PRIMARY KEY,
  firm        TEXT,
  name        TEXT,
  email       TEXT,
  phone       TEXT,
  notes       TEXT,
  file_count  INTEGER,
  status      TEXT,        -- 'pending' → 'uploaded'
  created_at  TEXT
);

-- One row per donated file (R2 object key + original filename/size)
CREATE TABLE IF NOT EXISTS files (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id  TEXT,
  key            TEXT,     -- R2 object key
  filename       TEXT,
  size           INTEGER,
  FOREIGN KEY (submission_id) REFERENCES submissions(id)
);

CREATE INDEX IF NOT EXISTS idx_files_submission ON files(submission_id);
