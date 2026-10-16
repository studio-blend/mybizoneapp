# Standard testing account

Owner instruction, 14 October 2026: **Use this account for all testing and verification.**

- Email: `pro.owner@example.com`
- Role: owner; full permissions within the dedicated test business.
- Plan: Pro; unlimited stores, products and users.
- Local login: `http://localhost:3000/login`
- Hosted development login: `https://mybizoneapp.vercel.app/login`
- Canonical private credentials: `.local/test-accounts/pro-owner.json` at the repository root.

Hosted sample data was expanded on 15 October 2026 to four stores (two furniture,
electronics, utensils), 12 departments, 24 products and 33 total users. See
[four-store test data and staff login instructions](FOUR_STORE_TEST_DATA.md).
The owner credentials are unchanged; local and hosted data remain separate.

Future tasks must read that private file locally and reuse the saved login. Do not print or commit passwords or sessions, create replacement owner accounts for routine verification, or implicitly reset the account/data. The same email/password is provisioned in the separate local and hosted databases; their business data does not automatically synchronize.

Use this account for authenticated product workflows, UI checks, screenshots and feature acceptance. Preserve isolated database guards for automated regressions. Do not weaken existing permission/tenant tests to make an owner-only check pass; report when a verification requires a different role or unauthenticated context.

Razorpay remains on hold. Record actual results and the environment used in `RELEASE_WORK_LOG.md`. The current account/provisioning evidence is in [LOCAL_PRO_TESTING.md](LOCAL_PRO_TESTING.md).
