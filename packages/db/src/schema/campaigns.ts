import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { customers } from './customers';

export const marketingCampaigns = pgTable('marketing_campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').notNull(),
  name: text('name').notNull(),
  messageTemplate: text('message_template').notNull(),
  status: text('status').notNull().default('draft'),
  recipientCount: integer('recipient_count').default(0),
  sentAt: timestamp('sent_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

export type MarketingCampaign = typeof marketingCampaigns.$inferSelect;
export type NewMarketingCampaign = typeof marketingCampaigns.$inferInsert;

export const campaignRecipients = pgTable('campaign_recipients', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').notNull(),
  campaignId: uuid('campaign_id')
    .notNull()
    .references(() => marketingCampaigns.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id),
  phone: text('phone'),
  personalizedMessage: text('personalized_message'),
  openedWhatsappAt: timestamp('opened_whatsapp_at'),
});

export type CampaignRecipient = typeof campaignRecipients.$inferSelect;
export type NewCampaignRecipient = typeof campaignRecipients.$inferInsert;
