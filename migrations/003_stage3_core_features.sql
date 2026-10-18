-- Hopewick 2.0 - 003: Stage 3 core features (mood check-in v2, coping toolkit,
-- personal goals, journal v2, My Next Step, consent keys).
--
-- Additive only: no column is dropped and no existing row is changed, except that
-- guided_activity_history.completed_at may now be NULL for an unfinished activity.
-- Length caps on encryptable columns stay sized for ciphertext (about 6x the
-- plain-text limits enforced in server/wellbeing/validate.js).

-- Consent keys for Stage 3. Current state in consent_preferences, history in consent_events.
--   checkin_ai_share   : include recent check-ins in Hope's context (off by default)
--   journal_ai         : allow journal "deepen" without asking every time (off by default)
--   next_step_followup : the person opted in to follow-ups about a next step (stored only; nothing is sent)
--   journal_sync / safety_plan_sync (already allowed): one-time upload of the browser copy
ALTER TABLE consent_preferences DROP CONSTRAINT consent_preferences_consent_key_check;
ALTER TABLE consent_preferences ADD CONSTRAINT consent_preferences_consent_key_check CHECK (consent_key IN (
  'terms','privacy','ai_processing','chat_history_sync','journal_sync','safety_plan_sync','analytics','product_email','research',
  'checkin_ai_share','journal_ai','next_step_followup'));

-- Daily check-in v2 (5-point scale: 1 Struggling, 2 Low, 3 Okay, 4 Good, 5 Great).
ALTER TABLE mood_entries
  ADD COLUMN feelings    text CHECK (feelings IS NULL OR char_length(feelings) <= 12000),  -- SENSITIVE (encrypted when key set)
  ADD COLUMN triggers    text CHECK (triggers IS NULL OR char_length(triggers) <= 12000),  -- SENSITIVE: JSON array text (encrypted when key set)
  ADD COLUMN intensity   smallint CHECK (intensity IS NULL OR intensity BETWEEN 0 AND 10),
  ADD COLUMN mood_scale  text NOT NULL DEFAULT 'v1' CHECK (mood_scale IN ('v1', 'v2')),
  ADD COLUMN encryption  text NOT NULL DEFAULT 'none' CHECK (encryption IN ('none', 'aes-256-gcm-v1'));

-- Coping toolkit sessions: begin / pause / resume / complete, optional "did this help?".
ALTER TABLE guided_activity_history DROP CONSTRAINT guided_activity_history_activity_type_check;
ALTER TABLE guided_activity_history ADD CONSTRAINT guided_activity_history_activity_type_check CHECK (activity_type IN (
  'skill','circuit_breaker','self_care','breathing','grounding','urge_surfing','thought_reframe','soap','step_work','other',
  'muscle_relaxation','mindfulness','emotion_regulation','distress_tolerance','relapse_prevention','stress_management'));
ALTER TABLE guided_activity_history DROP CONSTRAINT guided_activity_history_note_check;
ALTER TABLE guided_activity_history ADD CONSTRAINT guided_activity_history_note_check CHECK (note IS NULL OR char_length(note) <= 12000); -- SENSITIVE (encrypted when key set)
ALTER TABLE guided_activity_history
  ALTER COLUMN completed_at DROP NOT NULL,
  ALTER COLUMN completed_at DROP DEFAULT,
  ADD COLUMN status      text NOT NULL DEFAULT 'completed' CHECK (status IN ('started', 'paused', 'completed')),
  ADD COLUMN step_index  smallint NOT NULL DEFAULT 0 CHECK (step_index BETWEEN 0 AND 100),
  ADD COLUMN started_at  timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN updated_at  timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN encryption  text NOT NULL DEFAULT 'none' CHECK (encryption IN ('none', 'aes-256-gcm-v1'));
ALTER TABLE guided_activity_history ADD CONSTRAINT guided_activity_completed_check CHECK ((status = 'completed') = (completed_at IS NOT NULL));
CREATE INDEX guided_activity_user_updated_idx ON guided_activity_history (user_id, profile_id, updated_at DESC);

-- Personal goals (not tied to a week; separate from the weekly SMART goals table).
CREATE TABLE personal_goals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  profile_id    text NOT NULL DEFAULT 'main' CHECK (profile_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  title         text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 1200),   -- SENSITIVE (encrypted when key set)
  detail        text CHECK (detail IS NULL OR char_length(detail) <= 12000),     -- SENSITIVE (encrypted when key set)
  category      text NOT NULL DEFAULT 'wellbeing' CHECK (category IN ('wellbeing', 'recovery', 'emotional', 'other')),
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  progress      smallint NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  encryption    text NOT NULL DEFAULT 'none' CHECK (encryption IN ('none', 'aes-256-gcm-v1')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz,
  CHECK ((status = 'completed') = (completed_at IS NOT NULL))
);
CREATE INDEX personal_goals_user_idx ON personal_goals (user_id, profile_id, status, updated_at DESC);

-- Journal v2: entry kind, the prompt used, the day it is about, emotions noticed (encrypted).
ALTER TABLE journal_entries
  ADD COLUMN kind           text NOT NULL DEFAULT 'free' CHECK (kind IN ('free', 'prompt', 'gratitude', 'recovery')),
  ADD COLUMN prompt         text CHECK (prompt IS NULL OR char_length(prompt) <= 2000),
  ADD COLUMN entry_date     date,
  ADD COLUMN emotions_text  text CHECK (emotions_text IS NULL OR char_length(emotions_text) <= 6000);  -- SENSITIVE (encrypted when key set)
CREATE INDEX journal_entries_user_date_idx ON journal_entries (user_id, profile_id, entry_date DESC);

-- My Next Step: reflection, linked coping tool, follow-up opt-in (stored only), encryption.
ALTER TABLE next_step_items DROP CONSTRAINT next_step_items_title_check;
ALTER TABLE next_step_items ADD CONSTRAINT next_step_items_title_check CHECK (char_length(title) BETWEEN 1 AND 1400); -- SENSITIVE (encrypted when key set)
ALTER TABLE next_step_items DROP CONSTRAINT next_step_items_detail_check;
ALTER TABLE next_step_items ADD CONSTRAINT next_step_items_detail_check CHECK (detail IS NULL OR char_length(detail) <= 12000);
ALTER TABLE next_step_items
  ADD COLUMN reflection      text CHECK (reflection IS NULL OR char_length(reflection) <= 12000),  -- SENSITIVE (encrypted when key set)
  ADD COLUMN coping_key      text CHECK (coping_key IS NULL OR coping_key ~ '^[a-z0-9-]{1,40}$'),
  ADD COLUMN followup_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN encryption      text NOT NULL DEFAULT 'none' CHECK (encryption IN ('none', 'aes-256-gcm-v1'));

-- Row level security for the new table (same policy as every other user table).
ALTER TABLE personal_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_goals FORCE ROW LEVEL SECURITY;
CREATE POLICY personal_goals_owner ON personal_goals
  USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON personal_goals TO hopewick_rls;
