import express from "express";
import { parseLimitOffset } from "../utils/http.mjs";

/**
 * Public products (Billing API).
 *
 * Mounted under /api/billing, so paths are:
 * - GET /api/billing/products
 * - GET /api/billing/products/:productId
 */
export function makeProductsPublicRouter({ db }) {
  const r = express.Router();

  // GET /api/billing/products?limit=&offset=
  r.get("/products", async (req, res) => {
    const { limit, offset } = parseLimitOffset(req.query, { defaultLimit: 20, maxLimit: 100 });

    const totalRow = await db.get(`SELECT COUNT(*) as cnt FROM products WHERE is_active = 1`);
    const total = Number(totalRow?.cnt || 0);

    const items = await db.all(
      `SELECT product_id as productId, sku, title, is_active as isActive, price_minor as priceMinor,
              currency, delivery_type as deliveryType, payload_ref as payloadRef
       FROM products
       WHERE is_active = 1
       ORDER BY sku
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    res.json({ items, page: { limit, offset, total } });
  });

  // GET /api/billing/products/:productId
  r.get("/products/:productId", async (req, res) => {
    const { productId } = req.params;
    const p = await db.get(
      `SELECT product_id as productId, sku, title, is_active as isActive, price_minor as priceMinor,
              currency, delivery_type as deliveryType, payload_ref as payloadRef
       FROM products
       WHERE product_id = ?`,
      [productId]
    );
    if (!p) return res.status(404).json({ error: "Product not found" });
    return res.json(p);
  });

  return r;
}
