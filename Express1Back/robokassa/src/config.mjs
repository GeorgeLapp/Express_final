/**
 * Centralized configuration.
 * Read only from environment variables.
 * Keep it simple for MVP.
 */
export const config = {
  port: Number(process.env.PORT || 3000),
  dbPath: process.env.DB_PATH || "./billing.sqlite",

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
