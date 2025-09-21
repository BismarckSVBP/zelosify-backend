
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import prisma from "../../config/prisma/prisma.js";

const KEYCLOAK_URL = process.env.KEYCLOAK_URL || "http://localhost:8080/auth";
const REALM_NAME = process.env.KEYCLOAK_REALM || "Zelosify";

const keycloakJwksClient = jwksClient({
  jwksUri: `${KEYCLOAK_URL}/realms/${REALM_NAME}/protocol/openid-connect/certs`,
  cache: true,
  cacheMaxAge: 86400000, // 24 hours
  rateLimit: true,
  jwksRequestsPerMinute: 10,
});

// Extend Express Request to include user
declare module "express-serve-static-core" {
  interface Request {
    user?: any;
  }
}

// Keycloak JWT payload type
interface KeycloakJwtPayload extends jwt.JwtPayload {
  sub: string;
  email?: string;
  preferred_username?: string;
  realm_access?: { roles?: string[] };
}

// User select for Prisma queries
const userSelect = {
  id: true,
  username: true,
  email: true,
  role: true,
  department: true,
  provider: true,
  tenant: {
    select: {
      tenantId: true,
      companyName: true,
    },
  },
} as const;

// Cache for user data
const userCache = new Map();
const USER_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Middleware: Authenticate User
export const authenticateUser = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token =
      req.headers.authorization?.split(" ")[1] || req.cookies.access_token;

    if (!token) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || !decoded.payload) {
      res.status(401).json({ message: "Invalid token format" });
      return;
    }

    try {
      const key = await keycloakJwksClient.getSigningKey(decoded.header.kid);
      const signingKey = key.getPublicKey();

      const verified = jwt.verify(token, signingKey, {
        algorithms: ["RS256"],
        issuer: `${KEYCLOAK_URL}/realms/${REALM_NAME}`,
      }) as KeycloakJwtPayload;

      if (!verified || typeof verified !== "object") {
        throw new Error("Token verification failed");
      }

      // Check cache
      const cachedUser = userCache.get(verified.sub);
      if (cachedUser && cachedUser.timestamp > Date.now() - USER_CACHE_TTL) {
        req.user = cachedUser.data;
        return next();
      }

      // Lookup by externalId
      let user = await prisma.user.findUnique({
        where: { externalId: verified.sub },
        select: userSelect,
      });

      // Fallback: lookup by email+provider
      if (!user && verified.email) {
        user = await prisma.user.findUnique({
          where: {
            email_provider: {
              email: verified.email,
              provider: "KEYCLOAK",
            },
          },
          select: userSelect,
        });
      }

      if (!user) {
        res.status(401).json({ message: "User not found" });
        return;
      }

      // Flatten tenantId for easy access in routes
      const flattenedUser = {
        ...user,
        tenantId: user.tenant?.tenantId ?? null,
        realm_access: verified.realm_access,
      };

      // Update cache
      userCache.set(verified.sub, {
        data: flattenedUser,
        timestamp: Date.now(),
      });

      req.user = flattenedUser;
      next();
    } catch (error) {
      console.error("Token verification failed:", error);
      res.status(401).json({ message: "Invalid or expired token" });
      return;
    }
  } catch (error) {
    console.error("Authentication error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Middleware: Require IT_VENDOR role
export function requireVendorRole(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized: No user in request" });
    return;
  }

  const roles = (req.user.realm_access?.roles || []) as string[];
  if (!roles.includes("IT_VENDOR")) {
    res.status(403).json({ error: "Forbidden: IT_VENDOR role required" });
    return;
  }

  next();
}
