import express from "express";
import { parseLimitOffset } from "../utils/http.mjs";
import { requirePublicSalesAccess } from "../middleware/public-sales.mjs";

/**
 * Public sales (Billing API).
 *
 * Mounted under /api/billing, so paths are:
 * - GET /api/billing/sales
 * - GET /api/billing/sales/by-inv/:invId
 * - GET /api/billing/sales/:saleId
 *
 * Access controlled via PUBLIC_SALES_MODE:
 * - public     : open
 * - admin_key  : require x-api-key: ADMIN_API_KEY
 * - disabled   : return 404
 */
export function makeSalesPublicRouter({ db }) {
  const r = express.Router();

  // Feature-flag applies to all endpoints of this router
  r.use(requirePublicSalesAccess);

  // GET /api/billing/sales?limit=&offset=&userId=&productId=
  r.get("/sales", async (req, res) => {
    const { limit, offset } = parseLimitOffset(req.query, { defaultLimit: 20, maxLimit: 100 });

    const userId = req.query?.userId != null ? String(req.query.userId) : null;
    const productId = req.query?.productId != null ? String(req.query.productId) : null;

    const where = [];
    const args = [];

    if (userId) {
      where.push(`user_id = ?`);
      args.push(userId);
    }
    if (productId) {
      where.push(`product_id = ?`);
      args.push(productId);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const totalRow = await db.get(`SELECT COUNT(*) as cnt FROM sales ${whereSql}`, args);
    const total = Number(totalRow?.cnt || 0);

    const items = await db.all(
      `SELECT sale_id as saleId, user_id as userId, product_id as productId,
              amount_minor as amountMinor, currency, status, inv_id as invId,
              out_sum as outSum, paid_at as paidAt, fulfillment_ref as fulfillmentRef,
              created_at as createdAt
       FROM sales
       ${whereSql}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...args, limit, offset]
    );

    return res.json({
      items,
      page: { limit, offset, total },
      filter: { userId: userId || null, productId: productId || null }
    });
  });

  // GET /api/billing/sales/by-inv/:invId
  r.get("/sales/by-inv/:invId", async (req, res) => {
    const invId = Number.parseInt(String(req.params.invId), 10);
    if (!Number.isFinite(invId)) return res.status(400).json({ error: "Invalid InvId" });

    const s = await db.get(
      `SELECT sale_id as saleId, user_id as userId, product_id as productId,
              amount_minor as amountMinor, currency, status, inv_id as invId,
              out_sum as outSum, paid_at as paidAt, fulfillment_ref as fulfillmentRef,
              created_at as createdAt
       FROM sales
       WHERE inv_id = ?`,
      [invId]
    );
    if (!s) return res.status(404).json({ error: "Sale not found" });
    return res.json(s);
  });

  // GET /api/billing/sales/:saleId
  r.get("/sales/:saleId", async (req, res) => {
    const { saleId } = req.params;
    const s = await db.get(
      `SELECT sale_id as saleId, user_id as userId, product_id as productId,
              amount_minor as amountMinor, currency, status, inv_id as invId,
              out_sum as outSum, paid_at as paidAt, fulfillment_ref as fulfillmentRef,
              created_at as createdAt
       FROM sales
       WHERE sale_id = ?`,
      [saleId]
    );
    if (!s) return res.status(404).json({ error: "Sale not found" });
    return res.json(s);
  });

  return r;
}
