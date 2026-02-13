/**
 * Centralized configuration.
 * Read from process.env and local .env file.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serviceRoot = path.resolve(__dirname, "..");

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (!match) return null;

  const key = match[1];
  let value = match[2] ?? "";

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return { key, value };
}

function loadEnvFromFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const pair = parseEnvLine(line);
    if (!pair) continue;
    if (process.env[pair.key] === undefined) {
      process.env[pair.key] = pair.value;
    }
  }
}

function bootstrapEnv() {
  const explicitEnvFile = process.env.BILLING_ENV_FILE;
  const localEnvFile = path.resolve(process.cwd(), ".env");
  const serviceEnvFile = path.resolve(serviceRoot, ".env");

  if (explicitEnvFile) {
    loadEnvFromFile(path.resolve(explicitEnvFile));
  }
  loadEnvFromFile(localEnvFile);
  loadEnvFromFile(serviceEnvFile);
}

function resolveDbPath(rawDbPath) {
  if (!rawDbPath) {
    return path.resolve(serviceRoot, "billing.sqlite");
  }
  if (path.isAbsolute(rawDbPath)) {
    return rawDbPath;
  }
  return path.resolve(serviceRoot, rawDbPath);
}

bootstrapEnv();

export const config = {
  port: Number(process.env.PORT || 3010),
  dbPath: resolveDbPath(process.env.DB_PATH || "./billing.sqlite"),

  robokassa: {
    merchantLogin: process.env.ROBOKASSA_MERCHANT_LOGIN || "",
    password1: process.env.ROBOKASSA_PASSWORD1 || "",
    password2: process.env.ROBOKASSA_PASSWORD2 || "",
    hashAlgorithm: (process.env.ROBOKASSA_HASH_ALGORITHM || "MD5").toUpperCase(),
    isTest: (process.env.ROBOKASSA_IS_TEST || "false").toLowerCase() === "true"
  },

  // Admin API protection for /api/admin/*
  adminApiKey: process.env.ADMIN_API_KEY || "",

  // Feature-flag for public sales endpoints
  publicSalesMode: (process.env.PUBLIC_SALES_MODE || "public").toLowerCase(),

  // MVP convenience seeding
  seedDemoProducts: (process.env.SEED_DEMO_PRODUCTS || "false").toLowerCase() === "true"
};
