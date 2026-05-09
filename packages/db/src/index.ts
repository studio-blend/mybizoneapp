import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type Database = ReturnType<typeof createDb>;

export function createDb(connectionString: string) {
  const queryClient = postgres(connectionString, {
    max: 10,
    prepare: false, // RLS via SET LOCAL requires non-prepared statements per session
  });
  return drizzle(queryClient, { schema, casing: 'snake_case' });
}

export function createPgClient(connectionString: string) {
  return postgres(connectionString, { max: 1, prepare: false });
}

export * from './schema';
export * from './usage';
export { schema };
