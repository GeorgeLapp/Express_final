import express from "express";
import { nowIso } from "../utils/http.mjs";

/**
 * Health check.
 */
export function makeHealthRouter() {
  const r = express.Router();

  r.get("/health", async (_req, res) => {
    res.json({ ok: true, ts: nowIso() });
  });

  return r;
}
