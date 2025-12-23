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

  const requestedCount = parseInt(count, 10) || 1; // сколько событий вернуть
  const ATTEMPT_COST = 1; // сколько попыток стоит один запрос
  const nowSeconds = Math.floor(Date.now() / 1000);
  const maxStartTimeSeconds = nowSeconds + 24 * 60 * 60;

  let user_id = null;
  let user_attempts = null;
  let userEvents = [];

  // нормализуем диапазон коэффициентов
  let min = Number.isFinite(parseFloat(min_coef)) ? parseFloat(min_coef) : null;
  let max = Number.isFinite(parseFloat(max_coef)) ? parseFloat(max_coef) : null;

  if (min != null && max != null && min > max) {
    const tmp = min;
    min = max;
    max = tmp;
  }

  try {
    // --- работа с пользователем и попытками ---
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

    // --- формирование SQL-запроса ---
    let query = 'SELECT * FROM events WHERE 1=1';
    const params = [];

    const sportFilters = (sport || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const uniqueSports = Array.from(new Set(sportFilters));

    // фильтрация по спорту
    if (uniqueSports.length > 0) {
      query += ` AND sport IN (${uniqueSports.map(() => '?').join(',')})`;
      params.push(...uniqueSports);
    }

    // фильтрация по статусу
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    } else {
      query += ' AND status IS NULL';
    }

    query += " AND COALESCE(LOWER(team1), '') NOT IN ('хозяева', 'гости')";
    query += " AND COALESCE(LOWER(team2), '') NOT IN ('хозяева', 'гости')";

    // Оставляем только события, которые стартуют в ближайшие 24 часа (sec/ms отметки)
    query += ` AND (
      (CAST(startTime AS INTEGER) BETWEEN ? AND ?)
      OR (CAST(startTime AS INTEGER) BETWEEN ? AND ?)
    )`;
    params.push(nowSeconds, maxStartTimeSeconds, nowSeconds * 1000, maxStartTimeSeconds * 1000);

    // исключаем уже показанные события
    if (userEvents.length > 0) {
      query += ` AND id NOT IN (${userEvents.map(() => '?').join(',')})`;
      params.push(...userEvents);
    }

    // фильтрация по коэффициентам: хотя бы один исход в диапазоне
    if (min != null || max != null) {
      const realMin = min ?? 1.01; // можно 0, если хочешь
      const realMax = max ?? 1000;

      query += `
        AND (
          (outcome1 BETWEEN ? AND ?)
          OR (outcomeX BETWEEN ? AND ?)
          OR (outcome2 BETWEEN ? AND ?)
          OR (outcome1X BETWEEN ? AND ?)
          OR (outcomeX2 BETWEEN ? AND ?)
        )
      `;
      params.push(
        realMin,
        realMax,
        realMin,
        realMax,
        realMin,
        realMax,
        realMin,
        realMax,
        realMin,
        realMax
      );
    }

    // Fetch candidates; when multiple sports requested, balance across them.
    let events = [];
    let availableSports = [];

    if (uniqueSports.length > 1) {
      const distinctQuery = query.replace(
        'SELECT * FROM events',
        'SELECT DISTINCT sport FROM events'
      );
      const distinctRows = await db.all(distinctQuery, ...params);
      availableSports = distinctRows.map(r => r.sport).filter(Boolean);
    }

    if (availableSports.length > 1) {
      const perSportFetch = Math.max(
        requestedCount,
        Math.ceil(requestedCount / availableSports.length) * 2
      );

      for (const s of availableSports) {
        const sportQuery = `${query} AND sport = ? ORDER BY RANDOM() LIMIT ?`;
        const sportEvents = await db.all(sportQuery, ...params, s, perSportFetch);
        events.push(...sportEvents);
      }
    } else {
      const eventsQuery = `${query} ORDER BY RANDOM() LIMIT ${requestedCount}`;
      events = await db.all(eventsQuery, ...params);
    }
    if (!events.length) {
      return res.json([]);
    }

    // -------- 2. Баланс спортивных типов для мульти-выбора --------
    let eventsForProcessing = events;

    // Группируем по реальному виду спорта
    const bySport = new Map();
    for (const e of events) {
      const key = (e.sport || '').toString();
      if (!key) continue;
      if (!bySport.has(key)) bySport.set(key, []);
      bySport.get(key).push(e);
    }

    // Если реально есть несколько видов спорта — балансируем выдачу
    if (bySport.size > 1 && events.length > 1) {
      // Перемешиваем внутри каждой группы
      for (const [, list] of bySport) {
        list.sort(() => Math.random() - 0.5);
      }

      const balanced = [];
      const sportKeys = Array.from(bySport.keys());

      // Round-robin по видам спорта до requestedCount или пока всё не кончится
      while (balanced.length < requestedCount) {
        let progressed = false;

        for (const key of sportKeys) {
          const list = bySport.get(key);
          if (!list || !list.length) continue;
          balanced.push(list.pop());
          progressed = true;
          if (balanced.length >= requestedCount) break;
        }

        if (!progressed) break; // все группы опустели
      }

      if (balanced.length) {
        eventsForProcessing = balanced;
      }
    }

    // -------- 3. Выбор исхода с учётом min/max и приоритетов --------
    const filtered = eventsForProcessing
      .map(event => {
        const outcomeKeys = ['outcome1', 'outcomeX', 'outcome2', 'outcome1X', 'outcomeX2'];
        const availableOutcomes = outcomeKeys.filter(key => {
          const val = event[key];
          if (typeof val !== 'number' || val <= 0) return false;
          if (min != null && val < min) return false;
          if (max != null && val > max) return false;
          return true;
        });

        if (!availableOutcomes.length) return null;

        const o1 = Number(event.outcome1);
        const o2 = Number(event.outcome2);
        const hasO1 = Number.isFinite(o1) && o1 > 0;
        const hasO2 = Number.isFinite(o2) && o2 > 0;
        const diff = hasO1 && hasO2 ? Math.abs(o1 - o2) : 0;

        const underdogKey = hasO1 && hasO2 ? (o1 > o2 ? 'outcome1' : 'outcome2') : '';
        const favoriteKey = hasO1 && hasO2 ? (o1 > o2 ? 'outcome2' : 'outcome1') : '';
        const underdogDoubleKey =
          underdogKey === 'outcome1'
            ? 'outcome1X'
            : underdogKey === 'outcome2'
              ? 'outcomeX2'
              : '';
        const favoriteDoubleKey =
          diff >= 2 && favoriteKey === 'outcome1'
            ? 'outcome1X'
            : diff >= 2 && favoriteKey === 'outcome2'
              ? 'outcomeX2'
              : '';

        const sportName = (event.sport || '').toString().toLowerCase();
        const isTennis = sportName.includes('теннис') || sportName.includes('tennis');

        const pickRandom = (pool) => pool[Math.floor(Math.random() * pool.length)];

        let chosenKey = '';

        if (isTennis) {
          const tennisPool = availableOutcomes.filter(k => k === 'outcome1' || k === 'outcome2');
          if (tennisPool.length === 1) {
            chosenKey = tennisPool[0];
          } else if (tennisPool.length === 2 && underdogKey && favoriteKey) {
            chosenKey = Math.random() < 0.7 ? underdogKey : favoriteKey;
            if (!tennisPool.includes(chosenKey)) {
              chosenKey = pickRandom(tennisPool);
            }
          } else if (tennisPool.length) {
            chosenKey = pickRandom(tennisPool);
          }
        }

        if (!chosenKey) {
          const group70 = [];
          const group30 = [];

          if (availableOutcomes.includes('outcomeX')) group70.push('outcomeX');
          if (underdogDoubleKey && availableOutcomes.includes(underdogDoubleKey)) {
            group70.push(underdogDoubleKey);
          }

          if (availableOutcomes.includes('outcome1')) group30.push('outcome1');
          if (availableOutcomes.includes('outcome2')) group30.push('outcome2');
          if (favoriteDoubleKey && availableOutcomes.includes(favoriteDoubleKey)) {
            group30.push(favoriteDoubleKey);
          }

          let pool = [];
          let usingGroup70 = false;

          if (group70.length && group30.length) {
            usingGroup70 = Math.random() < 0.7;
            pool = usingGroup70 ? group70 : group30;
          } else if (group70.length) {
            usingGroup70 = true;
            pool = group70;
          } else if (group30.length) {
            pool = group30;
          } else {
            pool = availableOutcomes;
          }

          if (
            usingGroup70 &&
            underdogDoubleKey &&
            pool.includes(underdogDoubleKey) &&
            pool.length > 1
          ) {
            if (Math.random() < 0.6) {
              chosenKey = underdogDoubleKey;
            } else {
              const alt = pool.filter(k => k !== underdogDoubleKey);
              chosenKey = alt.length ? pickRandom(alt) : underdogDoubleKey;
            }
          } else {
            chosenKey = pickRandom(pool);
          }
        }

        if (!chosenKey) return null;

        return {
          ...event,
          shownOutcome: chosenKey,
          shownValue: event[chosenKey]
        };
      })
      .filter(Boolean);

    if (!filtered.length) {
      return res.json([]);
    }

    // -------- 4. Логирование показанных событий + списание попытки --------
    if (user_id) {
      const insertStmt = await db.prepare(
        'INSERT INTO user_event_shows (user_id, event_id, shown_outcome) VALUES (?, ?, ?)'
      );

      try {
        for (const ev of filtered) {
          await insertStmt.run(user_id, ev.id, ev.shownOutcome);
        }
      } finally {
        await insertStmt.finalize();
      }

      // 1 запрос = 1 попытка
      await db.run(
        'UPDATE users SET attempts = attempts - ? WHERE id = ?',
        ATTEMPT_COST,
        user_id
      );
    }

    return res.json(filtered);
  } catch (err) {
    console.error('Error in /events:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
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
    const shownOutcome = (show.shown_outcome || '').toString().trim().toLowerCase();
    let recommendedLabel = '';
    let recommendedKey = '';

    if (shownOutcome === 'outcome1') {
      recommendedLabel = '1';
      recommendedKey = 'outcome1';
    } else if (shownOutcome === 'outcomex') {
      recommendedLabel = 'X';
      recommendedKey = 'outcomeX';
    } else if (shownOutcome === 'outcome2') {
      recommendedLabel = '2';
      recommendedKey = 'outcome2';
    } else if (shownOutcome === 'outcome1x') {
      recommendedLabel = '1X';
      recommendedKey = 'outcome1X';
    } else if (shownOutcome === 'outcomex2') {
      recommendedLabel = 'X2';
      recommendedKey = 'outcomeX2';
    }

    const recommendedCoef = event && recommendedKey ? event[recommendedKey] : null;
    const teams = event ? [event.team1, event.team2].filter(Boolean).join(' / ') : '';
    return {
      ...show,
      event,
      teams,
      recommended_outcome: show.shown_outcome,
      recommended_label: recommendedLabel,
      recommended_coef: recommendedCoef
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
