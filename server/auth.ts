import passport from "passport";
import { IVerifyOptions, Strategy as LocalStrategy } from "passport-local";
import { type Express } from "express";
import session from "express-session";
import createMemoryStore from "memorystore";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { users, insertUserSchema, type SelectUser } from "@db/schema";
import { db } from "@db";
import { eq } from "drizzle-orm";
import { log } from "./vite";

const scryptAsync = promisify(scrypt);
const crypto = {
  hash: async (password: string) => {
    try {
      log(`Hashing password...`, "auth");
      const salt = randomBytes(16).toString("hex");
      const buf = (await scryptAsync(password, salt, 64)) as Buffer;
      const hashedPassword = `${buf.toString("hex")}.${salt}`;
      log(`Password hashed successfully`, "auth");
      return hashedPassword;
    } catch (error) {
      log(`Error hashing password: ${error}`, "auth");
      throw error;
    }
  },
  compare: async (suppliedPassword: string, storedPassword: string) => {
    try {
      log(`Comparing passwords...`, "auth");
      const [hashedPassword, salt] = storedPassword.split(".");
      log(`Stored hash: ${hashedPassword.slice(0, 10)}...`, "auth");
      const hashedPasswordBuf = Buffer.from(hashedPassword, "hex");
      const suppliedPasswordBuf = (await scryptAsync(
        suppliedPassword,
        salt,
        64
      )) as Buffer;
      const match = timingSafeEqual(hashedPasswordBuf, suppliedPasswordBuf);
      log(`Password comparison result: ${match}`, "auth");
      return match;
    } catch (error) {
      log(`Error comparing passwords: ${error}`, "auth");
      throw error;
    }
  },
};

// extend express user object with our schema
declare global {
  namespace Express {
    interface User extends SelectUser { }
  }
}

export function setupAuth(app: Express) {
  const MemoryStore = createMemoryStore(session);
  const sessionSettings: session.SessionOptions = {
    secret: process.env.REPL_ID || "porygon-supremacy",
    resave: false,
    saveUninitialized: false,
    cookie: {},
    store: new MemoryStore({
      checkPeriod: 86400000, // prune expired entries every 24h
    }),
  };

  if (app.get("env") === "production") {
    app.set("trust proxy", 1);
    sessionSettings.cookie = {
      secure: true,
    };
  }

  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        log(`Attempting login for user: ${username}`, "auth");
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.username, username))
          .limit(1);

        if (!user) {
          log(`Login failed: User ${username} not found`, "auth");
          return done(null, false, { message: "Incorrect username." });
        }

        const isMatch = await crypto.compare(password, user.password);
        if (!isMatch) {
          log(`Login failed: Incorrect password for user ${username}`, "auth");
          return done(null, false, { message: "Incorrect password." });
        }

        log(`Login successful for user ${username} (id: ${user.id}, admin: ${user.isAdmin})`, "auth");
        return done(null, user);
      } catch (err) {
        log(`Login error: ${err}`, "auth");
        return done(err);
      }
    })
  );

  passport.serializeUser((user, done) => {
    log(`Serializing user ${user.id}`, "auth");
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      log(`Deserializing user ${id}`, "auth");
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);
      done(null, user);
    } catch (err) {
      log(`Deserialize error: ${err}`, "auth");
      done(err);
    }
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      log(`Registration attempt for username: ${req.body.username}`, "auth");
      const result = insertUserSchema.safeParse(req.body);
      if (!result.success) {
        const errorMsg = result.error.issues.map(i => i.message).join(", ");
        log(`Registration validation failed: ${errorMsg}`, "auth");
        return res.status(400).send("Invalid input: " + errorMsg);
      }

      const { username, password } = result.data;

      // Check if user already exists
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);

      if (existingUser) {
        log(`Registration failed: Username ${username} already exists`, "auth");
        return res.status(400).send("Username already exists");
      }

      // Hash the password
      const hashedPassword = await crypto.hash(password);

      // Create the new user
      const [newUser] = await db
        .insert(users)
        .values({
          username,
          password: hashedPassword,
        })
        .returning();

      log(`Registration successful for user ${username} (id: ${newUser.id})`, "auth");

      // Log the user in after registration
      req.login(newUser, (err) => {
        if (err) {
          log(`Auto-login after registration failed: ${err}`, "auth");
          return next(err);
        }
        return res.json({
          message: "Registration successful",
          user: { id: newUser.id, username: newUser.username },
        });
      });
    } catch (error) {
      log(`Registration error: ${error}`, "auth");
      next(error);
    }
  });

  app.post("/api/login", (req, res, next) => {
    log(`Login attempt with username: ${req.body.username}`, "auth");
    const result = insertUserSchema.safeParse(req.body);
    if (!result.success) {
      const errorMsg = result.error.issues.map(i => i.message).join(", ");
      log(`Login validation failed: ${errorMsg}`, "auth");
      return res.status(400).send("Invalid input: " + errorMsg);
    }

    const cb = (err: any, user: Express.User, info: IVerifyOptions) => {
      if (err) {
        log(`Login error: ${err}`, "auth");
        return next(err);
      }

      if (!user) {
        log(`Login failed: ${info.message}`, "auth");
        return res.status(400).send(info.message ?? "Login failed");
      }

      req.logIn(user, (err) => {
        if (err) {
          log(`Login session creation failed: ${err}`, "auth");
          return next(err);
        }

        log(`Login successful for user ${user.username} (id: ${user.id})`, "auth");
        return res.json({
          message: "Login successful",
          user: { id: user.id, username: user.username },
        });
      });
    };
    passport.authenticate("local", cb)(req, res, next);
  });

  app.post("/api/logout", (req, res) => {
    const userId = req.user?.id;
    req.logout((err) => {
      if (err) {
        log(`Logout failed for user ${userId}: ${err}`, "auth");
        return res.status(500).send("Logout failed");
      }

      log(`Logout successful for user ${userId}`, "auth");
      res.json({ message: "Logout successful" });
    });
  });

  app.get("/api/user", (req, res) => {
    if (req.isAuthenticated()) {
      log(`Current user check: ${req.user.id}`, "auth");
      return res.json(req.user);
    }

    log("Current user check: Not authenticated", "auth");
    res.status(401).send("Not logged in");
  });
}