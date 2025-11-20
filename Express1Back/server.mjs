import express from 'express';
import bodyParser from 'body-parser';
import { initDB } from './db.mjs';
import { EventModel } from './EventModel.mjs';
import { UserModel } from './UserModel.mjs';
import swaggerUi from 'swagger-ui-express';
import swaggerJSDoc from 'swagger-jsdoc';
import cors from 'cors';

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'Express1Back API',
    version: '1.0.0',
    description: 'Документация API для Express1Back',
  },
  servers: [
    {
      url: 'http://localhost:3001',
    },
  ],
};

const options = {
  swaggerDefinition,
  apis: ['./server.mjs'],
};

const swaggerSpec = swaggerJSDoc(options);

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

let db;
initDB().then(database => { db = database; });

/**
 * @swagger
 * /events:
 *   get:
 *     summary: Получить события с фильтрацией
 *     parameters:
 *       - in: query
 *         name: sport
 *         schema:
 *           type: string
 *         description: Виды спорта через запятую (например, футбол,теннис)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Статус события
 *       - in: query
 *         name: tg_id
 *         schema:
 *           type: string
 *         description: Telegram ID пользователя
 *       - in: query
 *         name: count
 *         schema:
 *           type: integer
 *         description: Количество событий
 *       - in: query
 *         name: min_coef
 *         schema:
 *           type: number
 *         description: Минимальный коэффициент
 *       - in: query
 *         name: max_coef
 *         schema:
 *           type: number
 *         description: Максимальный коэффициент
 *     responses:
 *       200:
 *         description: Список событий
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 */
// Получить события с фильтрацией и по пользователю
app.get('/events', async (req, res) => {
  const { sport, status, tg_id, count, min_coef, max_coef } = req.query;

  const requestedCount = parseInt(count, 10) || 1; // Сколько событий вернуть
  const ATTEMPT_COST = 1; // Сколько попыток стоит один запрос

  let user_id = null;
  let user_attempts = null;
  let userEvents = [];

  if (tg_id) {
    const user = await db.get('SELECT * FROM users WHERE tg_id = ?', tg_id);
    if (user) {
      user_id = user.id;
      user_attempts = user.attempts;

      if (user_attempts < ATTEMPT_COST) {
        return res
          .status(403)
          .json({ error: `У вас недостаточно попыток! Осталось: ${user_attempts}` });
      }

      const shownRows = await db.all(
        'SELECT event_id FROM user_event_shows WHERE user_id = ?',
        user_id
      );
      userEvents = shownRows.map(r => r.event_id);
    }
  }

  // ... фильтрация по спорту / статусу / коэффициентам / исключение показанных ...

  // LIMIT requestedCount — как и раньше
  query += ' ORDER BY RANDOM() LIMIT ' + requestedCount;
  const events = await db.all(query, ...params);

  // ... выбор shownOutcome, shownValue ...

  if (tg_id && user_id && filtered.length > 0) {
    for (const e of filtered) {
      await db.run(
        'INSERT INTO user_event_shows (user_id, event_id, shown_outcome) VALUES (?, ?, ?)',
        user_id,
        e.id,
        e.shownOutcome
      );
    }

    // ВАЖНО: считаем именно «1 запрос = 1 попытка»
    await db.run(
      'UPDATE users SET attempts = attempts - ? WHERE id = ?',
      ATTEMPT_COST,
      user_id
    );
  }

  return res.json(filtered);
});
app.get('/ensureUser/:tg_id', async (req, res) => {
  const { tg_id } = req.params;
  let user = await db.get('SELECT * FROM users WHERE tg_id = ?', tg_id);
  if (!user) {
    await db.run(
      'INSERT INTO users (tg_id, attempts) VALUES (?, ?)',
      tg_id,
      10 // стартовое количество попыток
    );
    user = await db.get('SELECT * FROM users WHERE tg_id = ?', tg_id);
  }

  // фронту в первую очередь важны attempts
  res.json({
    id: user.id,
    tg_id: user.tg_id,
    attempts: user.attempts
  });
});


