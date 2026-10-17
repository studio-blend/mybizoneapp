# Release phases

> **17 October 2026:** This document tracks commercial delivery/release gates.
> For current application progress and separate product feature phases, read
> [project status](../PROJECT_STATUS.md). Features through Phase 4b are live; this
> does not complete delivery Phase 3 or commercial launch. Older dated deployment
> and verification statements below remain historical evidence.
>
> Phase 4b advances/refunds/corrections is published and hosted-verified: 365
> automated tests, 215 local production-browser checks and 137 read-only hosted
> checks passed. Approved migration 0029 is applied/recorded, its temporary branch
> removed. Migration preserved all 39 checked tables; later audited owner-account
> profile edits were retained. Phase 4c opening cash,
> transfers and bank clearing is next. See
> [the accounting scope](../ADVANCES_REFUNDS_AND_CORRECTIONS.md). Commercial phases
> below remain separate and open where previously recorded.

**15 October 2026 update:** Hosted development performance changes are deployed and verified with the saved Pro owner; 133 web + 17 DB tests, types, scoped lint and production build passed. Phase 1 remains complete within supported scope. Phase 2 retains deferred Razorpay and unverified cloud email gates. Windows installer and full cloud delivery/recovery acceptance remain pending; the working hosted development site does not complete those gates. See [current status](STATUS_AND_NEXT_TASKS.md) and [performance report](../PERFORMANCE_OPTIMIZATION.md).

**14 October 2026 owner steering:** Hold Razorpay acceptance for now. Reusable Pro owner is verified locally and on `mybizoneapp.vercel.app` after Neon provisioning; saved credentials are shared across those test accounts. Provider and complete cloud delivery acceptance remain incomplete, not waived. See [Pro testing](LOCAL_PRO_TESTING.md).

**Provider follow-up, 26 September:** Phase 2 remains blocked. Seller-owned Razorpay Test Mode keys/plans/webhook endpoint and Resend key/verified sender/inbox are missing. Mailer API-error handling fixed; 20 synthetic/mocked focused regressions passed, including isolated database webhook rollback/retry. Actual provider checkout and cloud email journeys remain unrun. See [setup and acceptance matrix](VERIFICATION_REPORT.md#provider-acceptance-follow-up--26-september-2026). Earlier build/browser gates predate this change. Next task remains provider acceptance after configuration; no Phase 3 advance.

Requested scope: Windows desktop/local network and cloud. No seller accounts are configured yet.

**26 September 2026: Phase 1 stabilization, Phase 2 automated baseline, and browser/local recovery acceptance complete within documented scope; not sale-ready.** Final production build and all 20 browser scenarios passed in CI mode, with zero skipped/retried tests. Both backup formats, full-schema/data recovery, controlled restart, paired uploads and failure recovery passed (7 top-level tests plus 1 subtest). Native PDF tests and targeted/scoped checks passed. The prior 249-test full suite was not repeated after these changes. See [verification report](VERIFICATION_REPORT.md), [recovery prerequisites](PHASE2_RECOVERY.md) and [status](STATUS_AND_NEXT_TASKS.md). Provider sandbox/email, installer and cloud acceptance remain incomplete. Prior [security limits](S3_STABILIZATION.md) and [transaction/accounting limits](S2_S5_STABILIZATION.md) still apply.

| Phase | Exit criteria | Status |
| --- | --- | --- |
| 1. Stabilize | Patched dependencies; reviewed auth and transactional changes; regressions pass | Complete within documented scope: S1–S5 targeted gates pass. S3 adds 62 security + 14 permission + 19 transaction passes and current typecheck. Current integrated automated evidence is recorded in the verification report. |
| 2. Verify | Automated gates, core browser journeys, local recovery and provider acceptance pass | Automated baseline passed 25 September; browser/local recovery passed 26 September. Overall phase incomplete: seller-owned provider sandbox/email configuration is missing. Next task: provider acceptance. Provider preparation complete; actual provider acceptance blocked; do not advance to Phase 3 |
| 3. Package | Windows artifact and cloud configuration; startup/backup evidence; limitations recorded | Preparation in progress |
| 4. Launch handoff | Operator guide, release evidence, seller-owned external setup completed | Pending |

Work in parallel only on independent files. Run targeted checks during edits and one full validation at the phase gate. Record results in [the work log](../../RELEASE_WORK_LOG.md); no phase is complete merely because code exists.

External gates: seller identity and support contact; approved commercial terms/privacy information; hosting/domain/email/payment accounts; Windows runtime/license configuration and clean-machine acceptance; cloud deployment smoke test. No production access or purchase is assumed.
