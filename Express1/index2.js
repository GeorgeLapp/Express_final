require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');

const PORT = Number(process.env.PORT || 3000);
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const WEBAPP_URL =
  process.env.VK_TUNNEL ||
  process.env.BackAddress ||
  process.env.BACK_ADDRESS ||
  '';
const toPositiveInt = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
};

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

const publicDir = path.join(__dirname, 'public');

app.use(
  express.static(publicDir, {
    index: 'index.html',
    etag: true,
    lastModified: true,
    maxAge: '1d',
    setHeaders: (res, filePath) => {
      const p = filePath.toLowerCase();
      if (p.endsWith('.html') || p.endsWith('.js') || p.endsWith('.css')) {
        res.setHeader(
          'Cache-Control',
          'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0'
        );
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
    }
  })
);

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

if (BOT_TOKEN) {
  const pollingIntervalMs = toPositiveInt(process.env.TG_POLL_INTERVAL_MS, 1000);
  const pollingTimeoutSec = toPositiveInt(process.env.TG_POLL_TIMEOUT_SEC, 25);
  const restartBaseDelayMs = toPositiveInt(process.env.TG_POLL_RESTART_DELAY_MS, 3000);
  const restartMaxDelayMs = toPositiveInt(process.env.TG_POLL_RESTART_MAX_DELAY_MS, 60000);
  const transientErrorCodes = new Set([
    'EAI_AGAIN',
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'ECONNREFUSED'
  ]);
  const transientErrorRegex = /\b(EAI_AGAIN|ECONNRESET|ETIMEDOUT|ENOTFOUND|ECONNREFUSED)\b/i;

  const bot = new TelegramBot(BOT_TOKEN, {
    polling: {
      interval: pollingIntervalMs,
      params: {
        timeout: pollingTimeoutSec
      },
      autoStart: true
    }
  });

  let restartDelayMs = restartBaseDelayMs;
  let restartTimer = null;
  let restartInFlight = false;

  const parsePollingError = (err) => {
    const message = String(err?.message || err || '');
    const messageCode = message.match(transientErrorRegex)?.[1]?.toUpperCase();
    const code = String(
      messageCode ||
      err?.cause?.code ||
      err?.code ||
      err?.response?.statusCode ||
      'UNKNOWN'
    ).toUpperCase();
    return { code, message };
  };

  const isTransientPollingError = (code, message) => {
    if (transientErrorCodes.has(code)) return true;
    return code === 'EFATAL' && transientErrorRegex.test(message);
  };

  const runPollingRestart = async () => {
    if (restartInFlight) return false;
    restartInFlight = true;
    try {
      await bot.stopPolling({ cancel: true }).catch(() => {});
      await bot.startPolling();
      restartDelayMs = restartBaseDelayMs;
      console.warn('[telegram] polling restarted');
      return true;
    } catch (restartErr) {
      restartDelayMs = Math.min(restartDelayMs * 2, restartMaxDelayMs);
      console.error(
        `[telegram] polling restart failed; retry in ${restartDelayMs}ms`,
        restartErr?.message || restartErr
      );
      return false;
    } finally {
      restartInFlight = false;
    }
  };

  const schedulePollingRestart = (reason) => {
    if (restartTimer || restartInFlight) return;
    const delay = restartDelayMs;
    console.warn(`[telegram] polling restart scheduled in ${delay}ms (${reason})`);

    restartTimer = setTimeout(async () => {
      restartTimer = null;
      const restarted = await runPollingRestart();
      if (!restarted) {
        schedulePollingRestart('retry after failed restart');
      }
    }, delay);
  };

  bot.on('polling_error', (err) => {
    const { code, message } = parsePollingError(err);
    if (isTransientPollingError(code, message)) {
      console.warn(`[telegram][polling_warning] transient code=${code}`, message);
      schedulePollingRestart(`${code}`);
      return;
    }
    console.error(`[telegram][polling_error] code=${code}`, message);
  });

  bot.on('message', (msg) => {
    if (!msg.web_app_data) return;
    const data = msg.web_app_data.data;
    console.log('WebApp data:', data);
    bot.sendMessage(msg.chat.id, `Received: ${data}`);
  });

  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;

    if (!WEBAPP_URL) {
      bot.sendMessage(chatId, 'WEBAPP URL is not configured on server');
      return;
    }

    bot.sendMessage(chatId, 'Open mini app:', {
      reply_markup: {
        inline_keyboard: [[{ text: 'Open Web App', web_app: { url: WEBAPP_URL } }]],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    });
  });
} else {
  console.warn('[telegram] BOT_TOKEN is empty, bot polling is disabled');
}

app.listen(PORT, () => {
  console.log(`Frontend server running on http://localhost:${PORT}`);
});
