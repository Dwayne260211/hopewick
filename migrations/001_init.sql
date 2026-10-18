-- Hopewick 2.0 - 001_init: per-user health and recovery data.
--
-- Not used by production yet. The app keeps using the JSON store until the
-- cut-over in docs/DB-MIGRATION-PLAN.md.
--
-- Rules for every table:
--   * keyed by user_id (the existing account id from users.json), NOT NULL,
--     FK to app_users with ON DELETE CASCADE so deleting an account removes everything;
--   * profile_id: the app allows several local profiles per account ('main' by default);
--   * CHECK constraints for every enum-like or bounded column;
--   * an index that starts with user_id for every list query;
--   * row level security FORCED: rows are only visible when the server has set
--     app.user_id for the transaction (server/db/index.js withUser()).
-- Sensitive free-text columns are marked "SENSITIVE" below. When HOPEWICK_DATA_KEY
-- is set the app encrypts them (AES-256-GCM, value prefix "hwenc:v1:") before insert.
-- Length caps on encryptable columns are 6x the plain-text limit so ciphertext fits
-- (UTF-8 + base64 + IV/tag); the plain-text limits are enforced in server/db/repo.js.

CREATE TABLE app_users (
  id          text PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9_-]{1,128}$'),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_profiles (
  user_id              text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  profile_id           text NOT NULL DEFAULT 'main' CHECK (profile_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  display_name         text CHECK (display_name IS NULL OR char_length(display_name) BETWEEN 1 AND 60),
  companion_mode       text NOT NULL DEFAULT 'counsellor' CHECK (companion_mode IN ('counsellor', 'friend')),
  faith                text NOT NULL DEFAULT 'general' CHECK (faith IN ('general','christian','catholic','islamic','jewish','buddhist','hindu','sikh','indigenous','none')),
  faith_level          text NOT NULL DEFAULT 'ask' CHECK (faith_level IN ('ask', 'woven', 'central')),
  theme                text NOT NULL DEFAULT 'system' CHECK (theme IN ('system', 'light', 'dark')),
  timezone             text NOT NULL DEFAULT 'Australia/Brisbane' CHECK (char_length(timezone) BETWEEN 1 AND 64),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, profile_id)
);

-- Current consent state per purpose, plus an append-only history.
CREATE TABLE consent_preferences (
  user_id         text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  consent_key     text NOT NULL CHECK (consent_key IN ('terms','privacy','ai_processing','chat_history_sync','journal_sync','safety_plan_sync','analytics','product_email','research')),
  granted         boolean NOT NULL,
  policy_version  text NOT NULL CHECK (char_length(policy_version) BETWEEN 1 AND 40),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, consent_key)
);
CREATE TABLE consent_events (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id         text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  consent_key     text NOT NULL,
  granted         boolean NOT NULL,
  policy_version  text NOT NULL,
  source          text NOT NULL DEFAULT 'app' CHECK (source IN ('app', 'support', 'import')),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX consent_events_user_idx ON consent_events (user_id, created_at DESC);

-- Daily check-in: one row per profile per local day.
CREATE TABLE mood_entries (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  profile_id     text NOT NULL DEFAULT 'main',
  entry_date     date NOT NULL,
  mood_score     smallint CHECK (mood_score BETWEEN 1 AND 6),
  mood_label     text CHECK (mood_label IS NULL OR char_length(mood_label) BETWEEN 1 AND 30),
  craving_level  text CHECK (craving_level IN ('None', 'Mild', 'Moderate', 'Strong')),
  gratitude      text[] NOT NULL DEFAULT '{}' CHECK (cardinality(gratitude) <= 3),  -- SENSITIVE
  note           text CHECK (note IS NULL OR char_length(note) <= 120000),             -- SENSITIVE (may be encrypted)
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (mood_score IS NOT NULL OR craving_level IS NOT NULL OR cardinality(gratitude) > 0 OR note IS NOT NULL),
  UNIQUE (user_id, profile_id, entry_date)
);
CREATE INDEX mood_entries_user_date_idx ON mood_entries (user_id, profile_id, entry_date DESC);

-- Recovery start dates, milestones reached, and resets.
CREATE TABLE recovery_milestones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  profile_id      text NOT NULL DEFAULT 'main',
  kind            text NOT NULL CHECK (kind IN ('start_date', 'milestone', 'reset')),
  label           text CHECK (label IS NULL OR char_length(label) BETWEEN 1 AND 80),  -- e.g. "alcohol-free"
  milestone_date  date NOT NULL,
  days            integer CHECK (days IS NULL OR days >= 0),
  note            text CHECK (note IS NULL OR char_length(note) <= 4000),             -- SENSITIVE
  is_current      boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recovery_milestones_user_idx ON recovery_milestones (user_id, profile_id, milestone_date DESC);
-- At most one current start date per profile.
CREATE UNIQUE INDEX recovery_current_start_idx ON recovery_milestones (user_id, profile_id) WHERE kind = 'start_date' AND is_current;

-- Weekly SMART goals (Sunday-Saturday weeks, as in the app).
CREATE TABLE goals (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  profile_id       text NOT NULL DEFAULT 'main',
  week_start       date NOT NULL CHECK (extract(isodow FROM week_start) = 7),
  position         smallint NOT NULL CHECK (position BETWEEN 0 AND 9),
  specific         text NOT NULL CHECK (char_length(specific) BETWEEN 1 AND 500),
  measurable       text CHECK (measurable IS NULL OR char_length(measurable) <= 500),
  achievable       text CHECK (achievable IS NULL OR char_length(achievable) <= 500),
  relevant         text CHECK (relevant IS NULL OR char_length(relevant) <= 500),
  time_bound       text CHECK (time_bound IS NULL OR char_length(time_bound) <= 500),
  status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'done', 'changed', 'let_go')),
  midweek_answer   text CHECK (midweek_answer IN ('still', 'change', 'letgo')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, profile_id, week_start, position)
);
CREATE INDEX goals_user_week_idx ON goals (user_id, profile_id, week_start DESC);

