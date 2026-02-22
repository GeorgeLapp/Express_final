# Express1 - Полная документация проекта

## 1. Назначение проекта

`Express1` - Telegram Mini App для формирования рекомендаций на спортивные экспрессы.

Ключевые функции:

- выбор вида спорта, диапазона коэффициентов и количества событий;
- выдача готового экспресса на ближайшие события;
- сохранение экспресса в историю;
- просмотр истории экспрессов с группировкой по выдачам;
- покупка пакета попыток через Robokassa;
- юридическая и контактная информация внутри приложения.

Важно: сервис не является букмекерской конторой и не принимает ставки. Он выдает рекомендации.

---

## 2. Архитектура

Проект состоит из 5 основных частей:

1. `Express1` - фронтенд (статические страницы + JS) и опциональный Telegram bot polling.
2. `Express1Back/server.mjs` - основной API для событий, пользователей, истории и логов.
3. `Express1Back/index.mjs` - парсер линии Fonbet (записывает события и коэффициенты в SQLite).
4. `Express1Back/results_parser.mjs` - парсер результатов матчей (обновляет статус/результаты).
5. `Express1Back/robokassa` - отдельный billing-сервис с платежной интеграцией Robokassa.

Поток данных:

1. `index.mjs` регулярно тянет линию Fonbet и пишет события в `database.sqlite`.
2. `results_parser.mjs` обновляет `status/results/winning_outcome` в тех же событиях.
3. Фронтенд запрашивает `/events` у `server.mjs` и показывает экспресс пользователю.
4. При `SAVE TO MIND` фронтенд сохраняет события в `user_event_shows` (`/saveHistory`) с `batch_id`.
5. Экран истории получает `/userHistory/:tg_id`, группирует по `batch_id` в "Экспресс #N".
6. Экран кошелька вызывает billing API (`/api/billing/*`) и редиректит пользователя на оплату.

---

## 3. Структура репозитория

```text
Express_final/
├─ Express1/                         # Frontend + локальный web-сервер + Telegram polling
│  ├─ index2.js
│  ├─ .env
│  └─ public/
│     ├─ *.html                      # Экраны мини-приложения
│     ├─ js/*.js                     # Логика экранов
│     ├─ css/style.css
│     └─ images/, docs/
├─ Express1Back/                     # Основной backend + парсеры
│  ├─ server.mjs                     # API (users/events/history)
│  ├─ index.mjs                      # Парсер линии Fonbet
│  ├─ results_parser.mjs             # Парсер результатов
│  ├─ db.mjs                         # Инициализация SQLite
│  ├─ database.sqlite
│  └─ robokassa/                     # Billing-сервис
│     ├─ src/server.mjs
│     ├─ src/routes/*.mjs
│     ├─ src/schema.sql
│     ├─ .env
│     └─ billing.sqlite
├─ nginx/
│  ├─ sites-available/express1_ru.conf
│  └─ snippets/*.conf
├─ ecosystem.config.cjs              # PM2 конфигурация всех процессов
└─ PROJECT_DOCUMENTATION.md          # Этот файл
```

---

## 4. Технологический стек

- `Node.js` (ESM + CommonJS)
- `Express` (front и back)
- `sqlite3` + `sqlite`
- `node-fetch` (в backend)
- `node-telegram-bot-api` (в frontend server)
- `PM2` (оркестрация процессов)
- `Nginx` (reverse proxy + SSL + маршрутизация)
- `Robokassa` (внешний платежный провайдер)

---

## 5. Компоненты и поведение

## 5.1 Frontend (`Express1`)

### 5.1.1 Сервер фронтенда

Файл: `Express1/index2.js`

- раздает `Express1/public` как статику;
- `GET /health` -> `{ ok: true }`;
- `GET /` -> `index.html`;
- для `.html/.js/.css` выставляет no-cache заголовки;
- при наличии `BOT_TOKEN` запускает Telegram polling и обрабатывает `/start`.

### 5.1.2 Экраны

- `index.html` - главный экран с кнопкой "РАЗБУДИТЬ ГУРУ".
- `choose-page.html` - выбор спорта, коэффициентов и количества событий.
- `table-screen.html` - выданный экспресс (таблица событий, итоговый коэф., действия).
- `history-screen.html` - история экспрессов.
- `wallet-screen.html` - покупка попыток.
- `profile-screen.html` - профиль Telegram пользователя + число попыток.
- `instruction-screen.html` - инструкции по использованию.
- `legal.html` - контакты, реквизиты, условия, оферта.

### 5.1.3 Ключевые UX-правки (текущее состояние)