/**
 * @swagger
 * /user/{tg_id}:
 *   get:
 *     summary: Получить или создать пользователя
 *     parameters:
 *       - in: path
 *         name: tg_id
 *         required: true
 *         schema:
 *           type: string
 *         description: Telegram ID пользователя
 *     responses:
 *       200:
 *         description: Данные пользователя
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
// Получить или создать пользователя
app.get('/user/:tg_id', async (req, res) => {
  const { tg_id } = req.params;
  let user = await db.get('SELECT * FROM users WHERE tg_id = ?', tg_id);
  if (!user) {
    await db.run('INSERT INTO users (tg_id, attempts) VALUES (?, ?)', tg_id, 10);
    user = await db.get('SELECT * FROM users WHERE tg_id = ?', tg_id);
  }
  res.json(user);
});

/**
 * @swagger
 * /userHistory/{tg_id}:
 *   get:
 *     summary: Получить историю показанных пользователю событий
 *     parameters:
 *       - in: path
 *         name: tg_id
 *         required: true
 *         schema:
 *           type: string
 *         description: Telegram ID пользователя
 *     responses:
 *       200:
 *         description: История событий пользователя
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 */
app.get('/userHistory/:tg_id', async (req, res) => {
  const { tg_id } = req.params;
  const user = await db.get('SELECT * FROM users WHERE tg_id = ?', tg_id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  // Получаем все user_event_shows для user_id
  const shows = await db.all('SELECT * FROM user_event_shows WHERE user_id = ?', user.id);
  if (!shows.length) return res.json([]);
  // Получаем все события по event_id
  const eventIds = shows.map(s => s.event_id);
  const placeholders = eventIds.map(() => '?').join(',');
  const events = await db.all(`SELECT * FROM events WHERE id IN (${placeholders})`, ...eventIds);
  // Формируем историю: объединяем show и event по event_id
  const history = shows.map(show => {
    const event = events.find(e => e.id === show.event_id);
    return {
      ...show,
      event
    };
  });
  res.json(history);
});

/**
 * @swagger
 * /getUsers:
 *   get:
 *     summary: Получить всех пользователей
 *     responses:
 *       200:
 *         description: Список пользователей
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
// Получить всех пользователей
app.get('/getUsers', async (req, res) => {
  try {
    const users = await db.all('SELECT * FROM users');
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: 'DB error', details: err.message });
  }
});

/**
 * @swagger
 * /addAttempts:
 *   post:
 *     summary: Добавить попытки пользователю
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               tg_id:
 *                 type: string
 *               count:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Обновлённый пользователь
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
app.post('/addAttempts', async (req, res) => {
  const { tg_id, count } = req.body;
  if (!tg_id || !count || isNaN(count) || count <= 0) {
    return res.status(400).json({ error: 'tg_id и положительный count обязательны' });
  }
  const db = await initDB();
  const user = await db.get('SELECT * FROM users WHERE tg_id = ?', tg_id);
  if (!user) {
    return res.status(404).json({ error: 'Пользователь не найден' });
  }
  await db.run('UPDATE users SET attempts = attempts + ? WHERE tg_id = ?', count, tg_id);
  const updatedUser = await db.get('SELECT * FROM users WHERE tg_id = ?', tg_id);
  res.json(updatedUser);
});

app.post('/frontend-log', express.json(), (req, res) => {
  const { level, message, meta, tg_id, path, ts } = req.body || {};

  const stamp = ts || new Date().toISOString();
  const lvl = (level || 'log').toUpperCase();
  const userPart = tg_id ? `tg_id=${tg_id}` : 'tg_id=-';
  const pathPart = path || '-';

  console.log(
    `[FRONT][${stamp}][${lvl}][${userPart}][${pathPart}]`,
    message || '',
    meta || ''
  );

  // при желании можно писать в БД
  res.json({ ok: true });
});

const PORT = 3001;

app.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
});