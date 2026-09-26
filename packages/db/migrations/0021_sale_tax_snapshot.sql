-- Tax context must survive changes to business settings and delayed PDF creation.
-- No defaults: NULL deliberately identifies legacy context we cannot recover.
ALTER TABLE sales ADD COLUMN gst_enabled_at_sale BOOLEAN;
ALTER TABLE sales ADD COLUMN business_gstin_at_sale TEXT;
ALTER TABLE sales ADD COLUMN is_interstate BOOLEAN;
ALTER TABLE sales ADD COLUMN cgst NUMERIC(12,2);
ALTER TABLE sales ADD COLUMN sgst NUMERIC(12,2);
ALTER TABLE sales ADD COLUMN igst NUMERIC(12,2);

-- Existing invoices are the only frozen historical tax source. Do not copy
-- today's business GST settings into old transactions or infer missing states.
UPDATE sales s SET
  gst_enabled_at_sale = (s.bill_type = 'gst_bill' AND (i.business_gstin IS NOT NULL OR s.tax_total > 0)),
  business_gstin_at_sale = i.business_gstin,
  is_interstate = i.is_interstate,
  cgst = i.cgst, sgst = i.sgst, igst = i.igst
FROM invoices i WHERE i.sale_id = s.id AND i.business_id = s.business_id
  AND i.cgst + i.sgst + i.igst = s.tax_total;

-- Non-GST bills and estimates with no tax have unambiguous zero liability.
UPDATE sales SET gst_enabled_at_sale = FALSE, is_interstate = FALSE,
  cgst = 0, sgst = 0, igst = 0
WHERE gst_enabled_at_sale IS NULL AND bill_type IN ('non_gst_bill', 'estimate') AND tax_total = 0;

ALTER TABLE sales ADD CONSTRAINT sales_tax_snapshot_consistent CHECK (
  (cgst IS NULL AND sgst IS NULL AND igst IS NULL)
  OR (cgst IS NOT NULL AND sgst IS NOT NULL AND igst IS NOT NULL
    AND cgst >= 0 AND sgst >= 0 AND igst >= 0 AND cgst + sgst + igst = tax_total)
);