- Fallback `tg_id` для web-тестов: `517552587` (если нет Telegram WebApp user).
- На экранах выбора и таблицы добавлена кнопка-ссылка:
  - текст: `ФОНБЕТ БОНУС`
  - URL: `https://clicks.af-ru2e2e.com/click?offer_id=819&partner_id=29087&landing_id=3214&utm_medium=affiliate`
- Кнопка `SAVE TO MIND` блокируется после первого клика в рамках текущего экрана.
- В footer на экранах отображается:
  - `Самозанятый Хилков Александр Борисович`
  - `ИНН: 665803826172`
- На экране истории элементы группируются по экспрессам (по `batch_id`).
- Статус группы в истории: только `В ожидании` или `Завершен`.

### 5.1.4 Навигация и base URL API

Файл: `Express1/public/js/utils.js`

- backend base определяется так:
  1. `window.__BACKEND_BASE_URL__` или `window.BACKEND_BASE_URL` или `localStorage.backendBaseUrl`;
  2. для `localhost` -> `http://localhost:3001`;
  3. иначе -> `${location.origin}/backend`.

Примечание: `sendFrontendLog()` сейчас жестко шлет в `https://express1.ru/backend/frontend-log`.

---

## 5.2 Основной backend (`Express1Back/server.mjs`)

### 5.2.1 Общая логика

- инициализирует БД через `initDB()`;
- включает CORS;
- опционально поднимает Swagger UI на `/api-docs` (по `ENABLE_SWAGGER`);
- работает на порту `3001` (в коде зафиксирован `const PORT = 3001`).

### 5.2.2 API endpoints

### `GET /events`

Параметры query:

- `sport` - CSV список видов спорта;
- `status` - статус события (если не передан, фильтр на `status IS NULL`);
- `tg_id` - Telegram ID пользователя;
- `username` - username (опциональная синхронизация в users);
- `count` - количество событий;
- `min_coef`, `max_coef` - диапазон коэффициентов.

Основные правила:

- выбираются события только на ближайшие 24 часа;
- исключаются команды `хозяева/гости`;
- если передано несколько видов спорта, выдача балансируется между ними;
- для тенниса логика выбора исхода отдельная;
- если `tg_id` найден и попыток недостаточно -> `403`;
- при успешной выдаче списывается 1 попытка (на стороне backend).

Ответ: массив событий с полями `shownOutcome` и `shownValue`.

### `GET /user/:tg_id`

- возвращает пользователя;
- если пользователя нет, создает с `attempts = 10`;
- если передан `username`, обновляет его.

### `GET /userHistory/:tg_id`

- возвращает историю сохраненных событий пользователя;
- объединяет `user_event_shows` с `events`;
- включает вычисленные поля:
  - `teams`
  - `recommended_outcome`
  - `recommended_label`
  - `recommended_coef`

### `POST /saveHistory`

Body:

```json
{
  "tg_id": "123",
  "username": "user",
  "batch_id": "optional_uuid",
  "events": [
    { "id": "event_id", "shownOutcome": "outcome1" }
  ]
}
```

- пишет события в `user_event_shows`;
- если `batch_id` не передан, генерирует `randomUUID()`;
- возвращает `{ ok: true, saved, batch_id }`.

### `GET /getUsers`

- возвращает всех пользователей.

### `POST /addAttempts`

Body:

```json
{
  "tg_id": "123",
  "count": 10,
  "username": "optional"
}
```

- добавляет попытки пользователю.

### `POST /frontend-log`

- принимает фронтовые логи и пишет в stdout.

---

## 5.3 Парсер линии (`Express1Back/index.mjs`)

Класс: `FonbetStream`.

Источник:

- `https://line32w.bk6bba-resources.com/events/list?lang=ru&version=...&scopeMarket=1600`

Характеристики:

- polling (по умолчанию ~5 секунд в примере запуска);
- retry + timeout для сетевых ошибок;
- запись в таблицу `events` (INSERT OR IGNORE);
- берутся коэффициенты по кодам:
  - `921` -> `outcome1`
  - `922` -> `outcomeX`
  - `923` -> `outcome2`
  - `924` -> `outcome1X`
  - `925` -> `outcomeX2`

Бизнес-фильтры:

- `Футбол`:
  - Англия Premier League
  - Италия Serie A
  - Испания La Liga/Primera
  - Германия Bundesliga
  - Аргентина Primera/Liga Profesional
  - Россия РПЛ/Премьер-Лига
  - Бразилия Serie A
- `Хоккей`:
  - КХЛ
  - NHL
