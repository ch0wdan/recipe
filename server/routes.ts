import type { Express } from "express";
import { createServer, type Server } from "http";
import { db } from "@db";
import { recipes, comments, ratings, crawlerConfigs } from "@db/schema";
import { eq, and, desc } from "drizzle-orm";
import { runCrawler } from "./crawler";
import { setupAuth } from "./auth";
import cron from "node-cron";

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

    const comments = await db
      .select()
      .from(comments)
      .where(eq(comments.recipeId, recipe.id))
      .orderBy(desc(comments.createdAt));

    const ratings = await db
      .select()
      .from(ratings)
      .where(eq(ratings.recipeId, recipe.id));

    res.json({ ...recipe, comments, ratings });
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

  // Admin routes
  app.get("/api/admin/crawler", async (req, res) => {
    if (!req.isAuthenticated() || !req.user?.isAdmin) {
      return res.status(403).send("Not authorized");
    }

    const configs = await db.select().from(crawlerConfigs);
    res.json(configs);
  });

  app.post("/api/admin/crawler", async (req, res) => {
    if (!req.isAuthenticated() || !req.user?.isAdmin) {
      return res.status(403).send("Not authorized");
    }

    const config = await db.insert(crawlerConfigs).values(req.body).returning();
    res.json(config[0]);
  });

  app.post("/api/admin/crawler/run", async (req, res) => {
    if (!req.isAuthenticated() || !req.user?.isAdmin) {
      return res.status(403).send("Not authorized");
    }

    runCrawler().catch(console.error);
    res.json({ message: "Crawler started" });
  });

  // Schedule crawler to run daily
  cron.schedule('0 0 * * *', () => {
    runCrawler().catch(console.error);
  });

  const httpServer = createServer(app);
  return httpServer;
}
