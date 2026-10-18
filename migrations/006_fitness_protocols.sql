-- Hopewick 2.0: Move & Recover (30-Minute Move, sauna, cold and contrast protocols).
-- Behind FEATURE_FITNESS_PROTOCOLS (default off). Hopewick Plus. Pending clinical review.
--
-- Numbered 006: the Stage 4 workstream uses 005. Nothing here depends on 005, and
-- server/db/migrate.js applies pending files by version, so either order works.
--
-- Privacy: the safety screen ANSWERS are never stored. fitness_profiles.screen holds
-- only the outcome per area (green / amber / red), dates and the doctor's-OK tick.
-- screen, lock_until, prefs and fitness_sessions.detail are SENSITIVE and are
-- AES-256-GCM encrypted (server/db/crypto.js) when HOPEWICK_DATA_KEY is set.
-- lock_until is text (an encrypted timestamp) because it reveals reported substance use.

CREATE TABLE fitness_profiles (
  user_id      text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  profile_id   text NOT NULL DEFAULT 'main' CHECK (profile_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  screen       text,   -- SENSITIVE JSON: screen result only (encrypted when key set)
  lock_until   text,   -- SENSITIVE: pause after reported alcohol or drug use (encrypted when key set)
  prefs        text,   -- SENSITIVE JSON: level and adapted track (encrypted when key set)
  encryption   text NOT NULL DEFAULT 'none' CHECK (encryption IN ('none', 'aes-256-gcm-v1')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, profile_id)
);

ALTER TABLE fitness_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitness_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY fitness_profiles_owner ON fitness_profiles
  USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON fitness_profiles TO hopewick_rls;

CREATE TABLE fitness_sessions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  profile_id        text NOT NULL DEFAULT 'main' CHECK (profile_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  kind              text NOT NULL CHECK (kind IN ('workout', 'sauna', 'cold', 'contrast')),
  plan_key          text NOT NULL CHECK (plan_key ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  status            text NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'completed', 'stopped')),
  started_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz,
  duration_seconds  integer NOT NULL DEFAULT 0 CHECK (duration_seconds BETWEEN 0 AND 14400),
  detail            text,   -- SENSITIVE JSON: moods before/after, stopped for symptoms, water temp (encrypted when key set)
  encryption        text NOT NULL DEFAULT 'none' CHECK (encryption IN ('none', 'aes-256-gcm-v1')),
  CHECK ((status = 'started') = (completed_at IS NULL))
);
CREATE INDEX fitness_sessions_user_idx ON fitness_sessions (user_id, profile_id, started_at DESC);

ALTER TABLE fitness_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitness_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY fitness_sessions_owner ON fitness_sessions
  USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON fitness_sessions TO hopewick_rls;
