/**
 * Route mounting split:
 * - Billing API is mounted under /api/billing/*
 * - Robokassa endpoints are mounted at /api/robokassa/* (NO /api/billing prefix)
 *
 * Why:
 * - Front (localhost:3000) must not receive billing API calls.
 * - You want a clean prefix /api/billing for all billing endpoints.
 * - Robokassa cabinet URLs must be stable (ResultURL/SuccessURL/FailURL) and remain /api/robokassa/*.
 */
import express from "express";

import { makeHealthRouter } from "./health.mjs";
import { makeProductsPublicRouter } from "./products.public.mjs";
import { makeProductsAdminRouter } from "./products.admin.mjs";
import { makeCheckoutRouter } from "./checkout.mjs";
import { makeSalesPublicRouter } from "./sales.public.mjs";
import { makeSalesAdminRouter } from "./sales.admin.mjs";
import { makeRobokassaRouter } from "./robokassa.mjs";

export function mountRoutes(app, { db }) {
  // Global health endpoint (in root namespace)
  app.use(makeHealthRouter());

  // Build a dedicated router for billing API and mount it under /api/billing
  const billing = express.Router();

  // NOTE: all routers below MUST use relative paths (no "/api" prefix inside),
  // because billing router is mounted with "/api/billing" prefix.
  billing.use(makeProductsPublicRouter({ db }));
  billing.use(makeProductsAdminRouter({ db }));
  billing.use(makeCheckoutRouter({ db }));
  billing.use(makeSalesPublicRouter({ db }));
  billing.use(makeSalesAdminRouter({ db }));

  app.use("/api/billing", billing);

  // Robokassa endpoints must NOT be under /api/billing.
  // They stay at /api/robokassa/* to match Robokassa cabinet URLs and nginx routing.
  app.use(makeRobokassaRouter({ db }));
}
