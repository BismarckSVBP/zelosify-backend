

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface KeycloakJwt {
  sub: string;
  email?: string;
  preferred_username?: string;
  realm_access?: { roles?: string[] };
}

export default async function authVendor(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  let token: string | null = null;

  // ✅ First check header
  if (req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }

  // ✅ Fallback to cookie
  if (!token && (req as any).cookies?.access_token) {
    token = (req as any).cookies.access_token;
  }

  if (!token) {
    res.status(401).json({ error: "Unauthorized: No token provided" });
    return;
  }

  try {
    const decoded = jwt.decode(token) as KeycloakJwt | null;
    if (!decoded) {
      res.status(401).json({ error: "Invalid token" });
      return;
    }

    const roles = decoded.realm_access?.roles || [];
    if (!roles.includes("IT_VENDOR")) {
      res.status(403).json({ error: "Forbidden: IT_VENDOR role required" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: {
        email_provider: {
          email: decoded.email || "",
          provider: "KEYCLOAK",
        },
      },
      select: { id: true, email: true, tenantId: true, role: true },
    });

    if (!user) {
      res.status(401).json({ error: "User not found in system" });
      return;
    }

    (req as any).user = {
      id: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    };

    next();
  } catch (err) {
    console.error("Auth error:", err);
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
}
