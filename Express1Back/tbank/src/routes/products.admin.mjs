import express from "express";
import { requireAdmin } from "../middleware/admin.mjs";
import { genId } from "../utils/ids.mjs";
import { parseLimitOffset } from "../utils/http.mjs";
import { validateProductPayload } from "../utils/products.mjs";

/**
 * Admin products (Billing API).
 *
 * Mounted under /api/billing, so paths are:
 * - GET    /api/billing/admin/products
 * - POST   /api/billing/admin/products
 * - PUT    /api/billing/admin/products/:productId
 * - DELETE /api/billing/admin/products/:productId
 */
export function makeProductsAdminRouter({ db }) {
  const r = express.Router();

  // GET /api/billing/admin/products?limit=&offset=&isActive=&sku=&q=
  r.get("/admin/products", requireAdmin, async (req, res) => {
    const { limit, offset } = parseLimitOffset(req.query, { defaultLimit: 50, maxLimit: 200 });

    const isActiveQ = req.query?.isActive;
    const skuQ = req.query?.sku != null ? String(req.query.sku) : null;
    const q = req.query?.q != null ? String(req.query.q).trim() : null;

    const where = [];
    const args = [];

    if (isActiveQ != null) {
      const v = String(isActiveQ).toLowerCase();
      if (v === "true" || v === "1") where.push(`is_active = 1`);
      else if (v === "false" || v === "0") where.push(`is_active = 0`);
    }

    if (skuQ) {
      where.push(`sku = ?`);
      args.push(skuQ);
    }

    if (q) {
      where.push(`(sku LIKE ? OR title LIKE ? OR product_id LIKE ?)`);
      const like = `%${q}%`;
      args.push(like, like, like);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const totalRow = await db.get(`SELECT COUNT(*) as cnt FROM products ${whereSql}`, args);
    const total = Number(totalRow?.cnt || 0);

    const items = await db.all(
      `SELECT product_id as productId, sku, title, is_active as isActive, price_minor as priceMinor,
              currency, delivery_type as deliveryType, payload_ref as payloadRef
       FROM products
       ${whereSql}
       ORDER BY sku
       LIMIT ? OFFSET ?`,
      [...args, limit, offset]
    );

    return res.json({
      items,
      page: { limit, offset, total },
      filter: { isActive: isActiveQ != null ? String(isActiveQ) : null, sku: skuQ, q: q || null }
    });
  });

  // POST /api/billing/admin/products
  r.post("/admin/products", requireAdmin, async (req, res) => {
    const errors = validateProductPayload(req.body);
    if (errors.length) return res.status(400).json({ error: "Validation failed", details: errors });

    const productId = String(req.body.productId || genId("prod"));
    const sku = String(req.body.sku);
    const title = String(req.body.title);
    const isActive = req.body.isActive == null ? true : Boolean(req.body.isActive);
    const priceMinor = Number(req.body.priceMinor);
    const currency = String(req.body.currency);
    const deliveryType = String(req.body.deliveryType);
    const payloadRef = String(req.body.payloadRef);

    try {
      await db.run(
        `INSERT INTO products(product_id, sku, title, is_active, price_minor, currency, delivery_type, payload_ref)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [productId, sku, title, isActive ? 1 : 0, priceMinor, currency, deliveryType, payloadRef]
      );
      return res.status(201).json({ productId });
    } catch (e) {
      const msg = String(e?.message || e);
      if (msg.includes("UNIQUE") || msg.includes("unique")) {
        return res.status(409).json({ error: "Conflict (productId or sku already exists)" });
      }
      throw e;
    }
  });

  // PUT /api/billing/admin/products/:productId
  r.put("/admin/products/:productId", requireAdmin, async (req, res) => {
    const { productId } = req.params;
    const errors = validateProductPayload(req.body);
    if (errors.length) return res.status(400).json({ error: "Validation failed", details: errors });

    const sku = String(req.body.sku);
    const title = String(req.body.title);
    const isActive = req.body.isActive == null ? true : Boolean(req.body.isActive);
    const priceMinor = Number(req.body.priceMinor);
    const currency = String(req.body.currency);
    const deliveryType = String(req.body.deliveryType);
    const payloadRef = String(req.body.payloadRef);

    const existing = await db.get(`SELECT product_id FROM products WHERE product_id = ?`, [productId]);
    if (!existing) return res.status(404).json({ error: "Product not found" });

    try {
      await db.run(
        `UPDATE products
         SET sku = ?, title = ?, is_active = ?, price_minor = ?, currency = ?, delivery_type = ?, payload_ref = ?
         WHERE product_id = ?`,
        [sku, title, isActive ? 1 : 0, priceMinor, currency, deliveryType, payloadRef, productId]
      );
      return res.json({ ok: true });
    } catch (e) {
      const msg = String(e?.message || e);
      if (msg.includes("UNIQUE") || msg.includes("unique")) {
        return res.status(409).json({ error: "Conflict (sku already exists)" });
      }
      throw e;
    }
  });

  // DELETE /api/billing/admin/products/:productId  (soft delete)
  r.delete("/admin/products/:productId", requireAdmin, async (req, res) => {
    const { productId } = req.params;
    const existing = await db.get(`SELECT product_id FROM products WHERE product_id = ?`, [productId]);
    if (!existing) return res.status(404).json({ error: "Product not found" });

    await db.run(`UPDATE products SET is_active = 0 WHERE product_id = ?`, [productId]);
    return res.json({ ok: true });
  });

  return r;
}
