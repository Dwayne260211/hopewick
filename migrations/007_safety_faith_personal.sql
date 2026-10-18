-- Hopewick 2.0 Stage 5: safety plan history, personal preferences and the optional faith layer.
-- (006 is reserved for the fitness work on another branch; versions are applied one by one, so a gap is fine.)
--  * safety_plan_versions: a copy of the safety plan each time the person saves or restores it, so
--    they can look back or restore an older version. The last 20 per profile are kept (the app trims).
--    The plan text is SENSITIVE (encrypted when HOPEWICK_DATA_KEY is set). Always free.
--  * user_preferences: what the person chose about themselves: preferred name, focus areas, tone,
--    and the faith opt-in (OFF unless they switch it on) with a tradition. One SENSITIVE JSON
--    document per profile (it can include religious belief, so the whole document is encrypted).
--    Hopewick never infers any of these; it only stores what the person picks.
-- Row level security follows 002/005: ENABLE + FORCE, owner-only policies on app.user_id, and
-- grants to the NOLOGIN hopewick_rls runtime role.

CREATE TABLE safety_plan_versions (
  user_id     text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  profile_id  text NOT NULL DEFAULT 'main' CHECK (profile_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  version     integer NOT NULL CHECK (version >= 1),
  reason      text NOT NULL DEFAULT 'save' CHECK (reason IN ('save', 'restore')),
  plan        text NOT NULL CHECK (char_length(plan) <= 200000),   -- SENSITIVE JSON
  encryption  text NOT NULL DEFAULT 'none' CHECK (encryption IN ('none', 'aes-256-gcm-v1')),
  saved_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, profile_id, version)
);
CREATE INDEX safety_plan_versions_user_idx ON safety_plan_versions (user_id, profile_id, version DESC);

CREATE TABLE user_preferences (
  user_id     text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  profile_id  text NOT NULL DEFAULT 'main' CHECK (profile_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  prefs       text NOT NULL CHECK (char_length(prefs) <= 20000),   -- SENSITIVE JSON (may include faith)
  encryption  text NOT NULL DEFAULT 'none' CHECK (encryption IN ('none', 'aes-256-gcm-v1')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, profile_id)
);

ALTER TABLE safety_plan_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety_plan_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY safety_plan_versions_owner ON safety_plan_versions
  USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences FORCE ROW LEVEL SECURITY;
CREATE POLICY user_preferences_owner ON user_preferences
  USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON safety_plan_versions, user_preferences TO hopewick_rls;
