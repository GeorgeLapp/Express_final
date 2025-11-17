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
      url: 'http://localhost:3000',
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
  let userEvents = [];
  let user_id = null;
  let user_attempts = null;
  const requestedCount = parseInt(count) || 1;
  if (tg_id) {
    const user = await db.get('SELECT * FROM users WHERE tg_id = ?', tg_id);
    if (user) {
      user_id = user.id;
      user_attempts = user.attempts;
      // Проверяем попытки
      if (user_attempts < requestedCount) {
        return res.status(403).json({ error: `У вас недостаточно попыток! Осталось: ${user_attempts}` });
      }
      // Получаем id событий, которые уже были показаны этому пользователю
      const shownRows = await db.all('SELECT event_id FROM user_event_shows WHERE user_id = ?', user_id);
      userEvents = shownRows.map(row => row.event_id);
    }
  }
  let query = 'SELECT * FROM events WHERE 1=1';
  const params = [];
  // Фильтрация по видам спорта
  if (sport) {
    const sports = sport.split(',').map(s => s.trim()).filter(Boolean);
    if (sports.length > 0) {
      query += ` AND sport IN (${sports.map(() => '?').join(',')})`;
      params.push(...sports);
    }
  }
  if (status) {
    query += ' AND status = ?';
    params.push(status);
  } else {
    // По умолчанию показываем только не начавшиеся события (status IS NULL)
    query += ' AND status IS NULL';
  }
  if (userEvents.length > 0) {
    query += ` AND id NOT IN (${userEvents.map(() => '?').join(',')})`;
    params.push(...userEvents);
  }
  // Фильтрация по коэффициентам
  if (min_coef && max_coef) {
    query += ' AND (' +
      '(outcome1 BETWEEN ? AND ?) OR ' +
      '(outcomeX BETWEEN ? AND ?) OR ' +
      '(outcome2 BETWEEN ? AND ?))';
    params.push(min_coef, max_coef, min_coef, max_coef, min_coef, max_coef);
  } else if (min_coef) {
    query += ' AND (' +
      'outcome1 >= ? OR outcomeX >= ? OR outcome2 >= ?)';
    params.push(min_coef, min_coef, min_coef);
  } else if (max_coef) {
    query += ' AND (' +
      'outcome1 <= ? OR outcomeX <= ? OR outcome2 <= ?)';
    params.push(max_coef, max_coef, max_coef);
  }
  // Лимит по количеству
  const limit = requestedCount;
  query += ' ORDER BY RANDOM() LIMIT ' + limit;
  const events = await db.all(query, ...params);
  if (events.length === 0) return res.json([]);
  // Для каждого события выбираем только подходящие исходы
  const outcomes = ['outcome1', 'outcomeX', 'outcome2'];
  const min = min_coef !== undefined ? parseFloat(min_coef) : undefined;
  const max = max_coef !== undefined ? parseFloat(max_coef) : undefined;
  const filtered = events.map(event => {
    // Определяем подходящие исходы
    const suitable = outcomes.filter(o => {
      const val = parseFloat(event[o]);
      if (isNaN(val)) return false;
      if (min !== undefined && val < min) return false;
      if (max !== undefined && val > max) return false;
      return true;
    });
    if (suitable.length === 0) return null;
    const random = suitable[Math.floor(Math.random() * suitable.length)];
    return {
      ...event,
      shownOutcome: random,
      shownValue: event[random]
    };
  }).filter(Boolean);
  if (filtered.length === 0) return res.json([]);
  // Сохраняем показанные события пользователю в user_event_shows
  if (tg_id && user_id && filtered.length > 0) {
    for (const e of filtered) {
      await db.run('INSERT INTO user_event_shows (user_id, event_id, shown_outcome) VALUES (?, ?, ?)', user_id, e.id, e.shownOutcome);
    }
    // Уменьшаем attempts на count
    await db.run('UPDATE users SET attempts = attempts - ? WHERE id = ?', requestedCount, user_id);
  }
  res.json(filtered);
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


const PORT = 3000;

app.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
});