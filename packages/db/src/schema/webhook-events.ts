import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const webhookEvents = pgTable('webhook_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  provider: text('provider').notNull(),
  eventId: text('event_id').notNull(),
  eventType: text('event_type').notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
});

export type WebhookEvent = typeof webhookEvents.$inferSelect;
