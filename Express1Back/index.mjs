// Fonbet Streaming Parser на ECMAScript с русскими комментариями
import { EventEmitter } from 'events';
import path from 'path';
import { fileURLToPath } from 'url';
import { EventModel } from './EventModel.mjs';
import { initDB } from './db.mjs';

let fetchFn;
const __filename = fileURLToPath(import.meta.url);
const isRunDirectly = process.argv[1] === __filename;

// Поддержка fetch как в браузере, так и через node-fetch
try {
  // В новых версиях Node fetch есть глобально
  // eslint-disable-next-line no-undef
  fetchFn = fetch;
} catch (_) {
  fetchFn = (...args) => import('node-fetch').then(mod => mod.default(...args));
}

// Инициализация БД (один shared-инстанс)
let dbPromise = initDB();

// --- Бизнес-фильтры по видам спорта / турнирам / игрокам ---

const FOOTBALL_TOURNAMENT_KEYWORDS = [
  'россия',
  'англия',
  'италия',
  'испания',
  'германия',
  'бельгия',
  'бразилия',
  'аргентина',
  'кубок европ',      // "Кубок Европы"
  'лига чемпионов',
  'лига европы',
  'лига конференций'
];

const HOCKEY_TOURNAMENT_KEYWORDS = [
  'кхл',
  'вхл',
  'nhl',
  'ahl'
];

// Имена топ-игроков для фильтрации тенниса (рус/латиница)
// --- Бизнес-фильтры по видам спорта / турнирам ---

// Допустимые турниры по видам спорта (всё в нижнем регистре)
const FOOTBALL_TOURNAMENT_WHITELIST = [
  'кубок мира',
  'лига чемпионов',
  'кубок уефа',
  'россия. премьер-лига',
  'англия. премьер-лига',
  'германия. бундеслига',
  'испания. примера дивизион',
  'италия. серия а',
  'португалия. премьер-лига',
  'бельгия. премьер-лига',
  'турция. суперлига',
  'бразилия. серия а',
];

const HOCKEY_TOURNAMENT_WHITELIST = [
  'кубок мира',
  'кхл',
  'нхл',
];

const TENNIS_TOURNAMENT_WHITELIST = [
  'роллан-гаррос',
  'уимблдон',
  'кубок дэвиса',
  'usa open',
  'australian open',
  'davis cup',
  'itf',
  'atp',
];

const TEAM_NAME_BLACKLIST = new Set(['хозяева', 'гости']);


export class FonbetStream extends EventEmitter {
  /**
   * @param {Object} opts
   * @param {string} [opts.host="line32w.bk6bba-resources.com"] - адрес источника
   * @param {string} [opts.lang="ru"] - язык запроса
   * @param {number} [opts.scopeMarket=1600] - охват рынков (1600 — вся линия)
   * @param {number} [opts.pollInterval=4000] - интервал обновления в мс
   * @param {string[]} [opts.sportsFilter=["Футбол","Теннис","Хоккей"]] - фильтр по видам спорта
   */
  constructor({
    host = 'line32w.bk6bba-resources.com',
    lang = 'ru',
    scopeMarket = 1600,
    pollInterval = 4000,
    sportsFilter = ['Футбол', 'Теннис', 'Хоккей']
  } = {}) {
    super();
    this.host = host;
    this.lang = lang;
    this.scopeMarket = scopeMarket;
    this.pollInterval = pollInterval;
    this.sportsFilter = new Set(sportsFilter.map(s => s.toLowerCase()));

    this._version = 0;
    this._timer = null;

    this.cache = {
      sports: new Map(),   // id -> объект вида спорта / сегмента
      events: new Map(),   // id -> объект события
      markets: new Map(),  // id -> маркет
      factors: new Map()   // e -> customFactors
    };

    this._allowedSportIds = new Set(); // id видов спорта, прошедших фильтр
    this.allowedMathesIds = new Set(); // id сегментов (чемпионатов), по которым берём матчи
  }

  // Запуск постоянного опроса
  start () {
    if (this._timer) return;
    this._tick();
  }

  // Остановка опроса
  stop () {
    if (this._timer) {
      clearTimeout(this._timer);
    }
    this._timer = null;
  }

