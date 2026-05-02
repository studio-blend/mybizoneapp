import { type Database, createDb } from '@mybizone/db';
import { env } from './env';

declare global {
  var __mybizone_db: Database | undefined;
}

function getDb(): Database {
  if (!globalThis.__mybizone_db) {
    globalThis.__mybizone_db = createDb(env.DATABASE_URL);
  }
  return globalThis.__mybizone_db;
}

export const db: Database = getDb();
