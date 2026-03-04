/**
 * SQLite DB initialization + transaction helper.
 *
 * We use BEGIN IMMEDIATE:
 * - it takes a RESERVED lock early
 * - prevents two parallel ResultURL handlers from racing and double-fulfilling
 *
 * In MVP this is the simplest robust choice.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { open } from "sqlite";
import sqlite3 from "sqlite3";
import { config } from "./config.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEMO_PRODUCTS = [
  {
    productId: "p_express_100",
    sku: "EXPRESS_100",
    title: "100 экспрессов",
    isActive: 1,
    priceMinor: 50000,
    currency: "RUB",
    deliveryType: "credits_pack",
    payloadRef: "credits:100"
  },
  {
    productId: "p_week_1000",
    sku: "WEEK_1000",
    title: "Неделя (без ограничений или до 1000 экспрессов)",
    isActive: 1,
    priceMinor: 100000,
    currency: "RUB",
    deliveryType: "subscription",
    payloadRef: "subscription:week:1000"
  },
  {
    productId: "p_month",
    sku: "MONTH",
    title: "Месяц",
    isActive: 1,
    priceMinor: 500000,
    currency: "RUB",
    deliveryType: "subscription",
    payloadRef: "subscription:month"
  },
  {
    productId: "p_year",
    sku: "YEAR",
    title: "Год",
    isActive: 1,
    priceMinor: 2500000,
    currency: "RUB",
    deliveryType: "subscription",
    payloadRef: "subscription:year"
  }
];

async function readSchema() {
  const schemaPath = path.resolve(__dirname, "schema.sql");
  return fs.readFile(schemaPath, "utf8");
}

export async function initDb() {
  const db = await open({
    filename: config.dbPath,
    driver: sqlite3.Database
  });

  const schema = await readSchema();
  await db.exec(schema);

  // Optional demo seeding for easier local testing
  if (config.seedDemoProducts) {
    for (const p of DEMO_PRODUCTS) {
      await db.run(
        `INSERT INTO products(product_id, sku, title, is_active, price_minor, currency, delivery_type, payload_ref)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(product_id) DO UPDATE SET
           sku = excluded.sku,
           title = excluded.title,
           is_active = excluded.is_active,
           price_minor = excluded.price_minor,
           currency = excluded.currency,
           delivery_type = excluded.delivery_type,
           payload_ref = excluded.payload_ref`,
        [
          p.productId,
          p.sku,
          p.title,
          p.isActive,
          p.priceMinor,
          p.currency,
          p.deliveryType,
          p.payloadRef
        ]
      );
    }

    // Deactivate old demo products from previous builds to avoid confusion in wallet.
    await db.run(`UPDATE products SET is_active = 0 WHERE product_id IN ('p_basic', 'p_pro')`);
  }

  return db;
}

export async function withTx(db, fn) {
  await db.exec("BEGIN IMMEDIATE");
  try {
    const res = await fn();
    await db.exec("COMMIT");
    return res;
  } catch (e) {
    await db.exec("ROLLBACK");
    throw e;
  }
}
