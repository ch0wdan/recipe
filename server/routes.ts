import type { Express } from "express";
import { createServer, type Server } from "http";
import { db } from "@db";
import { recipes, comments, ratings, crawlerConfigs, roles, userRoles } from "@db/schema";
import { eq, and, desc } from "drizzle-orm";
import { runCrawler, analyzeWebsite } from "./crawler";
import { setupAuth } from "./auth";
import { requirePermissions } from "./middleware/rbac";
import cron from "node-cron";
import { log } from "./vite";

const ADMIN_PERMISSIONS = [
  "manage_users",
  "manage_roles",
  "manage_crawler",
  "view_admin_dashboard"
];

const MODERATOR_PERMISSIONS = [
  "moderate_comments",
  "moderate_recipes",
  "view_admin_dashboard"
];

export function registerRoutes(app: Express): Server {
  setupAuth(app);

  // Recipe routes
  app.get("/api/recipes", async (req, res) => {
    const { cookware, difficulty } = req.query;
    let query = db.select().from(recipes);

    if (cookware) {
      query = query.where(eq(recipes.cookwareType, cookware as string));
    }
    if (difficulty) {
      query = query.where(eq(recipes.difficulty, difficulty as string));
    }

    const result = await query.orderBy(desc(recipes.createdAt));
    res.json(result);
  });

  app.get("/api/recipes/:id", async (req, res) => {
    const [recipe] = await db
      .select()
      .from(recipes)
      .where(eq(recipes.id, parseInt(req.params.id)));

    if (!recipe) {
      return res.status(404).send("Recipe not found");
    }

    const recipeComments = await db
      .select()
      .from(comments)
      .where(eq(comments.recipeId, recipe.id))
      .orderBy(desc(comments.createdAt));

    const recipeRatings = await db
      .select()
      .from(ratings)
      .where(eq(ratings.recipeId, recipe.id));

    res.json({ ...recipe, comments: recipeComments, ratings: recipeRatings });
  });

  // Admin routes
  app.get("/api/admin/roles", requirePermissions({ permissions: ["manage_roles"] }), async (req, res) => {
    const allRoles = await db.select().from(roles);
    res.json(allRoles);
  });

  app.post("/api/admin/roles", requirePermissions({ permissions: ["manage_roles"] }), async (req, res) => {
    const { name, permissions } = req.body;
    const [role] = await db.insert(roles).values({ name, permissions }).returning();
    res.json(role);
  });

  app.post("/api/admin/user-roles", requirePermissions({ permissions: ["manage_roles"] }), async (req, res) => {
    const { userId, roleId } = req.body;
    const [userRole] = await db.insert(userRoles).values({ userId, roleId }).returning();
    res.json(userRole);
  });

  app.delete("/api/admin/user-roles", requirePermissions({ permissions: ["manage_roles"] }), async (req, res) => {
    const { userId, roleId } = req.body;
    await db
      .delete(userRoles)
      .where(
        and(
          eq(userRoles.userId, userId),
          eq(userRoles.roleId, roleId)
        )
      );
    res.json({ success: true });
  });

  app.get("/api/admin/crawler", requirePermissions({ permissions: ["manage_crawler"] }), async (req, res) => {
    const configs = await db.select().from(crawlerConfigs);
    res.json(configs);
  });

  app.post("/api/admin/crawler", requirePermissions({ permissions: ["manage_crawler"] }), async (req, res) => {
    const [config] = await db.insert(crawlerConfigs).values(req.body).returning();
    res.json(config);
  });

  app.post("/api/admin/crawler/run", requirePermissions({ permissions: ["manage_crawler"] }), async (req, res) => {
    runCrawler().catch(console.error);
    res.json({ message: "Crawler started" });
  });

  app.post("/api/admin/crawler/analyze", requirePermissions({ permissions: ["manage_crawler"] }), async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ error: "URL is required" });
      }

      const analysis = await analyzeWebsite(url);
      res.json(analysis);
    } catch (error) {
      log(`Error analyzing website: ${error}`, "express");
      res.status(500).json({ error: "Failed to analyze website" });
    }
  });


  // Comments
  app.post("/api/recipes/:id/comments", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const comment = await db.insert(comments).values({
      content: req.body.content,
      userId: req.user!.id,
      recipeId: parseInt(req.params.id),
    }).returning();

    res.json(comment[0]);
  });

  // Ratings
  app.post("/api/recipes/:id/ratings", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const [existing] = await db
      .select()
      .from(ratings)
      .where(
        and(
          eq(ratings.userId, req.user!.id),
          eq(ratings.recipeId, parseInt(req.params.id))
        )
      );

    if (existing) {
      const rating = await db
        .update(ratings)
        .set({ rating: req.body.rating })
        .where(eq(ratings.id, existing.id))
        .returning();
      return res.json(rating[0]);
    }

    const rating = await db.insert(ratings).values({
      rating: req.body.rating,
      userId: req.user!.id,
      recipeId: parseInt(req.params.id),
    }).returning();

    res.json(rating[0]);
  });

  app.post("/api/recipes", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const recipe = await db.insert(recipes).values({
      ...req.body,
      userId: req.user!.id,
    }).returning();

    res.json(recipe[0]);
  });


  // Schedule crawler to run daily
  cron.schedule('0 0 * * *', () => {
    runCrawler().catch(console.error);
  });

  const httpServer = createServer(app);
  return httpServer;
}