- `Теннис`:
  - матчи только при наличии игроков из whitelist:
    - Медведев, Rublev, Zverev, Alkaraz/Alcaraz, Djokovic, Sinner,
      Sobolenko/Sabalenka, Rybakina, Sventek/Swiatek, De Minaur,
      Munar, Menshik/Mensik, Bublik

Примечание: внизу файла стрим запускается без проверки `isRunDirectly`, поэтому импорт файла тоже запускает процесс.

---

## 5.4 Парсер результатов (`Express1Back/results_parser.mjs`)

Источник:

- `https://<host>/results/v2/getByDate?lang=ru&lineDate=YYYY-MM-DD&scopeMarket=1600`
- хосты задаются через `FONBET_RESULTS_HOSTS` (CSV).

Логика:

- запрашивает данные за сегодня и вчера;
- заполняет `events.results` (`score1:score2`);
- нормализует `status`:
  - `1` -> `live`
  - `2` -> `finished`
- для завершенных матчей вычисляет `winning_outcome`:
  - `outcome1` | `outcome2` | `outcomeX`

Интервал цикла: `RESULTS_PARSER_INTERVAL_MS` (по умолчанию 5 минут).

---

## 5.5 Billing service (`Express1Back/robokassa`)

Отдельный сервис на `Express` + `SQLite`.

### 5.5.1 Назначение

- хранит товары и продажи;
- создает checkout-сессию и ссылку на Robokassa;
- принимает ResultURL callback и помечает оплату;
- обеспечивает идемпотентность по `InvId` и `idempotencyKey`.

### 5.5.2 Маршрутизация

- `GET /health`
- Billing API под префиксом: `/api/billing/*`
- Robokassa callbacks/redirects:
  - `/api/robokassa/result`
  - `/api/robokassa/success`
  - `/api/robokassa/fail`

### 5.5.3 Billing API

Публичные:

- `GET /api/billing/products`
- `GET /api/billing/products/:productId`
- `POST /api/billing/checkout/create`
- `GET /api/billing/checkout/:sessionId`
- `GET /api/billing/sales`
- `GET /api/billing/sales/by-inv/:invId`
- `GET /api/billing/sales/:saleId`

Админские (`x-api-key: ADMIN_API_KEY`):

- `GET /api/billing/admin/products`
- `POST /api/billing/admin/products`
- `PUT /api/billing/admin/products/:productId`
- `DELETE /api/billing/admin/products/:productId` (soft delete)
- `GET /api/billing/admin/sales`

Доступ к публичным `sales` контролируется `PUBLIC_SALES_MODE`:

- `public`
- `admin_key`
- `disabled`

### 5.5.4 Robokassa протокол

Файл: `Express1Back/robokassa/src/robokassa.mjs`

