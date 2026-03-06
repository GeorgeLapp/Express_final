import crypto from "node:crypto";
import { open } from "sqlite";
import sqlite3 from "sqlite3";
import { config } from "./config.mjs";

let appDbPromise = null;

function positiveIntOrNull(value) {
  const n = Number.parseInt(String(value), 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function resolveAttempts({ deliveryType, payloadRef }) {
  const d = String(deliveryType || "").trim().toLowerCase();
  const p = String(payloadRef || "").trim().toLowerCase();

  // credits:100
  if (d === "credits_pack") {
    const direct = p.match(/^credits:(\d+)$/i)?.[1];
    const fallback = p.match(/(\d+)/)?.[1];
    return positiveIntOrNull(direct || fallback) || 0;
  }

  // subscription:week:1000 / subscription:month / subscription:year
  if (d === "subscription" && p.startsWith("subscription:")) {
    const parts = p.split(":");
    const plan = String(parts[1] || "");
    const explicit = positiveIntOrNull(parts[2]);
    if (explicit) return explicit;

    if (plan === "week") return Math.max(0, Number(config.fulfillment.subscriptionWeekAttempts) || 0);
    if (plan === "month") return Math.max(0, Number(config.fulfillment.subscriptionMonthAttempts) || 0);
    if (plan === "year") return Math.max(0, Number(config.fulfillment.subscriptionYearAttempts) || 0);
  }

  return 0;
}

async function getAppDb() {
  if (!appDbPromise) {
    appDbPromise = open({
      filename: config.appDbPath,
      driver: sqlite3.Database
    });
  }
  return appDbPromise;
}

let schemaReady = false;

async function ensureAppSchema(db) {
  if (schemaReady) return;

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tg_id TEXT UNIQUE,
      username TEXT,
      balance REAL DEFAULT 0,
      attempts INTEGER DEFAULT 0
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS billing_fulfillments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inv_id INTEGER NOT NULL UNIQUE,
      sale_id TEXT NOT NULL,
      tg_id TEXT NOT NULL,
      attempts_added INTEGER NOT NULL DEFAULT 0,
      payload_ref TEXT,
      delivery_type TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS ix_billing_fulfillments_tg_id
    ON billing_fulfillments(tg_id);
  `);

  schemaReady = true;
}

/**
 * Fulfillment for paid sale.
 *
 * - Generates deterministic fulfillmentRef.
 * - Adds attempts to primary app DB users table.
 * - Uses billing_fulfillments(inv_id UNIQUE) for idempotency.
 */
export async function fulfillDigital({ deliveryType, payloadRef, saleId, invId, userId }) {
  const token = crypto
    .createHash("sha256")
    .update(`${deliveryType}:${payloadRef}:${saleId}:${invId}`, "utf8")
    .digest("hex")
    .slice(0, 24);

  const fulfillmentRef = `${deliveryType}:${payloadRef}:${token}`;

  const tgId = String(userId || "").trim();
  if (!tgId) {
    return fulfillmentRef;
  }

  const attemptsToAdd = resolveAttempts({ deliveryType, payloadRef });
  if (attemptsToAdd <= 0) {
    return fulfillmentRef;
  }

  const appDb = await getAppDb();
  await ensureAppSchema(appDb);

  await appDb.exec("BEGIN IMMEDIATE");
  try {
    const insertResult = await appDb.run(
      `INSERT OR IGNORE INTO billing_fulfillments(inv_id, sale_id, tg_id, attempts_added, payload_ref, delivery_type)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        Number.parseInt(String(invId), 10),
        String(saleId),
        tgId,
        attemptsToAdd,
        String(payloadRef || ""),
        String(deliveryType || "")
      ]
    );

    const created = Number(insertResult?.changes || 0) > 0;

    if (created) {
      await appDb.run(
        `INSERT OR IGNORE INTO users(tg_id, attempts) VALUES (?, 0)`,
        [tgId]
      );

      await appDb.run(
        `UPDATE users SET attempts = attempts + ? WHERE tg_id = ?`,
        [attemptsToAdd, tgId]
      );
    }

    await appDb.exec("COMMIT");
  } catch (err) {
    await appDb.exec("ROLLBACK");
    throw err;
  }

  return fulfillmentRef;
}