import { Request, Response, NextFunction } from "express";
import { db } from "@db";
import { userRoles, roles } from "@db/schema";
import { eq, and } from "drizzle-orm";
import { log } from "../vite";

export interface RBACOptions {
  permissions?: string[];
}

export async function hasPermission(userId: number, requiredPermissions: string[]): Promise<boolean> {
  try {
    // Get all roles for the user
    const userRoleRecords = await db
      .select({
        permissions: roles.permissions,
      })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(eq(userRoles.userId, userId));

    // Flatten all permissions from all roles
    const userPermissions = userRoleRecords.flatMap(r => r.permissions);

    // Check if user has all required permissions
    return requiredPermissions.every(p => userPermissions.includes(p));
  } catch (error) {
    log(`Error checking permissions: ${error}`, "rbac");
    return false;
  }
}

export function requirePermissions(options: RBACOptions = {}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const { permissions = [] } = options;

    // If no specific permissions are required, just check if user is authenticated
    if (permissions.length === 0) {
      return next();
    }

    try {
      // Admin users bypass permission checks
      if (req.user?.isAdmin) {
        return next();
      }

      const hasRequiredPermissions = await hasPermission(req.user.id, permissions);

      if (!hasRequiredPermissions) {
        log(`Permission denied for user ${req.user.id}: missing ${permissions.join(", ")}`, "rbac");
        return res.status(403).json({ error: "Insufficient permissions" });
      }

      next();
    } catch (error) {
      log(`RBAC middleware error: ${error}`, "rbac");
      res.status(500).json({ error: "Internal server error" });
    }
  };
}
