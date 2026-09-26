# Security and authentication release work log

## Latest status — S3 complete, 25 September 2026

This entry supersedes the unfinished review list below. The September 15 notes remain historical evidence and do not independently validate current source.

- Completed the page, action, report, export and stored-file authorization review. Added missing gates, filtered assigned-store sales/POS/products and validated persisted store ownership for files/bill uploads. Cross-business store/category/brand/customer/parent/tag references now fail before writes/uploads.
- Current membership/account state and grants are reloaded. Managed role grant/revoke writes `custom` to disable legacy privilege fallback after the final revocation; legacy owner and employee-store backfill compatibility is retained. Employee changes protect explicit super-admins as well as legacy owners. Ownership transfers revalidate current sender/recipient authority.
- Invitation/new-business acceptance checks verified active unlocked unassigned accounts without pending password replacement, tenant store/role, expiry and single use; concurrent business creation is serialized. LAN bootstrap denies cloud direct calls and validates inputs. Onboarding pages, including the demo-product write, require administration permission.
- Employee sign-in now serializes current account/credential validation, lockout counting and session creation against administrative changes; password changes reject concurrent credential replacement and revoke sessions. Malformed JSON bodies fail safely.
- Backup gate and actual entry-point wiring cover allowed/denied cases. Dumps/restore remain operator acceptance work; public license probes expose validity only.
- **Final evidence:** `node scripts/release-check.mjs test:security` — **62 passed / 0 skipped**; `node scripts/release-check.mjs test:permissions` — **14 passed / 0 skipped**; `node scripts/release-check.mjs test:transactions` — **19 passed / 0 skipped**; `node scripts/release-check.mjs typecheck` — **all eight packages passed**. Scoped Biome and `git diff --check` passed. Initial worker/fixture/assertion/formatting failures and exact commands are recorded in [S3 stabilization evidence](S3_STABILIZATION.md) and [work log section 11](../../RELEASE_WORK_LOG.md).
- **Still deferred:** full browser/HTTP/deployment acceptance, successful first-install LAN bootstrap on an empty instance, actual backup/restore/provenance/concurrent-provisioning checks, real email delivery/outbox and distributed abuse limiting. Department-only workflows are not supported; shared accounts and business-wide reports require unscoped grants. See the evidence document for precise supported store workflows and revocation semantics.
- No customer database, live integrations, deployment or publishing was used. Next task is Phase 2 integrated verification, not more S3 implementation unless a relevant failure is found.

## Scope and findings (2026-09-15)

Audited MyBizOne v2 sessions, authentication endpoints, employee mutations, role grants, onboarding/settings authorization, signup, and domain permission scope semantics. No production database or secret environment files were accessed.

## Implemented changes

- `apps/web/lib/require-permission.ts`: centralized asynchronous server-side permission gate using current tenant role grants.
- `packages/domain/src/permissions.ts` and `tests/permissions.test.ts`: scoped roles now require an explicit matching store/department. A scoped super-admin no longer bypasses scope checks. Regression tests cover omitted and mismatched scopes.
- `apps/web/lib/get-user-roles.ts`: explicit business/user predicates; legacy employee maps to sales and retains its assigned store.
- `apps/web/lib/session.ts`: reload current account state; reject locked/deactivated accounts immediately; preserve store scope; require temporary password replacement before protected application access. Missing role defaults to employee rather than owner.
- `apps/web/app/(app)/employees/actions.ts`: role-management authorization required for employee/invitation changes; validate assigned stores belong to tenant; protect owner/super-admin accounts; create credentials within the existing transaction; generate random temporary passwords; revoke sessions on administrative reset.
- Employee creation/reset UI copy now describes random temporary passwords.
- `apps/web/app/(app)/team/actions.ts`: verify grant target is an active member of the same business; validate stores and departments; disallow scoped super-admin grants.
- `apps/web/app/(app)/onboarding/actions.ts`: business setup requires manage_settings.
- Billing create-subscription gate initially added, then ownership transferred to root agent for billing hardening.
- `apps/web/lib/employee-credentials.ts`, employee sign-in and password-change routes: sign session cookies using Better Auth-compatible HMAC SHA-256; use secure cookie prefix when configured for HTTPS; validate credential input types and sizes; accept both legacy bcrypt and Better Auth hashes; new changed passwords use Better Auth hashes; revoke sessions atomically on password change; return user to login.
- `apps/web/app/(auth)/actions.ts`: normalize signup email; link business using returned signup user ID; check successful link; initialize usage snapshot in same transaction; attempt removal of orphan newly-created account after setup failure. Root subsequently added production email-configuration and LAN signup handling.

## Validation observed

- Initial `pnpm --filter @mybizone/web typecheck` passed (before the final credential/signup edits).
- Sandbox multi-package test command failed with Windows EPERM spawning workers; rerun through approved escalation succeeded.
- `pnpm --filter @mybizone/domain --filter @mybizone/storage --filter @mybizone/web test`: 90 domain, 23 storage, 34 web tests passed (147 total). Includes three new employee credential tests (valid signature/tamper rejection; legacy bcrypt; new Better Auth hash and malformed hash rejection) and 14 permission tests.
- Root reports isolated PostgreSQL migration and RLS verification; see central release work log for root-owned evidence.

## Remaining review / limitations

- Complete page/API and mutation gate coverage remains under audit. Tenant isolation alone does not enforce employee permissions.
- Employee credentials are still delivered through existing email paths; reliable production email delivery must be tested with deployment credentials. Welcome/reset email delivery currently occurs within or adjacent to database transactions and lacks an outbox/retry queue.
- Employee sign-in has a three-attempt lockout; concurrent failed-attempt updates and public endpoint rate limiting need further review.
- Role revocation fallback to legacy role, protected owner grants/revocation, and invitation acceptance need further audit.
- No sale-readiness claim is based solely on these unit checks; deployed onboarding/auth/authorization behavior still needs end-to-end evidence.
