# Cash, bank accounts and payment clearing — feature Phase 4c

Status, 20 October 2026: locally accepted; awaiting migration/publication approval.
Migration 0030 is tested on a temporary Neon branch. Hosted application and
database remain at accepted Phase 4b until explicit migration/publication approval.

Local acceptance completed on 17–18 October: **401 automated tests** (384 web /
35 suites, including 36 new money regressions; 17 database / three suites), production
build, application/database types and scoped lint passed. **240 production-browser
checks / 17 runners** passed. After review added the legacy over-allocation guard,
the final build and full automated suite passed, followed by all **25 affected finance
browser checks**. The other 215 scenarios cover unchanged code. Financial fixture
cleanup preserved all 46 checked stock/financial/account table hashes. Phone layouts
were visually inspected at 360px. All 20 accepted source hashes still match on
20 October; the prepared SQL and 40 preserved temporary-branch table hashes were
rechecked without changing data. Hosted acceptance remains pending publication.

Evidence: `.cache/money-all-tests-final.log`, `.cache/money-db-tests-final.log`,
`.cache/money-build-final.log`, `.cache/money-lint-final.log`,
`.cache/money-production-acceptance.json`, `.cache/money-final-acceptance.json`,
their individual runner logs/screenshots, `.cache/money-accepted-source.json` and
`.cache/money-temporary-validation.json`. Credentials/migration context remain
in ignored private files. Public runners are `scripts/verify-money.mjs` (guarded
local financial writes) and `scripts/verify-money-register.mjs` (read-only).

## Operator workflow

Open **Billing → Cash & bank**. Owner, global admin and global accounts users use
the existing `manage_expenses` permission. Store/department grants do not expose
shared account balances. The same gate protects commands, dashboard figures and
the credit bill reconciliation report.

1. Add each actual cash or bank account with a name, a start-of-day opening date,
   verified balance, evidence reference and note. Count sheets and bank statements
   are external evidence: the application records the operator's assertion; it does
   not contact a bank or independently verify a document. Cash openings cannot be
   negative; bank openings can represent an overdraft. No accounts means setup is
   required, rather than asserting that available cash is zero.
2. Assign recorded cashbook receipts/payments to the actual account. Partial and
   split assignments are supported, up to the source amount across all accounts.
   The source date must be on/after the account opening date, and assignment cannot
   predate the source. Earlier transactions are represented by the opening balance
   and cannot be posted again. Unknown payment methods require explicit assignment.
3. Assignments start **pending**. Clear them with a date, reference and evidence
   note after confirming cash or the statement. Pending incoming contributes no
   available money. Pending outgoing reserves funds. A genuine recorded expense may
   expose a negative cash position: recording evidence is not blocked to hide a gap.
4. Record a transfer between two different business accounts. It creates one linked
   entry, reserves the origin while pending and changes both balances atomically
   when cleared. Creation/clearing protect other pending outgoing reservations.
   A transfer never becomes new sales, income or expense.
5. Cancel pending entries, reverse cleared entries, or mark pending/cleared money
   bounced. Closed entries are terminal. Original entries, clearing evidence,
   references, actor and notes remain retained. No backdated event may predate its
   assignment or earlier clearing. Dates use India calendar days and cannot be future.

The current account balance is verified opening plus active cleared incoming minus
active cleared outgoing. Available from recorded entries subtracts pending outgoing.
Pending incoming is shown separately. Figures are provisional when source coverage
is incomplete, captured evidence changed/disappeared or an account has a negative
position after reservations. Reconciled status means recorded source coverage is
complete; physical cash/statement confirmation and all real-world account coverage
remain the operator's responsibility.

The earliest account opening is the adoption boundary for business-wide source
coverage. Different later account openings retain their own assignment guards.
Use a common verified date for accounts being adopted together. Sources before
adoption are not automatically reconstructed from historical cashbook totals.

## Source evidence and corrections

Stable source keys distinguish sale, customer receipt, purchase, supplier payment,
order receipt/refund, EMI down payment, EMI instalment, expense/income and accounting
event even when separate tables contain the same UUID. Financial fingerprints cover
source identity, India date, direction, amount and normalised method. Labels are
descriptive snapshots. Assignment does not alter stock, party debt, bill allocations
or cashbook movement totals. Advance-funded synthetic settlements remain excluded
from cashbook/account money to avoid duplication.

