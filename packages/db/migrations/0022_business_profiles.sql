-- Independent industry defaults and selling model. Stores may inherit either.
-- Additive only: existing products, prices, roles and transactions are preserved.
ALTER TABLE businesses ADD COLUMN business_profile text NOT NULL DEFAULT 'general_retail'
  CHECK (business_profile IN ('general_retail','grocery','furniture','electronics','wholesale','food_service'));
ALTER TABLE businesses ADD COLUMN selling_model text NOT NULL DEFAULT 'retail'
  CHECK (selling_model IN ('retail','wholesale','both'));
ALTER TABLE stores ADD COLUMN business_profile text
  CHECK (business_profile IN ('general_retail','grocery','furniture','electronics','wholesale','food_service'));
ALTER TABLE stores ADD COLUMN selling_model text
  CHECK (selling_model IN ('retail','wholesale','both'));
