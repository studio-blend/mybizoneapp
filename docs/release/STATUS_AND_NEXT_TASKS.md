# MyBizOne — status and next tasks

> **Phase 4b verified candidate, 17 October:** Customer/supplier advances, partial
> use/refunds, paid-return refund entitlements and linked corrections are implemented
> and committed locally. All 365 automated tests and 215 production-browser checks
> passed, plus TypeScript, scoped lint and production build. Migration 0029 preserved
> all 39 checked existing tables on a temporary Neon branch. Hosted application and
> migration rollout await explicit approval; Phase 4a remains live. See
> [the new accounting scope](../ADVANCES_REFUNDS_AND_CORRECTIONS.md). Phase 4c
> opening cash/transfers/clearing and commercial delivery gates remain separate.

> **17 October 2026 — Phase 4a live:** Bill allocations, partial customer/supplier
> payments and recorded cashbook charts are published and hosted-verified. All
> **337 automated tests, 186 local production-browser checks and 125 read-only
> hosted browser checks** passed, plus TypeScript, scoped lint and production build.
> Owner-approved migration 0028 is applied/recorded and its temporary branch removed.
> All 37 checked existing-table hashes match before/after migration and hosted
> acceptance. No existing payments were guessed into bills or financial fixtures saved.
> See [current project status](../PROJECT_STATUS.md) and
> [accounting scope and next phases](../ACCOUNTING_FOUNDATIONS.md). Phase 4b adds
> general advances, refunds and reversal records; opening cash/bank clearing follow.
>
> Dashboards, profiles, analysis and feature Phases 3a–3e remain live. The dated
> entries below retain historical delivery evidence. Product feature phases and
> commercial delivery phases are separate. Razorpay remains on hold; migration
> 0020, email, installer, complete cloud recovery and commercial gates remain open.

Updated: 15 October 2026. Scope: Windows desktop/LAN and cloud.

**Testing instruction:** Reuse `pro.owner@example.com` for all testing and verification. Read [the standard account record](TEST_ACCOUNT.md) for login URLs and private credential location.

## Latest status — 15 October 2026

Core stabilization is complete within documented scope. The hosted development deployment and reusable Pro owner are verified. Performance commit `b01c3fb` was pushed and deployed successfully; Vercel functions now run in Singapore beside Neon. Latest performance validation passed 133 web tests, 17 database tests, scoped lint, TypeScript, isolated production build and local/hosted owner checks. Seven hosted routes and pagination passed; dashboard median decreased from 12,686 to 552 ms in three-load acceptance measurements. See [performance evidence](../PERFORMANCE_OPTIMIZATION.md).

**Not sale-ready.** Razorpay acceptance is on hold by owner instruction; real cloud email acceptance, Windows installer/clean-machine acceptance, complete cloud persistence/recovery acceptance and commercial launch gates remain pending. Earlier full-suite/browser/recovery results below describe their recorded snapshots, not a final gate for the newest tree. Test-account/tunnel tooling and release-documentation changes remain uncommitted after the performance commits. Next: review/integrate remaining work, validate the candidate, then complete desktop and cloud delivery acceptance. No new test run was performed for this status review.

## Local Pro testing — 14 October 2026

Owner requested that Razorpay work be held and testing continue with full Pro access. Created a dedicated owner (`pro.owner@example.com`) in the verified disposable database with the highest implemented plan (`pro`), stores and sample stock. Reusable credentials are in ignored `.local/test-accounts/pro-owner.json`; no provider subscription was created. Owner privileges apply to this business only. The same account is now provisioned in the Neon database for `https://mybizoneapp.vercel.app/`; actual hosted login, Pro/unlimited indicators, two stores and five application/admin routes passed browser verification. Real payment/email and complete cloud delivery acceptance remain unverified; provider setup is deferred at the owner's request. See [Pro test report](LOCAL_PRO_TESTING.md) for current evidence and restart instructions.

## Provider acceptance follow-up — 26 September 2026

