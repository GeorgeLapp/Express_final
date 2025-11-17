import { initDB } from './db.mjs';
import fetch from 'node-fetch';

const lang = 'ru';
const packetVersion = '1751704721;55031668694;55031671281;55031671281;55031671098'; // можно менять
// Получить сегодняшнюю дату в формате YYYY-MM-DD
function getLineDate(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
const scopeMarket = 1600;

async function fetchResultsForDate(lineDate) {
  const API_URL = `https://clientsapi04w.bk6bba-resources.com/results/v2/getByDate?lang=${lang}&packetVersion=${encodeURIComponent(packetVersion)}&lineDate=${lineDate}&scopeMarket=${scopeMarket}`;
  const res = await fetch(API_URL);
  if (!res.ok) throw new Error('Ошибка запроса к API');
  return await res.json();
}

async function runParser() {
  try {
    const db = await initDB();
    // Получаем результаты за сегодня и вчера
    const todayData = await fetchResultsForDate(getLineDate(0));
    const yesterdayData = await fetchResultsForDate(getLineDate(-1));
    // Объединяем массивы событий
    const allEvents = [
      ...(todayData.events || []),
      ...(yesterdayData.events || [])
    ];
    const allMiscs = [
      ...(todayData.eventMiscs || []),
      ...(yesterdayData.eventMiscs || [])
    ];
    const dbEvents = await db.all('SELECT id FROM events');
    const uniqueIds = dbEvents.map(e => e.id);
    let updated = 0;
    // 1. Собираем статусы из блока events
    const statusById = new Map();
    for (const ev of allEvents) {
      if (ev.id && typeof ev.status !== 'undefined') {
        statusById.set(String(ev.id), ev.status);
      }
    }
    // 2. Обрабатываем только те, где есть score1/score2
    for (const id of uniqueIds) {
      const result = allMiscs.find(ev => String(ev.id) === String(id) && ev.score1 !== undefined && ev.score2 !== undefined);
      const event = await db.get('SELECT * FROM events WHERE id = ?', Number(id));
      let wasUpdated = false;
      if (event && result) {
        const scoreStr = `${result.score1}:${result.score2}`;
        if (event.results !== scoreStr) {
          await db.run(
            'UPDATE events SET results = ? WHERE id = ?',
            scoreStr,
            Number(id)
          );
          console.log(`Обновлён results для события id=${id}: ${event.results} → ${scoreStr}`);
          wasUpdated = true;
        }
        // Берём статус из statusById
        const rawStatus = statusById.get(String(id));
        console.log(`Проверка статуса для id=${id}: rawStatus=`, rawStatus, 'event.status=', event.status);
        if (typeof rawStatus !== 'undefined') {
          let statusStr = '';
          if (rawStatus === 1 || rawStatus === '1') statusStr = 'live';
          else if (rawStatus === 2 || rawStatus === '2') statusStr = 'finished';
          else statusStr = String(rawStatus);
          console.log(`Сравнение: event.status (${event.status}) !== statusStr (${statusStr})`);
          if (event.status !== statusStr) {
            await db.run(
              'UPDATE events SET status = ? WHERE id = ?',
              statusStr,
              Number(id)
            );
            console.log(`Обновлён status для события id=${id}: ${event.status} → ${statusStr}`);
            wasUpdated = true;
            
            // Вычисляем winning_outcome только если статус = 'finished'
            if (statusStr === 'finished' && event.results) {
              const scores = event.results.split(':');
              const score1 = parseInt(scores[0]);
              const score2 = parseInt(scores[1]);
              let winningOutcome = '';
              if (score1 > score2) {
                winningOutcome = 'outcome1';
              } else if (score1 < score2) {
                winningOutcome = 'outcome2';
              } else {
                winningOutcome = 'outcomeX';
              }
              await db.run(
                'UPDATE events SET winning_outcome = ? WHERE id = ?',
                winningOutcome,
                Number(id)
              );
              console.log(`Обновлён winning_outcome для события id=${id}: ${winningOutcome}`);
            }
          }
        }
        if (wasUpdated) updated++;
      } else if (!event) {
        console.log(`Не найдено событие с id: ${id}`);
      } else if (event && !result) {
        console.log(`Нет score1/score2 для id: ${id}`);
      }
    }
    const now = new Date();
    console.log(`[${now.toLocaleString()}] Обновлено событий: ${updated}`);
  } catch (err) {
    console.error('Ошибка парсера:', err);
  }
  setTimeout(runParser, 5 * 60 * 1000); // 5 минут, всегда срабатывает
}

runParser();