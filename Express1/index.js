// index.js
require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');

const { BOT_TOKEN, PORT = 3000, VK_TUNNEL } = process.env;

// Init Telegram bot (long-polling)
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Init Express app
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

// Serve static files with caching
app.use(
  express.static(path.join(__dirname, 'public'), {
    index: 'index.html',
    etag: true,
    lastModified: true,
    maxAge: '7d',
    setHeaders: (res, filePath) => {
      // Do not cache HTML; cache assets
      if (filePath.endsWith('.html') || path.endsWith('.js')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    }
  })
);


// Telegram WebApp data handler
bot.on('message', (msg) => {
  if (msg.web_app_data) {
    const data = msg.web_app_data.data;
    console.log('WebApp data:', data);
    bot.sendMessage(msg.chat.id, `Received: ${data}`);
  }
});

// /start command with WebApp button
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const webAppUrl = VK_TUNNEL;

  bot.sendMessage(chatId, 'Открой мини‑приложение:', {
    reply_markup: {
      inline_keyboard: [[{ text: 'Open Web App', web_app: { url: webAppUrl } }]],
      resize_keyboard: true,
      one_time_keyboard: true
    }
  });
});

// Healthcheck
app.get('/', (req, res) => {
  res.send('OK');
});

app.listen(PORT, () => {
  console.log(`Frontend server running on http://localhost:${PORT}`);
});
