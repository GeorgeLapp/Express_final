/**
 * Admin protection for /api/admin/* endpoints.
 *
 * Use header:
 *   x-api-key: <ADMIN_API_KEY>
 *
 * MVP:
 * - simple shared secret
 * - no sessions/JWT/etc
 */
import { config } from "../config.mjs";

export function requireAdmin(req, res, next) {
  const key = String(req.headers["x-api-key"] || "");
  if (!config.adminApiKey) {
    return res.status(500).json({ error: "ADMIN_API_KEY is not configured" });
  }
  if (key !== config.adminApiKey) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}
