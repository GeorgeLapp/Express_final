import { initDB } from './db.mjs';
import fetch from 'node-fetch';

const lang = process.env.FONBET_RESULTS_LANG || 'ru';
const packetVersion = process.env.FONBET_RESULTS_PACKET_VERSION || '';
const scopeMarket = Number(process.env.FONBET_RESULTS_SCOPE_MARKET || 1600);
const requestTimeoutMs = Number(process.env.FONBET_RESULTS_TIMEOUT_MS || 12000);
const requestRetries = Number(process.env.FONBET_RESULTS_RETRIES || 2);
const parserIntervalMs = Number(process.env.RESULTS_PARSER_INTERVAL_MS || 5 * 60 * 1000);
const unresolvedLookbackDays = Number(process.env.RESULTS_UNRESOLVED_LOOKBACK_DAYS || 14);
const maxLineDatesPerRun = Number(process.env.RESULTS_MAX_LINE_DATES_PER_RUN || 6);

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

function asPositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

const effectiveUnresolvedLookbackDays = asPositiveInt(unresolvedLookbackDays, 14);
const effectiveMaxLineDatesPerRun = asPositiveInt(maxLineDatesPerRun, 6);

function getLineDate(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function toLineDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '';
  }
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function parseStartTimeToMs(rawStartTime) {
  const parsed = Number(rawStartTime);
  if (!Number.isFinite(parsed) || parsed <= 0) return NaN;
  return parsed > 1e12 ? Math.trunc(parsed) : Math.trunc(parsed * 1000);
}

function getLineDateFromStartTime(rawStartTime) {
  const startMs = parseStartTimeToMs(rawStartTime);
  if (!Number.isFinite(startMs)) return '';
  return toLineDate(new Date(startMs));
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
  const normalized = String(rawStatus ?? '').trim().toLowerCase();
  if (rawStatus === 1 || normalized === '1' || normalized === 'live') return 'live';
  if (
    rawStatus === 2 ||
    normalized === '2' ||
    normalized === 'finished' ||
    normalized === 'ended' ||
    normalized === 'completed' ||
    normalized === 'settled' ||
    normalized === 'closed'
  ) {
    return 'finished';
  }
  return normalized;
}

function getStatusPriority(status) {
  if (status === 'finished') return 3;
  if (status === 'live') return 2;
  if (status) return 1;
  return 0;
}

async function collectLineDates(db) {
  const lineDates = new Set([getLineDate(0), getLineDate(-1)]);
  const unresolvedDateCandidates = new Set();

  const nowMs = Date.now();
  const lookbackMs = effectiveUnresolvedLookbackDays * 24 * 60 * 60 * 1000;
  const minStartMs = nowMs - lookbackMs;

  const unresolvedRows = await db.all(`
    SELECT DISTINCT startTime
    FROM events
    WHERE (winning_outcome IS NULL OR TRIM(winning_outcome) = '')
      AND startTime IS NOT NULL
      AND TRIM(CAST(startTime AS TEXT)) <> ''
  `);

  for (const row of unresolvedRows) {
    const startMs = parseStartTimeToMs(row.startTime);
    if (!Number.isFinite(startMs)) continue;
    if (startMs > nowMs) continue;
    if (startMs < minStartMs) continue;

    const lineDate = getLineDateFromStartTime(row.startTime);
    if (lineDate) {
      unresolvedDateCandidates.add(lineDate);
    }
  }

  const sortedCandidates = Array.from(unresolvedDateCandidates).sort((a, b) => b.localeCompare(a));
  for (const lineDate of sortedCandidates) {
    if (lineDates.size >= effectiveMaxLineDatesPerRun) break;
    lineDates.add(lineDate);
  }

  return Array.from(lineDates).sort((a, b) => b.localeCompare(a));
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

    const lineDates = await collectLineDates(db);
    const settled = await Promise.allSettled(lineDates.map(lineDate => fetchResultsForDate(lineDate)));

    const datasets = settled
      .filter(item => item.status === 'fulfilled')
      .map(item => item.value);

    settled.forEach((item, index) => {
      if (item.status !== 'rejected') return;
      const code = getErrorCode(item.reason) || item.reason?.name || 'UNKNOWN';
      const lineDate = lineDates[index] || 'unknown';
      console.warn(
        `[results-parser] transient fetch error lineDate=${lineDate} code=${code}: ${item.reason?.message || item.reason}`
      );
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
        const id = String(ev.id);
        const normalizedStatus = normalizeStatus(ev.status);
        const prevStatus = statusById.get(id);
        if (
          typeof prevStatus === 'undefined' ||
          getStatusPriority(normalizedStatus) >= getStatusPriority(prevStatus)
        ) {
          statusById.set(id, normalizedStatus);
        }
      }
      if (ev?.id != null) {
        const id = String(ev.id);
        if (!hockeyById.has(id)) {
          hockeyById.set(id, eventLooksLikeHockey(ev));
        }
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

      if (score && !scoresById.has(id)) {
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
        effectiveStatus = rawStatus;
        if (row.status !== rawStatus) {
          await db.run('UPDATE events SET status = ? WHERE id = ?', rawStatus, id);
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
    console.log(
      `[${now.toLocaleString()}] updated events=${updated}, lineDates=${lineDates.join(',')}`
    );
  } catch (err) {
    const code = getErrorCode(err) || err?.name || 'UNKNOWN';
    console.error(`[results-parser] Ошибка парсера code=${code}:`, err?.message || err);
  } finally {
    setTimeout(runParser, parserIntervalMs);
  }
}

runParser();

