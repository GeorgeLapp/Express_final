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
  const bot = new TelegramBot(BOT_TOKEN, {
    polling: {
      interval: 1000,
      autoStart: true
    }
  });

  bot.on('polling_error', (err) => {
    const code = err?.code || err?.response?.statusCode || 'UNKNOWN';
    console.error(`[telegram][polling_error] code=${code}`, err?.message || err);
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