- init-подпись (Password#1) для PayURL;
- verify result-подписи (Password#2) для ResultURL;
- поддерживаются алгоритмы:
  - `MD5`, `RIPEMD160`, `SHA1`, `SHA256`, `SHA384`, `SHA512`
- учитываются `Shp_*` параметры в подписи (сортировка по ключу).

ResultURL обработчик:

- проверяет обязательные поля (`OutSum`, `InvId`, `SignatureValue`);
- проверяет подпись;
- сверяет сумму;
- защищен транзакцией `BEGIN IMMEDIATE`;
- при повторном callback на уже оплаченный `InvId` возвращает `OK{InvId}`.

---

## 6. База данных

## 6.1 Основная БД (`Express1Back/database.sqlite`)

Инициализация: `Express1Back/db.mjs`.

### Таблица `events`

- `id TEXT PRIMARY KEY`
- `sport TEXT`
- `tournament TEXT`
- `team1 TEXT`
- `team2 TEXT`
- `startTime TEXT`
- `outcome1 REAL`
- `outcomeX REAL`
- `outcome2 REAL`
- `outcome1X REAL`
- `outcomeX2 REAL`
- `status TEXT`
- `results TEXT`
- `winning_outcome TEXT`

### Таблица `users`

- `id INTEGER PRIMARY KEY AUTOINCREMENT`
- `tg_id TEXT UNIQUE`
- `username TEXT`
- `balance REAL DEFAULT 0`
- `attempts INTEGER DEFAULT 0`

### Таблица `user_event_shows`

- `id INTEGER PRIMARY KEY AUTOINCREMENT`
- `user_id INTEGER`
- `event_id TEXT`
- `shown_outcome TEXT`
- `username TEXT`
- `batch_id TEXT`
- `shown_at TEXT DEFAULT CURRENT_TIMESTAMP`

## 6.2 Billing БД (`Express1Back/robokassa/billing.sqlite`)

Инициализация: `Express1Back/robokassa/src/schema.sql`.

### Таблица `products`

- каталог продаваемых пакетов.

### Таблица `sale_sessions`

- checkout-сессии до оплаты;
- содержит `idempotency_key`, `inv_id`, `pay_url`, `expires_at`.

### Таблица `sales`

- фактические продажи (`pending|paid|canceled|refunded`);
- `inv_id` уникален;
- хранит `out_sum`, `paid_at`, `fulfillment_ref`.

---

## 7. Переменные окружения

Ниже только названия и назначение. Секреты не включать в git.

## 7.1 Frontend (`Express1/.env`)

- `PORT` - порт фронтенд сервера (по умолчанию `3000`).
- `BOT_TOKEN` - токен Telegram бота.
- `VK_TUNNEL` / `BackAddress` / `BACK_ADDRESS` - URL mini app для `/start`.
- `TG_POLL_INTERVAL_MS`
- `TG_POLL_TIMEOUT_SEC`
- `TG_POLL_RESTART_DELAY_MS`
- `TG_POLL_RESTART_MAX_DELAY_MS`

## 7.2 Основной backend (`Express1Back`)

- `ENABLE_SWAGGER` - включение Swagger UI.
- `FONBET_REQUEST_TIMEOUT_MS`
- `FONBET_REQUEST_RETRIES`
- `FONBET_RESULTS_LANG`
- `FONBET_RESULTS_PACKET_VERSION`
- `FONBET_RESULTS_SCOPE_MARKET`
- `FONBET_RESULTS_TIMEOUT_MS`
- `FONBET_RESULTS_RETRIES`
- `RESULTS_PARSER_INTERVAL_MS`
- `FONBET_RESULTS_HOSTS`

## 7.3 Billing (`Express1Back/robokassa/.env`)

- `PORT` (обычно `3010`)
- `DB_PATH`
- `ROBOKASSA_MERCHANT_LOGIN`
- `ROBOKASSA_PASSWORD1`
- `ROBOKASSA_PASSWORD2`
- `ROBOKASSA_HASH_ALGORITHM`
- `ROBOKASSA_IS_TEST`
- `ADMIN_API_KEY`
- `PUBLIC_SALES_MODE`
- `SEED_DEMO_PRODUCTS`
- `BILLING_ENV_FILE` (задается окружением процесса, например в PM2)

---

## 8. Локальный запуск

Требования:

- Node.js 18+
- npm

## 8.1 Frontend

```powershell
cd Express1
npm install
npm start
```

Сервер: `http://localhost:3000`

## 8.2 Основной backend API

```powershell
cd Express1Back
npm install
node server.mjs
```

Сервер: `http://localhost:3001`

## 8.3 Парсер линии

```powershell
cd Express1Back
node index.mjs
```

## 8.4 Парсер результатов

```powershell
cd Express1Back
node results_parser.mjs
```

## 8.5 Billing service

```powershell
cd Express1Back\robokassa
npm install
node src/server.mjs
```

Сервер: `http://localhost:3010`

---

## 9. Запуск через PM2 (production pattern)

Файл: `ecosystem.config.cjs`.

Поднимаются процессы:

- `front` (`Express1/index2.js`, `:3000`)
- `server` (`Express1Back/server.mjs`, `:3001`)
- `index` (`Express1Back/index.mjs`)
- `results_parser` (`Express1Back/results_parser.mjs`)
- `billing-service` (`Express1Back/robokassa/src/server.mjs`, `:3010`)

Команды:

```bash
pm2 start ecosystem.config.cjs
pm2 status
pm2 logs
pm2 save
```

---

## 10. Nginx и доменная маршрутизация

Конфиги:

- `nginx/sites-available/express1_ru.conf`
- `nginx/snippets/proxy_headers.conf`
- `nginx/snippets/robokassa_and_billing_locations.conf`

Маршруты:

- `/` -> `http://localhost:3000` (frontend)
- `/backend/` -> `http://localhost:3001/` (основной API)
- `/api/billing/` -> `http://localhost:3010` (billing API)
- `/api/robokassa/result` -> `http://localhost:3010`
- `/api/robokassa/success` -> `http://localhost:3010`
- `/api/robokassa/fail` -> `http://localhost:3010`

В Robokassa кабинете должны быть выставлены:

- `ResultURL`: `https://express1.ru/api/robokassa/result`
- `SuccessURL`: `https://express1.ru/api/robokassa/success`
- `FailURL`: `https://express1.ru/api/robokassa/fail`

---

## 11. Пользовательские сценарии

## 11.1 Получение экспресса

1. Пользователь открывает mini app.
2. Выбирает спорт(ы), диапазон коэффициентов и число событий.
3. Нажимает `СПРОСИТЬ ГУРУ`.
4. Фронтенд запрашивает `/events`.
5. Backend списывает 1 попытку и возвращает экспресс.
6. На экране таблицы доступны:
   - `ASK ME AGAIN`
   - `SAVE TO MIND`
   - `ФОНБЕТ БОНУС`

## 11.2 Сохранение в историю

1. Пользователь жмет `SAVE TO MIND` (один раз).
2. Фронтенд отправляет `/saveHistory`.
3. Backend сохраняет события с одним `batch_id`.
4. История показывает группу "Экспресс #N" с раскрывающейся таблицей.

## 11.3 Покупка попыток

1. На `wallet-screen` фронтенд запрашивает `/api/billing/products`.
2. Создает checkout через `POST /api/billing/checkout/create`.
3. Делает redirect на `payUrl` Robokassa.
4. После оплаты Robokassa шлет `POST /api/robokassa/result`.
5. Billing помечает sale как `paid`.

---

## 12. Примеры запросов

## 12.1 Получить пользователя

```bash
curl "http://localhost:3001/user/517552587"
```

## 12.2 Получить события

```bash
curl "http://localhost:3001/events?sport=Футбол,Теннис&count=6&min_coef=1.6&max_coef=4.8&tg_id=517552587"
```

## 12.3 Сохранить экспресс

```bash
curl -X POST "http://localhost:3001/saveHistory" ^
  -H "Content-Type: application/json" ^
  -d "{\"tg_id\":\"517552587\",\"events\":[{\"id\":\"123\",\"shownOutcome\":\"outcome1\"}]}"
```

## 12.4 Создать checkout в billing

```bash
curl -X POST "http://localhost:3010/api/billing/checkout/create" ^
  -H "Content-Type: application/json" ^
  -d "{\"userId\":\"517552587\",\"productId\":\"p_basic\",\"idempotencyKey\":\"test-1\"}"
```

---

## 13. Логирование и мониторинг

- Фронтенд отправляет клиентские сообщения в `/backend/frontend-log`.
- Backend пишет в stdout.
- PM2 собирает логи каждого процесса.
- Проверка живости сервисов:
  - `GET /health` на frontend
  - `GET /health` на billing
  - backend API можно проверять через `GET /getUsers` или `GET /user/:tg_id`

---

## 14. Известные ограничения и технический долг

- `Express1Back/server.mjs` использует фиксированный порт `3001`, игнорируя `process.env.PORT`.
- `Express1/public/js/utils.js` функция `sendFrontendLog()` использует жесткий URL `https://express1.ru/backend/frontend-log`.
- В `Express1Back/index.mjs` переменная `isRunDirectly` объявлена, но запуск стрима выполняется без проверки.
- `Express1Back/test_db.mjs` использует устаревшее поле `shown_events` в `users` (в текущей схеме такого столбца нет).
- Часть комментариев/строк в проекте отображается с проблемной кодировкой в некоторых консолях.

---

## 15. Рекомендации по безопасности

- Не хранить реальные токены/пароли в репозитории.
- Вынести секреты в защищенное окружение (CI/CD secrets, vault, server env).
- Ограничить доступ к админским billing endpoint через `x-api-key` и сетевые ACL.
- На production использовать только HTTPS.

---

## 16. Чек-лист после деплоя

1. Проверить `pm2 status`: все 5 процессов online.
2. Проверить `https://<domain>/` - фронт доступен.
3. Проверить `https://<domain>/backend/user/517552587` - backend отвечает.
4. Проверить `https://<domain>/api/billing/products` - billing доступен.
5. Проверить callback URL в кабинете Robokassa.
6. Прогнать сценарий: выдача экспресса -> save -> история -> покупка попыток.

---

## 17. Файлы, на которые опирается эта документация

- `Express1/index2.js`
- `Express1/public/*.html`
- `Express1/public/js/*.js`
- `Express1/public/css/style.css`
- `Express1Back/server.mjs`
- `Express1Back/db.mjs`
- `Express1Back/index.mjs`
- `Express1Back/results_parser.mjs`
- `Express1Back/robokassa/src/*.mjs`
- `Express1Back/robokassa/src/schema.sql`
- `ecosystem.config.cjs`
- `nginx/sites-available/express1_ru.conf`
- `nginx/snippets/*.conf`

