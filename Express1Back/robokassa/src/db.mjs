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
import { open } from "sqlite";
import sqlite3 from "sqlite3";
import { config } from "./config.mjs";

async function readSchema() {
  const schemaPath = path.resolve("src/schema.sql");
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
    const row = await db.get("SELECT COUNT(*) as cnt FROM products");
    if ((row?.cnt || 0) === 0) {
      await db.run(
        `INSERT INTO products(product_id, sku, title, is_active, price_minor, currency, delivery_type, payload_ref)
         VALUES
         ('p_basic', 'BASIC', 'Basic digital item', 1, 9900, 'RUB', 'license_key', 'pool:basic'),
         ('p_pro', 'PRO', 'Pro digital item', 1, 19900, 'RUB', 'download_link', 'file:pro.zip')`
      );
    }
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