**Blocked; Phase 2 incomplete.** Configuration inspection confirmed absent Razorpay keys/plans/webhook secret and Resend API key. Fixed swallowed Resend API errors; 20 focused synthetic/mocked regressions pass, including real isolated PostgreSQL webhook rollback, deduplication and ordering. Actual checkout, provider retry and cloud signup/verification/reset remain unrun. Prior build/browser/full-suite results predate this mailer change. See the [current provider evidence and exact seller setup checklist](VERIFICATION_REPORT.md#provider-acceptance-follow-up--26-september-2026). Next: supply those prerequisites and run actual provider acceptance; do not advance to Phase 3.

## Handoff status

**S1–S5 complete within the documented supported scope. Not ready for sale or production: integrated acceptance and delivery/launch gates remain open.**

The current implementation is saved in the working tree. Phase 2 browser and local recovery acceptance is complete: 20 browser scenarios passed in CI mode with zero skips/retries; both local backup formats, full-schema recovery, persistence and failure recovery passed. Final production build, native PDF regressions and scoped checks passed; see [verification evidence](VERIFICATION_REPORT.md) and [recovery prerequisites](PHASE2_RECOVERY.md). The earlier 249-test automated gate is historical and was not rerun after these changes. Provider sandbox/email acceptance remains blocked on seller configuration. S3 is complete within its [supported security scope](S3_STABILIZATION.md); [S2/S5 accounting limits](S2_S5_STABILIZATION.md) still apply. No release was published, installer accepted, cloud deployment verified, or payment account activated.

This document supersedes older progress statements when they conflict. Detailed history remains in `RELEASE_WORK_LOG.md` and the three team logs in this directory. Changes include a large formatting/dependency migration diff; review that diff before making a release commit.

## Work saved

| Area | Implemented or prepared | Remaining gate |
| --- | --- | --- |
| Access/security | S3 review plus passing employee/store/tenant browser boundaries and role revocation; isolated recovery accepted | Scope limits in S3 evidence; provider email and delivery-format acceptance |
| Transactions | Stock/return limits, settlement and EMI locking, invoice issuance; GST/non-GST purchase/sale/payment-record/receipt/return browser acceptance passed | Prior accounting limits and owner/accountant acceptance; provider payments |
| Subscriptions | Webhook signature checks, atomic deduplication, subscription binding, event ordering and checkout guards | Provider sandbox checkout/webhook acceptance |
| Dependencies | Next 15.5.24, Better Auth 1.6.33, Drizzle 0.45.2, Playwright 1.63.0, Vitest 4.1.11, vendor SheetJS 0.20.3; Node 22; required PDF renderer 4.9.0 fix | Full-development advisory disposition remains; current production audit clean |
| Customer experience | Public guide, configurable support links, LAN signup/login/store setup and 360px navigation verified | Cloud email flows require provider configuration |
| Delivery | Docker/Compose configuration, desktop launcher/backup improvements, runtime staging and draft-release packaging scripts | Actual cloud image and clean Windows installer acceptance |

Implementation in this table is not evidence of passing final validation.

## Latest verification evidence

| Check | Latest known result | Evidence / interpretation |
| --- | --- | --- |
| Dependency audit | Production: 0 advisories. Full: 2 moderate, 1 low, 0 high/critical | `tsx` updated to 4.20.5; remaining Drizzle Kit esbuild paths and CSS-parser advisory documented in S1/S4 evidence. Frozen-lockfile install passed. |
| Production build | **Current application tree passed**, exit 0 | Final PDF runtime correction included; compilation/types/static generation/standalone output passed. [Evidence](VERIFICATION_REPORT.md), `.cache/phase2-browser-build.log/.exit`. |
| Targeted damage tests | **2 passed, 7 intentionally filtered/skipped**, exit 0 | Reconfirmed in `.cache/s1-s4-resume-damage.log`; real isolated PostgreSQL verifies rollback and concurrent final-unit protection. |
| Transaction-file diagnostic run | **4 passed, 5 failed**, exit 1 | Initial helper filter was consumed by pnpm; full file ran. Historical S1/S4 result, superseded by the S2/S5 19-test pass after migration 0021. |
| Earlier combined tests | 175 passed on an earlier snapshot | Team transaction log: 16 database/RLS, 90 domain, 23 storage, 46 web. Later edits invalidate using this as final release evidence. |
| Lint/typecheck | **Scoped current check passed; prior workspace types passed** | Final Biome: 19 files, zero errors. Workspace typecheck passed before renderer update; final production build validated web types afterward. Historical full lint: 377 files, 113 warnings. [Evidence](VERIFICATION_REPORT.md). |
| Full unit/database suite | **Historical 25 September: 249 passed, zero failed/skipped; 27 files** | Not rerun after browser/PDF fixes. This task: 19 transaction regressions and 2 actual PDF-rendering tests passed. [Evidence](VERIFICATION_REPORT.md). |
| Browser tests | **20 passed, zero failed/skipped/retries** | Production Chromium, CI mode; signup/login/store, GST/non-GST commerce/PDFs/returns, employee/store/tenant boundaries and mobile. CI configuration requires these scenarios; hosted CI unrun. |
| Database migrations | **Current check passed: 0000–0021 already applied** | Phase 2 isolated migration runner found no pending migrations. Full suite includes legacy backfill/constraint regression. |
| S2/S5 targeted verification | **90 domain + 17 DB/RLS + 19 transaction tests passed; zero skipped** | [Evidence and precise limitations](S2_S5_STABILIZATION.md). Earlier transaction failures are resolved. |
| S3 targeted verification | **62 security + 14 permission + 19 transaction tests passed; zero skipped** | [S3 evidence](S3_STABILIZATION.md). Final workspace typecheck and scoped Biome check passed. Real-cookie authorization and isolated database paths covered; full-suite/build/browser/actual backup acceptance not run. |
| Local backup/recovery | **7 top-level tests plus 1 subtest passed; zero failed/skipped** | Real gzip/custom dumps, full application schema/data, controlled replacement-cluster restart, paired uploads and failure recovery. [Evidence and prerequisites](PHASE2_RECOVERY.md). Installed launcher acceptance remains unrun. |
| Desktop/cloud artifacts | Unverified | No clean-machine installer result or Docker deployment smoke result. Docker unavailable in the inspected environment. |

The `.cache` evidence files are local and ignored by Git. Preserve or summarize final evidence in a tracked release report before publishing.

## Upcoming work, phase by phase

Do not advance a phase until its exit criteria pass. Use a lead integrator plus bounded security, transaction, and delivery tasks on independent files. Avoid simultaneous formatting and code edits. Run targeted tests during changes and one complete validation after integration.

### Phase 1 — finish stabilization

| ID | Priority / owner | Task | Acceptance |
| --- | --- | --- | --- |
| S1 | Complete / integrator | Captured returned product row; corrected stock-guard comment; added excessive/concurrent damage regressions | Isolated typecheck and both damage regressions pass |
| S2 | Complete / transactions | Verify the repaired invoice-test import and complete the tax snapshot schema/action/invoice/migration 0021 changes | Migration works on an existing disposable database; concurrent invoice requests reuse one number; later business tax changes do not rewrite the sale's stored tax facts |
| S3 | Complete / scoped limitations | Finished page/action/report/export scope review, role revocation, account state, employee/invitation/onboarding and backup gates | 95 relevant tests and typecheck pass; supported store and business-wide workflows, risks and deferred acceptance recorded in S3 evidence |
| S4 | Complete / integrator | Lint/typecheck, tsx/Sentry migration, advisory assessment and frozen lockfile install pass; final standalone production build passes | Build requires an administrator terminal on this Windows machine. Drizzle tooling upgrade decision and low CSS-parser advisory remain documented follow-ups; full audit is not clean |
| S5 | Complete / scoped limitations | Review return valuation, settlement allocation, historical stock/cost and tax limitations | Supported workflows explicit; unsupported cases blocked or documented truthfully; regressions pass |

Exit: all P0 tasks resolved, remaining limitations explicitly scoped, targeted regressions pass.

### Phase 2 — verify integrated product

Depends on Phase 1. QA/integrator owns the final evidence. **Automated baseline passed on 25 September; browser and local recovery accepted on 26 September 2026.** Required journeys and recovery pass after documented fixes; final production build and targeted checks passed. See [verification report](VERIFICATION_REPORT.md). Provider acceptance remains incomplete because seller-owned sandbox/email configuration is absent. Provider preparation is updated above; do not advance to Phase 3.

1. Confirm isolated PostgreSQL is available, then apply pending migrations there only.
2. Run lint, typecheck, full unit/database tests and production build against the same frozen working tree.
3. Complete: browser acceptance for signup/login/store setup, products/purchases, sale/payment-record/invoice/receipt, returns, permissions and mobile navigation. CI uses the isolated helper and no LAN skip conditions.
4. Complete: disposable local backup/restore, error recovery and paired persisted uploads. Observe [operator prerequisites](PHASE2_RECOVERY.md); installed delivery formats remain Phase 3.
5. Once provider sandbox credentials exist, verify payment checkout, duplicate/out-of-order webhooks, failed delivery retry and cancellation. Never substitute live customer transactions for tests.
6. Record commands, date, revision/tree state, passed/failed/skipped counts and artifacts in a release evidence report.

Exit: all required checks pass with no unexplained skipped core scenarios. Resolve failures before repeating the whole suite.

### Phase 3 — package and accept both delivery formats

Depends on Phase 2; delivery engineer owns packaging.

- **Desktop:** verify pinned Node/PostgreSQL runtime downloads and hashes, seller license text, installer creation, clean-machine install/start/restart, LAN access, data persistence, backup/restore, upgrade and uninstall data behavior. Decide and document code-signing arrangements. Test launcher/backup failure paths; Go compilation alone is insufficient.
- **Cloud:** build the Docker image in a Docker-capable environment; provision seller-owned hosting, TLS/domain, email, secrets and durable database/upload/backup volumes. Validate migration, startup, restart, upload persistence, tenant isolation, backup recovery and rollback in staging.
- Supported cloud storage preparation currently uses durable local storage on a single instance. R2 remains unsupported and should fail explicitly; do not market serverless/multi-instance storage support.

Exit: reproducible artifacts, installation/deployment instructions, recovery evidence and known limits recorded. Keep releases as drafts until launch gates pass.

### Phase 4 — seller setup and launch handoff

Owner inputs can be gathered alongside engineering but are required before customer launch:

- Seller/business identity, support email and support process.
- Product/pricing choices and approved commercial license, terms and privacy information.
- Hosting/domain/email ownership and configuration for cloud delivery.
- Activated payment account and approved plans if subscriptions will be sold.
- Desktop runtime distribution/license inputs and signing decision.
- Named pilot customer, acceptance checklist and support/recovery expectations.

Prepare a customer guide, operator/recovery guide and final release notes using actual verified behavior. Obtain appropriate accounting/tax review before making compliance claims. Exit only after the owner accepts the pilot and all required external setup is complete.

## Resume instructions

1. Read this document and `RELEASE_WORK_LOG.md`; inspect `git status` and current diffs. Do not discard saved changes or assume interrupted agent work is complete.
2. Next task: Phase 2 provider sandbox/email acceptance once seller-owned configuration is available. Verify checkout/cancellation, duplicate/out-of-order webhooks and email verification/reset/invitation delivery/retry using disposable data and sandbox accounts. Current helper intentionally disables providers; do not invent credentials or enable live payments. Preserve this isolation while preparing any separate sandbox harness. Do not repeat passing local gates without relevant source changes/failures. For future production builds here, run `node scripts/release-check.mjs build` from a Windows administrator terminal for standalone symlinks.
3. The isolated helper pins `127.0.0.1:55432/mybizone_release_test`, test auth values and disabled real integrations. Verify the local PostgreSQL process belongs to `.cache/test-pgdata`; its running state is not guaranteed after interruption.
4. From the repository root, use these commands at the corresponding phase gate:

```powershell
node scripts/release-check.mjs migrate
pnpm lint
node scripts/release-check.mjs typecheck
node scripts/release-check.mjs test
node scripts/release-check.mjs build
node scripts/release-check.mjs e2e
```

5. Preserve logs and update this status with actual outcomes. No completion estimate is committed until stabilization identifies the remaining failures.

## Known product limits needing an explicit decision

Party-level settlements do not provide per-invoice allocation; cash-refund/advance ledger support is incomplete; EMI returns are blocked; duplicate product lines can limit return valuation selection. Historical costs and legacy stock edits have reconstruction limitations, and historical tax facts cannot always be inferred for backfill. Email delivery within transactions lacks a durable outbox. The supported scope and explicit blocks are recorded in [S2/S5 accounting limits](S2_S5_STABILIZATION.md); owner/accountant acceptance is still required before sale. [S3 security limits](S3_STABILIZATION.md) distinguish store-specific sales/inventory from business-wide reports/shared accounts, unsupported department-only workflows, request-time revocation and operator-controlled backup provenance.
