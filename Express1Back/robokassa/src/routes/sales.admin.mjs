import express from "express";
import { requireAdmin } from "../middleware/admin.mjs";
import { parseLimitOffset } from "../utils/http.mjs";
import { parseIsoDateOrNull, parseIntOrNull } from "../utils/parse.mjs";

/**
 * Admin sales (Billing API).
 *
 * Mounted under /api/billing, so path is:
 * - GET /api/billing/admin/sales
 */
export function makeSalesAdminRouter({ db }) {
  const r = express.Router();

  // GET /api/billing/admin/sales?limit=&offset=&userId=&productId=&status=&invId=&createdFrom=&createdTo=&paidFrom=&paidTo=
  r.get("/admin/sales", requireAdmin, async (req, res) => {
    const { limit, offset } = parseLimitOffset(req.query, { defaultLimit: 50, maxLimit: 200 });

    const userId = req.query?.userId != null ? String(req.query.userId) : null;
    const productId = req.query?.productId != null ? String(req.query.productId) : null;
    const status = req.query?.status != null ? String(req.query.status) : null;

    const invId = parseIntOrNull(req.query?.invId);

    const createdFrom = parseIsoDateOrNull(req.query?.createdFrom);
    const createdTo = parseIsoDateOrNull(req.query?.createdTo);
    const paidFrom = parseIsoDateOrNull(req.query?.paidFrom);
    const paidTo = parseIsoDateOrNull(req.query?.paidTo);

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
    if (status) {
      where.push(`status = ?`);
      args.push(status);
    }
    if (invId != null) {
      where.push(`inv_id = ?`);
      args.push(invId);
    }

    if (createdFrom) {
      where.push(`created_at >= ?`);
      args.push(createdFrom);
    }
    if (createdTo) {
      where.push(`created_at <= ?`);
      args.push(createdTo);
    }
    if (paidFrom) {
      where.push(`paid_at >= ?`);
      args.push(paidFrom);
    }
    if (paidTo) {
      where.push(`paid_at <= ?`);
      args.push(paidTo);
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
      filter: {
        userId: userId || null,
        productId: productId || null,
        status: status || null,
        invId: invId != null ? invId : null,
        createdFrom,
        createdTo,
        paidFrom,
        paidTo
      }
    });
  });

  return r;
}
