-- Hopewick 2.0 Stage 3: free vs Plus model.
--  * journal_entries.pack_id: which guided series / prompt pack an entry came from
--    (packs are listed in server/library/content-releases.json).
--  * weekly_step_plans: weekly multi-step plans in My Next Step (Hopewick Plus to
--    create and edit; anyone can read, export and delete their own).
-- Plan status never deletes rows: lapsed Plus keeps everything.

ALTER TABLE journal_entries
  ADD COLUMN pack_id text CHECK (pack_id IS NULL OR pack_id ~ '^[a-z0-9][a-z0-9-]{1,63}$');

CREATE TABLE weekly_step_plans (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  profile_id    text NOT NULL DEFAULT 'main' CHECK (profile_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  week_start    date NOT NULL,
  title         text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 1200),   -- SENSITIVE (encrypted when key set)
  steps         text NOT NULL,                                                  -- SENSITIVE JSON list (encrypted when key set)
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'done', 'archived')),
  encryption    text NOT NULL DEFAULT 'none' CHECK (encryption IN ('none', 'aes-256-gcm-v1')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz,
  CHECK ((status = 'done') = (completed_at IS NOT NULL))
);
CREATE INDEX weekly_step_plans_user_idx ON weekly_step_plans (user_id, profile_id, week_start DESC);

ALTER TABLE weekly_step_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_step_plans FORCE ROW LEVEL SECURITY;
CREATE POLICY weekly_step_plans_owner ON weekly_step_plans
  USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON weekly_step_plans TO hopewick_rls;