Some existing sources, including expenses and EMI payment records, can be edited
or deleted elsewhere. Active captured evidence is checked against current financial
facts. A changed/deleted source stays visible as needing reconciliation; its already
cleared balance is not silently erased. Cancel pending or reverse cleared assignments,
correct the source, then capture it again. An immutable noncash offset whose source
was later edited remains a flagged exception requiring external reconciliation;
Phase 4c does not supply arbitrary journal adjustments or rewrite that history.

Opening balance corrections append a separate verified revision, retain the original
opening date and require all dependent pending/cleared entries to be cancelled or
reversed first. Revisions use insertion time after the account lock to retain the
actual correction order. The history includes original opening evidence and revisions.

### Bounced receipts and operational debt

Bank clearing does not silently change debt or stock. If an allocated customer
cheque bounces, the account entry can be marked bounced, but the original settlement
still needs the existing operational correction:

1. In **Advances & refunds**, reverse its active bill allocations, then the settlement
   (existing paid-return reconciliation restrictions still apply).
2. In **Cash & bank → Reconcile bounced correction**, select the bounced original
   money and its actual linked opposite reversal. Only provenance-linked settlement
   reversals or advance/refund money reversals qualify.
3. Record up to the remaining bounced, unassigned capacity on both source documents.
   This is documentary noncash reconciliation; it creates no fictional bank payment.

Partial offsets are supported. If part of the original money actually cleared,
reversing its complete operational settlement may still require a real refund or
other supported correction for that cleared portion. Unrelated income/expenses
cannot be offset just to make a balance appear reconciled.

## Credit bill reconciliation

**Billing → Credit bill reconciliation** shows ordinary customer/supplier credit
bills, their recorded remaining values, invoice age and evidence qualifications.
Age bars include only bills with consistent evidence. Explicit due dates, when
present, support overdue-day labels. Missing due dates do not become inferred
payment terms; supplier bills currently have no due-date field.

Consistency requires ordinary credit bill remaining values to agree with party debt,
no unallocated party payments, no unsupported legacy paid/partial statuses and full
current cleared account coverage for every actively allocated receipt/payment.
Negative remaining bill values always require reconciliation, even when a legacy
negative party balance happens to agree.
Advance-funded allocations check the original advance's cleared evidence. This
strictly requires the whole receipt/advance to be cleared, even for partial allocation.
Customers with any order or EMI ledger require separate reconciliation and are not
certified by this ordinary-credit report. Historical receipts before account adoption
cannot be verified merely from an aggregate opening balance. These rows remain
qualified; a mismatch is never guessed into an invoice allocation.

This is management evidence, not an audited statement, general ledger, automatic
bank reconciliation or tax filing. Current account positions are explicit on the
finance dashboard even when its sales period is historical. Historical account
balance reconstruction and statement import/matching are outside this phase.

## Integrity and rollout

Migration `0030_money_accounts_and_clearing.sql` adds six tables only: accounts,
opening revisions, source snapshots, postings, posting events and source offsets.
All use FORCE RLS; app_user receives SELECT/INSERT only. Compound foreign keys
prevent cross-business account/source links. Unique indexes constrain source
versions, account names and one clearing/terminal closing per entry.

Every command has a request UUID and canonical payload hash. Exact retries replay
once; changed retries fail. Transaction advisory locks serialize request identity,
source capacity and sorted account IDs. Mutable source rows are also locked.
The UI retains a request ID after uncertain responses and uses full navigation
after success to display fresh committed positions. A forged saved ID produces
no success banner. Initial setup and every command require evidence.

The migration passed on temporary branch `br-solitary-wildflower-ao4hv2u9`:
all **40 existing table row counts/full-row hashes** match the fresh hosted baseline;
all six new tables have the required RLS/grants and no fabricated financial data.
Only this migration may be applied after approval. Subscription migration 0020
remains intentionally pending and must not be included in an all-pending rollout.

Final validation and publication state are maintained in
[project status](PROJECT_STATUS.md) and [the work log](../RELEASE_WORK_LOG.md).
Financial mutation tests and browser fixtures run only against the exact guarded
local disposable cluster. The read-only acceptance runner can later verify hosted
pages/roles without submitting a financial command. Credentials remain ignored.
