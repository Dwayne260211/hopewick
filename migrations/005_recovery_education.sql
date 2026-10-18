-- Hopewick 2.0 Stage 4: recovery tracker and learning pathways.
--  * recovery_goals: goals the person chose (stop, cut down, another habit). Label,
--    target and "why" are optional and SENSITIVE (encrypted when HOPEWICK_DATA_KEY is set).
--  * recovery_logs: lapse and craving logs. Triggers, what helped and notes are SENSITIVE.
--    Day counts are worked out from these rows; nothing is ever reset or deleted by the app
--    unless the person deletes it.
--  * module_progress (new; the older learning_progress table from 001 is for the
--    legacy pathways and is left alone): where someone is up to in each learning module, plus their own
--    private notes from it (reflection, values sort, thought record) in one SENSITIVE JSON field.
-- Plan status never deletes rows: lapsed Plus keeps everything.

CREATE TABLE recovery_goals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  profile_id    text NOT NULL DEFAULT 'main' CHECK (profile_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  kind          text NOT NULL CHECK (kind IN ('abstain', 'reduce', 'other')),
  label         text,          -- SENSITIVE (encrypted when key set)
  target        text,          -- SENSITIVE
  why           text,          -- SENSITIVE
  start_date    date NOT NULL,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  encryption    text NOT NULL DEFAULT 'none' CHECK (encryption IN ('none', 'aes-256-gcm-v1')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, profile_id, id)
);
CREATE INDEX recovery_goals_user_idx ON recovery_goals (user_id, profile_id, created_at);

CREATE TABLE recovery_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  profile_id    text NOT NULL DEFAULT 'main' CHECK (profile_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  goal_id       uuid,
  kind          text NOT NULL CHECK (kind IN ('lapse', 'craving')),
  log_date      date NOT NULL,
  intensity     smallint CHECK (intensity IS NULL OR intensity BETWEEN 0 AND 10),
  outcome       text CHECK (outcome IS NULL OR outcome IN ('passed', 'used', 'unsure')),
  triggers      text,          -- SENSITIVE JSON list
  helped        text,          -- SENSITIVE
  note          text,          -- SENSITIVE
  encryption    text NOT NULL DEFAULT 'none' CHECK (encryption IN ('none', 'aes-256-gcm-v1')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- A log can only point at a goal of the same account and profile; deleting the goal deletes its logs.
  FOREIGN KEY (user_id, profile_id, goal_id) REFERENCES recovery_goals (user_id, profile_id, id) ON DELETE CASCADE
);
CREATE INDEX recovery_logs_user_idx ON recovery_logs (user_id, profile_id, log_date DESC);

CREATE TABLE module_progress (
  user_id       text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  profile_id    text NOT NULL DEFAULT 'main' CHECK (profile_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  module_id     text NOT NULL CHECK (module_id ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  step          smallint NOT NULL DEFAULT 0 CHECK (step BETWEEN 0 AND 40),
  quiz_correct  smallint CHECK (quiz_correct IS NULL OR quiz_correct BETWEEN 0 AND 10),
  quiz_total    smallint CHECK (quiz_total IS NULL OR quiz_total BETWEEN 1 AND 10),
  notes         text,          -- SENSITIVE JSON (reflection, values, thought record)
  encryption    text NOT NULL DEFAULT 'none' CHECK (encryption IN ('none', 'aes-256-gcm-v1')),
  started_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz,
  PRIMARY KEY (user_id, profile_id, module_id),
  CHECK ((quiz_correct IS NULL) = (quiz_total IS NULL))
);

ALTER TABLE recovery_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_goals FORCE ROW LEVEL SECURITY;
CREATE POLICY recovery_goals_owner ON recovery_goals
  USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));
ALTER TABLE recovery_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY recovery_logs_owner ON recovery_logs
  USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));
ALTER TABLE module_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE module_progress FORCE ROW LEVEL SECURITY;
CREATE POLICY module_progress_owner ON module_progress
  USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON recovery_goals, recovery_logs, module_progress TO hopewick_rls;
