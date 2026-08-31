import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const deskState = sqliteTable('desk_state', {
  id: integer('id').primaryKey(),
  revision: integer('revision').notNull().default(0),
  payload: text('payload').notNull(),
  updatedAt: text('updated_at').notNull(),
});
