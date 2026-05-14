-- Grant app_user role to the connection user so SET ROLE app_user succeeds.
-- On Neon (and some managed Postgres providers) the connection user creates the
-- role but is not automatically a member of it, so SET LOCAL ROLE app_user
-- inside withTenant() fails with "permission denied to set role".
GRANT app_user TO CURRENT_USER;
