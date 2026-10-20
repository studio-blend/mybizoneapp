-- Verified start-of-day openings and append-only cash/bank evidence.
CREATE TABLE money_accounts (
 id uuid PRIMARY KEY,business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 2 AND 80),
 kind text NOT NULL CHECK(kind IN ('cash','bank')),opening_on date NOT NULL,
 opening_balance numeric(12,2) NOT NULL CHECK(kind='bank' OR opening_balance>=0),
 reference text NOT NULL CHECK(length(trim(reference)) BETWEEN 3 AND 100),
 note text NOT NULL CHECK(length(trim(note)) BETWEEN 3 AND 500),request_hash text NOT NULL,
 created_by text REFERENCES "user"(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(id,business_id)
);
CREATE UNIQUE INDEX money_accounts_name ON money_accounts(business_id,lower(trim(name)));
CREATE TABLE money_opening_revisions (
 id uuid PRIMARY KEY,business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
 account_id uuid NOT NULL,opening_balance numeric(12,2) NOT NULL,
 reference text NOT NULL CHECK(length(trim(reference)) BETWEEN 3 AND 100),
 note text NOT NULL CHECK(length(trim(note)) BETWEEN 3 AND 500),request_hash text NOT NULL,
 created_by text REFERENCES "user"(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(account_id,business_id) REFERENCES money_accounts(id,business_id)
);
CREATE INDEX money_openings_account ON money_opening_revisions(business_id,account_id,created_at);
CREATE TABLE money_source_snapshots (
 id uuid PRIMARY KEY,business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
 source_kind text NOT NULL CHECK(source_kind IN ('sale','sales_settlement','purchase','purchase_settlement','order_payment','emi_down','emi_payment','expense','accounting_event')),
 source_id uuid NOT NULL,source_hash text NOT NULL,amount numeric(12,2) NOT NULL CHECK(amount>0),
 direction text NOT NULL CHECK(direction IN ('in','out')),method text NOT NULL,source_day date NOT NULL,
 label text NOT NULL,href text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,business_id),UNIQUE(business_id,source_kind,source_id,source_hash)
);
CREATE TABLE money_postings (
 id uuid PRIMARY KEY,business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('source','transfer')),snapshot_id uuid,from_account_id uuid,to_account_id uuid,
 amount numeric(12,2) NOT NULL CHECK(amount>0),booked_on date NOT NULL,
 reference text NOT NULL CHECK(length(trim(reference)) BETWEEN 3 AND 100),
 note text NOT NULL CHECK(length(trim(note)) BETWEEN 3 AND 500),request_hash text NOT NULL,
 created_by text REFERENCES "user"(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(id,business_id),
 FOREIGN KEY(snapshot_id,business_id) REFERENCES money_source_snapshots(id,business_id),
 FOREIGN KEY(from_account_id,business_id) REFERENCES money_accounts(id,business_id),
 FOREIGN KEY(to_account_id,business_id) REFERENCES money_accounts(id,business_id),
 CHECK((kind='source' AND snapshot_id IS NOT NULL AND num_nonnulls(from_account_id,to_account_id)=1) OR (kind='transfer' AND snapshot_id IS NULL AND from_account_id IS NOT NULL AND to_account_id IS NOT NULL AND from_account_id<>to_account_id))
);
CREATE INDEX money_postings_source ON money_postings(business_id,snapshot_id);
CREATE INDEX money_postings_from ON money_postings(business_id,from_account_id);
CREATE INDEX money_postings_to ON money_postings(business_id,to_account_id);
CREATE TABLE money_posting_events (
 id uuid PRIMARY KEY,business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
 posting_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN ('clear','bounce','cancel','reverse')),event_on date NOT NULL,
 reference text NOT NULL CHECK(length(trim(reference)) BETWEEN 3 AND 100),
 note text NOT NULL CHECK(length(trim(note)) BETWEEN 3 AND 500),request_hash text NOT NULL,
 created_by text REFERENCES "user"(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(posting_id,business_id) REFERENCES money_postings(id,business_id),UNIQUE(business_id,posting_id,kind)
);
CREATE UNIQUE INDEX money_posting_closed ON money_posting_events(business_id,posting_id) WHERE kind IN ('bounce','cancel','reverse');
CREATE TABLE money_source_offsets (
 id uuid PRIMARY KEY,business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
 original_snapshot_id uuid NOT NULL,correction_snapshot_id uuid NOT NULL,
 amount numeric(12,2) NOT NULL CHECK(amount>0),booked_on date NOT NULL,
 reference text NOT NULL CHECK(length(trim(reference)) BETWEEN 3 AND 100),
 note text NOT NULL CHECK(length(trim(note)) BETWEEN 3 AND 500),request_hash text NOT NULL,
 created_by text REFERENCES "user"(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(original_snapshot_id,business_id) REFERENCES money_source_snapshots(id,business_id),
 FOREIGN KEY(correction_snapshot_id,business_id) REFERENCES money_source_snapshots(id,business_id),
 CHECK(original_snapshot_id<>correction_snapshot_id)
);
CREATE INDEX money_offsets_original ON money_source_offsets(business_id,original_snapshot_id);
CREATE INDEX money_offsets_correction ON money_source_offsets(business_id,correction_snapshot_id);
ALTER TABLE money_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY money_tenant ON money_accounts USING(business_id=NULLIF(current_setting('app.business_id',true),'')::uuid) WITH CHECK(business_id=NULLIF(current_setting('app.business_id',true),'')::uuid);
REVOKE ALL ON money_accounts FROM app_user;
GRANT SELECT,INSERT ON money_accounts TO app_user;
ALTER TABLE money_opening_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_opening_revisions FORCE ROW LEVEL SECURITY;
CREATE POLICY money_tenant ON money_opening_revisions USING(business_id=NULLIF(current_setting('app.business_id',true),'')::uuid) WITH CHECK(business_id=NULLIF(current_setting('app.business_id',true),'')::uuid);
REVOKE ALL ON money_opening_revisions FROM app_user;
GRANT SELECT,INSERT ON money_opening_revisions TO app_user;
ALTER TABLE money_source_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_source_snapshots FORCE ROW LEVEL SECURITY;
CREATE POLICY money_tenant ON money_source_snapshots USING(business_id=NULLIF(current_setting('app.business_id',true),'')::uuid) WITH CHECK(business_id=NULLIF(current_setting('app.business_id',true),'')::uuid);
REVOKE ALL ON money_source_snapshots FROM app_user;
GRANT SELECT,INSERT ON money_source_snapshots TO app_user;
ALTER TABLE money_postings ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_postings FORCE ROW LEVEL SECURITY;
CREATE POLICY money_tenant ON money_postings USING(business_id=NULLIF(current_setting('app.business_id',true),'')::uuid) WITH CHECK(business_id=NULLIF(current_setting('app.business_id',true),'')::uuid);
REVOKE ALL ON money_postings FROM app_user;
GRANT SELECT,INSERT ON money_postings TO app_user;
ALTER TABLE money_posting_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_posting_events FORCE ROW LEVEL SECURITY;
CREATE POLICY money_tenant ON money_posting_events USING(business_id=NULLIF(current_setting('app.business_id',true),'')::uuid) WITH CHECK(business_id=NULLIF(current_setting('app.business_id',true),'')::uuid);
REVOKE ALL ON money_posting_events FROM app_user;
GRANT SELECT,INSERT ON money_posting_events TO app_user;
ALTER TABLE money_source_offsets ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_source_offsets FORCE ROW LEVEL SECURITY;
CREATE POLICY money_tenant ON money_source_offsets USING(business_id=NULLIF(current_setting('app.business_id',true),'')::uuid) WITH CHECK(business_id=NULLIF(current_setting('app.business_id',true),'')::uuid);
REVOKE ALL ON money_source_offsets FROM app_user;
GRANT SELECT,INSERT ON money_source_offsets TO app_user;
