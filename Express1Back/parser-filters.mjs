import fs from 'fs';
import path from 'path';

const FILTER_FILE_NAME = 'parser-filters.txt';
const SECTION_NAMES = new Set(['FOOTBALL', 'HOCKEY', 'TENNIS']);

// Fallback defaults are used if a section is accidentally removed or left empty.
const DEFAULT_FILTERS_TEXT = String.raw`
[FOOTBALL]
Германия. Бундеслига. Сезон 25/26
ИСПАНИЯ. ПРИМЕРА ДИВИЗИОН/СЕЗОН 25/26
ИТАЛИЯ. СЕРИЯ А/СЕЗОН 25/26
Россия. Премьер-Лига. Сезон 25/26
Англия. Премьер-Лига. Сезон 25/26
Аргентина/Премьер-Лига
Бразилия/Серия А

[HOCKEY]
КХЛ/Регулярный сезон
НХЛ/Регулярный сезон

[TENNIS]
Д. Медведев \ D.Medvedev
А. Рублев \ A. Rublev
А. Зверев \ A. Zverev
К. Алькарас \ C. Alkaraz
Н. Джокович \ N. Djokovic
Я. Синнер \ J. Sinner
А. Соболенко \ A. Sobolenko
Е. Рыбакина \ E.Rybakina
И. Швентек \ I. Sventek
А. Де Минаур \ A. De Minaur
Х. Мунар \ H. Munar
Меньшик \ J.Menshik
Бублик \ A. Bublik
`;

export function normalizeSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[.,/\\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseFiltersText(text) {
  const sections = {
    FOOTBALL: [],
    HOCKEY: [],
    TENNIS: []
  };

  let activeSection = '';
  const lines = String(text || '').split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#') || line.startsWith('//') || line.startsWith(';')) {
      continue;
    }

    const sectionMatch = line.match(/^\[([A-Z_]+)\]$/i);
    if (sectionMatch) {
      const sectionName = String(sectionMatch[1] || '').toUpperCase();
      activeSection = SECTION_NAMES.has(sectionName) ? sectionName : '';
      continue;
    }

    if (!activeSection) {
      continue;
    }

    sections[activeSection].push(line);
  }

  const footballTournaments = new Set(
    sections.FOOTBALL
      .map(normalizeSearchText)
      .filter(Boolean)
  );

  const hockeyTournaments = new Set(
    sections.HOCKEY
      .map(normalizeSearchText)
      .filter(Boolean)
  );

  const tennisPlayers = new Set(
    sections.TENNIS
      .flatMap(line => line.split(/[\\|]/g))
      .map(name => normalizeSearchText(name))
      .filter(Boolean)
  );

  return {
    footballTournaments,
    hockeyTournaments,
    tennisPlayers
  };
}

function applyFallbackIfNeeded(parsedFilters) {
  const fallback = parseFiltersText(DEFAULT_FILTERS_TEXT);
  const warnings = [];

  const footballTournaments = parsedFilters.footballTournaments.size
    ? parsedFilters.footballTournaments
    : fallback.footballTournaments;

  if (!parsedFilters.footballTournaments.size) {
    warnings.push('Секция [FOOTBALL] пустая: применены дефолтные фильтры.');
  }

  const hockeyTournaments = parsedFilters.hockeyTournaments.size
    ? parsedFilters.hockeyTournaments
    : fallback.hockeyTournaments;

  if (!parsedFilters.hockeyTournaments.size) {
    warnings.push('Секция [HOCKEY] пустая: применены дефолтные фильтры.');
  }

  const tennisPlayers = parsedFilters.tennisPlayers.size
    ? parsedFilters.tennisPlayers
    : fallback.tennisPlayers;

  if (!parsedFilters.tennisPlayers.size) {
    warnings.push('Секция [TENNIS] пустая: применены дефолтные фильтры.');
  }

  return {
    footballTournaments: new Set(footballTournaments),
    hockeyTournaments: new Set(hockeyTournaments),
    tennisPlayers: new Set(tennisPlayers),
    warnings
  };
}

function resolveFiltersFilePath({ baseDir, filePath }) {
  if (filePath) {
    return path.resolve(filePath);
  }

  const effectiveBaseDir = baseDir || process.cwd();
  return path.join(effectiveBaseDir, FILTER_FILE_NAME);
}

function ensureFiltersFileExists(filtersFilePath) {
  if (fs.existsSync(filtersFilePath)) {
    return;
  }

  const dirName = path.dirname(filtersFilePath);
  fs.mkdirSync(dirName, { recursive: true });
  fs.writeFileSync(filtersFilePath, DEFAULT_FILTERS_TEXT.trim() + '\n', 'utf8');
}

export function loadParserFilters({ baseDir, filePath } = {}) {
  const resolvedPath = resolveFiltersFilePath({ baseDir, filePath });
  ensureFiltersFileExists(resolvedPath);

  const text = fs.readFileSync(resolvedPath, 'utf8');
  const parsed = parseFiltersText(text);
  const safe = applyFallbackIfNeeded(parsed);

  return {
    filePath: resolvedPath,
    footballTournaments: safe.footballTournaments,
    hockeyTournaments: safe.hockeyTournaments,
    tennisPlayers: safe.tennisPlayers,
    warnings: safe.warnings
  };
}
