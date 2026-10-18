-- Hopewick 2.0 Stage 2b: make row level security effective for the app's queries.
--
-- Neon's owner role (the one in DATABASE_URL) has BYPASSRLS, so policies alone
-- would not apply to it. withUser() (server/db/index.js) therefore runs
--   SET LOCAL ROLE hopewick_rls
-- for every per-user transaction. hopewick_rls cannot log in, does not bypass
-- RLS and only has row-level DML on the user tables, so every query inside a
-- user transaction is limited to rows where user_id = app.user_id.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hopewick_rls') THEN
    CREATE ROLE hopewick_rls NOLOGIN NOBYPASSRLS NOINHERIT;
  END IF;
  -- Let the migrating (login) role switch into it with SET ROLE.
  EXECUTE format('GRANT hopewick_rls TO %I WITH SET TRUE, INHERIT FALSE', current_user);
END
$$;

GRANT USAGE ON SCHEMA public TO hopewick_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hopewick_rls;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO hopewick_rls;
REVOKE ALL ON schema_migrations FROM hopewick_rls;

-- Tables added by later migrations get the same grants automatically.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hopewick_rls;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO hopewick_rls;
