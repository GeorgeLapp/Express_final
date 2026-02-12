/**
 * Entry point.
 * Initializes DB, creates app, starts HTTP server.
 */
import { initDb } from "./db.mjs";
import { config } from "./config.mjs";
import { createApp } from "./app.mjs";

const db = await initDb();
const app = createApp({ db });

app.listen(config.port, () => {
  console.log(`[billing-service] listening on :${config.port}`);
});
