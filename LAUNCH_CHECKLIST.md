# MyBizOne v2 — Launch Checklist

Last updated: 2026-05-14
Status: Code complete (M1–M14 shipped). Pre-launch work remaining.

---

## How to use this file
Work through categories A → F in order. A is fully blocking — nothing else matters until
the app is deployed and the production build is confirmed working. Check off each item as
you complete it.

---

## A. Deployment Blockers ← START HERE

These must all be done before any customer can use the product.

- [ ] **A1** — `pnpm build` passes with 0 errors (run locally first)
- [ ] **A2** — Push repo to GitHub (create private repo, push main branch)
- [ ] **A3** — Provision production Postgres (Neon recommended — free tier, serverless)
- [ ] **A4** — Deploy to Vercel (connect GitHub repo, set root = apps/web)
- [ ] **A5** — Set all production env vars in Vercel dashboard
- [ ] **A6** — Run all 17 migrations against production DB
- [ ] **A7** — Seed `usage_snapshots` on business creation (userCount=1 row)
- [ ] **A8** — Configure custom domain + SSL on Vercel
- [ ] **A9** — Configure Sentry DSN for production error tracking
- [ ] **A10** — Smoke test: register → create product → make sale → print invoice

### Required env vars (Vercel)
```
DATABASE_URL=                    # from Neon
BETTER_AUTH_SECRET=              # random 32-char string: openssl rand -hex 32
BETTER_AUTH_URL=                 # https://yourdomain.com
NEXT_PUBLIC_APP_URL=             # https://yourdomain.com

RAZORPAY_KEY_ID=                 # from Razorpay dashboard (test mode first)
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
NEXT_PUBLIC_RAZORPAY_KEY_ID=

RESEND_API_KEY=                  # or SMTP_* for email
EMAIL_FROM=                      # noreply@yourdomain.com

NEXT_PUBLIC_SENTRY_DSN=          # from sentry.io project
SENTRY_AUTH_TOKEN=               # for source map upload

LAN_MODE=false                   # false for cloud SaaS
```

---

## B. Legal & Compliance

These can run in parallel with deployment. Some have external wait times.

- [ ] **B1** — CA review of GST invoice template (mandatory fields per CBIC)
- [ ] **B2** — Privacy Policy page at /privacy
- [ ] **B3** — Terms of Service page at /terms
- [ ] **B4** — GSTN IRP production credentials (for real e-invoice IRN above ₹5cr)
- [ ] **B5** — Razorpay live mode KYC + activation

### Notes
- B1 (CA review): Share the invoice PDF with a CA. Key fields required: GSTIN of supplier,
  GSTIN of buyer (B2B), place of supply, HSN/SAC, CGST/SGST or IGST breakup, IRN (above ₹5cr).
- B4 is only required when a customer's annual turnover exceeds ₹5cr. Can defer until then.
- B5: Apply at razorpay.com/support/payments/dashboard/activation — takes 3–7 working days.

---

## C. Feature Gaps

Fix these during or just after deployment.

- [ ] **C1** — SMS on bill save (MSG91 API key in .env, fire after createSaleAction)
- [ ] **C2** — Real GSTN IRP API call in generateIrnAction (replace mock response)
- [ ] **C3** — Staff performance tab in /reports/performance (needs employees table data)
- [ ] **C4** — Verify purchase bill → supplier outstanding sync is correct end-to-end
- [ ] **C5** — Add `usage_snapshots` seed on business creation in the registration flow

### C1 detail (SMS)
Add to `apps/web/app/(app)/sales/actions.ts` after bill is saved:
```
POST https://api.msg91.com/api/v5/flow/
Headers: authkey: MSG91_API_KEY
Body: { template_id, recipients: [{ mobiles: customerPhone, name, bill_no, amount }] }
```
Env vars needed: `MSG91_API_KEY`, `MSG91_TEMPLATE_ID`

---

## D. Desktop Installer (LAN / self-hosted track)

Not needed for cloud SaaS launch. Do after first 5 cloud customers.

- [ ] **D1** — Bundle portable PostgreSQL 16 (pgPortable zip) into release workflow
- [ ] **D2** — Bundle portable Node.js 20 LTS into release workflow
- [ ] **D3** — End-to-end test Go launcher on clean Windows machine
- [ ] **D4** — Windows code signing certificate (~$150/yr, Sectigo/DigiCert)
- [ ] **D5** — macOS .dmg with arm64+x64, Apple notarization ($99/yr Apple Developer)

### D3 test steps
1. Download release zip to a machine with no Node/Postgres installed
2. Double-click mybizonelaunch.exe
3. Verify: Postgres starts → Node starts → browser opens at localhost:3000
4. Complete /setup wizard
5. Create a sale, print invoice
6. Verify daily backup runs and creates .sql.gz

---

## E. QA & Testing

Do this as soon as A is complete (app is live).

- [ ] **E1** — Razorpay test-mode full flow (subscribe → webhook → plan gate → cancel)
- [ ] **E2** — Full POS flow UAT: product → sale → payment → invoice → return
- [ ] **E3** — GST report accuracy: cross-check GSTR-1 export against manual calculation
- [ ] **E4** — Multi-store isolation: 2 stores, verify data doesn't bleed across
- [ ] **E5** — RBAC gate testing: login as each role, verify access is correct
- [ ] **E6** — EMI flow: create EMI sale → schedule → record payments → complete
- [ ] **E7** — Backup/restore: run backup, drop a table, restore, verify data intact
- [ ] **E8** — Load test: seed 1000 products, 500 customers, 3000 sales — check page speed

---

## F. Business Infrastructure

Do in parallel with E. Needed before marketing begins.

- [ ] **F1** — Landing page / marketing site (separate from app, or /marketing folder)
- [ ] **F2** — Pricing page with plan comparison
- [ ] **F3** — Help documentation (basic: getting started, POS, reports, GST)
- [ ] **F4** — Customer support channel (WhatsApp Business or email helpdesk)
- [ ] **F5** — Onboarding email sequence (welcome + 3-day tips series via Resend)
- [ ] **F6** — Demo video / screenshots for sales
- [ ] **F7** — Google Analytics or Plausible on the app

---

## Launch Order Recommendation

```
Week 1:  A1 → A2 → A3 → A4 → A5 → A6 (get app live, even if rough)
         B2 + B3 in parallel (Privacy + ToS — write yourself, review later)
         C5 (usage_snapshots seed — 1hr fix)

Week 2:  A7 → A8 → A9 → A10 (domain, Sentry, smoke test)
         E1 → E2 → E3 (critical QA flows)
         C1 (SMS — 2hrs)
         B5 (Razorpay KYC — submit application)

Week 3:  E4 → E5 → E6 → E7 (remaining QA)
         B1 (CA review — book appointment)
         F4 (support channel setup)
         F2 (pricing page)

Week 4:  F1 (landing page)
         F3 (help docs)
         F5 (onboarding emails)
         First real customer onboarded

Post-launch (as needed):
         C2 (real IRN — only when customer crosses ₹5cr)
         D1–D5 (desktop installer — when customers request it)
         B4 (GSTN production credentials)
```

---

## Current Code State

| Metric | Value |
|--------|-------|
| Milestones shipped | M1–M14 (all) |
| DB migrations | 17 (0000–0016) |
| App pages | 83 |
| Domain tests | 74 passing |
| TypeScript errors | 0 |
| Last commit | 35bc2b5 (M14) |
