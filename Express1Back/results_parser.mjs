import { initDB } from './db.mjs';
import fetch from 'node-fetch';

const lang = process.env.FONBET_RESULTS_LANG || 'ru';
const packetVersion = process.env.FONBET_RESULTS_PACKET_VERSION || '';
const scopeMarket = Number(process.env.FONBET_RESULTS_SCOPE_MARKET || 1600);
const requestTimeoutMs = Number(process.env.FONBET_RESULTS_TIMEOUT_MS || 12000);
const requestRetries = Number(process.env.FONBET_RESULTS_RETRIES || 2);
const parserIntervalMs = Number(process.env.RESULTS_PARSER_INTERVAL_MS || 5 * 60 * 1000);

const resultHosts = (process.env.FONBET_RESULTS_HOSTS || 'clientsapi04w.bk6bba-resources.com')
  .split(',')
  .map(v => v.trim())
  .filter(Boolean);

const RETRYABLE_CODES = new Set([
  'EAI_AGAIN',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'ECONNREFUSED'
]);

const dbPromise = initDB();

function getLineDate(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getErrorCode(err) {
  return err?.code || err?.cause?.code || '';
}

function isRetryableError(err) {
  if (!err) return false;
  if (err.name === 'AbortError') return true;
  return RETRYABLE_CODES.has(getErrorCode(err));
}

function buildResultsUrl(host, lineDate) {
  const params = new URLSearchParams({
    lang,
    lineDate,
    scopeMarket: String(scopeMarket)
  });

  if (packetVersion) {
    params.set('packetVersion', packetVersion);
  }

  return `https://${host}/results/v2/getByDate?${params.toString()}`;
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchResultsForDate(lineDate) {
  let lastError = null;

  for (const host of resultHosts) {
    for (let attempt = 0; attempt <= requestRetries; attempt++) {
      const url = buildResultsUrl(host, lineDate);

      try {
        const res = await fetchWithTimeout(url);

        if (!res.ok) {
          const snippet = (await res.text()).slice(0, 200).replace(/\s+/g, ' ');
          const httpError = new Error(
            `HTTP ${res.status} ${res.statusText} for ${host}; body=${snippet}`
          );
          httpError.code = `HTTP_${res.status}`;
          httpError.isRetriableStatus = res.status >= 500 || res.status === 429;
          throw httpError;
        }

        return await res.json();
      } catch (err) {
        lastError = err;
        const shouldRetry =
          attempt < requestRetries &&
          (isRetryableError(err) || err?.isRetriableStatus === true);

        if (!shouldRetry) {
          break;
        }

        const delayMs = Math.min(5000, 500 * (attempt + 1));
        await sleep(delayMs);
      }
    }
  }

  throw lastError || new Error('No response from results API');
}

function normalizeStatus(rawStatus) {
  if (rawStatus === 1 || rawStatus === '1') return 'live';
  if (rawStatus === 2 || rawStatus === '2') return 'finished';
  return String(rawStatus);
}

function calcWinningOutcome(scoreString) {
  if (!scoreString || !scoreString.includes(':')) return '';
  const [leftRaw, rightRaw] = scoreString.split(':');
  const score1 = parseInt(leftRaw, 10);
  const score2 = parseInt(rightRaw, 10);

  if (!Number.isFinite(score1) || !Number.isFinite(score2)) return '';
  if (score1 > score2) return 'outcome1';
  if (score1 < score2) return 'outcome2';
  return 'outcomeX';
}

async function runParser() {
  try {
    const db = await dbPromise;

    const settled = await Promise.allSettled([
      fetchResultsForDate(getLineDate(0)),
      fetchResultsForDate(getLineDate(-1))
    ]);

    const datasets = settled
      .filter(item => item.status === 'fulfilled')
      .map(item => item.value);

    settled
      .filter(item => item.status === 'rejected')
      .forEach(item => {
        const code = getErrorCode(item.reason) || item.reason?.name || 'UNKNOWN';
        console.warn(`[results-parser] transient fetch error code=${code}: ${item.reason?.message || item.reason}`);
      });

    if (!datasets.length) {
      throw new Error('No successful responses from results API');
    }

    const allEvents = datasets.flatMap(data => data.events || []);
    const allMiscs = datasets.flatMap(data => data.eventMiscs || []);

    const statusById = new Map();
    for (const ev of allEvents) {
      if (ev.id && typeof ev.status !== 'undefined') {
        statusById.set(String(ev.id), ev.status);
      }
    }

    const scoresById = new Map();
    for (const misc of allMiscs) {
      if (
        misc?.id != null &&
        typeof misc.score1 !== 'undefined' &&
        typeof misc.score2 !== 'undefined'
      ) {
        scoresById.set(String(misc.id), `${misc.score1}:${misc.score2}`);
      }
    }

    const dbEvents = await db.all('SELECT id, results, status FROM events');
    let updated = 0;

    for (const row of dbEvents) {
      const id = String(row.id);
      const scoreStr = scoresById.get(id);
      const rawStatus = statusById.get(id);
      let touched = false;
      let currentResults = row.results;

      if (scoreStr && row.results !== scoreStr) {
        await db.run('UPDATE events SET results = ? WHERE id = ?', scoreStr, Number(row.id));
        currentResults = scoreStr;
        touched = true;
      }

      if (typeof rawStatus !== 'undefined') {
        const normalized = normalizeStatus(rawStatus);
        if (row.status !== normalized) {
          await db.run('UPDATE events SET status = ? WHERE id = ?', normalized, Number(row.id));
          touched = true;

          if (normalized === 'finished') {
            const winningOutcome = calcWinningOutcome(currentResults);
            if (winningOutcome) {
              await db.run(
                'UPDATE events SET winning_outcome = ? WHERE id = ?',
                winningOutcome,
                Number(row.id)
              );
            }
          }
        }
      }

      if (touched) {
        updated += 1;
      }
    }

    const now = new Date();
    console.log(`[${now.toLocaleString()}] Обновлено событий: ${updated}`);
  } catch (err) {
    const code = getErrorCode(err) || err?.name || 'UNKNOWN';
    console.error(`[results-parser] Ошибка парсера code=${code}:`, err?.message || err);
  } finally {
    setTimeout(runParser, parserIntervalMs);
  }
}

runParser();
