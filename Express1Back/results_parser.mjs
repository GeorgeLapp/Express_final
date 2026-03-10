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

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .trim();
}

function parseScorePart(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  const parsed = parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function toScoreString(score1, score2) {
  const left = parseScorePart(score1);
  const right = parseScorePart(score2);

  if (!Number.isFinite(left) || !Number.isFinite(right)) {
    return '';
  }

  return `${left}:${right}`;
}

function isHockeyText(value) {
  const text = normalizeText(value);
  if (!text) return false;
  return text.includes('хоккей') || text.includes('hockey') || text.includes('ice hockey');
}

function getSubScores(misc) {
  if (Array.isArray(misc?.subScores)) return misc.subScores;
  if (Array.isArray(misc?.subscores)) return misc.subscores;
  return [];
}

function getSubScoreValue(subScore, primaryKey, fallbackKey) {
  if (typeof subScore?.[primaryKey] !== 'undefined') {
    return subScore[primaryKey];
  }
  return subScore?.[fallbackKey];
}

function parseSubScoreIndex(subScore) {
  const rawIndex = typeof subScore?.scoreIndex !== 'undefined'
    ? subScore.scoreIndex
    : subScore?.kindId;
  return parseScorePart(rawIndex);
}

function extractRegularTimeHockeyScore(misc) {
  const subScores = getSubScores(misc);
  if (!subScores.length) return '';

  const regularIndexSet = new Set([16, 17, 18]);

  let byIndexScore1 = 0;
  let byIndexScore2 = 0;
  let byIndexCount = 0;

  for (const subScore of subScores) {
    const scoreIndex = parseSubScoreIndex(subScore);
    if (!regularIndexSet.has(scoreIndex)) continue;

    const s1 = parseScorePart(getSubScoreValue(subScore, 'score1', 'c1'));
    const s2 = parseScorePart(getSubScoreValue(subScore, 'score2', 'c2'));
    if (!Number.isFinite(s1) || !Number.isFinite(s2)) continue;

    byIndexScore1 += s1;
    byIndexScore2 += s2;
    byIndexCount += 1;
  }

  if (byIndexCount > 0) {
    return `${byIndexScore1}:${byIndexScore2}`;
  }

  let byNameScore1 = 0;
  let byNameScore2 = 0;
  let byNameCount = 0;

  for (const subScore of subScores) {
    const title = normalizeText(subScore?.title || subScore?.kindName);
    if (!title.includes('период')) continue;
    if (title.includes('оверт') || title.includes('буллит') || title.includes('shootout')) {
      continue;
    }

    const s1 = parseScorePart(getSubScoreValue(subScore, 'score1', 'c1'));
    const s2 = parseScorePart(getSubScoreValue(subScore, 'score2', 'c2'));
    if (!Number.isFinite(s1) || !Number.isFinite(s2)) continue;

    byNameScore1 += s1;
    byNameScore2 += s2;
    byNameCount += 1;
  }

  if (byNameCount > 0) {
    return `${byNameScore1}:${byNameScore2}`;
  }

  return '';
}

function eventLooksLikeHockey(event) {
  if (!event || typeof event !== 'object') return false;

  if (isHockeyText(event?.sport?.name)) return true;
  if (isHockeyText(event?.sport?.caption)) return true;

  const textFields = [
    event.sportName,
    event.sportCaption,
    event.sportTitle,
    event.sportAlias,
    event.sportKindName,
    event.kindName,
    event.scoreFunction,
    event.sport
  ];

  return textFields.some(isHockeyText);
}

function miscLooksLikeHockey(misc) {
  if (isHockeyText(misc?.scoreFunction)) return true;

  const subScores = getSubScores(misc);
  if (!subScores.length) return false;

  for (const subScore of subScores) {
    const scoreIndex = parseSubScoreIndex(subScore);
    if ([16, 17, 18].includes(scoreIndex)) {
      return true;
    }

    const title = normalizeText(subScore?.title || subScore?.kindName);
    if (!title) continue;
    if (title.includes('период') || title.includes('оверт') || title.includes('буллит')) {
      return true;
    }
  }

  return false;
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
    const hockeyById = new Map();
    for (const ev of allEvents) {
      if (ev.id && typeof ev.status !== 'undefined') {
        statusById.set(String(ev.id), ev.status);
      }
      if (ev?.id != null) {
        hockeyById.set(String(ev.id), eventLooksLikeHockey(ev));
      }
    }

    const scoresById = new Map();
    for (const misc of allMiscs) {
      if (misc?.id == null) continue;

      const id = String(misc.id);
      const defaultScore = toScoreString(misc.score1, misc.score2);
      const isHockey = hockeyById.get(id) === true || miscLooksLikeHockey(misc);
      const regularTimeScore = isHockey ? extractRegularTimeHockeyScore(misc) : '';
      const score = regularTimeScore || defaultScore;

      if (score) {
        scoresById.set(id, score);
      }
    }

    const dbEvents = await db.all('SELECT id, results, status, winning_outcome FROM events');
    let updated = 0;

    for (const row of dbEvents) {
      const id = String(row.id);
      const scoreStr = scoresById.get(id);
      const rawStatus = statusById.get(id);
      let touched = false;
      let currentResults = row.results;
      let effectiveStatus = row.status;

      if (scoreStr && row.results !== scoreStr) {
        await db.run('UPDATE events SET results = ? WHERE id = ?', scoreStr, id);
        currentResults = scoreStr;
        touched = true;
      }

      if (typeof rawStatus !== 'undefined') {
        const normalized = normalizeStatus(rawStatus);
        effectiveStatus = normalized;
        if (row.status !== normalized) {
          await db.run('UPDATE events SET status = ? WHERE id = ?', normalized, id);
          touched = true;
        }
      }

      if (effectiveStatus === 'finished') {
        const winningOutcome = calcWinningOutcome(currentResults);
        if (winningOutcome && row.winning_outcome !== winningOutcome) {
          await db.run(
            'UPDATE events SET winning_outcome = ? WHERE id = ?',
            winningOutcome,
            id
          );
          touched = true;
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
