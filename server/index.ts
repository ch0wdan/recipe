import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { db } from "@db";
import { users } from "@db/schema";
import { setupAuth } from "./auth";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine, "express");
    }
  });

  next();
});

// Error handling middleware
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  log(`Error: ${message}`, "express");
  res.status(status).json({ message });
});

(async () => {
  try {
    // Test database connection and initialize schema
    try {
      log("Testing database connection...", "express");
      await db.select().from(users).limit(1);
      log("Database connection successful", "express");
    } catch (error) {
      if ((error as Error).message.includes('relation "users" does not exist')) {
        log("Database tables don't exist, pushing schema...", "express");
        await execute_sql_tool({
          sql_query: `
            CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
          `
        });
        log("Created uuid extension", "express");

        // Push schema using drizzle-kit
        const { execSync } = require('child_process');
        try {
          log("Pushing schema with drizzle-kit...", "express");
          execSync('npm run db:push', { stdio: 'inherit' });
          log("Schema push completed successfully", "express");
        } catch (pushError) {
          log(`Error pushing schema: ${pushError}`, "express");
          throw pushError;
        }
      } else {
        log(`Database error: ${error}`, "express");
        throw error;
      }
    }

    // Setup authentication
    log("Setting up authentication...", "express");
    setupAuth(app);
    log("Authentication setup complete", "express");

    // Register routes
    log("Registering application routes...", "express");
    const server = registerRoutes(app);
    log("Routes registered successfully", "express");

    // Setup Vite or static serving
    if (app.get("env") === "development") {
      log("Setting up Vite development server...", "express");
      await setupVite(app, server);
      log("Vite setup complete", "express");
    } else {
      log("Setting up static file serving...", "express");
      serveStatic(app);
      log("Static serving setup complete", "express");
    }

    // Start the server
    const PORT = 5000;
    server.listen(PORT, "0.0.0.0", () => {
      log(`Server running on port ${PORT}`, "express");
    });
  } catch (error) {
    log(`Failed to start server: ${error}`, "express");
    process.exit(1);
  }
})();