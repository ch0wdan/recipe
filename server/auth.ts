import passport from "passport";
import { IVerifyOptions, Strategy as LocalStrategy } from "passport-local";
import { type Express } from "express";
import session from "express-session";
import createMemoryStore from "memorystore";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { users, insertUserSchema, type SelectUser } from "@db/schema";
import { db } from "@db";
import { eq, sql } from "drizzle-orm";
import { log } from "./vite";
import { roles, userRoles } from "@db/schema";

const scryptAsync = promisify(scrypt);

const crypto = {
  hash: async (password: string): Promise<string> => {
    try {
      log("Generating new salt and hashing password", "auth");
      const salt = randomBytes(16).toString("hex");
      const derivedKey = await scryptAsync(password, salt, 64) as Buffer;
      const hash = `${derivedKey.toString("hex")}.${salt}`;
      log("Password hashed successfully", "auth");
      return hash;
    } catch (error) {
      log(`Error hashing password: ${error}`, "auth");
      throw new Error("Password hashing failed");
    }
  },

  verify: async (password: string, hash: string): Promise<boolean> => {
    try {
      log("Verifying password", "auth");
      const [hashedPassword, salt] = hash.split(".");

      if (!hashedPassword || !salt) {
        log("Invalid hash format", "auth");
        return false;
      }

      const derivedKey = await scryptAsync(password, salt, 64) as Buffer;
      const providedHash = derivedKey.toString("hex");
      const storedHash = Buffer.from(hashedPassword, "hex");
      const providedHashBuffer = Buffer.from(providedHash, "hex");

      const match = timingSafeEqual(providedHashBuffer, storedHash);
      log(`Password verification result: ${match}`, "auth");
      return match;
    } catch (error) {
      log(`Error verifying password: ${error}`, "auth");
      return false;
    }
  }
};

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

async function setupDefaultRoles() {
  try {
    log("Setting up default roles", "auth");
    const [existingAdminRole] = await db
      .select()
      .from(roles)
      .where(eq(roles.name, "admin"))
      .limit(1);

    if (!existingAdminRole) {
      log("Creating admin role", "auth");
      await db.insert(roles).values({
        name: "admin",
        permissions: [
          "manage_users",
          "manage_roles",
          "manage_crawler",
          "view_admin_dashboard",
          "moderate_comments",
          "moderate_recipes"
        ],
      });
    }

    const [existingModRole] = await db
      .select()
      .from(roles)
      .where(eq(roles.name, "moderator"))
      .limit(1);

    if (!existingModRole) {
      log("Creating moderator role", "auth");
      await db.insert(roles).values({
        name: "moderator",
        permissions: [
          "moderate_comments",
          "moderate_recipes",
          "view_admin_dashboard"
        ],
      });
    }
  } catch (error) {
    log(`Error setting up default roles: ${error}`, "auth");
  }
}

