import express from "express";
import { withTx } from "../db.mjs";
import { verifyResultSignature } from "../robokassa.mjs";
import { fulfillDigital } from "../fulfillment.mjs";
import { mergeParams, extractShp, nowIso } from "../utils/http.mjs";

/**
 * Robokassa routes:
 * - GET /api/robokassa/success : user redirect (NOT a proof of payment)
 * - GET /api/robokassa/fail    : user redirect (NOT a proof of payment)
 * - POST /api/robokassa/result : server-to-server payment notification (proof)
 *
 * ResultURL handler guarantees:
 * - idempotency by inv_id
 * - signature verification (Password#2 + Shp_*)
 * - amount verification (OutSum must match expected)
 * - fulfillment idempotency (fulfillment_ref set once)
 * - response "OK{InvId}" for success (and for already paid)
 */
export function makeRobokassaRouter({ db }) {
  const r = express.Router();

  // SuccessURL redirect (UI signal only)
  r.get("/api/robokassa/success", async (req, res) => {
    const invId = req.query?.InvId ? String(req.query.InvId) : "";
    return res.json({
      ok: true,
      kind: "success_redirect",
      invId,
      note: "User redirect is NOT a payment proof. Poll /api/sales/by-inv/:invId or /api/checkout/:sessionId."
    });
  });

  // FailURL redirect (UI signal only)
  r.get("/api/robokassa/fail", async (req, res) => {
    const invId = req.query?.InvId ? String(req.query.InvId) : "";
    return res.json({
      ok: false,
      kind: "fail_redirect",
      invId,
      note: "User redirect is NOT a payment proof. Verify payment via ResultURL / sale status."
    });
  });

  // ResultURL (server-to-server) — idempotent
  r.post("/api/robokassa/result", async (req, res) => {
    // Robokassa can send urlencoded form body; we support both req.body and req.query
    const all = mergeParams(req);

    const OutSum = all.OutSum;
    const InvIdRaw = all.InvId;
    const SignatureValue = all.SignatureValue;

    // Minimal required parameters
    if (OutSum == null || InvIdRaw == null || SignatureValue == null) {
      return res.status(400).send("Missing required parameters");
    }

    const invId = Number.parseInt(String(InvIdRaw), 10);
    if (!Number.isFinite(invId)) return res.status(400).send("Invalid InvId");

    // Collect all Shp_* params into object (used in signature base)
    const shp = extractShp(all);

    // Use transaction lock to avoid concurrency problems (double paid / double fulfillment)
    const process = await withTx(db, async () => {
      const sale = await db.get(
        `SELECT sale_id as saleId, user_id as userId, product_id as productId,
                amount_minor as amountMinor, status, inv_id as invId, fulfillment_ref as fulfillmentRef
         FROM sales
         WHERE inv_id = ?`,
        [invId]
      );

      if (!sale) return { status: 404, body: "Unknown InvId" };

      // If already paid -> MUST return OK{InvId} (idempotency)
      if (sale.status === "paid") {
        return { status: 200, body: `OK${invId}` };
      }

      // Verify signature (Password#2) including Shp_*.
      const sigOk = verifyResultSignature({
        outSum: String(OutSum),
        invId: String(invId),
        signatureValue: SignatureValue,
        shp
      });
      if (!sigOk) return { status: 400, body: "Bad signature" };

      // Verify amount
      const expectedOutSum = (Number(sale.amountMinor) / 100).toFixed(2);
      if (String(OutSum) !== expectedOutSum) return { status: 400, body: "Amount mismatch" };

      // Optional strong binding: if Shp_userId present, match our userId
      if (shp.Shp_userId && shp.Shp_userId !== String(sale.userId)) {
        return { status: 400, body: "Shp_userId mismatch" };
      }

      // Mark as paid (safe update)
      const paidAt = nowIso();
      await db.run(
        `UPDATE sales
         SET status = 'paid', out_sum = ?, paid_at = ?
         WHERE inv_id = ? AND status != 'paid'`,
        [String(OutSum), paidAt, invId]
      );

      // Fulfillment idempotency: set fulfillment_ref once
      const sale2 = await db.get(
        `SELECT sale_id as saleId, product_id as productId, inv_id as invId, fulfillment_ref as fulfillmentRef
         FROM sales WHERE inv_id = ?`,
        [invId]
      );

      if (!sale2.fulfillmentRef) {
        const product = await db.get(
          `SELECT delivery_type as deliveryType, payload_ref as payloadRef
           FROM products
           WHERE product_id = ?`,
          [sale2.productId]
        );

        const fulfillmentRef = await fulfillDigital({
          deliveryType: product.deliveryType,
          payloadRef: product.payloadRef,
          saleId: sale2.saleId,
          invId: sale2.invId
        });

        await db.run(
          `UPDATE sales SET fulfillment_ref = ?
           WHERE inv_id = ? AND fulfillment_ref IS NULL`,
          [fulfillmentRef, invId]
        );
      }

      // Best-effort update session
      await db.run(`UPDATE sale_sessions SET status = 'converted_to_sale' WHERE inv_id = ?`, [invId]);

      // IMPORTANT: Robokassa expects "OK{InvId}"
      return { status: 200, body: `OK${invId}` };
    });

    return res.status(process.status).send(process.body);
  });

  return r;
}
