import express from "express";
import { withTx } from "../db.mjs";
import { fulfillDigital } from "../fulfillment.mjs";
import { nowIso } from "../utils/http.mjs";
import { config } from "../config.mjs";
import { verifyTbankToken } from "../tbank.mjs";

function mapSaleStatus(tbankStatus, success) {
  const status = String(tbankStatus || "").toUpperCase();

  if (status === "CONFIRMED") return "paid";
  if (status === "REFUNDED") return "refunded";
  if (status === "REVERSED") return "refunded";

  if (
    status === "REJECTED" ||
    status === "DEADLINE_EXPIRED" ||
    status === "CANCELED" ||
    status === "AUTH_FAIL"
  ) {
    return "canceled";
  }

  if (!success) {
    return "canceled";
  }

  return "pending";
}

function toBool(value) {
  if (typeof value === "boolean") return value;
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function appendInvId(baseUrl, invId) {
  if (!baseUrl) return "";
  try {
    const u = new URL(baseUrl);
    if (invId) {
      u.searchParams.set("invId", String(invId));
    }
    return u.toString();
  } catch (_) {
    return baseUrl;
  }
}

export function makeTbankRouter({ db }) {
  const r = express.Router();

  // Success redirect endpoint for T-Bank terminal settings.
  r.get("/api/tbank/success", async (req, res) => {
    const invId = req.query?.OrderId ? String(req.query.OrderId) : "";
    const fallback = appendInvId(config.tbank.successFallbackUrl, invId);

    if (fallback) {
      return res.redirect(302, fallback);
    }

    return res.json({ ok: true, kind: "success_redirect", invId });
  });

  // Fail redirect endpoint for T-Bank terminal settings.
  r.get("/api/tbank/fail", async (req, res) => {
    const invId = req.query?.OrderId ? String(req.query.OrderId) : "";
    const fallback = appendInvId(config.tbank.failFallbackUrl, invId);

    if (fallback) {
      return res.redirect(302, fallback);
    }

    return res.json({ ok: false, kind: "fail_redirect", invId });
  });

  // NotificationURL from T-Bank. Must respond with plain `OK` on success.
  r.post("/api/tbank/notification", async (req, res) => {
    const body = req.body || {};
    const orderIdRaw = body.OrderId;
    const token = body.Token;

    if (orderIdRaw == null || token == null) {
      return res.status(400).send("Missing OrderId or Token");
    }

    if (!verifyTbankToken(body)) {
      return res.status(400).send("Bad token");
    }

    if (body.TerminalKey && String(body.TerminalKey) !== String(config.tbank.terminalKey)) {
      return res.status(400).send("Terminal mismatch");
    }

    const invId = Number.parseInt(String(orderIdRaw), 10);
    if (!Number.isFinite(invId)) {
      return res.status(400).send("Invalid OrderId");
    }

    const statusRaw = String(body.Status || "");
    const success = toBool(body.Success);
    const amountMinor = Number(body.Amount);

    const result = await withTx(db, async () => {
      const sale = await db.get(
        `SELECT sale_id as saleId, user_id as userId, product_id as productId,
                amount_minor as amountMinor, status, inv_id as invId, fulfillment_ref as fulfillmentRef
         FROM sales
         WHERE inv_id = ?`,
        [invId]
      );

      if (!sale) {
        return { status: 404, body: "Unknown OrderId" };
      }

      if (Number.isFinite(amountMinor) && Number(sale.amountMinor) !== amountMinor) {
        return { status: 400, body: "Amount mismatch" };
      }

      const mappedStatus = mapSaleStatus(statusRaw, success);

      // Idempotent path for already paid sale.
      if (sale.status === "paid" && mappedStatus === "paid") {
        return { status: 200, body: "OK" };
      }

      if (mappedStatus === "paid") {
        const paidAt = nowIso();
        const outSum = Number.isFinite(amountMinor) ? (amountMinor / 100).toFixed(2) : null;

        await db.run(
          `UPDATE sales
           SET status = 'paid', out_sum = COALESCE(?, out_sum), paid_at = ?
           WHERE inv_id = ?`,
          [outSum, paidAt, invId]
        );

        const sale2 = await db.get(
          `SELECT sale_id as saleId, user_id as userId, product_id as productId,
                  inv_id as invId, fulfillment_ref as fulfillmentRef
           FROM sales
           WHERE inv_id = ?`,
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
            invId: sale2.invId,
            userId: sale2.userId
          });

          await db.run(
            `UPDATE sales SET fulfillment_ref = ?
             WHERE inv_id = ? AND fulfillment_ref IS NULL`,
            [fulfillmentRef, invId]
          );
        }

        await db.run(`UPDATE sale_sessions SET status = 'converted_to_sale' WHERE inv_id = ?`, [invId]);

        return { status: 200, body: "OK" };
      }

      await db.run(`UPDATE sales SET status = ? WHERE inv_id = ?`, [mappedStatus, invId]);

      const sessionStatus = statusRaw ? `tbank_${statusRaw.toLowerCase()}` : "tbank_unknown";
      await db.run(`UPDATE sale_sessions SET status = ? WHERE inv_id = ?`, [sessionStatus, invId]);

      return { status: 200, body: "OK" };
    });

    return res.status(result.status).send(result.body);
  });

  return r;
}