CREATE TABLE journal_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  profile_id  text NOT NULL DEFAULT 'main',
  client_id   text CHECK (client_id IS NULL OR char_length(client_id) <= 64),  -- id from the app's localStorage, for idempotent import
  title       text CHECK (title IS NULL OR char_length(title) <= 6000),        -- SENSITIVE (encrypted when key set)
  body        text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1200000),    -- SENSITIVE (encrypted when key set)
  refined     text CHECK (refined IS NULL OR char_length(refined) <= 1200000),  -- SENSITIVE (encrypted when key set)
  emotions    text[] NOT NULL DEFAULT '{}' CHECK (cardinality(emotions) <= 20),
  encryption  text NOT NULL DEFAULT 'none' CHECK (encryption IN ('none', 'aes-256-gcm-v1')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, profile_id, client_id)
);
CREATE INDEX journal_entries_user_idx ON journal_entries (user_id, profile_id, created_at DESC);

-- Skills, circuit breakers, self-care, breathing etc. that the person actually did.
CREATE TABLE guided_activity_history (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  profile_id        text NOT NULL DEFAULT 'main',
  activity_type     text NOT NULL CHECK (activity_type IN ('skill','circuit_breaker','self_care','breathing','grounding','urge_surfing','thought_reframe','soap','step_work','other')),
  activity_key      text NOT NULL CHECK (char_length(activity_key) BETWEEN 1 AND 80),
  completed_at      timestamptz NOT NULL DEFAULT now(),
  duration_seconds  integer CHECK (duration_seconds IS NULL OR duration_seconds BETWEEN 0 AND 86400),
  helpfulness       smallint CHECK (helpfulness IS NULL OR helpfulness BETWEEN 1 AND 5),
  note              text CHECK (note IS NULL OR char_length(note) <= 4000)       -- SENSITIVE
);
CREATE INDEX guided_activity_user_idx ON guided_activity_history (user_id, profile_id, completed_at DESC);

-- 12 Steps, Going Deeper, Bible & SOAP plan, education library.
CREATE TABLE learning_progress (
  user_id       text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  profile_id    text NOT NULL DEFAULT 'main',
  pathway       text NOT NULL CHECK (pathway IN ('twelve_steps', 'going_deeper', 'bible_soap', 'diving_deeper', 'education')),
  item_key      text NOT NULL CHECK (char_length(item_key) BETWEEN 1 AND 120),
  status        text NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'completed')),
  progress_pct  smallint NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  note          text CHECK (note IS NULL OR char_length(note) <= 20000),        -- SENSITIVE (step work notes)
  started_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'completed') = (completed_at IS NOT NULL)),
  PRIMARY KEY (user_id, profile_id, pathway, item_key)
);
CREATE INDEX learning_progress_user_idx ON learning_progress (user_id, profile_id, updated_at DESC);

