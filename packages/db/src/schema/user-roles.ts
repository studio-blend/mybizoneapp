import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { businesses } from './businesses';
import { departments } from './departments';
import { stores } from './stores';

export const userRoles = pgTable('user_roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  // user.id is text in Better Auth
  userId: text('user_id').notNull(),
  role: text('role').notNull(),
  storeId: uuid('store_id').references(() => stores.id, { onDelete: 'cascade' }),
  departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'cascade' }),
  grantedBy: text('granted_by'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const ownershipTransfers = pgTable('ownership_transfers', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  fromUserId: text('from_user_id').notNull(),
  toUserId: text('to_user_id').notNull(),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  acceptedAt: timestamp('accepted_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

export type UserRole = typeof userRoles.$inferSelect;
export type NewUserRole = typeof userRoles.$inferInsert;
export type OwnershipTransfer = typeof ownershipTransfers.$inferSelect;
export type NewOwnershipTransfer = typeof ownershipTransfers.$inferInsert;
