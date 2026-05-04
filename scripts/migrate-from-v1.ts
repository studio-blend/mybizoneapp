/**
 * v1 (MERN, MongoDB) → v2 (Next.js, Postgres) data migration.
 *
 * STATUS: M2 stub — happy-path scaffolding compiles and lays out the
 * structure. Field-by-field mapping TODOs in mapXxx() are filled in M3
 * during the father's-shop cutover prep, after a Mongo dump is on hand
 * for diffing.
 *
 * Idempotency:
 *   _v1_migration_lookup (Postgres table) maps Mongo ObjectIds → v2 UUIDs.
 *   Re-running picks up where the previous run left off.
 *
 * Run:
 *   MONGO_URI=mongodb://... DATABASE_URL=postgres://... pnpm tsx scripts/migrate-from-v1.ts
 *
 * Order matters: businesses → users → stores → categories/brands → products →
 * sales → sale_items. Every step writes into the lookup table so later steps
 * can resolve foreign keys.
 */
import postgres from 'postgres';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`${name} not set`);
    process.exit(1);
  }
  return v;
}

const MONGO_URI = requireEnv('MONGO_URI');
const PG_URI = requireEnv('DATABASE_URL');

interface Lookup {
  get(collection: string, mongoId: string): Promise<string | null>;
  put(collection: string, mongoId: string, uuid: string): Promise<void>;
}

async function ensureLookupTable(sql: postgres.Sql): Promise<void> {
  await sql`CREATE TABLE IF NOT EXISTS _v1_migration_lookup (
    collection TEXT NOT NULL,
    mongo_id TEXT NOT NULL,
    uuid UUID NOT NULL,
    migrated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (collection, mongo_id)
  )`;
}

function makeLookup(sql: postgres.Sql): Lookup {
  return {
    async get(collection, mongoId) {
      const rows = await sql<{ uuid: string }[]>`
        SELECT uuid FROM _v1_migration_lookup
        WHERE collection = ${collection} AND mongo_id = ${mongoId}`;
      return rows[0]?.uuid ?? null;
    },
    async put(collection, mongoId, uuid) {
      await sql`
        INSERT INTO _v1_migration_lookup (collection, mongo_id, uuid)
        VALUES (${collection}, ${mongoId}, ${uuid})
        ON CONFLICT (collection, mongo_id) DO NOTHING`;
    },
  };
}

interface MongoLike {
  collection<T = Record<string, unknown>>(
    name: string,
  ): {
    find(): { toArray(): Promise<T[]> };
  };
}

async function connectMongo(
  uri: string,
): Promise<{ client: { close(): Promise<void> }; db: MongoLike }> {
  // Lazy import keeps the dependency optional — devs running other scripts in
  // this folder don't need mongodb on disk.
  let mod: {
    MongoClient: new (
      u: string,
    ) => { connect(): Promise<unknown>; db(): MongoLike; close(): Promise<void> };
  };
  try {
    mod = await import('mongodb');
  } catch {
    throw new Error("install mongodb: 'pnpm add -w mongodb'");
  }
  const client = new mod.MongoClient(uri);
  await client.connect();
  return { client, db: client.db() };
}

// ── Per-collection mappers ────────────────────────────────────────────────
// Each mapper returns the row to INSERT into Postgres or null to skip.
// Field names follow v1 (MongoDB camelCase) on input and v2 Drizzle column
// names on output.

interface V1Business {
  _id: { toString(): string };
  name: string;
  // v1 didn't carry GST flags — defaults applied below.
}
function mapBusiness(doc: V1Business) {
  return {
    name: doc.name,
    vertical: 'retail',
    gst_enabled: false,
    currency: 'INR',
    timezone: 'Asia/Kolkata',
  };
}

// TODO M3: fill in real mappers + per-collection migrators below. Keeping
// signatures here as compile-time anchors so M3 work is purely fill-in-the-
// blank.
//   - mapStore(doc): { name, address, phone }
//   - mapCategory(doc, lookup): { name, parent_id, store_id }
//   - mapBrand(doc): { name, description, image_key (skip — re-upload separately) }
//   - mapProduct(doc, lookup): full product row, NUMERIC stringified
//   - mapSale(doc, lookup): + corresponding sale_items[]

async function migrateBusinesses(
  sql: postgres.Sql,
  mongo: MongoLike,
  lookup: Lookup,
): Promise<void> {
  const docs = await mongo.collection<V1Business>('businesses').find().toArray();
  console.warn(`businesses: ${docs.length} rows`);
  for (const doc of docs) {
    const mongoId = doc._id.toString();
    if (await lookup.get('businesses', mongoId)) continue;
    const row = mapBusiness(doc);
    const [inserted] = await sql<{ id: string }[]>`
      INSERT INTO businesses (name, vertical, gst_enabled, currency, timezone)
      VALUES (${row.name}, ${row.vertical}, ${row.gst_enabled}, ${row.currency}, ${row.timezone})
      RETURNING id`;
    if (!inserted) throw new Error(`business insert failed: ${doc.name}`);
    await lookup.put('businesses', mongoId, inserted.id);
  }
}

async function run(): Promise<void> {
  const sql = postgres(PG_URI, { max: 4, prepare: false });
  const { client, db } = await connectMongo(MONGO_URI);
  try {
    await ensureLookupTable(sql);
    const lookup = makeLookup(sql);

    await migrateBusinesses(sql, db, lookup);

    // TODO M3: add migrateUsers, migrateStores, migrateCategories,
    // migrateBrands, migrateProducts, migrateSales here in dependency
    // order. Each step uses `lookup` to resolve foreign keys from the
    // previous step.
    console.warn('migration: business pass complete (M2 stub).');
    console.warn('TODO M3: stores → categories/brands → products → sales.');
  } finally {
    await client.close();
    await sql.end();
  }
}

run().catch((err) => {
  console.error('migration failed:', err);
  process.exit(1);
});
