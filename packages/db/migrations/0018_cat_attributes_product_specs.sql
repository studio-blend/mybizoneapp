-- M13: Category attributes (dimensions) + product specs

-- User-defined dimension attributes per category (e.g. [{name:"Capacity",unit:"Ton"}])
ALTER TABLE categories ADD COLUMN IF NOT EXISTS attributes jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Product-level values for those attributes (e.g. {"Capacity":"1.5"})
ALTER TABLE products ADD COLUMN IF NOT EXISTS specs jsonb NOT NULL DEFAULT '{}'::jsonb;
