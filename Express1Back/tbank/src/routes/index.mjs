/**
 * Route mounting split:
 * - Billing API is mounted under /api/billing/*
 * - T-Bank endpoints are mounted at /api/tbank/* (no /api/billing prefix)
 */
import express from "express";

import { makeHealthRouter } from "./health.mjs";
import { makeProductsPublicRouter } from "./products.public.mjs";
import { makeProductsAdminRouter } from "./products.admin.mjs";
import { makeCheckoutRouter } from "./checkout.mjs";
import { makeSalesPublicRouter } from "./sales.public.mjs";
import { makeSalesAdminRouter } from "./sales.admin.mjs";
import { makeTbankRouter } from "./tbank.mjs";

export function mountRoutes(app, { db }) {
  // Global health endpoint (in root namespace)
  app.use(makeHealthRouter());

  // Build a dedicated router for billing API and mount it under /api/billing.
  const billing = express.Router();

  // NOTE: all routers below MUST use relative paths (no "/api" prefix inside),
  // because billing router is mounted with "/api/billing" prefix.
  billing.use(makeProductsPublicRouter({ db }));
  billing.use(makeProductsAdminRouter({ db }));
  billing.use(makeCheckoutRouter({ db }));
  billing.use(makeSalesPublicRouter({ db }));
  billing.use(makeSalesAdminRouter({ db }));

  app.use("/api/billing", billing);

  // T-Bank callback/redirect endpoints are outside /api/billing.
  app.use(makeTbankRouter({ db }));
}