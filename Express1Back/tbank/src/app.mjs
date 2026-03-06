/**
 * Express app creation.
 * Middlewares: JSON + URL-encoded.
 * T-Bank notifications come as JSON; URL-encoded parser is kept for compatibility.
 */
import express from "express";
import { mountRoutes } from "./routes/index.mjs";

export function createApp({ db }) {
  const app = express();
  app.disable("x-powered-by");

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false }));

  mountRoutes(app, { db });

  return app;
}