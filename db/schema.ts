import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";

export const roles = pgTable("roles", {
  id: serial("id").primaryKey(),
  name: text("name").unique().notNull(),
  permissions: text("permissions").array().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const userRoles = pgTable("user_roles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  roleId: integer("role_id").references(() => roles.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").unique().notNull(),
  password: text("password").notNull(),
  isAdmin: boolean("is_admin").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const recipes = pgTable("recipes", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  ingredients: text("ingredients").array().notNull(),
  instructions: text("instructions").array().notNull(),
  cookwareType: text("cookware_type").notNull(),
  difficulty: text("difficulty").notNull(),
  prepTime: integer("prep_time").notNull(),
  cookTime: integer("cook_time").notNull(),
  servings: integer("servings").notNull(),
  sourceUrl: text("source_url"),
  sourceName: text("source_name"),
  imageUrl: text("image_url"),
  userId: integer("user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const comments = pgTable("comments", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  recipeId: integer("recipe_id").references(() => recipes.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const ratings = pgTable("ratings", {
  id: serial("id").primaryKey(),
  rating: integer("rating").notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  recipeId: integer("recipe_id").references(() => recipes.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const crawlerConfigs = pgTable("crawler_configs", {
  id: serial("id").primaryKey(),
  siteName: text("site_name").unique().notNull(),
  siteUrl: text("site_url").notNull(),
  selectors: jsonb("selectors").notNull(),
  enabled: boolean("enabled").default(true),
  lastCrawl: timestamp("last_crawl"),
});

// Relations
export const userRelations = relations(users, ({ many }) => ({
  roles: many(userRoles),
}));

export const roleRelations = relations(roles, ({ many }) => ({
  users: many(userRoles),
}));

export const userRoleRelations = relations(userRoles, ({ one }) => ({
  user: one(users, {
    fields: [userRoles.userId],
    references: [users.id],
  }),
  role: one(roles, {
    fields: [userRoles.roleId],
    references: [roles.id],
  }),
}));

export const recipeRelations = relations(recipes, ({ one, many }) => ({
  user: one(users, {
    fields: [recipes.userId],
    references: [users.id],
  }),
  comments: many(comments),
  ratings: many(ratings),
}));

export const commentRelations = relations(comments, ({ one }) => ({
  user: one(users, {
    fields: [comments.userId],
    references: [users.id],
  }),
  recipe: one(recipes, {
    fields: [comments.recipeId],
    references: [recipes.id],
  }),
}));

export const ratingRelations = relations(ratings, ({ one }) => ({
  user: one(users, {
    fields: [ratings.userId],
    references: [users.id],
  }),
  recipe: one(recipes, {
    fields: [ratings.recipeId],
    references: [recipes.id],
  }),
}));

// Types
export type Recipe = typeof recipes.$inferSelect;
export type InsertRecipe = typeof recipes.$inferInsert;
export type Comment = typeof comments.$inferSelect;
export type Rating = typeof ratings.$inferSelect;
export type CrawlerConfig = typeof crawlerConfigs.$inferSelect;
export type Role = typeof roles.$inferSelect;
export type UserRole = typeof userRoles.$inferSelect;

// Schemas
export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);
export const insertRoleSchema = createInsertSchema(roles);
export const selectRoleSchema = createSelectSchema(roles);
export type InsertUser = typeof users.$inferInsert;
export type SelectUser = typeof users.$inferSelect;