// Fonbet Streaming Parser на ECMAScript с русскими комментариями
import { EventEmitter } from 'events';
import path from 'path';
import { fileURLToPath } from 'url';
import { EventModel } from './EventModel.mjs';
import { initDB } from './db.mjs';
let fetchFn;
const __filename = fileURLToPath(import.meta.url);
const isRunDirectly = process.argv[1] === __filename;
try {
  fetchFn = fetch;
} catch (_) {
  fetchFn = (...args) => import('node-fetch').then(mod => mod.default(...args));
}

let dbPromise = initDB();

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
      sports: new Map(),
      events: new Map(),
      markets: new Map(),
      factors: new Map()
    };

    this._allowedSportIds = new Set();
    this.allowedMathesIds = new Set();
  }

  // Запуск постоянного опроса
  start () {
    if (this._timer) return;
    this._tick();
  }

  // Остановка опроса
  stop () {
    if (this._timer) clearTimeout(this._timer);
    this._timer = null;
  }

  // Единичный запрос данных
  async _tick () {
    try {
      const url = `https://${this.host}/events/list?lang=${this.lang}&version=${this._version}&scopeMarket=${this.scopeMarket}`;
      const res = await fetchFn(url, { timeout: 10000 });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const json = await res.json();
      this._process(json);
      this._version = json.packetVersion;
    } catch (err) {
      this.emit('error', err);
    } finally {
      this._timer = setTimeout(() => this._tick(), this.pollInterval);
    }
  }

  // Проверка: входит ли вид спорта в фильтр
  _matchAllowedSport (sportObj) {
    return this.sportsFilter.has(String(sportObj.name).toLowerCase());
  }

  // Проверка: входит ли матч в нужный сегмент
  _matchAllowedMatch (sportObj) {
    return this._allowedSportIds.has(sportObj.parentId);
  }

  // Основная обработка пакета данных
  async _process (data) {
    const { sports = [], events = [], markets = [], customFactors = [], deleted = [] } = data;

    // Обработка и фильтрация справочника спорта
    for (const obj of sports) {
      const objId = obj.id ?? obj.sportId;
      const prev = this.cache.sports.get(objId);
      const changed = !prev || JSON.stringify(prev) !== JSON.stringify(obj);
      if (changed) this.cache.sports.set(objId, obj);

      if (obj.kind === 'sport' && this._matchAllowedSport(obj)) {
        this._allowedSportIds.add(objId);
        this.emit('sport', obj);
      }

      if (obj.kind === 'segment' && this._matchAllowedMatch(obj)) {
        this.allowedMathesIds.add(objId);
        this.emit('sport', obj);
      }
    }

    // Обработка событий
    const allowedEventIds = new Set();
    for (const ev of events) {
      const sportId = ev.sportId ?? ev.kindId ?? ev.sport ?? null;
      if (!this.allowedMathesIds.has(sportId) || ev.level !== 1) continue;
      const evId = ev.id ?? ev.eventId;
      allowedEventIds.add(evId);

      const prev = this.cache.events.get(evId);
      const changed = !prev || JSON.stringify(prev) !== JSON.stringify(ev);
      if (changed) {
        this.cache.events.set(evId, ev);
        this.emit('event', ev);
        // --- Сохраняем событие в БД ---
        // Получаем название вида спорта
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
          outcome2: undefined
        });
        // Коэффициенты ищем в customFactors
        const factor = customFactors.find(f => f.e === evId);
        if (factor && Array.isArray(factor.factors)) {
          for (const f of factor.factors) {
            if (f.f === 921) eventObj.outcome1 = f.v;
            if (f.f === 922) eventObj.outcome2 = f.v;
            if (f.f === 923) eventObj.outcomeX = f.v;
          }
        }
        // Для тенниса переносим outcomeX в outcome2
        if (sportName && sportName.toLowerCase() === 'теннис') {
          eventObj.outcome2 = eventObj.outcomeX;
          eventObj.outcomeX = undefined;
        }
        if (eventObj.isValid()) {
          const db = await dbPromise;
          // Проверяем, есть ли уже такое событие
          const exists = await db.get('SELECT id FROM events WHERE id = ?', eventObj.id);
          if (!exists) {
            await db.run(
              'INSERT INTO events (id, sport, tournament, team1, team2, startTime, outcome1, outcomeX, outcome2) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
              eventObj.id, eventObj.sport, eventObj.tournament, eventObj.team1, eventObj.team2, eventObj.startTime, eventObj.outcome1, eventObj.outcomeX, eventObj.outcome2
            );
          }
        }
        // --- конец блока сохранения ---
      }
    }

    // Обработка маркетов
    for (const m of markets) {
      const mId = m.id;
      const prev = this.cache.markets.get(mId);
      const changed = !prev || JSON.stringify(prev) !== JSON.stringify(m);
      if (changed) {
        this.cache.markets.set(mId, m);
        this.emit('market', m);
      }
    }

    // Обработка коэффициентов
    for (const f of customFactors) {
      if (!allowedEventIds.has(f.e)) continue;
      const prev = this.cache.factors.get(f.e);
      const changed = !prev || JSON.stringify(prev) !== JSON.stringify(f);
      if (changed) {
        this.cache.factors.set(f.e, f);
        let com1 = '', com2 = '', comx = '';
        for (const factor of f.factors) {
          if (factor.f === 921) com1 = factor.v;
          if (factor.f === 922) com2 = factor.v;
          if (factor.f === 923) comx = factor.v;
        }
        this.emit('factor', `${f.e} ${com1} ${comx} ${com2}`);
      }
    }

    // Обработка удалённых объектов
    for (const id of deleted) {
      this.cache.events.delete(id);
      this.cache.factors.delete(id);
      this.emit('delete', id);
    }

    this.emit('update', {
      sports: sports.length,
      events: allowedEventIds.size,
      markets: markets.length,
      factors: customFactors.filter(f => allowedEventIds.has(f.e)).length,
      deleted: deleted?.length || 0,
      packetVersion: data.packetVersion
    });
  }
}

// Пример запуска (если файл запущен напрямую)
if (isRunDirectly) {
  const stream = new FonbetStream({ pollInterval: 5000 });

  console.log('Запуск: фильтруем только Футбол, Теннис, Хоккей');

  stream.on('sport', s => console.log('[sport ]', s.name));
  stream.on('event', e => console.log('[event ]', `${e.team1} – ${e.team2}`));
  stream.on('factor', f => console.log('[factor]', f));
  stream.on('update', info => console.log('[batch ]', info));
  stream.on('error', console.error);
  stream.start();
}