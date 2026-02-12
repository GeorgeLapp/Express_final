/**
 * Feature-flag middleware for PUBLIC sales endpoints.
 *
 * PUBLIC_SALES_MODE:
 * - public: open to everyone
 * - admin_key: require x-api-key === ADMIN_API_KEY
 * - disabled: return 404 (hide endpoint)
 */
import { config } from "../config.mjs";

export function requirePublicSalesAccess(req, res, next) {
  const mode = String(config.publicSalesMode || "public").toLowerCase();

  if (mode === "public") return next();

  if (mode === "disabled") {
    return res.status(404).json({ error: "Not found" });
  }

  if (mode === "admin_key") {
    if (!config.adminApiKey) {
      return res.status(500).json({ error: "ADMIN_API_KEY is not configured" });
    }
    const key = String(req.headers["x-api-key"] || "");
    if (key !== config.adminApiKey) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    return next();
  }

  return res.status(500).json({ error: `Invalid PUBLIC_SALES_MODE=${mode}` });
}
