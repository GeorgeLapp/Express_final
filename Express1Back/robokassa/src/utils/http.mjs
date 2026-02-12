/**
 * HTTP-layer utilities:
 * - mergeParams: to read both query and body (Robokassa can send urlencoded)
 * - extractShp: read all Shp_* into object
 * - pagination parsing
 */
export function mergeParams(req) {
  return { ...(req.query || {}), ...(req.body || {}) };
}

export function extractShp(obj) {
  const shp = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (k.startsWith("Shp_")) shp[k] = String(v);
  }
  return shp;
}

export function nowIso() {
  return new Date().toISOString();
}

export function addMinutes(dt, minutes) {
  return new Date(dt.getTime() + minutes * 60_000).toISOString();
}

/**
 * Parse pagination:
 * - limit default / max
 * - offset default
 */
export function parseLimitOffset(query, { defaultLimit = 20, maxLimit = 100 } = {}) {
  const limitRaw = query?.limit;
  const offsetRaw = query?.offset;

  const limit = Math.max(
    1,
    Math.min(maxLimit, Number.parseInt(String(limitRaw ?? String(defaultLimit)), 10) || defaultLimit)
  );
  const offset = Math.max(0, Number.parseInt(String(offsetRaw ?? "0"), 10) || 0);

  return { limit, offset };
}
