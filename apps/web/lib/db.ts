import { type Database, createDb } from '@mybizone/db';
import { env } from './env';

declare global {
  // biome-ignore lint/style/noVar: required to share singleton across HMR reloads
  var __mybizone_db: Database | undefined;
}

export const db: Database =
  globalThis.__mybizone_db ?? (globalThis.__mybizone_db = createDb(env.DATABASE_URL));
