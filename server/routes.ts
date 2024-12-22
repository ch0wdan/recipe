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

export function registerRoutes(app: Express): Server {
  // Set up authentication routes
  setupAuth(app);

  // Recipe routes
  app.get("/api/recipes", async (req, res) => {
    const { cookware, difficulty } = req.query;
    try {
      const baseQuery = db.select().from(recipes);

      const conditions = [];
      if (cookware) {
        conditions.push(eq(recipes.cookwareType, cookware as string));
      }
      if (difficulty) {
        conditions.push(eq(recipes.difficulty, difficulty as string));
      }

      const result = conditions.length > 0
        ? await baseQuery.where(and(...conditions)).orderBy(desc(recipes.createdAt))
        : await baseQuery.orderBy(desc(recipes.createdAt));

      res.json(result);
    } catch (error) {
      log(`Error fetching recipes: ${error}`, "express");
      res.status(500).json({ error: "Failed to fetch recipes" });
    }
  });

  // Admin routes
  app.get("/api/admin/roles", requirePermissions({ permissions: ["manage_roles"] }), async (req, res) => {
    try {
      const allRoles = await db.select().from(roles);
      res.json(allRoles);
    } catch (error) {
      log(`Error fetching roles: ${error}`, "express");
      res.status(500).json({ error: "Failed to fetch roles" });
    }
  });

  app.post("/api/admin/roles", requirePermissions({ permissions: ["manage_roles"] }), async (req, res) => {
    try {
      const { name, permissions } = req.body;
      const [role] = await db.insert(roles).values({ name, permissions }).returning();
      res.json(role);
    } catch (error) {
      log(`Error creating role: ${error}`, "express");
      res.status(500).json({ error: "Failed to create role" });
    }
  });

  app.get("/api/admin/crawler", requirePermissions({ permissions: ["manage_crawler"] }), async (req, res) => {
    try {
      const configs = await db.select().from(crawlerConfigs);
      res.json(configs);
    } catch (error) {
      log(`Error fetching crawler configs: ${error}`, "express");
      res.status(500).json({ error: "Failed to fetch crawler configurations" });
    }
  });

  app.post("/api/admin/crawler", requirePermissions({ permissions: ["manage_crawler"] }), async (req, res) => {
    try {
      const [config] = await db.insert(crawlerConfigs).values({
        siteName: req.body.siteName,
        siteUrl: req.body.siteUrl,
        enabled: req.body.enabled,
        selectors: req.body.selectors,
      }).returning();
      res.json(config);
    } catch (error) {
      log(`Error creating crawler config: ${error}`, "express");
      res.status(500).json({ error: "Failed to create crawler configuration" });
    }
  });

  app.put("/api/admin/crawler/:id", requirePermissions({ permissions: ["manage_crawler"] }), async (req, res) => {
    try {
      const [config] = await db
        .update(crawlerConfigs)
        .set({
          siteName: req.body.siteName,
          siteUrl: req.body.siteUrl,
          enabled: req.body.enabled,
          selectors: req.body.selectors,
        })
        .where(eq(crawlerConfigs.id, parseInt(req.params.id)))
        .returning();

      if (!config) {
        return res.status(404).json({ error: "Crawler configuration not found" });
      }

      res.json(config);
    } catch (error) {
      log(`Error updating crawler config: ${error}`, "express");
      res.status(500).json({ error: "Failed to update crawler configuration" });
    }
  });

  app.post("/api/admin/crawler/run", requirePermissions({ permissions: ["manage_crawler"] }), async (req, res) => {
    try {
      await runCrawler();
      res.json({ message: "Crawler started" });
    } catch (error) {
      log(`Error running crawler: ${error}`, "express");
      res.status(500).json({ error: "Failed to start crawler" });
    }
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

    try {
      const [comment] = await db.insert(comments).values({
        content: req.body.content,
        userId: req.user!.id,
        recipeId: parseInt(req.params.id),
      }).returning();

      res.json(comment);
    } catch (error) {
      log(`Error creating comment: ${error}`, "express");
      res.status(500).json({ error: "Failed to create comment" });
    }
  });

  // Ratings
  app.post("/api/recipes/:id/ratings", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
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
        const [rating] = await db
          .update(ratings)
          .set({ rating: req.body.rating })
          .where(eq(ratings.id, existing.id))
          .returning();
        return res.json(rating);
      }

      const [rating] = await db.insert(ratings).values({
        rating: req.body.rating,
        userId: req.user!.id,
        recipeId: parseInt(req.params.id),
      }).returning();

      res.json(rating);
    } catch (error) {
      log(`Error updating rating: ${error}`, "express");
      res.status(500).json({ error: "Failed to update rating" });
    }
  });

  // Recipe creation
  app.post("/api/recipes", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const [recipe] = await db.insert(recipes).values({
        ...req.body,
        userId: req.user!.id,
      }).returning();

      res.json(recipe);
    } catch (error) {
      log(`Error creating recipe: ${error}`, "express");
      res.status(500).json({ error: "Failed to create recipe" });
    }
  });

  // Schedule crawler to run daily
  cron.schedule('0 0 * * *', () => {
    runCrawler().catch(error => {
      log(`Scheduled crawler error: ${error}`, "express");
    });
  });

  const httpServer = createServer(app);
  return httpServer;
}