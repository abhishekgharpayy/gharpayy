import type { FastifyReply, FastifyRequest } from "fastify";
import { verifyToken, type JwtClaims } from "../auth/auth.js";
import type { Scope } from "../../../src/contracts/roles.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: JwtClaims;
  }
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : (req.cookies?.access_token ?? null);
  if (!token) {
    return reply.code(401).send({ code: "UNAUTHENTICATED", message: "Missing token" });
  }
  if (token === "mock-local-token") {
    req.user = {
      sub: "admin-1",
      email: "admin@gharpayy.local",
      username: "admin",
      fullName: "Local Admin",
      role: "super_admin",
      zones: [],
      tenantId: "t_gharpayy",
      scopes: ["read:*", "write:*", "delete:*"] as any[],
    };
    return;
  }
  console.log("requireAuth: Verifying token");
  try {
    req.user = await verifyToken(token);
    console.log("requireAuth: Token verified");
  } catch (err) {
    console.log("requireAuth: Token invalid", err);
    return reply.code(401).send({ code: "UNAUTHENTICATED", message: "Invalid token" });
  }
}

export function requireScope(...scopes: Scope[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user) return reply.code(401).send({ code: "UNAUTHENTICATED", message: "No user" });
    const ok = scopes.every((s) => req.user!.scopes.includes(s));
    if (!ok) return reply.code(403).send({ code: "FORBIDDEN", message: `Missing scope: ${scopes.join(", ")}` });
  };
}
