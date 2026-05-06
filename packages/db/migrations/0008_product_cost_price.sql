-- Add cost_price to products (nullable — existing rows have unknown cost).
-- Snapshot at sale time into sale_items so historical profit remains accurate
-- even when cost_price is later changed or cleared.

ALTER TABLE products ADD COLUMN cost_price NUMERIC(10,2);
ALTER TABLE sale_items ADD COLUMN cost_price_at_sale NUMERIC(10,2);
