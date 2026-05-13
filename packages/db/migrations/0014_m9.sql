-- M9: Accounting Lite + GST Compliance
-- Adds: e_invoices table for IRN tracking

-- ────────────────────────────────────────────────────────────
-- e_invoices: IRN tracking per sale
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS e_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  sale_id uuid NOT NULL REFERENCES sales(id),
  irn text UNIQUE,
  ack_no text,
  ack_date timestamp,
  signed_invoice text,
  signed_qr_code text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','generated','cancelled','failed')),
  error_message text,
  cancelled_at timestamp,
  cancel_reason text,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

ALTER TABLE e_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY e_invoices_tenant ON e_invoices USING (business_id = NULLIF(current_setting('app.business_id', true), '')::uuid);
GRANT ALL ON e_invoices TO app_user;