  // Единичный запрос данных
  async _tick () {
    try {
      const url = `https://${this.host}/events/list?lang=${this.lang}&version=${this._version}&scopeMarket=${this.scopeMarket}`;
      const res = await fetchFn(url, { timeout: 10000 });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }

      const json = await res.json();
      await this._process(json);
      this._version = json.packetVersion;
    } catch (err) {
      this.emit('error', err);
    } finally {
      if (this.pollInterval > 0) {
        this._timer = setTimeout(() => this._tick(), this.pollInterval);
      }
    }
  }

  // Проверка: входит ли вид спорта в фильтр
  _matchAllowedSport (sportObj) {
    return this.sportsFilter.has(String(sportObj.name).toLowerCase());
  }

  // Проверка: входит ли матч в нужный сегмент (чемпионат)
  _matchAllowedMatch (sportObj) {
    return this._allowedSportIds.has(sportObj.parentId);
  }

  // Бизнес-фильтр: оставляем только нужные чемпионаты/игроков
  _eventMatchesFilter ({ sportName, tournamentName, team1, team2 }) {
    const sport = (sportName || '').toLowerCase();
    const tournament = (tournamentName || '').toLowerCase();
    const t1 = (team1 || '').trim().toLowerCase();
    const t2 = (team2 || '').trim().toLowerCase();

    if (TEAM_NAME_BLACKLIST.has(t1) || TEAM_NAME_BLACKLIST.has(t2)) {
      return false;
    }

    // Футбол: только заданные турниры
    if (sport === 'футбол') {
      return FOOTBALL_TOURNAMENT_WHITELIST.some(kw => tournament.includes(kw));
    }

    // Хоккей: только заданные турниры
    if (sport === 'хоккей') {
      return HOCKEY_TOURNAMENT_WHITELIST.some(kw => tournament.includes(kw));
    }

    // Теннис: только заданные турниры
    if (sport === 'теннис') {
      return TENNIS_TOURNAMENT_WHITELIST.some(kw => tournament.includes(kw));
    }

    // Остальные виды спорта в БД не пишем
    return false;
  }
  // Основная обработка пакета данных
  async _process (data) {
    const { sports = [], events = [], markets = [], customFactors = [], deleted = [] } = data;

    // Обработка и фильтрация справочника спорта (вид спорта + сегменты/чемпы)
    for (const obj of sports) {
      const objId = obj.id ?? obj.sportId;
      if (objId == null) continue;

      // Кэшируем справочник спорта без глубокого сравнения
      this.cache.sports.set(objId, obj);

      if (obj.kind === 'sport' && this._matchAllowedSport(obj)) {
        this._allowedSportIds.add(objId);
        this.emit('sport', obj);
      }

      if (obj.kind === 'segment' && this._matchAllowedMatch(obj)) {
        this.allowedMathesIds.add(objId);
        this.emit('sport', obj);
      }
    }

    // Прединдексация коэффициентов по id события
    const factorsByEventId = new Map();
    for (const cf of customFactors) {
      if (cf && cf.e != null) {
        factorsByEventId.set(cf.e, cf);
      }
    }

    // Обработка событий
    const allowedEventIds = new Set();
    const eventsToInsert = [];

    for (const ev of events) {
      const sportId = ev.sportId ?? ev.kindId ?? ev.sport ?? null;
      if (!this.allowedMathesIds.has(sportId) || ev.level !== 1) continue;

      const evId = ev.id ?? ev.eventId;
      if (evId == null) continue;

      // Если событие уже есть в кэше — считаем, что уже обрабатывали
      if (this.cache.events.has(evId)) {
        continue;
      }

      // Получаем название вида спорта и турнира
      let sportName = '';
      let tournamentName = '';
      const sportObj = this.cache.sports.get(sportId);

      if (sportObj && sportObj.kind === 'segment') {
        // Если это сегмент, ищем родительский спорт
        const parentSport = this.cache.sports.get(sportObj.parentId);
        if (parentSport && parentSport.kind === 'sport') {
          sportName = parentSport.name;
          tournamentName = sportObj.name;
        }
      } else if (sportObj && sportObj.kind === 'sport') {
        sportName = sportObj.name;
        tournamentName = '';
      }

      const eventObj = new EventModel({
        id: evId,
        sport: sportName,
        tournament: tournamentName,
        team1: ev.team1,
        team2: ev.team2,
        startTime: ev.startTime || ev.start || '',
        outcome1: undefined,
        outcomeX: undefined,
        outcome2: undefined,
        status: ev.status ?? null
      });

      // Коэффициенты ищем в прединдексированной карте
      const factor = factorsByEventId.get(evId);
      if (factor && Array.isArray(factor.factors)) {
        for (const f of factor.factors) {
          if (f.f === 921) eventObj.outcome1 = f.v; // победа 1
          if (f.f === 922) eventObj.outcomeX = f.v; // ничья (если есть)
          if (f.f === 923) eventObj.outcome2 = f.v; // победа 2
        }
      }

      // Применяем бизнес-фильтр по виду спорта/турниру/игрокам
      if (!this._eventMatchesFilter({
        sportName,
        tournamentName,
        team1: eventObj.team1,
        team2: eventObj.team2
      })) {
        // Всё равно кэшируем базовую инфу, чтобы второй раз не разбирать это событие
        this.cache.events.set(evId, ev);
        continue;
      }

      // В БД пишем только валидные события
      if (eventObj.isValid()) {
        this.cache.events.set(evId, ev);
        allowedEventIds.add(evId);
        eventsToInsert.push(eventObj);
        this.emit('event', ev);
      }
    }

    // Пакетное сохранение в БД (INSERT OR IGNORE, чтобы не ловить дубль по PRIMARY KEY)
    if (eventsToInsert.length > 0) {
      const db = await dbPromise;
      await db.exec('BEGIN');
      try {
        const stmt = await db.prepare(
          'INSERT OR IGNORE INTO events (id, sport, tournament, team1, team2, startTime, outcome1, outcomeX, outcome2) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );

        for (const e of eventsToInsert) {
          await stmt.run(
            e.id,
            e.sport,
            e.tournament,
            e.team1,
            e.team2,
            e.startTime,
            e.outcome1,
            e.outcomeX,
            e.outcome2
          );
        }

        await stmt.finalize();
        await db.exec('COMMIT');
      } catch (err) {
        await db.exec('ROLLBACK');
        this.emit('error', err);
      }
    }

    // Обработка маркетов
    for (const m of markets) {
      const mId = m.id;
      if (mId == null) continue;
      // Кэшируем маркет без глубокого сравнения и сразу эмитим событие
      this.cache.markets.set(mId, m);
      this.emit('market', m);
    }

    // Обработка коэффициентов (для событий, прошедших фильтрацию)
    for (const f of customFactors) {
      if (!f || !allowedEventIds.has(f.e)) continue;

      // Кэшируем коэффициенты без глубокого сравнения
      this.cache.factors.set(f.e, f);

      let com1 = '';
      let com2 = '';
      let comx = '';
      if (Array.isArray(f.factors)) {
        for (const factor of f.factors) {
          if (factor.f === 921) com1 = factor.v;
          if (factor.f === 922) comx = factor.v;
          if (factor.f === 923) com2 = factor.v;
        }
      }
      this.emit('factor', `${f.e} ${com1} ${comx} ${com2}`);
    }

    // Обработка удалённых объектов
    for (const id of deleted) {
      this.cache.events.delete(id);
      this.cache.factors.delete(id);
      this.emit('delete', id);
    }

    // Краткая сводка по пакету
    this.emit('update', {
      sports: sports.length,
      events: allowedEventIds.size,
      markets: markets.length,
      factors: customFactors.filter(f => f && allowedEventIds.has(f.e)).length,
      deleted: deleted?.length || 0,
      packetVersion: data.packetVersion
    });
  }
}

// Пример запуска (если файл запущен напрямую)
//if (isRunDirectly) {
  const stream = new FonbetStream({ pollInterval: 5000 });

  console.log('Запуск: фильтруем Футбол (топ-чемпы), Хоккей (КХЛ/ВХЛ/NHL/AHL) и Теннис (топ-игроки)');

  stream.on('sport', s => console.log('[sport ]', s.name));
  stream.on('event', e => console.log('[event ]', `${e.sport} / ${e.tournament} | ${e.team1} – ${e.team2}`));
  stream.on('factor', f => console.log('[factor]', f));
  stream.on('update', info => console.log('[batch ]', info));
  stream.on('error', console.error);

  stream.start();
//}
