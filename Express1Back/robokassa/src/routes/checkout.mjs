import express from "express";
import { withTx } from "../db.mjs";
import { buildPayUrl } from "../robokassa.mjs";
import { genId } from "../utils/ids.mjs";
import { nowIso, addMinutes } from "../utils/http.mjs";

/**
 * Checkout (Billing API).
 *
 * Mounted under /api/billing, so paths are:
 * - POST /api/billing/checkout/create
 * - GET  /api/billing/checkout/:sessionId
 */

async function nextInvId(db) {
  // Must be called inside BEGIN IMMEDIATE transaction (withTx)
  const row = await db.get("SELECT COALESCE(MAX(inv_id), 1000) AS mx FROM sale_sessions");
  return (row?.mx || 1000) + 1;
}

export function makeCheckoutRouter({ db }) {
  const r = express.Router();

  // POST /api/billing/checkout/create
  r.post("/checkout/create", async (req, res) => {
    const { userId, productId, idempotencyKey } = req.body || {};
    if (!userId || !productId || !idempotencyKey) {
      return res.status(400).json({ error: "userId, productId, idempotencyKey are required" });
    }

    const result = await withTx(db, async () => {
      // Idempotency: same (userId, idempotencyKey) returns the same session
      const existing = await db.get(
        `SELECT session_id as sessionId, inv_id as invId, robokassa_pay_url as payUrl, expires_at as expiresAt, status
         FROM sale_sessions
         WHERE user_id = ? AND idempotency_key = ?`,
        [userId, idempotencyKey]
      );
      if (existing) return existing;

      // Product must exist and be active
      const p = await db.get(
        `SELECT product_id as productId, price_minor as priceMinor, currency, title
         FROM products
         WHERE product_id = ? AND is_active = 1`,
        [productId]
      );
      if (!p) return { _error: { status: 404, message: "Product not found or inactive" } };

      const invId = await nextInvId(db);
      const sessionId = genId("sess");
      const amountMinor = Number(p.priceMinor);

      // Robokassa uses decimal string, MVP: 2 decimals
      const outSum = (amountMinor / 100).toFixed(2);

      // Shp_* are included into signatures and help bind payment to user/session
      const shp = { Shp_userId: String(userId), Shp_sessionId: String(sessionId) };

      const payUrl = buildPayUrl({ invId, outSum, description: p.title, shp });

      const createdAt = nowIso();
      const expiresAt = addMinutes(new Date(), 30);

      await db.run(
        `INSERT INTO sale_sessions(session_id, user_id, product_id, amount_minor, currency, idempotency_key, status,
                                  inv_id, robokassa_pay_url, created_at, expires_at, converted_sale_id)
         VALUES (?, ?, ?, ?, ?, ?, 'payment_link_issued', ?, ?, ?, ?, NULL)`,
        [sessionId, userId, productId, amountMinor, String(p.currency), idempotencyKey, invId, payUrl, createdAt, expiresAt]
      );

      // Create pending sale right away so ResultURL can find it by InvId
      const saleId = genId("sale");
      await db.run(
        `INSERT INTO sales(sale_id, user_id, product_id, amount_minor, currency, status, inv_id, out_sum, paid_at, fulfillment_ref, created_at)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, NULL, NULL, NULL, ?)`,
        [saleId, userId, productId, amountMinor, String(p.currency), invId, createdAt]
      );

      await db.run(`UPDATE sale_sessions SET converted_sale_id = ? WHERE session_id = ?`, [saleId, sessionId]);

      return { sessionId, invId, payUrl, expiresAt, status: "payment_link_issued" };
    });

    if (result?._error) return res.status(result._error.status).json({ error: result._error.message });
    return res.json(result);
  });

  // GET /api/billing/checkout/:sessionId
  r.get("/checkout/:sessionId", async (req, res) => {
    const { sessionId } = req.params;
    const s = await db.get(
      `SELECT session_id as sessionId, user_id as userId, product_id as productId,
              amount_minor as amountMinor, currency, status, inv_id as invId,
              robokassa_pay_url as payUrl, created_at as createdAt, expires_at as expiresAt,
              converted_sale_id as saleId
       FROM sale_sessions
       WHERE session_id = ?`,
      [sessionId]
    );
    if (!s) return res.status(404).json({ error: "Session not found" });
    return res.json(s);
  });

  return r;
}
