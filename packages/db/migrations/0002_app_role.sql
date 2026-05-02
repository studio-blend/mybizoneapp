-- Application role. The connection user (e.g. mybizone in dev, neon_owner in prod)
-- typically has SUPERUSER or BYPASSRLS, which makes Postgres ignore RLS even with
-- FORCE ROW LEVEL SECURITY. We avoid that by switching into a role that has
-- neither attribute via `SET LOCAL ROLE app_user` per transaction.
--
-- Migration scripts continue to run as the connection user (superuser) — they
-- need DDL privileges. App code (Server Actions, queries) calls withTenant()
-- which always SETs ROLE to app_user before issuing queries.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$$;

-- Grant DML on every existing tenant + auth table.
GRANT USAGE ON SCHEMA public TO app_user;

GRANT SELECT, INSERT, UPDATE, DELETE ON businesses TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON stores TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON audit_logs TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "user" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON session TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON account TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON verification TO app_user;

-- Future tables (added in M2+) inherit DML grants automatically.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