export function setupAuth(app: Express) {
  setupDefaultRoles().catch(console.error);
  const MemoryStore = createMemoryStore(session);
  const sessionSettings: session.SessionOptions = {
    secret: process.env.REPL_ID || "secure-session-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      httpOnly: true,
    },
    store: new MemoryStore({
      checkPeriod: 86400000, // prune expired entries every 24h
    }),
  };

  if (app.get("env") === "production") {
    app.set("trust proxy", 1);
    sessionSettings.cookie = {
      ...sessionSettings.cookie,
      secure: true,
    };
  }

  log("Setting up session middleware", "auth");
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        log(`Login attempt for user: ${username}`, "auth");

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.username, username))
          .limit(1);

        if (!user) {
          log(`User not found: ${username}`, "auth");
          return done(null, false, { message: "Invalid username or password" });
        }

        const isValid = await crypto.verify(password, user.password);

        if (!isValid) {
          log(`Invalid password for user: ${username}`, "auth");
          return done(null, false, { message: "Invalid username or password" });
        }

        log(`Successful login for user: ${username}`, "auth");
        return done(null, user);
      } catch (error) {
        log(`Login error: ${error}`, "auth");
        return done(error);
      }
    })
  );

  passport.serializeUser((user, done) => {
    log(`Serializing user: ${user.id}`, "auth");
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      log(`Deserializing user: ${id}`, "auth");
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      if (!user) {
        log(`User not found during deserialization: ${id}`, "auth");
        return done(null, false);
      }

      done(null, user);
    } catch (error) {
      log(`Deserialization error: ${error}`, "auth");
      done(error);
    }
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      log(`Registration attempt: ${req.body.username}`, "auth");

      const parseResult = insertUserSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errors = parseResult.error.errors.map((e) => e.message).join(", ");
        log(`Registration validation failed: ${errors}`, "auth");
        return res.status(400).json({ error: errors });
      }

      const { username, password } = parseResult.data;

      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);

      if (existingUser) {
        log(`Username already exists: ${username}`, "auth");
        return res.status(400).json({ error: "Username already exists" });
      }

      const hashedPassword = await crypto.hash(password);

      const [userCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(users);

      const isFirstUser = userCount?.count === 0;
      log(`Creating user ${username} with admin privileges: ${isFirstUser}`, "auth");

      const [newUser] = await db
        .insert(users)
        .values({
          username,
          password: hashedPassword,
          isAdmin: isFirstUser,
        })
        .returning();

      log(`User registered successfully: ${username}`, "auth");

      if (isFirstUser) {
        const [adminRole] = await db
          .select()
          .from(roles)
          .where(eq(roles.name, "admin"))
          .limit(1);

        if (adminRole) {
          await db.insert(userRoles).values({
            userId: newUser.id,
            roleId: adminRole.id,
          });
          log(`Assigned admin role to first user: ${username}`, "auth");
        }
      }

      req.login(newUser, (err) => {
        if (err) {
          log(`Auto-login failed after registration: ${err}`, "auth");
          return next(err);
        }
        res.json({ message: "Registration successful", user: { id: newUser.id, username: newUser.username } });
      });
    } catch (error) {
      log(`Registration error: ${error}`, "auth");
      next(error);
    }
  });

  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err: Error, user: Express.User | false, info: IVerifyOptions) => {
      if (err) {
        log(`Login error: ${err}`, "auth");
        return next(err);
      }

      if (!user) {
        log(`Login failed: ${info.message}`, "auth");
        return res.status(401).json({ error: info.message });
      }

      req.login(user, (err) => {
        if (err) {
          log(`Session creation failed: ${err}`, "auth");
          return next(err);
        }

        log(`Login successful: ${user.username}`, "auth");
        res.json({ message: "Login successful", user: { id: user.id, username: user.username } });
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res) => {
    const username = req.user?.username;
    req.logout((err) => {
      if (err) {
        log(`Logout error: ${err}`, "auth");
        return res.status(500).json({ error: "Logout failed" });
      }
      log(`Logout successful: ${username}`, "auth");
      res.json({ message: "Logged out successfully" });
    });
  });

  app.get("/api/user", async (req, res) => {
    if (!req.isAuthenticated()) {
      log("User check: Not authenticated", "auth");
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      // Get user roles and their permissions
      const userRoleRecords = await db
        .select({
          permissions: roles.permissions,
        })
        .from(userRoles)
        .innerJoin(roles, eq(roles.id, userRoles.roleId))
        .where(eq(userRoles.userId, req.user.id));

      // Flatten all permissions from all roles
      const permissions = userRoleRecords.flatMap(r => r.permissions);

      log(`User check: ${req.user.username} with permissions: ${permissions.join(", ")}`, "auth");
      res.json({
        ...req.user,
        permissions,
      });
    } catch (error) {
      log(`Error fetching user permissions: ${error}`, "auth");
      res.status(500).json({ error: "Failed to fetch user permissions" });
    }
  });
}