-- Structured safety plan (Stanley-Brown sections) + the app's relapse plan. One per profile.
CREATE TABLE safety_plans (
  user_id                 text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  profile_id              text NOT NULL DEFAULT 'main',
  warning_signs           text CHECK (warning_signs IS NULL OR char_length(warning_signs) <= 120000),        -- SENSITIVE
  coping_strategies       text CHECK (coping_strategies IS NULL OR char_length(coping_strategies) <= 120000), -- SENSITIVE
  distraction_people      text CHECK (distraction_people IS NULL OR char_length(distraction_people) <= 120000), -- SENSITIVE
  support_contacts        text CHECK (support_contacts IS NULL OR char_length(support_contacts) <= 120000),   -- SENSITIVE (names, phone numbers)
  professional_contacts   text CHECK (professional_contacts IS NULL OR char_length(professional_contacts) <= 120000), -- SENSITIVE
  safe_environment        text CHECK (safe_environment IS NULL OR char_length(safe_environment) <= 120000),  -- SENSITIVE
  reasons_for_living      text CHECK (reasons_for_living IS NULL OR char_length(reasons_for_living) <= 120000), -- SENSITIVE
  relapse_plan            text CHECK (relapse_plan IS NULL OR char_length(relapse_plan) <= 600000),         -- SENSITIVE (JSON text from the app's Plans)
  encryption              text NOT NULL DEFAULT 'none' CHECK (encryption IN ('none', 'aes-256-gcm-v1')),
  version                 integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, profile_id)
);

-- "My Next Step" items.
CREATE TABLE next_step_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  profile_id    text NOT NULL DEFAULT 'main',
  title         text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  detail        text CHECK (detail IS NULL OR char_length(detail) <= 4000),    -- SENSITIVE
  source        text NOT NULL DEFAULT 'user' CHECK (source IN ('user', 'suggested', 'hope')),
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'dismissed')),
  due_date      date,
  position      integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz,
  CHECK ((status = 'done') = (completed_at IS NOT NULL))
);
CREATE INDEX next_step_items_user_idx ON next_step_items (user_id, profile_id, status, position);

-- Saved chats with Hope (replaces chats.json later).
CREATE TABLE ai_conversations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  profile_id    text NOT NULL DEFAULT 'main',
  client_id     text NOT NULL CHECK (char_length(client_id) BETWEEN 1 AND 64),
  title         text CHECK (title IS NULL OR char_length(title) <= 200),       -- SENSITIVE
  mode          text CHECK (mode IN ('counsellor', 'friend')),
  study_focus   text CHECK (study_focus IS NULL OR char_length(study_focus) <= 120),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, profile_id, client_id),
  UNIQUE (id, user_id)
);
CREATE INDEX ai_conversations_user_idx ON ai_conversations (user_id, profile_id, updated_at DESC);
CREATE TABLE ai_messages (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversation_id  uuid NOT NULL,
  user_id          text NOT NULL,
  role             text NOT NULL CHECK (role IN ('user', 'assistant')),
  content          text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 60000),  -- SENSITIVE
  created_at       timestamptz NOT NULL DEFAULT now(),
  -- user_id must match the conversation's owner: a message can never hang off someone else's chat.
  FOREIGN KEY (conversation_id, user_id) REFERENCES ai_conversations (id, user_id) ON DELETE CASCADE
);
CREATE INDEX ai_messages_conversation_idx ON ai_messages (conversation_id, id);
CREATE INDEX ai_messages_user_idx ON ai_messages (user_id, created_at DESC);

CREATE TABLE notification_preferences (
  user_id                 text PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  email_product_updates   boolean NOT NULL DEFAULT false,
  email_weekly_summary    boolean NOT NULL DEFAULT false,
  push_daily_checkin      boolean NOT NULL DEFAULT false,
  checkin_reminder_time   time,
  quiet_hours_start       time,
  quiet_hours_end         time,
  timezone                text NOT NULL DEFAULT 'Australia/Brisbane' CHECK (char_length(timezone) BETWEEN 1 AND 64),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CHECK ((quiet_hours_start IS NULL) = (quiet_hours_end IS NULL))
);

-- Row level security: defence in depth behind the server's own WHERE user_id = $1.
-- FORCE makes it apply to the table owner too (the role the app connects as).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['user_profiles','consent_preferences','consent_events','mood_entries','recovery_milestones','goals',
                           'journal_entries','guided_activity_history','learning_progress','safety_plans','next_step_items',
                           'ai_conversations','ai_messages','notification_preferences']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY %I ON %I USING (user_id = current_setting('app.user_id', true)) WITH CHECK (user_id = current_setting('app.user_id', true))$p$, t || '_owner', t);
  END LOOP;
END $$;
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_users FORCE ROW LEVEL SECURITY;
CREATE POLICY app_users_owner ON app_users USING (id = current_setting('app.user_id', true)) WITH CHECK (id = current_setting('app.user_id', true));
