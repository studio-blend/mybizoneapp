-- Employee-specific columns on the Better Auth user table
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS emp_id text UNIQUE;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS failed_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS locked_at timestamp with time zone;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
