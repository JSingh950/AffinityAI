-- Per-file status tracking (apply once to the existing remote DB):
--   npx wrangler d1 execute affinity-donations --remote --file=./migrations/0001_per_file_status.sql
--
-- Adds a status + completed_at column to `files` so the Scans Donated counter
-- reflects individual uploaded files (not whole submissions), and so partially
-- failed batches can be identified via /api/donate/incomplete.

ALTER TABLE files ADD COLUMN status TEXT DEFAULT 'pending';
ALTER TABLE files ADD COLUMN completed_at TEXT;

-- Backfill: every file in an already-'uploaded' submission was fully uploaded.
UPDATE files
   SET status = 'uploaded'
 WHERE submission_id IN (SELECT id FROM submissions WHERE status = 'uploaded');
