const STORAGE_KEY = "trasovani-reporting-v2";
const API_URL = typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:8080";

async function apiFetch(path, options = {}) {
  const url = path.startsWith("http") ? path : `${API_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const resp = await fetch(url, { credentials: "same-origin", ...options });
  if (resp.status === 401 && !path.includes("/api/auth/")) {
    const next = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
    window.location.href = `/login.html?next=${next}`;
    throw new Error("Nejste přihlášeni");
  }
  return resp;
}
const REGION_CODES = [
  "MSK", "PR/ST", "BR", "PCE/KH", "PL", "Ústí", "Libr",
  "Zlín", "Olomouc", "Vysočina", "České Budějovice",
];

const DEFAULT_FONDY = {
  MSK: 6.5,
  "PR/ST": 6,
  BR: 8,
  "PCE/KH": 5.5,
  PL: 6,
  "Ústí": 5,
  Libr: 6.5,
  Zlín: 6.5,
  Olomouc: 6.5,
  Vysočina: 8,
  "České Budějovice": 6,
};

let overviewPrehled = { rows: [], totals: {}, podklady: [], koeficienty_kraje: [], lokalita_kraje: [] };
let overviewMonthKey = "2026-06";
/** Zaškrtnutí příjemců kopírování – podle jména (ne indexu, stabilní při přerenderu). */
const memberCopySelection = new Set();
/** Označené buňky sloupce Kraj – klíč "row:col". */
const gridRegionSelection = new Set();
let gridRegionAnchor = null;
let gridRegionDragging = false;

const OBDPOBI_SKUPINY = [
  { key: "MSK", nazev: "MSK", lokality: ["MSK"], defaultOd: "2026-06-15", defaultDo: "2026-06-21" },
  { key: "PR/ST+Libr", nazev: "PR/ST+Libr", lokality: ["PR/ST", "Libr"], defaultOd: "2026-06-16", defaultDo: "2026-06-22" },
  { key: "BR", nazev: "BR", lokality: ["BR"], defaultOd: "2026-06-17", defaultDo: "2026-06-23" },
  {
    key: "PAR+PL+ÚST+PCE+HK",
    nazev: "PAR+PL+ÚST+PCE+HK",
    lokality: ["PCE/KH", "PL", "Ústí"],
    defaultOd: "2026-06-11",
    defaultDo: "2026-06-24",
  },
  ...["Zlín", "Olomouc", "Vysočina", "České Budějovice"].map((lok) => ({
    key: lok,
    nazev: lok,
    lokality: [lok],
    defaultOd: "2026-06-01",
    defaultDo: "2026-06-14",
  })),
];

const LOKALITA_KRAJE_DEFAULT = {
  MSK: ["Olomoucký kraj", "Moravskoslezský kraj", "Zlínský kraj"],
  "PR/ST": ["Hlavní město Praha", "Středočeský kraj", "Jihočeský kraj"],
  BR: ["Jihomoravský kraj", "Kraj Vysočina"],
  "PCE/KH": ["Pardubický kraj", "Královéhradecký kraj"],
  PL: ["Plzeňský kraj"],
  "Ústí": ["Ústecký kraj"],
  Libr: ["Liberecký kraj"],
  Zlín: ["Zlínský kraj"],
  Olomouc: ["Olomoucký kraj"],
  Vysočina: ["Kraj Vysočina"],
  "České Budějovice": ["Jihočeský kraj"],
};

const KRAJE_LIST = [
  "Hlavní město Praha", "Jihomoravský kraj", "Kraj Vysočina", "Královéhradecký kraj",
  "Liberecký kraj", "Moravskoslezský kraj", "Olomoucký kraj", "Pardubický kraj",
  "Plzeňský kraj", "Středočeský kraj", "Ústecký kraj", "Zlínský kraj", "Jihočeský kraj",
];

// Z Excelu Přehled MONTÁŽE – pouze měsíce 7 (čvc), 8 (srp), 9 (zář) roku 2025/2026
const DEFAULT_KOEF_2026 = {
  "Hlavní město Praha": { 7: 1.502641, 8: 1.496767, 9: 1.446809 },
  "Jihomoravský kraj": { 7: 1.618608, 8: 1.578311, 9: 1.369667 },
  "Kraj Vysočina": { 7: 2.375, 8: 1.954545, 9: 3.0 },
  "Královéhradecký kraj": { 7: 1.673171, 8: 1.941957, 9: 2.145385 },
  "Liberecký kraj": { 7: 1.85, 8: 1.79, 9: 1.363636 },
  "Moravskoslezský kraj": { 7: 1.775093, 8: 1.872298, 9: 1.917317 },
  "Olomoucký kraj": { 7: 1.942857, 8: 1.807692, 9: 1.846154 },
  "Pardubický kraj": { 7: 1.768095, 8: 1.94, 9: 1.875 },
  "Plzeňský kraj": { 7: 1.795634, 8: 1.744247, 9: 1.541667 },
  "Středočeský kraj": { 7: 1.830699, 8: 1.873278, 9: 1.532658 },
  "Ústecký kraj": { 7: 2.221519, 8: 2.043269, 9: 2.15625 },
  "Zlínský kraj": { 7: 1.909091, 8: 2.022727, 9: 1.954545 },
  "Jihočeský kraj": { 7: 1.0, 8: 1.625, 9: 1.666667 },
};

const MONTHS_2026 = [
  { key: "2026-01", label: "Leden 2026", month: 1 },
  { key: "2026-02", label: "Únor 2026", month: 2 },
  { key: "2026-03", label: "Březen 2026", month: 3 },
  { key: "2026-04", label: "Duben 2026", month: 4 },
  { key: "2026-05", label: "Květen 2026", month: 5 },
  { key: "2026-06", label: "Červen 2026", month: 6 },
  { key: "2026-07", label: "Červenec 2026", month: 7 },
  { key: "2026-08", label: "Srpen 2026", month: 8 },
  { key: "2026-09", label: "Září 2026", month: 9 },
  { key: "2026-10", label: "Říjen 2026", month: 10 },
  { key: "2026-11", label: "Listopad 2026", month: 11 },
  { key: "2026-12", label: "Prosinec 2026", month: 12 },
];

const defaultJuneRows = [
  { date: "2026-06-01", monterHours: 172.63, collected: 0, montageCount: 106, avgPerDay: 3.79, reason: "" },
  { date: "2026-06-02", monterHours: 165.64, collected: 0, montageCount: 109, avgPerDay: 3.89, reason: "" },
  { date: "2026-06-03", monterHours: 169.88, collected: 0, montageCount: 113, avgPerDay: 4.04, reason: "" },
  { date: "2026-06-04", monterHours: 181.34, collected: 0, montageCount: 114, avgPerDay: 4.22, reason: "" },
  { date: "2026-06-05", monterHours: 200.56, collected: 0, montageCount: 102, avgPerDay: 3.52, reason: "" },
  { date: "2026-06-08", monterHours: 225.29, collected: 0, montageCount: 113, avgPerDay: 3.9, reason: "" },
  { date: "2026-06-09", monterHours: 213.65, collected: 0, montageCount: 97, avgPerDay: 3.59, reason: "" },
  { date: "2026-06-10", monterHours: 207.85, collected: 0, montageCount: 104, avgPerDay: 3.71, reason: "" },
  { date: "2026-06-11", monterHours: 210.44, collected: 0, montageCount: 105, avgPerDay: 3.89, reason: "" },
  { date: "2026-06-12", monterHours: 199.58, collected: 0, montageCount: 97, avgPerDay: 3.46, reason: "" },
  { date: "2026-06-15", monterHours: 170.74, collected: 0, montageCount: 94, avgPerDay: 3.48, reason: "Adel řeší" },
  { date: "2026-06-16", monterHours: 113.5, collected: 0, montageCount: 51, avgPerDay: 2.22, reason: "" },
  { date: "2026-06-17", monterHours: 134.34, collected: 0, montageCount: 54, avgPerDay: 2.45, reason: "" },
  { date: "2026-06-18", monterHours: 125.55, collected: 0, montageCount: 42, avgPerDay: 2, reason: "" },
  { date: "2026-06-19", monterHours: 99.27, collected: 0, montageCount: 32, avgPerDay: 1.6, reason: "" },
  { date: "2026-06-22", monterHours: 80, collected: 0, montageCount: 10, avgPerDay: 1, reason: "" },
  { date: "2026-06-24", monterHours: 61.76, collected: 0, montageCount: 27, avgPerDay: 1.69, reason: "" },
  { date: "2026-06-25", monterHours: 44.13, collected: 0, montageCount: 24, avgPerDay: 1.5, reason: "" },
  { date: "2026-06-26", monterHours: 23.15, collected: 0, montageCount: 11, avgPerDay: 1.83, reason: "" },
  { date: "2026-06-29", monterHours: 57.87, collected: 0, montageCount: 17, avgPerDay: 1.55, reason: "" },
  { date: "2026-06-30", monterHours: 36.51, collected: 0, montageCount: 9, avgPerDay: 1.12, reason: "" },
];

const MONTERI_SEZNAM = [
  "Jaroslav Balog", "Dominik Žihala", "Mirek Truhelka", "Jakub Krejza", "Vojtěch Žihala",
  "Karel Vengřinovič", "Tomáš Bok", "Stanislav Ivanov", "Roman Bek", "Filip Špígl",
  "Viktor Heger", "Adam Blažej", "Martin Strakoš", "Vladimír Novotný", "Petr Griač",
  "Kamil Beneš", "Radomír Ipri", "Arnošt Mynář", "Josef Fojtík", "Rostislav Vjačka",
  "Milan Smutný", "Miroslav Pecháček", "David Vallo", "Jakub Bečvář", "Jiří Dvořák",
  "Michal Kurfiřt", "Roman Marejka", "Jan Lorenc", "Radek Smoček", "René Berger",
  "Martin Bursík", "Petr Orel", "David Dočkal", "Matěj Čerych", "Maksim Dziarabkin",
  "Denis Willert", "Vladimir Chmelík", "Norbert Bider", "Tomáš Nesvačil", "Martin Žák",
  "Daniel Krkoška", "Jakub Fišer", "René Rovňak", "Jan Zemčík", "Lukáš Pospíšil",
  "Ondřej Crha", "Radovan Tesař", "Jan Perlík", "Václav Vála", "Tomáš Stoklasa", "Pavel Čajka",
  "Karel Kretschmann",
];

const defaultState = {
  overviewRows: [
    { from: "2026-06-01", to: "2026-06-07", location: "MSK", plannedHours: 123.5, scheduledHours: 101.05, missingKs: 11.81, orderedNotPlanned: 106, shiftProduction: "NE" },
    { from: "2026-06-01", to: "2026-06-14", location: "PR/ST", plannedHours: 528, scheduledHours: 522.76, missingKs: 3.14, orderedNotPlanned: 29, shiftProduction: "NE" },
    { from: "2026-06-01", to: "2026-06-14", location: "BR", plannedHours: 368, scheduledHours: 294.24, missingKs: 41.75, orderedNotPlanned: 127, shiftProduction: "NE" },
    { from: "2026-06-01", to: "2026-06-14", location: "PCE/KH", plannedHours: 181.5, scheduledHours: 202.62, missingKs: -10.88, orderedNotPlanned: 58, shiftProduction: "NE" },
    { from: "2026-06-01", to: "2026-06-14", location: "PL", plannedHours: 120, scheduledHours: 106.55, missingKs: 0, orderedNotPlanned: 27, shiftProduction: "NE" },
    { from: "2026-06-01", to: "2026-06-14", location: "Ústí", plannedHours: 100, scheduledHours: 105.92, missingKs: 0, orderedNotPlanned: 13, shiftProduction: "NE" },
    { from: "2026-06-01", to: "2026-06-14", location: "Libr", plannedHours: 84.5, scheduledHours: 79.42, missingKs: 0, orderedNotPlanned: 10, shiftProduction: "NE" },
  ],
  months: {
    "2026-06": {
      rows: defaultJuneRows,
      members: [
        { name: "Dominik Žihala", mountedHours: 0, targetFlag: 0, destinationRegion: "MSK", actualFlag: 0 },
        { name: "Jakub Krejza", mountedHours: 0, targetFlag: 0, destinationRegion: "MSK", actualFlag: 0 },
      ],
    },
  },
};

let state = loadState();
let activeMonthKey = "2026-06";
/** Po úspěšném načtení z PostgreSQL je server zdrojem pravdy (ne localStorage). */
let serverMesicLoaded = false;
/** Zabrání duplicitní hlavičce při souběžném renderMonthGrid(). */
let monthGridRenderToken = 0;
/** Ignoruje zastaralou odpověď při rychlém opakovaném načtení měsíce. */
let mesicFetchSeq = 0;

function loadState() {
  // Sdílená data vždy z defaultu + API. localStorage se nepoužívá jako zdroj,
  // ať mají všichni klienti stejný pohled (nezávisle na staré cache).
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem("trasovani-reporting-v1");
  } catch {
    /* ignore */
  }
  return normalizeState(structuredClone(defaultState));
}

function saveState() {
  // Úmyslně neukládáme do localStorage – pravda je v PostgreSQL.
}

const MONTH_LEFT_COLS = 4;
const MEMBER_FIELD_COUNT = 4;

const MONTERI_JMENA = new Set(MONTERI_SEZNAM.map((n) => n.trim().toLowerCase()));

function normName(name) {
  return (name || "").trim().toLowerCase();
}

function isMonterName(name) {
  return MONTERI_JMENA.has(normName(name));
}

function memberHasGridActivity(member) {
  if (sumMemberDailyHours(member) > 0 || Number(member.mountedHours || 0) > 0) return true;
  const cells = member.dailyCells || {};
  return Object.keys(cells).some((date) => isExplicitDayRosterEdit(member, date));
}

/** Montéři v mřížce – řízeno horním seznamem pro daný měsíc. */
function getGridMembers(monthData, monthKey = activeMonthKey) {
  const names = getMonthRosterNames(monthKey);
  if (!names.length) return [];
  const byName = new Map((monthData.members || []).map((m) => [normName(m.name), m]));
  return names.map((name) => byName.get(normName(name)) || createEmptyMonthMember(name));
}

function createEmptyMonthMember(name) {
  return {
    name,
    mountedHours: 0,
    dailyHours: {},
    dailyCells: {},
    targetFlag: 0,
    destinationRegion: "",
    actualFlag: 0,
  };
}

function getMonthRosterNames(monthKey = activeMonthKey) {
  const monthData = state.months[monthKey];
  if (!monthData) return [];
  if (monthData.rosterNames?.length) return [...monthData.rosterNames];
  return (monthData.members || []).map((m) => m.name).filter(Boolean);
}

function deriveRosterNamesFromMesicData(data, memberByName) {
  if (data.roster_configured) {
    return (data.roster || []).map((r) => r.jmeno).filter(Boolean);
  }
  const saved = (data.roster || []).map((r) => r.jmeno).filter(Boolean);
  if (saved.length) return saved;

  const fromApi = (data.members || []).map((m) => m.name).filter(Boolean);
  if (fromApi.length) return fromApi;

  const seen = new Set();
  const fromDaily = [];
  [...(data.daily_roster || [])]
    .sort((a, b) => Number(a.col_index || 0) - Number(b.col_index || 0))
    .forEach((entry) => {
      const name = String(entry.jmeno || "").trim();
      const key = normName(name);
      if (!name || seen.has(key)) return;
      seen.add(key);
      fromDaily.push(name);
    });
  if (fromDaily.length) return fromDaily;

  return Array.from(memberByName.values()).map((m) => m.name).filter(Boolean);
}

function setMonthRosterNames(monthKey, names, { lock = true } = {}) {
  const monthData = ensureMonth(monthKey);
  const unique = [];
  const seen = new Set();
  (names || []).forEach((raw) => {
    const name = String(raw || "").trim();
    const key = normName(name);
    if (!name || seen.has(key)) return;
    seen.add(key);
    unique.push(name);
  });
  monthData.rosterNames = unique;
  const byName = new Map((monthData.members || []).map((m) => [normName(m.name), m]));
  monthData.members = unique.map((name) => byName.get(normName(name)) || createEmptyMonthMember(name));
  monthData.rosterConfigured = Boolean(lock);
  if (lock) recomputeMonthStatsFromRoster(monthData);
}

function showMonthGridError(message) {
  const el = document.getElementById("monthGridError");
  if (!el) return;
  if (message) {
    el.textContent = message;
    el.hidden = false;
  } else {
    el.textContent = "";
    el.hidden = true;
  }
}

function ensureMemberInMonth(monthData, member) {
  let found = monthData.members.find((m) => normName(m.name) === normName(member.name));
  if (!found) {
    found = {
      name: member.name,
      mountedHours: member.mountedHours ?? 0,
      dailyHours: member.dailyHours || {},
      dailyCells: member.dailyCells || {},
      targetFlag: member.targetFlag ?? 0,
      destinationRegion: member.destinationRegion || "MSK",
      actualFlag: member.actualFlag ?? 0,
    };
    monthData.members.push(found);
  }
  return found;
}

function parseMonthKeyParts(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  return { rok: y, mesic: m };
}

function shiftIsoToMonth(iso, rok, mesic) {
  const day = Number(String(iso || "").slice(8, 10)) || 1;
  const last = new Date(rok, mesic, 0).getDate();
  const clamped = Math.min(Math.max(day, 1), last);
  return `${rok}-${String(mesic).padStart(2, "0")}-${String(clamped).padStart(2, "0")}`;
}

function applyKoefFromMonthKey(monthKey) {
  const { rok, mesic } = parseMonthKeyParts(monthKey);
  const mesicEl = document.getElementById("nastavenyMesic");
  const rokEl = document.getElementById("nastavenyRok");
  if (mesicEl) mesicEl.value = String(mesic);
  if (rokEl) rokEl.value = String(rok);
}

function shiftOverviewObdobiToMonth(monthKey) {
  const { rok, mesic } = parseMonthKeyParts(monthKey);
  (overviewPrehled.rows || []).forEach((row) => {
    if (row.od) row.od = shiftIsoToMonth(row.od, rok, mesic);
    if (row.do) row.do = shiftIsoToMonth(row.do, rok, mesic);
  });
  OBDPOBI_SKUPINY.forEach((skupina) => {
    skupina.defaultOd = shiftIsoToMonth(skupina.defaultOd, rok, mesic);
    skupina.defaultDo = shiftIsoToMonth(skupina.defaultDo, rok, mesic);
  });
  renderCiselnikSkupiny();
}

function daysInMonthKey(monthKey) {
  const { rok, mesic } = parseMonthKeyParts(monthKey);
  const last = new Date(rok, mesic, 0).getDate();
  const days = [];
  for (let d = 1; d <= last; d += 1) {
    days.push(`${rok}-${String(mesic).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  return days;
}

function ensureMonthRowsComplete(monthData, monthKey) {
  const days = daysInMonthKey(monthKey);
  const byDate = new Map((monthData.rows || []).map((r) => [r.date, r]));
  monthData.rows = days.map((date) => {
    const old = byDate.get(date) || {};
    return {
      date,
      monterHours: old.monterHours ?? 0,
      montageCount: old.montageCount ?? 0,
      avgPerDay: old.avgPerDay ?? 0,
      collected: old.collected ?? 0,
      reason: old.reason ?? "",
    };
  });
}

function sumMemberDailyHours(member) {
  const daily = member.dailyHours || {};
  return Object.values(daily).reduce((acc, h) => acc + Number(h || 0), 0);
}

/** Montérohodiny technika v konkrétní den (0 = nepracoval). */
function memberHoursOnDay(member, date) {
  const raw = member?.dailyHours?.[date];
  if (raw == null || raw === "") return 0;
  const n = Number(String(raw).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function getMemberDayField(member, date, field) {
  const day = member.dailyCells?.[date];
  const hours = memberHoursOnDay(member, date);
  if (day && Object.prototype.hasOwnProperty.call(day, field)) return day[field];
  if (field === "targetFlag") return hours > 0 ? 1 : 0;
  if (field === "destinationRegion") return hours > 0 ? (member.destinationRegion ?? "") : "";
  if (field === "actualFlag") return hours > 0 ? 1 : 0;
  return "";
}

/** Skutečnost = 1 právě když má technik v daný den montérohodiny (> 0). */
function getMemberDayActual(member, date) {
  return memberHoursOnDay(member, date) > 0 ? 1 : 0;
}

function setMemberDayField(memberIdx, date, field, value) {
  const member = getActiveMonthData().members[memberIdx];
  if (!member) return;
  if (!member.dailyCells) member.dailyCells = {};
  if (!member.dailyCells[date]) member.dailyCells[date] = {};
  member.dailyCells[date][field] = value;
}

function setMemberDayFieldForMember(member, date, field, value) {
  if (!member) return;
  if (!member.dailyCells) member.dailyCells = {};
  if (!member.dailyCells[date]) member.dailyCells[date] = {};
  member.dailyCells[date][field] = value;
}

function gridMemberFromCol(col) {
  const gridIdx = colToMemberIdx(col);
  if (gridIdx == null) return null;
  return getGridMembers(getActiveMonthData())[gridIdx] || null;
}

function ensureMonthIn(months, key) {
  if (!months[key]) {
    months[key] = { rows: [], members: [], rosterNames: [], rosterConfigured: false };
  }
  if (!Array.isArray(months[key].rows)) months[key].rows = [];
  if (!Array.isArray(months[key].members)) months[key].members = [];
  if (!Array.isArray(months[key].rosterNames)) months[key].rosterNames = [];
  months[key].members.forEach((m) => {
    if (!m.dailyHours) m.dailyHours = {};
    if (!m.dailyCells) m.dailyCells = {};
  });
  return months[key];
}

function ensureMonth(key) {
  return ensureMonthIn(state.months, key);
}

function normalizeState(sourceState) {
  const normalized = sourceState;
  if (!normalized.months || typeof normalized.months !== "object") normalized.months = {};
  if (!Array.isArray(normalized.overviewRows)) normalized.overviewRows = [];

  MONTHS_2026.forEach(({ key }) => ensureMonthIn(normalized.months, key));
  Object.values(normalized.months).forEach((monthData) => {
    pruneImplicitDailyRosterCells(monthData);
  });

  return normalized;
}

function recomputeMonthStatsFromRoster(monthData) {
  const members = getGridMembers(monthData);
  (monthData.rows || []).forEach((row) => {
    let hours = 0;
    let working = 0;
    members.forEach((member) => {
      const h = Number(member.dailyHours?.[row.date] || 0);
      if (h > 0) {
        hours += h;
        working += 1;
      }
    });
    row.monterHours = Math.round(hours * 100) / 100;
    if (monthData.rosterConfigured) {
      row.avgPerDay = working ? Math.round((Number(row.montageCount || 0) / working) * 100) / 100 : 0;
    }
  });
}

function getMonthLabel(key) {
  return MONTHS_2026.find((m) => m.key === key)?.label || key;
}

function updateAppMonthBadge() {
  const el = document.getElementById("monthBadge");
  if (!el) return;
  const onMonthTab = document.getElementById("month")?.classList.contains("is-active");
  el.textContent = getMonthLabel(onMonthTab ? activeMonthKey : overviewMonthKey);
}

function getActiveMonthData() {
  return ensureMonth(activeMonthKey);
}

function fmt(num, decimals = 2) {
  return Number(num || 0).toLocaleString("cs-CZ", { maximumFractionDigits: decimals });
}

function renderCards() {
  const t = overviewPrehled.totals || {};
  const overviewCards = document.getElementById("overviewCards");
  if (overviewCards) {
    overviewCards.innerHTML = `
    <div class="card"><p>Počet lokalit</p><h3>${fmt(t.pocet_lokalit || 0, 0)}</h3></div>
    <div class="card"><p>Plán (hod) celkem</p><h3>${fmt(t.plan_celkem || 0)}</h3></div>
    <div class="card"><p>Naplánováno (hod) celkem</p><h3>${fmt(t.naplanovano_celkem || 0)}</h3></div>
    <div class="card"><p>Plnění</p><h3>${fmt((t.plneni || 0) * 100, 1)} %</h3></div>
    <div class="card"><p>Kolik chybí (ks)</p><h3>${fmt(t.kolik_chybi_ks || 0, 2)}</h3></div>
  `;
  }

  const monthData = getActiveMonthData();
  const gridMembers = getGridMembers(monthData);
  const totalMontages = monthData.rows.reduce((acc, row) => acc + Number(row.montageCount || 0), 0);
  const totalHours = monthData.rows.reduce((acc, row) => acc + Number(row.monterHours || 0), 0);
  let activeDayCount = 0;
  gridMembers.forEach((member) => {
    Object.values(member.dailyHours || {}).forEach((h) => {
      if (Number(h || 0) > 0) activeDayCount += 1;
    });
  });

  const monthCards = document.getElementById("monthCards");
  if (!monthCards) return;
  monthCards.innerHTML = `
    <div class="card"><p>Montáže za měsíc</p><h3>${fmt(totalMontages, 0)}</h3></div>
    <div class="card"><p>Montéro-hodiny celkem</p><h3>${fmt(totalHours)}</h3></div>
    <div class="card"><p>Skutečnost (dny s montáží)</p><h3>${fmt(activeDayCount, 0)}</h3></div>
    <div class="card"><p>Technici v mřížce</p><h3>${fmt(gridMembers.length, 0)}</h3></div>
    <div class="card"><p>Průměr montáží / pracovní den</p><h3>${fmt(totalMontages / Math.max(monthData.rows.length, 1), 2)}</h3></div>
  `;
}

function createInput(value, onChange, type = "text", step = "", navMeta = null) {
  const input = document.createElement("input");
  input.type = type;
  if (step) input.step = step;
  input.value = value ?? "";
  input.addEventListener("change", () => onChange(input.value));
  if (navMeta) {
    input.classList.add("grid-nav-input");
    input.dataset.row = String(navMeta.row);
    input.dataset.col = String(navMeta.col);
    input.dataset.field = navMeta.field || "";
  }
  return input;
}

function normalizeRegionCode(val) {
  const code = String(val ?? "").trim();
  if (!code || code === "—" || code === "-") return "";
  return code;
}

/** Text pro Ctrl+C/V + rozbalovací šipka s číselníkem krajů. */
function createGridRegionSelect(value, onChange, navMeta) {
  const wrap = document.createElement("div");
  wrap.className = "region-combo";

  const input = document.createElement("input");
  input.type = "text";
  input.classList.add("grid-nav-input", "grid-nav-region");
  input.autocomplete = "off";
  input.spellcheck = false;
  input.setAttribute("autocapitalize", "off");
  input.setAttribute("autocorrect", "off");
  input.dataset.row = String(navMeta.row);
  input.dataset.col = String(navMeta.col);
  input.dataset.field = navMeta.field || "region";
  input.title = "Kraj – Ctrl+C / Ctrl+V, nebo šipka vpravo pro výběr z nabídky";
  input.placeholder = "—";
  input.value = normalizeRegionCode(value);

  const select = document.createElement("select");
  select.className = "region-combo__picker";
  select.tabIndex = -1;
  select.title = "Vybrat kraj z nabídky";
  select.setAttribute("aria-label", "Vybrat kraj");

  const emptyOption = document.createElement("option");
  emptyOption.value = "";
  emptyOption.textContent = "—";
  select.append(emptyOption);
  REGION_CODES.forEach((code) => {
    const option = document.createElement("option");
    option.value = code;
    option.textContent = code;
    select.append(option);
  });

  const normalized = normalizeRegionCode(value);
  if (normalized && !REGION_CODES.includes(normalized)) {
    const custom = document.createElement("option");
    custom.value = normalized;
    custom.textContent = normalized;
    select.append(custom);
  }
  select.value = REGION_CODES.includes(normalized) || normalized === "" ? normalized : normalized;

  const commit = (raw) => {
    const next = normalizeRegionCode(raw);
    input.value = next;
    if (REGION_CODES.includes(next) || next === "") {
      select.value = next;
    } else if (![...select.options].some((o) => o.value === next)) {
      const custom = document.createElement("option");
      custom.value = next;
      custom.textContent = next;
      select.append(custom);
      select.value = next;
    } else {
      select.value = next;
    }
    applyRegionValue(next, navMeta.row, navMeta.col);
  };

  input.addEventListener("change", () => commit(input.value));
  input.addEventListener("blur", () => commit(input.value));
  select.addEventListener("change", () => {
    commit(select.value);
    input.focus();
    if (input.select) input.select();
  });

  wrap.append(input, select);
  return wrap;
}

function commitGridNavInput(el) {
  if (!el || !el.matches?.(".grid-nav-input")) return;
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function focusGridCell(row, col) {
  const el = document.querySelector(
    `#monthGridTable .grid-nav-input[data-row="${row}"][data-col="${col}"]`,
  );
  if (el) {
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    if (el.select) el.select();
    updateMonthGridScrollUi();
  }
}

function getMonthGridScrollStep() {
  const wrap = document.getElementById("monthGridWrap");
  if (!wrap) return 280;
  const memberHead = wrap.querySelector(".month-grid-member-head");
  const memberWidth = memberHead?.getBoundingClientRect().width || 220;
  return Math.max(180, Math.round(memberWidth * 0.9));
}

function updateMonthGridScrollUi() {
  const wrap = document.getElementById("monthGridWrap");
  const shell = document.getElementById("monthGridShell");
  const leftBtn = document.getElementById("monthGridScrollLeft");
  const rightBtn = document.getElementById("monthGridScrollRight");
  const hint = document.getElementById("monthGridScrollHint");
  if (!wrap || !shell) return;

  const maxScroll = Math.max(0, wrap.scrollWidth - wrap.clientWidth);
  const canScroll = maxScroll > 8;
  const atStart = wrap.scrollLeft <= 4;
  const atEnd = wrap.scrollLeft >= maxScroll - 4;

  shell.classList.toggle("is-scrollable", canScroll);
  shell.classList.toggle("can-scroll-left", canScroll && !atStart);
  shell.classList.toggle("can-scroll-right", canScroll && !atEnd);

  if (leftBtn) leftBtn.disabled = !canScroll || atStart;
  if (rightBtn) rightBtn.disabled = !canScroll || atEnd;
  if (hint) {
    hint.textContent = canScroll
      ? "Posouvejte mezi jmény montérů ← →"
      : "Všichni montéři jsou vidět";
  }
}

function scrollMonthGridBy(direction) {
  const wrap = document.getElementById("monthGridWrap");
  if (!wrap) return;
  wrap.scrollBy({ left: direction * getMonthGridScrollStep(), behavior: "smooth" });
}

function setupMonthGridScroll() {
  const wrap = document.getElementById("monthGridWrap");
  const leftBtn = document.getElementById("monthGridScrollLeft");
  const rightBtn = document.getElementById("monthGridScrollRight");
  if (!wrap || wrap.dataset.scrollBound) return;
  wrap.dataset.scrollBound = "1";

  wrap.addEventListener("scroll", () => updateMonthGridScrollUi(), { passive: true });
  leftBtn?.addEventListener("click", () => scrollMonthGridBy(-1));
  rightBtn?.addEventListener("click", () => scrollMonthGridBy(1));
  window.addEventListener("resize", () => updateMonthGridScrollUi());
}

function handleGridArrowKey(e) {
  const el = e.target;
  if (!el.matches(".grid-nav-input")) return;
  const row = Number(el.dataset.row);
  const col = Number(el.dataset.col);
  const monthData = getActiveMonthData();
  const maxRow = monthData.rows.length;
  const memberCount = getGridMembers(monthData).length;

  const move = (nextRow, nextCol) => {
    commitGridNavInput(el);
    focusGridCell(nextRow, nextCol);
  };

  if (e.key === "ArrowDown" && row < maxRow - 1) {
    e.preventDefault();
    move(row + 1, col);
    return;
  }
  if (e.key === "ArrowUp" && row > 0) {
    e.preventDefault();
    move(row - 1, col);
    return;
  }
  if (e.key === "ArrowRight") {
    e.preventDefault();
    if (col < MONTH_LEFT_COLS - 1) {
      move(row, col + 1);
      return;
    }
    if (col >= MONTH_LEFT_COLS) {
      const rel = col - MONTH_LEFT_COLS;
      const fieldIdx = rel % MEMBER_FIELD_COUNT;
      const memberIdx = Math.floor(rel / MEMBER_FIELD_COUNT);
      if (fieldIdx === 0 && memberIdx + 1 < memberCount) {
        move(row, MONTH_LEFT_COLS + (memberIdx + 1) * MEMBER_FIELD_COUNT);
      } else if (fieldIdx < MEMBER_FIELD_COUNT - 1) {
        move(row, col + 1);
      } else if (memberIdx + 1 < memberCount) {
        move(row, MONTH_LEFT_COLS + (memberIdx + 1) * MEMBER_FIELD_COUNT);
      }
      return;
    }
    if (memberCount > 0) {
      move(row, MONTH_LEFT_COLS);
    }
    return;
  }
  if (e.key === "ArrowLeft") {
    e.preventDefault();
    if (col > MONTH_LEFT_COLS) {
      const rel = col - MONTH_LEFT_COLS;
      const fieldIdx = rel % MEMBER_FIELD_COUNT;
      const memberIdx = Math.floor(rel / MEMBER_FIELD_COUNT);
      if (fieldIdx === 0 && memberIdx > 0) {
        move(row, MONTH_LEFT_COLS + (memberIdx - 1) * MEMBER_FIELD_COUNT);
      } else {
        move(row, col - 1);
      }
      return;
    }
    if (col === MONTH_LEFT_COLS) {
      move(row, MONTH_LEFT_COLS - 1);
      return;
    }
    if (col > 0) move(row, col - 1);
  }
}

function regionCellKey(row, col) {
  return `${row}:${col}`;
}

function colToMemberIdx(col) {
  if (col < MONTH_LEFT_COLS) return null;
  const rel = col - MONTH_LEFT_COLS;
  if (rel % MEMBER_FIELD_COUNT !== 2) return null;
  return Math.floor(rel / MEMBER_FIELD_COUNT);
}

function regionColForMember(memberIdx) {
  return MONTH_LEFT_COLS + memberIdx * MEMBER_FIELD_COUNT + 2;
}

function selectRegionRange(r1, m1, r2, m2) {
  gridRegionSelection.clear();
  const rMin = Math.min(r1, r2);
  const rMax = Math.max(r1, r2);
  const mMin = Math.min(m1, m2);
  const mMax = Math.max(m1, m2);
  for (let r = rMin; r <= rMax; r += 1) {
    for (let m = mMin; m <= mMax; m += 1) {
      gridRegionSelection.add(regionCellKey(r, regionColForMember(m)));
    }
  }
}

function toggleRegionCell(row, col) {
  const key = regionCellKey(row, col);
  if (gridRegionSelection.has(key)) gridRegionSelection.delete(key);
  else gridRegionSelection.add(key);
}

function clearGridRegionSelection() {
  gridRegionSelection.clear();
  gridRegionAnchor = null;
  gridRegionDragging = false;
  updateGridRegionSelectionUi();
}

function updateGridRegionSelectionUi() {
  const anchorKey = gridRegionAnchor
    ? regionCellKey(gridRegionAnchor.row, regionColForMember(gridRegionAnchor.memberIdx))
    : null;
  document.querySelectorAll("#monthGridBody td.month-grid-col-kraj").forEach((td) => {
    const row = Number(td.dataset.row);
    const col = Number(td.dataset.col);
    const key = regionCellKey(row, col);
    td.classList.toggle("is-region-selected", gridRegionSelection.has(key));
    td.classList.toggle("is-region-anchor", key === anchorKey);
  });
  const hint = document.getElementById("gridRegionSelectionHint");
  if (hint) {
    const n = gridRegionSelection.size;
    hint.textContent = n > 0 ? `Označeno buněk kraj: ${n}` : "";
  }
}

function applyRegionValue(val, sourceRow, sourceCol) {
  const sourceKey = regionCellKey(sourceRow, sourceCol);
  const keys = gridRegionSelection.size > 0
    ? [...gridRegionSelection]
    : [sourceKey];
  const monthData = getActiveMonthData();
  keys.forEach((key) => {
    const [rowIdx, col] = key.split(":").map(Number);
    const date = monthData.rows[rowIdx]?.date;
    const member = gridMemberFromCol(col);
    if (!date || !member) return;
    setMemberDayFieldForMember(member, date, "destinationRegion", val);
  });
  saveState();
  scheduleSaveMesicZapis();
  if (overviewMonthKey === activeMonthKey) fetchPrehledFromApi();
  renderMonthGrid();
}

function regionValueAt(row, col) {
  const monthData = getActiveMonthData();
  const date = monthData.rows[row]?.date;
  const member = gridMemberFromCol(col);
  if (!date || !member) return "";
  return normalizeRegionCode(getMemberDayField(member, date, "destinationRegion"));
}

function setRegionAndSave(row, col, val) {
  const monthData = getActiveMonthData();
  const date = monthData.rows[row]?.date;
  const member = gridMemberFromCol(col);
  if (!date || !member) return;
  setMemberDayFieldForMember(member, date, "destinationRegion", val);
  saveState();
  scheduleSaveMesicZapis();
  if (overviewMonthKey === activeMonthKey) fetchPrehledFromApi();
  renderMonthGrid();
}

function fillSelectedRegionsFromAnchor() {
  if (gridRegionSelection.size < 2 || !gridRegionAnchor) return false;
  const col = regionColForMember(gridRegionAnchor.memberIdx);
  const val = regionValueAt(gridRegionAnchor.row, col);
  applyRegionValue(val, gridRegionAnchor.row, col);
  return true;
}

let fillHandleDragging = false;
let regionClipboard = "";

function isFillHandleClick(e, td) {
  if (!td.classList.contains("is-region-anchor")) return false;
  const rect = td.getBoundingClientRect();
  return e.clientX >= rect.right - 12 && e.clientY >= rect.bottom - 12;
}

function handleRegionCellMouseDown(e) {
  const td = e.target.closest("td.month-grid-col-kraj");
  if (!td || e.button !== 0) return;
  const row = Number(td.dataset.row);
  const col = Number(td.dataset.col);
  const memberIdx = colToMemberIdx(col);
  if (memberIdx == null) return;

  if (e.target.closest(".region-combo__picker")) return;

  if (isFillHandleClick(e, td) && gridRegionAnchor) {
    e.preventDefault();
    fillHandleDragging = true;
    gridRegionDragging = false;
    return;
  }

  const onInput = e.target.closest(".grid-nav-region");
  if (onInput && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
    if (!gridRegionSelection.has(regionCellKey(row, col))) {
      gridRegionSelection.clear();
      gridRegionSelection.add(regionCellKey(row, col));
      gridRegionAnchor = { row, memberIdx };
      updateGridRegionSelectionUi();
    }
    return;
  }

  e.preventDefault();
  if (e.shiftKey && gridRegionAnchor) {
    selectRegionRange(gridRegionAnchor.row, gridRegionAnchor.memberIdx, row, memberIdx);
    updateGridRegionSelectionUi();
    fillSelectedRegionsFromAnchor();
    return;
  } else if (e.ctrlKey || e.metaKey) {
    toggleRegionCell(row, col);
    gridRegionAnchor = { row: gridRegionAnchor?.row ?? row, memberIdx: gridRegionAnchor?.memberIdx ?? memberIdx };
  } else {
    gridRegionSelection.clear();
    gridRegionSelection.add(regionCellKey(row, col));
    gridRegionAnchor = { row, memberIdx };
    gridRegionDragging = true;
  }
  updateGridRegionSelectionUi();
}

function handleRegionCellMouseEnter(e) {
  if (!gridRegionAnchor) return;
  const td = e.target.closest("td.month-grid-col-kraj");
  if (!td) return;
  const row = Number(td.dataset.row);
  const col = Number(td.dataset.col);
  const memberIdx = colToMemberIdx(col);
  if (memberIdx == null) return;

  if (fillHandleDragging) {
    selectRegionRange(gridRegionAnchor.row, gridRegionAnchor.memberIdx, row, gridRegionAnchor.memberIdx);
    updateGridRegionSelectionUi();
    return;
  }
  if (!gridRegionDragging) return;
  selectRegionRange(gridRegionAnchor.row, gridRegionAnchor.memberIdx, row, memberIdx);
  updateGridRegionSelectionUi();
}

function setupGridRegionSelection() {
  const body = document.getElementById("monthGridBody");
  if (!body || body.dataset.regionSelectBound) return;
  body.dataset.regionSelectBound = "1";
  body.addEventListener("mousedown", handleRegionCellMouseDown);
  body.addEventListener("mouseover", handleRegionCellMouseEnter);
  document.addEventListener("mouseup", () => {
    const shouldFill = (gridRegionDragging || fillHandleDragging) && gridRegionSelection.size > 1 && gridRegionAnchor;
    gridRegionDragging = false;
    fillHandleDragging = false;
    if (shouldFill) fillSelectedRegionsFromAnchor();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") clearGridRegionSelection();
    if (!gridRegionAnchor) return;
    const mod = e.ctrlKey || e.metaKey;

    if (mod && (e.key === "d" || e.key === "D") && gridRegionSelection.size > 1) {
      e.preventDefault();
      fillSelectedRegionsFromAnchor();
      return;
    }

    if (mod && (e.key === "c" || e.key === "C")) {
      const col = regionColForMember(gridRegionAnchor.memberIdx);
      regionClipboard = regionValueAt(gridRegionAnchor.row, col);
      return;
    }

    if (mod && (e.key === "v" || e.key === "V") && regionClipboard) {
      e.preventDefault();
      const col = regionColForMember(gridRegionAnchor.memberIdx);
      if (gridRegionSelection.size > 0) {
        applyRegionValue(regionClipboard, gridRegionAnchor.row, col);
      } else {
        setRegionAndSave(gridRegionAnchor.row, col, regionClipboard);
      }
      return;
    }

    if (e.key === "ArrowDown" && gridRegionSelection.size >= 1 && !mod && e.shiftKey) {
      e.preventDefault();
      const newRow = gridRegionAnchor.row + Math.max(1, gridRegionSelection.size);
      const maxRow = (getActiveMonthData().rows || []).length - 1;
      if (newRow > maxRow) return;
      for (let r = gridRegionAnchor.row + 1; r <= Math.min(newRow, maxRow); r++) {
        gridRegionSelection.add(regionCellKey(r, regionColForMember(gridRegionAnchor.memberIdx)));
      }
      updateGridRegionSelectionUi();
      return;
    }
  });
}

function setupGridNavigation() {
  const table = document.getElementById("monthGridTable");
  if (!table || table.dataset.navBound) return;
  table.dataset.navBound = "1";
  table.addEventListener("keydown", handleGridArrowKey);
}

function plneniClass(val) {
  if (val >= 0.95) return "plneni-ok";
  if (val < 0.8) return "plneni-warn";
  return "";
}

function getNastavenyMesic() {
  return Number(document.getElementById("nastavenyMesic")?.value || overviewPrehled.nastaveni?.nastaveny_mesic || 6);
}

function getNastavenyRok() {
  return Number(document.getElementById("nastavenyRok")?.value || overviewPrehled.nastaveni?.nastaveny_rok || 2026);
}

function buildLokalitaKrajeMap(rows) {
  const map = Object.fromEntries(
    Object.entries(LOKALITA_KRAJE_DEFAULT).map(([lok, kraje]) => [lok, [...kraje]]),
  );
  (rows || []).forEach((row) => {
    if (!map[row.lokalita]) map[row.lokalita] = [];
    if (!map[row.lokalita].includes(row.kraj)) map[row.lokalita].push(row.kraj);
  });
  return map;
}

function buildKrajeKoefDetail(lokalita, mesic, rok, grid, lokMap) {
  return (lokMap[lokalita] || []).map((kraj) => ({
    kraj,
    koeficient: koefValueFromGrid(grid, kraj, mesic),
  })).filter((item) => item.koeficient != null);
}

function koefValueFromGrid(grid, kraj, mesic) {
  const row = (grid || []).find((r) => r.kraj === kraj);
  const fromRow = row?.mesice?.[String(mesic)] ?? row?.mesice?.[mesic];
  if (fromRow !== "" && fromRow != null && !Number.isNaN(Number(fromRow))) return Number(fromRow);
  return null;
}

function recomputePodkladyFromKoef() {
  const mesic = getNastavenyMesic();
  const rok = getNastavenyRok();
  const lokMap = buildLokalitaKrajeMap(overviewPrehled.lokalita_kraje);
  const grid = overviewPrehled.koeficienty_kraje?.length
    ? overviewPrehled.koeficienty_kraje
    : defaultKoefGrid(rok);
  const fondy = {};
  (overviewPrehled.podklady || []).forEach((p) => {
    fondy[p.lokalita] = p.fond;
  });
  overviewPrehled.podklady = REGION_CODES.map((lok) => ({
    lokalita: lok,
    fond: fondy[lok] ?? DEFAULT_FONDY[lok] ?? 6,
    koeficient: koeficientProLokalitu(lok, mesic, rok, grid, lokMap),
    kraje: lokMap[lok] || [],
    kraje_koeficienty: buildKrajeKoefDetail(lok, mesic, rok, grid, lokMap),
  }));

  overviewPrehled.rows = (overviewPrehled.rows || []).map((row) => {
    const koef = overviewPrehled.podklady.find((p) => p.lokalita === row.lokalita)?.koeficient;
    const plan = Number(row.plan_celkem || 0);
    const sched = Number(row.naplanovano_celkem || 0);
    const missing = koef != null && koef !== ""
      ? Math.round(((plan - sched) / Number(koef)) * 100) / 100
      : null;
    return {
      ...row,
      koeficient: koef,
      kolik_chybi_ks: missing,
      lze_objednat_ks: missing != null
        ? Math.round((missing - Number(row.objednano_ks || 0)) * 100) / 100
        : null,
    };
  });

  if (overviewPrehled.totals) {
    overviewPrehled.totals.kolik_chybi_ks = overviewPrehled.rows.reduce(
      (a, r) => a + (r.kolik_chybi_ks != null ? Number(r.kolik_chybi_ks) : 0),
      0,
    );
  }

  renderPodklady();
  renderOverview();
  renderCards();
}

function koeficientProLokalitu(lokalita, mesic, rok, grid, lokMap) {
  const kraje = lokMap[lokalita] || [];
  if (!kraje.length) return null;
  const vals = kraje.map((k) => koefValueFromGrid(grid, k, mesic)).filter((v) => v != null);
  if (!vals.length) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 1e6) / 1e6;
}

function defaultKoefGrid(rok = 2026) {
  return KRAJE_LIST.map((kraj) => ({
    kraj,
    mesice: Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => {
        const m = i + 1;
        return [String(m), DEFAULT_KOEF_2026[kraj]?.[m] ?? ""];
      }),
    ),
  }));
}

function getSkupinaDates(skupina) {
  for (const lok of skupina.lokality) {
    const row = (overviewPrehled.rows || []).find((r) => r.lokalita === lok);
    if (row?.od && row?.do) {
      return { od: String(row.od).slice(0, 10), do: String(row.do).slice(0, 10) };
    }
  }
  return { od: skupina.defaultOd, do: skupina.defaultDo };
}

function findSkupinaForLokalita(lokalita) {
  return OBDPOBI_SKUPINY.find((s) => s.lokality.includes(lokalita));
}

async function applySkupinaObdobi(skupina, od, do_) {
  skupina.lokality.forEach((lok) => {
    const row = (overviewPrehled.rows || []).find((r) => r.lokalita === lok);
    if (row) {
      row.od = od;
      row.do = do_;
      row.skupina = skupina.nazev;
    }
    const local = state.overviewRows.find((r) => r.location === lok);
    if (local) {
      local.from = od;
      local.to = do_;
    }
  });
  saveState();
  renderOverview();

  try {
    await persistSkupinaObdobi(skupina, od, do_);
    await fetchPrehledFromApi();
  } catch {
    computeOverviewLocal();
  }
}

function renderCiselnikSkupiny() {
  const body = document.getElementById("ciselnikSkupinyTable");
  if (!body) return;
  body.innerHTML = "";

  OBDPOBI_SKUPINY.forEach((skupina) => {
    const { od, do: do_ } = getSkupinaDates(skupina);
    const tr = document.createElement("tr");
    appendCell(tr, skupina.nazev);
    appendCell(tr, createInput(od, (val) => applySkupinaObdobi(skupina, val, do_), "date"));
    appendCell(tr, createInput(do_, (val) => applySkupinaObdobi(skupina, od, val), "date"));
    appendCell(tr, skupina.lokality.join(", "));
    body.append(tr);
  });
}

async function persistSkupinaObdobi(skupina, od, do_) {
  for (const lok of skupina.lokality) {
    const row = (overviewPrehled.rows || []).find((r) => r.lokalita === lok);
    await apiFetch(`/api/prehled-obdobi`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: row?.id,
        od,
        do: do_,
        skupina: skupina.nazev,
        lokalita: lok,
        objednano_ks: row?.objednano_ks || 0,
        celkem_zakazek: row?.celkem_zakazek || 0,
        posunout_vyrobu: row?.posunout_vyrobu || "NE",
      }),
    });
  }
}

async function saveAllObdobiSkupiny() {
  const status = document.getElementById("apiStatus");
  try {
    for (const skupina of OBDPOBI_SKUPINY) {
      const { od, do: do_ } = getSkupinaDates(skupina);
      await persistSkupinaObdobi(skupina, od, do_);
    }
    await fetchPrehledFromApi();
    status.textContent = "Období skupin uloženo";
    status.className = "api-status is-ok";
  } catch (e) {
    status.textContent = `Uložení období selhalo (${e.message})`;
    status.className = "api-status is-error";
    computeOverviewLocal();
  }
}

function ensureOverviewRowsFromSkupiny() {
  OBDPOBI_SKUPINY.forEach((skupina) => {
    skupina.lokality.forEach((lok) => {
      if (!state.overviewRows.some((r) => r.location === lok)) {
        state.overviewRows.push({
          from: skupina.defaultOd,
          to: skupina.defaultDo,
          location: lok,
          plannedHours: 0,
          scheduledHours: 0,
          missingKs: 0,
          orderedNotPlanned: 0,
          shiftProduction: "NE",
        });
      }
    });
  });
  saveState();
}

function renderKoeficienty() {
  const head = document.getElementById("koeficientyHead");
  const body = document.getElementById("koeficientyBody");
  if (!head || !body) return;

  const mesice = ["Led", "Úno", "Bře", "Dub", "Kvě", "Čvn", "Čvc", "Srp", "Zář", "Říj", "Lis", "Pro"];
  head.innerHTML = `<tr><th>Kraj</th>${mesice.map((m, i) => `<th>${m} (${i + 1})</th>`).join("")}</tr>`;
  body.innerHTML = "";

  const grid = overviewPrehled.koeficienty_kraje?.length
    ? overviewPrehled.koeficienty_kraje
    : defaultKoefGrid(getNastavenyRok());

  grid.forEach((row, rowIdx) => {
    const tr = document.createElement("tr");
    const nameTd = document.createElement("td");
    nameTd.textContent = row.kraj;
    tr.append(nameTd);

    for (let m = 1; m <= 12; m += 1) {
      const td = document.createElement("td");
      const val = row.mesice?.[String(m)] ?? "";
      const input = createInput(val, (v) => {
        if (!overviewPrehled.koeficienty_kraje[rowIdx]) return;
        overviewPrehled.koeficienty_kraje[rowIdx].mesice[String(m)] = v === "" ? "" : Number(v);
        recomputePodkladyFromKoef();
      }, "number", "0.000001");
      td.append(input);
      tr.append(td);
    }
    body.append(tr);
  });

  if (!overviewPrehled.koeficienty_kraje?.length) {
    overviewPrehled.koeficienty_kraje = grid;
  }
}

function formatKrajePodklady(row) {
  const detail = row.kraje_koeficienty || [];
  if (detail.length) {
    return detail.map((k) => `${shortKrajName(k.kraj)} ${fmt(k.koeficient, 3)}`).join(" · ");
  }
  if (row.kraje?.length) return row.kraje.map(shortKrajName).join(", ");
  return "—";
}

function shortKrajName(kraj) {
  return String(kraj || "")
    .replace(" kraj", "")
    .replace("Hlavní město Praha", "Praha");
}

function renderPodklady() {
  const body = document.getElementById("podkladyTable");
  if (!body) return;
  body.innerHTML = "";
  (overviewPrehled.podklady || []).forEach((row, idx) => {
    const tr = document.createElement("tr");
    const lokTd = document.createElement("td");
    lokTd.textContent = row.lokalita;
    const krajeTd = document.createElement("td");
    krajeTd.className = "podklady-kraje";
    krajeTd.textContent = formatKrajePodklady(row);
    krajeTd.title = (row.kraje || []).join(", ");
    const fondTd = document.createElement("td");
    fondTd.append(createInput(row.fond, (val) => updatePodklad(idx, "fond", Number(val)), "number", "0.1"));
    const koefTd = document.createElement("td");
    koefTd.textContent = row.koeficient != null && row.koeficient !== "" ? fmt(row.koeficient, 4) : "—";
    koefTd.className = "koef-readonly";
    koefTd.title = row.kraje?.length > 1
      ? `Průměr ${row.kraje.length} krajů (jako AVERAGE v Excelu)`
      : "";
    tr.append(lokTd, krajeTd, fondTd, koefTd);
    body.append(tr);
  });
}

function updatePodklad(idx, key, value) {
  overviewPrehled.podklady[idx][key] = value;
}

function appendCell(tr, content) {
  const td = document.createElement("td");
  if (content instanceof HTMLElement) {
    td.append(content);
  } else {
    td.textContent = content;
  }
  tr.append(td);
}

function renderOverview() {
  const body = document.getElementById("overviewTable");
  if (!body) return;
  body.innerHTML = "";

  (overviewPrehled.rows || []).forEach((row, idx) => {
    const tr = document.createElement("tr");
    const plneni = Number(row.plneni || 0);

    appendCell(tr, row.od ? String(row.od).slice(0, 10) : "");
    appendCell(tr, row.do ? String(row.do).slice(0, 10) : "");
    appendCell(tr, row.skupina || findSkupinaForLokalita(row.lokalita)?.nazev || "");
    appendCell(tr, row.lokalita || "");
    appendCell(tr, fmt(row.plan_hod));
    appendCell(tr, fmt(row.naplanovano_hod));
    appendCell(tr, fmt(row.plan_celkem));
    appendCell(tr, fmt(row.naplanovano_celkem));

    const plTd = document.createElement("td");
    plTd.textContent = `${fmt(plneni * 100, 1)} %`;
    plTd.className = plneniClass(plneni);
    tr.append(plTd);

    appendCell(tr, row.kolik_chybi_ks != null ? fmt(row.kolik_chybi_ks, 2) : "—");
    appendCell(tr, createInput(row.celkem_zakazek, (val) => updatePrehledRow(idx, "celkem_zakazek", Number(val)), "number", "1"));
    appendCell(tr, createInput(row.objednano_ks, (val) => updatePrehledRow(idx, "objednano_ks", Number(val)), "number", "1"));
    appendCell(tr, row.lze_objednat_ks != null ? fmt(row.lze_objednat_ks, 2) : "—");

    const select = document.createElement("select");
    ["NE", "ANO"].forEach((optionValue) => {
      const option = document.createElement("option");
      option.value = optionValue;
      option.textContent = optionValue;
      if (row.posunout_vyrobu === optionValue) option.selected = true;
      select.append(option);
    });
    select.addEventListener("change", () => updatePrehledRow(idx, "posunout_vyrobu", select.value));
    appendCell(tr, select);

    body.append(tr);
  });
}

function getRosterPayload() {
  const monthData = state.months[overviewMonthKey];
  if (!monthData || !monthData.members) return [];
  return monthData.members.map((m) => ({
    jmeno: m.name,
    target_flag: Number(m.targetFlag || 0),
    destination_region: m.destinationRegion || "",
  }));
}

function pruneImplicitDailyRosterCells(monthData) {
  (monthData.members || []).forEach((member) => {
    const cells = member.dailyCells || {};
    Object.keys(cells).forEach((date) => {
      const day = cells[date];
      if (!day) return;

      const hasDest = Object.prototype.hasOwnProperty.call(day, "destinationRegion");
      const hasTarget = Object.prototype.hasOwnProperty.call(day, "targetFlag");

      // Ručně vymazaný kraj (—) musí zůstat uložený.
      if (hasDest && day.destinationRegion === "") {
        if (hasTarget) {
          const hours = Number(member.dailyHours?.[date] || 0);
          const autoTarget = hours > 0 ? 1 : Number(member.targetFlag || 0);
          if (day.targetFlag === undefined || day.targetFlag === "" || Number(day.targetFlag) === autoTarget) {
            delete day.targetFlag;
          }
        }
        if (Object.keys(day).length === 0) delete cells[date];
        return;
      }

      const hours = Number(member.dailyHours?.[date] || 0);
      const autoTarget = hours > 0 ? 1 : Number(member.targetFlag || 0);
      const dest = day.destinationRegion;
      const target = day.targetFlag;
      const implicitDest = !hasDest || dest === "";
      const implicitTarget = !hasTarget || target === "" || Number(target) === autoTarget;
      if (implicitDest && implicitTarget) delete cells[date];
    });
  });
}

function isExplicitDayRosterEdit(member, date) {
  const day = member.dailyCells?.[date];
  if (!day) return false;
  if (Object.prototype.hasOwnProperty.call(day, "destinationRegion")) return true;
  if (!Object.prototype.hasOwnProperty.call(day, "targetFlag")) return false;
  if (day.targetFlag === "") return false;
  const hours = Number(member.dailyHours?.[date] || 0);
  const autoTarget = hours > 0 ? 1 : Number(member.targetFlag || 0);
  return Number(day.targetFlag) !== autoTarget;
}

/** Jen ruční úpravy z mřížky – bez ručního kraje zůstane kraj prázdný. */
function getDailyRosterOverrides(monthKey = activeMonthKey) {
  const monthData = state.months[monthKey];
  if (!monthData?.members?.length) return [];
  const entries = [];
  const days = monthData.rows?.length ? monthData.rows.map((r) => r.date) : daysInMonthKey(monthKey);
  monthData.members.forEach((member, memberIdx) => {
    days.forEach((date) => {
      if (!isExplicitDayRosterEdit(member, date)) return;
      const hours = Number(member.dailyHours?.[date] || 0);
      const day = member.dailyCells[date];
      const targetFlag = day.targetFlag !== undefined && day.targetFlag !== ""
        ? Number(day.targetFlag)
        : (hours > 0 ? 1 : Number(member.targetFlag || 0));
      entries.push({
        col_index: memberIdx + 1,
        jmeno: member.name,
        datum: date,
        target_flag: targetFlag,
        destination_region: day.destinationRegion ?? "",
      });
    });
  });
  return entries;
}

function deriveDailyRosterFromMembers(monthData, monthKey = overviewMonthKey) {
  const entries = [];
  if (!monthData?.members?.length) return entries;
  const days = monthData.rows?.length ? monthData.rows.map((r) => r.date) : daysInMonthKey(monthKey);
  monthData.members.forEach((member, memberIdx) => {
    days.forEach((date) => {
      const hours = Number(member.dailyHours?.[date] || 0);
      if (hours <= 0) return;
      entries.push({
        col_index: memberIdx + 1,
        jmeno: member.name,
        datum: date,
        target_flag: 1,
        destination_region: "",
      });
    });
  });
  return entries;
}

function mergeDailyRosterEntries(base, overlay) {
  const idx = new Map();
  const keyOf = (e) => `${normName(e.jmeno)}|${e.datum}`;
  base.forEach((entry) => idx.set(keyOf(entry), { ...entry }));
  overlay.forEach((entry) => {
    const key = keyOf(entry);
    if (idx.has(key)) {
      idx.set(key, { ...idx.get(key), ...entry });
    } else {
      idx.set(key, { ...entry });
    }
  });
  return [...idx.values()];
}

function getEffectiveDailyRoster() {
  const monthData = state.months[overviewMonthKey];
  return mergeDailyRosterEntries(
    deriveDailyRosterFromMembers(monthData),
    getDailyRosterOverrides(),
  );
}

function getDailyRosterPayload() {
  return getDailyRosterOverrides();
}

function planHoursForLokalita(lokalita, od, do_, fond, dailyEntries) {
  if (!od || !do_) return 0;
  const start = new Date(od);
  const end = new Date(do_);
  let total = 0;
  dailyEntries.forEach((entry) => {
    const day = new Date(entry.datum);
    if (Number.isNaN(day.getTime()) || day < start || day > end) return;
    if (entry.destination_region !== lokalita) return;
    if (Number(entry.target_flag) !== 1) return;
    total += fond;
  });
  return Math.round(total * 100) / 100;
}

function scheduledHoursForLokalita(lokalita, od, do_, dailyEntries, monthData) {
  if (!od || !do_ || !monthData?.members) return 0;
  const start = new Date(od);
  const end = new Date(do_);
  const byKey = new Map(dailyEntries.map((e) => [`${e.jmeno}|${e.datum}`, e]));
  let total = 0;
  monthData.members.forEach((member) => {
    const daily = member.dailyHours || {};
    Object.entries(daily).forEach(([date, hours]) => {
      const day = new Date(date);
      if (Number.isNaN(day.getTime()) || day < start || day > end) return;
      const entry = byKey.get(`${member.name}|${date}`);
      if (!entry || entry.destination_region !== lokalita) return;
      if (Number(entry.target_flag) !== 1) return;
      total += Number(hours || 0);
    });
  });
  return Math.round(total * 100) / 100;
}

async function fetchPrehledFromApi() {
  const status = document.getElementById("apiStatus");
  status.textContent = "Načítám z PostgreSQL…";
  status.className = "api-status";

  try {
    const resp = await apiFetch(`/api/prehled-montaze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mesic_key: overviewMonthKey,
        nastaveny_mesic: getNastavenyMesic(),
        nastaveny_rok: getNastavenyRok(),
      }),
    });
    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error || resp.statusText);
    }
    overviewPrehled = await resp.json();
    if (overviewPrehled.nastaveni) {
      document.getElementById("nastavenyMesic").value = String(overviewPrehled.nastaveni.nastaveny_mesic);
      document.getElementById("nastavenyRok").value = String(overviewPrehled.nastaveni.nastaveny_rok);
    }
    const dr = overviewPrehled.daily_roster_count ?? 0;
    const drDerived = overviewPrehled.daily_roster_derived_count ?? dr;
    const drOverlay = overviewPrehled.daily_roster_overlay_count ?? 0;
    const rn = overviewPrehled.raynet_montaze_count ?? 0;
    if (!rn) {
      status.textContent = "Chybí montáže z Raynetu – klikněte „Stáhnout z Raynet API“";
      status.className = "api-status is-error";
    } else if (!drDerived) {
      status.textContent = "Raynet bez montérských hodin v období – zkontrolujte sync";
      status.className = "api-status is-warn";
    } else {
      const overlayNote = drOverlay
        ? `, ruční úpravy ${drOverlay}`
        : " – kraj zatím není ručně vyplněný";
      status.textContent = `PostgreSQL: Raynet ${rn} montáží, rozpis ${drDerived}${overlayNote}`;
      status.className = "api-status is-ok";
    }
    renderOverviewFromPrehled();
  } catch (e) {
    status.textContent = `API nedostupné (${e.message}) – lokální výpočet`;
    status.className = "api-status is-error";
    computeOverviewLocal();
  }
}

function renderOverviewFromPrehled() {
  renderCiselnikSkupiny();
  renderKoeficienty();
  recomputePodkladyFromKoef();
  renderOverview();
  renderCards();
}

function computeOverviewLocal() {
  const mesic = getNastavenyMesic();
  const rok = getNastavenyRok();
  if (!overviewPrehled.koeficienty_kraje?.length) {
    overviewPrehled.koeficienty_kraje = defaultKoefGrid(rok);
  }
  const lokMap = buildLokalitaKrajeMap(overviewPrehled.lokalita_kraje);
  const podklady = REGION_CODES.map((lok) => ({
    lokalita: lok,
    fond: DEFAULT_FONDY[lok] || 6,
    koeficient: koeficientProLokalitu(lok, mesic, rok, overviewPrehled.koeficienty_kraje, lokMap),
    kraje: lokMap[lok] || [],
    kraje_koeficienty: buildKrajeKoefDetail(lok, mesic, rok, overviewPrehled.koeficienty_kraje, lokMap),
  }));
  const dailyEntries = getEffectiveDailyRoster();
  const monthData = state.months[overviewMonthKey];
  const rows = (overviewPrehled.rows?.length ? overviewPrehled.rows : state.overviewRows.map((row) => ({
    od: row.from,
    do: row.to,
    lokalita: row.location,
    objednano_ks: row.orderedNotPlanned || 0,
    celkem_zakazek: row.celkem_zakazek || 0,
    posunout_vyrobu: row.shiftProduction || "NE",
  }))).map((row) => {
    const lok = row.lokalita || row.location;
    const fond = podklady.find((p) => p.lokalita === lok)?.fond || 6;
    const koef = podklady.find((p) => p.lokalita === lok)?.koeficient;
    const od = row.od || row.from;
    const do_ = row.do || row.to;
    const plan = dailyEntries.length
      ? planHoursForLokalita(lok, od, do_, fond, dailyEntries)
      : 0;
    const sched = dailyEntries.length
      ? scheduledHoursForLokalita(lok, od, do_, dailyEntries, monthData)
      : Number(row.naplanovano_celkem || row.scheduledHours || 0);
    const planR = Math.round(plan * 100) / 100;
    const missing = koef != null && koef !== ""
      ? Math.round(((planR - sched) / Number(koef)) * 100) / 100
      : null;
    return {
      od,
      do: do_,
      skupina: row.skupina || row.location,
      lokalita: lok,
      plan_hod: planR,
      naplanovano_hod: sched,
      plan_celkem: planR,
      naplanovano_celkem: sched,
      plneni: planR ? sched / planR : 0,
      kolik_chybi_ks: missing,
      objednano_ks: row.objednano_ks ?? row.orderedNotPlanned ?? 0,
      celkem_zakazek: row.celkem_zakazek || 0,
      lze_objednat_ks: missing != null
        ? missing - Number(row.objednano_ks ?? row.orderedNotPlanned ?? 0)
        : null,
      posunout_vyrobu: row.posunout_vyrobu || row.shiftProduction || "NE",
    };
  });
  overviewPrehled = {
    rows,
    podklady,
    totals: {
      pocet_lokalit: rows.length,
      plan_celkem: rows.reduce((a, r) => a + r.plan_celkem, 0),
      naplanovano_celkem: rows.reduce((a, r) => a + r.naplanovano_celkem, 0),
      kolik_chybi_ks: rows.reduce((a, r) => a + r.kolik_chybi_ks, 0),
      plneni: 0,
    },
  };
  if (overviewPrehled.totals.plan_celkem) {
    overviewPrehled.totals.plneni = overviewPrehled.totals.naplanovano_celkem / overviewPrehled.totals.plan_celkem;
  }
  overviewPrehled.nastaveni = { nastaveny_mesic: mesic, nastaveny_rok: rok };
  if (!overviewPrehled.lokalita_kraje?.length) {
    overviewPrehled.lokalita_kraje = Object.entries(LOKALITA_KRAJE_DEFAULT).flatMap(
      ([lokalita, kraje]) => kraje.map((kraj) => ({ lokalita, kraj })),
    );
  }
  renderCiselnikSkupiny();
  renderKoeficienty();
  renderPodklady();
  renderOverview();
  renderCards();
}

async function saveKoeficienty() {
  const rok = getNastavenyRok();
  const rows = [];
  (overviewPrehled.koeficienty_kraje || []).forEach((krajRow) => {
    for (let m = 1; m <= 12; m += 1) {
      const v = krajRow.mesice?.[String(m)];
      if (v !== "" && v != null) {
        rows.push({ kraj: krajRow.kraj, mesic: m, koeficient: Number(v) });
      }
    }
  });
  try {
    await apiFetch(`/api/koeficienty-kraje`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rok, rows }),
    });
    await fetchPrehledFromApi();
  } catch {
    computeOverviewLocal();
    alert("Koeficienty uloženy lokálně (API nedostupné).");
  }
}

function applyMesicData(data) {
  const monthKey = data.mesic_key || activeMonthKey;
  const monthData = ensureMonthIn(state.months, monthKey);
  const denniByDate = new Map((data.denni || []).map((d) => [d.datum, d]));
  const zapisByDate = new Map((data.zapis_den || []).map((z) => [z.datum, z]));

  monthData.rows = daysInMonthKey(monthKey).map((date) => {
    const d = denniByDate.get(date);
    const z = zapisByDate.get(date);
    return {
      date,
      monterHours: d?.monter_hours ?? 0,
      montageCount: d?.montage_count ?? 0,
      avgPerDay: d?.avg_per_day ?? 0,
      collected: z?.collected ?? 0,
      reason: z?.reason ?? "",
    };
  });

  const savedRosterNames = (data.roster || []).map((r) => r.jmeno).filter(Boolean);
  const hoursByName = new Map(
    (data.members || []).map((m) => [normName(m.name), m]),
  );
  const byName = new Map();

  const ensureMem = (name) => {
    const trimmed = String(name || "").trim();
    const key = normName(trimmed);
    if (!trimmed || byName.has(key)) return byName.get(key);
    const api = hoursByName.get(key);
    const mem = createEmptyMonthMember(trimmed);
    if (api) {
      if (api.daily_hours != null && typeof api.daily_hours === "object") {
        mem.dailyHours = api.daily_hours;
      }
      mem.mountedHours = api.mounted_hours ?? 0;
      mem.actualFlag = api.actual_flag ?? (mem.mountedHours > 0 ? 1 : 0);
    }
    byName.set(key, mem);
    return mem;
  };

  (data.members || []).forEach((member) => ensureMem(member.name));

  const rosterByNameDate = new Map();
  (data.daily_roster || []).forEach((entry) => {
    const key = `${entry.jmeno}|${entry.datum}`;
    const prev = rosterByNameDate.get(key);
    if (
      !prev
      || Number(entry.target_flag) === 1
      || (Number(prev.target_flag) !== 1 && Number(entry.col_index || 0) < Number(prev.col_index || 0))
    ) {
      rosterByNameDate.set(key, entry);
    }
  });
  rosterByNameDate.forEach((entry) => {
    const mem = ensureMem(entry.jmeno);
    if (!mem) return;
    if (!mem.dailyCells) mem.dailyCells = {};
    mem.dailyCells[entry.datum] = {
      targetFlag: entry.target_flag,
      destinationRegion: entry.destination_region ?? "",
    };
  });

  const rosterNames = deriveRosterNamesFromMesicData(data, byName);
  monthData.members = Array.from(byName.values());
  monthData.rosterConfigured = Boolean(data.roster_configured || savedRosterNames.length);

  if (rosterNames.length || data.roster_configured) {
    setMonthRosterNames(monthKey, rosterNames, { lock: Boolean(data.roster_configured) });
    monthData.rosterConfigured = Boolean(data.roster_configured);
  } else {
    monthData.rosterNames = [];
    monthData.rosterConfigured = false;
    monthData.members = [];
  }

  serverMesicLoaded = true;

  renderMonthRoster();
  if (monthKey === activeMonthKey) renderMonthGrid();
  renderCards();
}

function getZapisDenPayload() {
  const monthData = state.months[overviewMonthKey];
  if (!monthData?.rows) return [];
  return monthData.rows.map((row) => ({
    datum: row.date,
    collected: Number(row.collected || 0),
    reason: row.reason || "",
  }));
}

let saveZapisTimer = null;
function scheduleSaveMesicZapis() {
  clearTimeout(saveZapisTimer);
  saveZapisTimer = setTimeout(() => {
    saveMesicZapisToApi().catch(() => {});
  }, 800);
}

async function saveMesicZapisToApi(monthKey = activeMonthKey) {
  await apiFetch(`/api/mesic-zapis`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mesic_key: monthKey,
      daily_roster: getDailyRosterOverrides(monthKey),
      zapis_den: [],
    }),
  });
}

async function syncRaynetFromApi(statusEl, onDone) {
  if (!statusEl) return false;
  statusEl.textContent = "Stahuji z Raynet API do PostgreSQL… (může trvat několik minut)";
  statusEl.className = "api-status";

  try {
    const resp = await apiFetch(`/api/sync-raynet`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ only: "main" }),
    });
    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error || resp.statusText);
    }
    const data = await resp.json();
    const counts = data.counts || {};
    const summary = Object.entries(counts)
      .map(([table, n]) => `${table}: ${n}`)
      .join(", ");
    statusEl.textContent = summary ? `Sync OK (${summary})` : "Sync OK";
    statusEl.className = "api-status is-ok";
    if (onDone) await onDone();
    return true;
  } catch (e) {
    statusEl.textContent = `Raynet sync selhal (${e.message})`;
    statusEl.className = "api-status is-error";
    return false;
  }
}

async function fetchMesicFromApi(monthKey = activeMonthKey) {
  const status = document.getElementById("mesicApiStatus");
  if (!status) return;
  const fetchSeq = ++mesicFetchSeq;
  status.textContent = "Načítám měsíc z PostgreSQL…";
  status.className = "api-status";
  showMonthGridError("");

  try {
    const resp = await apiFetch(`/api/mesic-data`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mesic_key: monthKey,
        // Prázdné = server bere jen DB + Raynet (stejné pro všechny PC)
        members: [],
      }),
    });
    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error || resp.statusText);
    }
    const data = await resp.json();
    if (fetchSeq !== mesicFetchSeq) return;
    if (monthKey === activeMonthKey) {
      applyMesicData(data);
      status.textContent = `Načteno z PostgreSQL (${data.denni?.length || 0} dní, ${data.members?.length || 0} montérů)`;
      status.className = "api-status is-ok";
    }
  } catch (e) {
    if (fetchSeq !== mesicFetchSeq) return;
    status.textContent = `PostgreSQL nedostupné (${e.message})`;
    status.className = "api-status is-error";
  }
}

async function savePodklady() {
  try {
    await apiFetch(`/api/podklady`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ podklady: overviewPrehled.podklady }),
    });
    await fetchPrehledFromApi();
  } catch {
    alert("Uložení podkladů vyžaduje běžící API server.");
  }
}

async function updatePrehledRow(idx, key, value) {
  const row = overviewPrehled.rows[idx];
  if (!row) return;
  row[key] = value;
  if (!["objednano_ks", "celkem_zakazek", "posunout_vyrobu"].includes(key)) return;
  if (row.id) {
    try {
      await apiFetch(`/api/prehled-obdobi`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: row.id,
          od: row.od,
          do: row.do,
          skupina: row.skupina,
          lokalita: row.lokalita,
          objednano_ks: row.objednano_ks,
          celkem_zakazek: row.celkem_zakazek,
          posunout_vyrobu: row.posunout_vyrobu,
        }),
      });
      recomputePodkladyFromKoef();
    } catch {
      /* lokální režim */
    }
  }
}

function formatGridDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${Number(d)}.${Number(m)}.`;
}

function renderMonthGrid() {
  const renderToken = ++monthGridRenderToken;
  try {
    showMonthGridError("");
    const monthData = getActiveMonthData();
    const monthLabel = getMonthLabel(activeMonthKey);
    const titleEl = document.getElementById("monthDailyTitle");
    const head = document.getElementById("monthGridHead");
    const body = document.getElementById("monthGridBody");
    const foot = document.getElementById("monthGridFoot");
    if (!titleEl || !head || !body || !foot) {
      showMonthGridError("Chybí HTML mřížky – obnovte stránku (Cmd+Shift+R).");
      return;
    }

    titleEl.textContent = `Měsíční zápis – ${monthLabel}`;
    updateAppMonthBadge();

    ensureMonthRowsComplete(monthData, activeMonthKey);
    const members = getGridMembers(monthData);

    const headRow1 = document.createElement("tr");
    const leftTitles = ["Datum", "Montéro-hodiny", "Počet montáží", "Průměr/den"];
    leftTitles.forEach((title, i) => {
      const th = document.createElement("th");
      th.textContent = title;
      th.className = i === 0 ? "sticky-left" : i === 1 ? "sticky-left-2" : "";
      th.rowSpan = 2;
      headRow1.append(th);
    });
    const subColClasses = ["month-grid-col-hours", "month-grid-col-target", "month-grid-col-kraj", "month-grid-col-actual"];
    members.forEach((member) => {
      const stored = ensureMemberInMonth(monthData, member);
      const realIdx = monthData.members.indexOf(stored);
      const th = document.createElement("th");
      th.colSpan = MEMBER_FIELD_COUNT;
      th.className = "month-grid-member-head";

      const wrap = buildMemberHead(member, realIdx);
      th.append(wrap);
      headRow1.append(th);
    });

    const headRow2 = document.createElement("tr");
    const subLabels = ["hodiny", "target", "kraj", "skutečnost"];
    members.forEach(() => {
      subLabels.forEach((label, i) => {
        const th = document.createElement("th");
        th.textContent = label;
        th.className = `month-grid-member-sub ${subColClasses[i]}${i === 0 ? " month-grid-member-block-start" : ""}`;
        headRow2.append(th);
      });
    });

    const bodyRows = [];
    monthData.rows.forEach((row, rowIdx) => {
    const tr = document.createElement("tr");

    const tdDate = document.createElement("td");
    tdDate.className = "sticky-left";
    tdDate.textContent = formatGridDate(row.date);
    tr.append(tdDate);

    const tdHours = document.createElement("td");
    tdHours.className = "sticky-left-2 koef-readonly";
    tdHours.textContent = fmt(row.monterHours);
    tr.append(tdHours);

    const tdMont = document.createElement("td");
    tdMont.className = "koef-readonly";
    tdMont.textContent = fmt(row.montageCount, 0);
    tr.append(tdMont);

    const tdAvg = document.createElement("td");
    tdAvg.className = "koef-readonly";
    tdAvg.textContent = fmt(row.avgPerDay, 2);
    tr.append(tdAvg);

    members.forEach((member, mIdx) => {
      const stored = ensureMemberInMonth(monthData, member);
      const realIdx = monthData.members.indexOf(stored);
      const baseCol = MONTH_LEFT_COLS + mIdx * MEMBER_FIELD_COUNT;
      const hours = memberHoursOnDay(stored, row.date);
      const tdH = document.createElement("td");
      tdH.className = "month-grid-hours month-grid-col-hours month-grid-member-block-start";
      const hourInput = document.createElement("input");
      hourInput.readOnly = true;
      hourInput.tabIndex = 0;
      hourInput.className = "grid-nav-input month-grid-hours-input";
      hourInput.value = hours > 0 ? fmt(hours) : "";
      hourInput.title = "Hodiny z PostgreSQL – šipka vpravo = další montér";
      hourInput.dataset.row = String(rowIdx);
      hourInput.dataset.col = String(baseCol);
      hourInput.dataset.field = "hours";
      tdH.append(hourInput);
      tr.append(tdH);

      const tdTarget = document.createElement("td");
      tdTarget.className = "month-grid-col-target";
      tdTarget.append(
        createInput(
          getMemberDayField(stored, row.date, "targetFlag"),
          (val) => {
            setMemberDayField(realIdx, row.date, "targetFlag", Number(val));
            saveState();
            scheduleSaveMesicZapis();
          },
          "number",
          "1",
          { row: rowIdx, col: baseCol + 1, field: "target" },
        ),
      );
      tr.append(tdTarget);

      const tdReg = document.createElement("td");
      tdReg.className = "month-grid-col-kraj";
      tdReg.dataset.row = String(rowIdx);
      tdReg.dataset.col = String(baseCol + 2);
      if (gridRegionSelection.has(regionCellKey(rowIdx, baseCol + 2))) {
        tdReg.classList.add("is-region-selected");
      }
      tdReg.append(
        createGridRegionSelect(
          getMemberDayField(stored, row.date, "destinationRegion"),
          () => {},
          { row: rowIdx, col: baseCol + 2, field: "region" },
        ),
      );
      tr.append(tdReg);

      const tdAct = document.createElement("td");
      const actual = getMemberDayActual(stored, row.date);
      tdAct.className = `month-grid-col-actual koef-readonly${actual === 1 ? " is-at-work" : ""}`;
      tdAct.textContent = String(actual);
      tdAct.title = actual === 1
        ? "Skutečnost = 1 (technik má montérohodiny)"
        : "Skutečnost = 0 (bez montérohodin)";
      tr.append(tdAct);
    });

    bodyRows.push(tr);
    });

    const totalRow = document.createElement("tr");
  totalRow.className = "month-grid-total-row";
  const tdLabel = document.createElement("td");
  tdLabel.className = "sticky-left";
  tdLabel.textContent = "CELKEM";
  totalRow.append(tdLabel);

  const tdSumHours = document.createElement("td");
  tdSumHours.className = "sticky-left-2";
  tdSumHours.textContent = fmt(monthData.rows.reduce((a, r) => a + Number(r.monterHours || 0), 0));
  totalRow.append(tdSumHours);

  const tdSumMont = document.createElement("td");
  tdSumMont.textContent = fmt(monthData.rows.reduce((a, r) => a + Number(r.montageCount || 0), 0), 0);
  totalRow.append(tdSumMont);

  totalRow.append(document.createElement("td"));

  members.forEach((member) => {
    const stored = ensureMemberInMonth(monthData, member);
    const sum = stored.mountedHours ?? sumMemberDailyHours(stored);
    stored.mountedHours = sum;
    const tdH = document.createElement("td");
    tdH.className = "month-grid-hours month-grid-col-hours month-grid-member-block-start";
    tdH.textContent = fmt(sum);
    totalRow.append(tdH);
    const tdT = document.createElement("td");
    tdT.className = "month-grid-col-target";
    totalRow.append(tdT);
    const tdK = document.createElement("td");
    tdK.className = "month-grid-col-kraj";
    totalRow.append(tdK);
    const tdA = document.createElement("td");
    tdA.className = "month-grid-col-actual";
    totalRow.append(tdA);
  });

    if (renderToken !== monthGridRenderToken) return;

    head.replaceChildren(headRow1, headRow2);
    body.replaceChildren(...bodyRows);
    foot.replaceChildren(totalRow);

    head.querySelectorAll("[data-member-name]").forEach((cb) => {
      cb.addEventListener("change", () => {
        toggleMemberCopySelection(cb.dataset.memberName, cb.checked);
      });
    });
    head.querySelectorAll("[data-copy-source]").forEach((btn) => {
      btn.addEventListener("click", () => {
        copyTargetFrom(
          Number(btn.dataset.copySource),
          btn.dataset.copyMode,
          btn.dataset.copyFields,
        );
      });
    });

    setupGridNavigation();
    setupGridRegionSelection();
    setupMonthGridScroll();
    requestAnimationFrame(() => updateMonthGridScrollUi());
  } catch (err) {
    console.error("renderMonthGrid:", err);
    showMonthGridError(`Chyba vykreslení mřížky: ${err.message}`);
  }
}

function createMemberCopyButton(sourceIdx, mode, fields, label) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `copy-target-btn copy-target-btn--compact copy-target-btn--${fields}`;
  btn.textContent = label;
  btn.dataset.copySource = String(sourceIdx);
  btn.dataset.copyMode = mode;
  btn.dataset.copyFields = fields;
  return btn;
}

function buildMemberHead(member, realIdx) {
  const wrap = document.createElement("div");
  wrap.className = "member-head";

  const nameEl = document.createElement("div");
  nameEl.className = "member-head__name";
  nameEl.textContent = member.name;
  nameEl.title = member.name;
  wrap.append(nameEl);

  const receiveRow = document.createElement("div");
  receiveRow.className = "member-head__receive";
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.title = "Zaškrtněte jako příjemce kopírování";
  cb.checked = memberCopySelection.has(normName(member.name));
  cb.dataset.memberName = member.name;
  const receiveLabel = document.createElement("span");
  receiveLabel.className = "member-head__receive-label";
  receiveLabel.textContent = "Příjemce";
  receiveRow.append(cb, receiveLabel);
  wrap.append(receiveRow);

  const copyBlock = document.createElement("div");
  copyBlock.className = "member-head__copy";

  const targetRow = document.createElement("div");
  targetRow.className = "member-head__copy-row member-head__copy-row--target";
  const targetLabel = document.createElement("span");
  targetLabel.className = "member-head__copy-label";
  targetLabel.textContent = "target";
  targetLabel.title = "Kopírovat target";
  const targetBtns = document.createElement("div");
  targetBtns.className = "member-head__copy-btns";
  targetBtns.append(
    createMemberCopyButton(realIdx, "all", "target", "→ všem"),
    createMemberCopyButton(realIdx, "selected", "target", "→ vybr."),
  );
  targetRow.append(targetLabel, targetBtns);

  const regionRow = document.createElement("div");
  regionRow.className = "member-head__copy-row member-head__copy-row--region";
  const regionLabel = document.createElement("span");
  regionLabel.className = "member-head__copy-label";
  regionLabel.textContent = "Kraj";
  regionLabel.title = "Kopírovat kraj";
  const regionBtns = document.createElement("div");
  regionBtns.className = "member-head__copy-btns";
  regionBtns.append(
    createMemberCopyButton(realIdx, "all", "region", "→ všem"),
    createMemberCopyButton(realIdx, "selected", "region", "→ vybr."),
  );
  regionRow.append(regionLabel, regionBtns);

  copyBlock.append(targetRow, regionRow);
  wrap.append(copyBlock);
  return wrap;
}

function getCopyFieldsMode() {
  return document.getElementById("copyFieldsMode")?.value || "both";
}

function copyFieldsLabel(mode) {
  if (mode === "target") return "target";
  if (mode === "region") return "kraj";
  return "target a kraj";
}

function sourceRegionForCopy(source, date) {
  const srcDay = source.dailyCells?.[date];
  if (srcDay && Object.prototype.hasOwnProperty.call(srcDay, "destinationRegion")) {
    return srcDay.destinationRegion;
  }
  return getMemberDayField(source, date, "destinationRegion");
}

function toggleMemberCopySelection(name, checked) {
  const key = normName(name);
  if (checked) memberCopySelection.add(key);
  else memberCopySelection.delete(key);
}

function copyTargetFrom(sourceIdx, mode, fields = getCopyFieldsMode()) {
  const monthData = getActiveMonthData();
  const gridMembers = getGridMembers(monthData);
  const source = monthData.members[sourceIdx];
  if (!source) return;

  const copyTarget = fields === "both" || fields === "target";
  const copyRegion = fields === "both" || fields === "region";
  let count = 0;

  gridMembers.forEach((member) => {
    if (normName(member.name) === normName(source.name)) return;
    const isSelected = mode === "all" || memberCopySelection.has(normName(member.name));
    if (!isSelected) return;

    if (!member.dailyCells) member.dailyCells = {};
    monthData.rows.forEach((row) => {
      if (!member.dailyCells[row.date]) member.dailyCells[row.date] = {};
      const day = member.dailyCells[row.date];
      if (copyTarget) {
        day.targetFlag = Number(getMemberDayField(source, row.date, "targetFlag") || 0);
      }
      if (copyRegion) {
        day.destinationRegion = sourceRegionForCopy(source, row.date);
      }
    });
    count += 1;
  });

  if (mode === "selected" && count === 0) {
    alert(`Nejprve zaškrtněte montéry, kterým chcete zkopírovat ${copyFieldsLabel(fields)}.`);
    return;
  }

  saveState();
  scheduleSaveMesicZapis();
  renderMonthGrid();
  renderCards();
  if (overviewMonthKey === activeMonthKey) fetchPrehledFromApi();
}

function pruneMemberCopySelection() {
  const names = new Set(getActiveMonthData().members.map((m) => normName(m.name)));
  [...memberCopySelection].forEach((name) => {
    if (!names.has(name)) memberCopySelection.delete(name);
  });
}

function populateMonthRosterSelect() {
  const select = document.getElementById("monthRosterSelect");
  if (!select) return;
  const current = new Set(getMonthRosterNames().map(normName));
  select.innerHTML = '<option value="">— vyberte montéra —</option>';
  MONTERI_SEZNAM.forEach((name) => {
    if (current.has(normName(name))) return;
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    select.append(opt);
  });
}

function renderMonthRoster() {
  const list = document.getElementById("monthRosterList");
  const title = document.getElementById("monthRosterTitle");
  if (!list) return;
  const monthLabel = getMonthLabel(activeMonthKey);
  if (title) title.textContent = `Montéři v ${monthLabel}`;
  list.innerHTML = "";
  const names = getMonthRosterNames();
  if (!names.length) {
    const empty = document.createElement("p");
    empty.className = "copy-target-hint";
    empty.textContent = "Zatím žádní montéři – přidejte ze seznamu nebo použijte „Výchozí seznam“.";
    list.append(empty);
    populateMonthRosterSelect();
    return;
  }
  names.forEach((name, idx) => {
    const div = document.createElement("div");
    div.className = "member-card is-roster-item";
    div.innerHTML = `<h4>${name}</h4><p>Sloupec ${idx + 1} v mřížce</p>`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "secondary-btn";
    remove.textContent = "Odebrat";
    remove.style.marginTop = "0.45rem";
    remove.addEventListener("click", () => {
      const next = getMonthRosterNames().filter((n) => normName(n) !== normName(name));
      setMonthRosterNames(activeMonthKey, next);
      renderMonthRoster();
      renderMonthGrid();
      renderCards();
      saveMonthRosterToApi(activeMonthKey);
    });
    div.append(remove);
    list.append(div);
  });
  populateMonthRosterSelect();
}

async function saveMonthRosterToApi(monthKey = activeMonthKey) {
  const names = getMonthRosterNames(monthKey);
  const status = document.getElementById("mesicApiStatus");
  try {
    const resp = await apiFetch("/api/mesic-roster", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mesic_key: monthKey, names }),
    });
    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error || resp.statusText);
    }
    if (status) {
      status.textContent = `Montéři uloženi (${names.length})`;
      status.className = "api-status is-ok";
    }
    await fetchMesicFromApi(monthKey);
    return true;
  } catch (e) {
    if (status) {
      status.textContent = `Uložení montérů selhalo (${e.message})`;
      status.className = "api-status is-error";
    }
    return false;
  }
}

function addMonterToRoster(name) {
  if (!name) return;
  const current = getMonthRosterNames();
  if (current.some((n) => normName(n) === normName(name))) return;
  setMonthRosterNames(activeMonthKey, [...current, name]);
  renderMonthRoster();
  renderMonthGrid();
  renderCards();
  saveMonthRosterToApi(activeMonthKey);
}

function setupMonthRosterToolbar() {
  document.getElementById("monthRosterAddBtn")?.addEventListener("click", () => {
    const select = document.getElementById("monthRosterSelect");
    const name = select?.value?.trim();
    if (!name) return;
    addMonterToRoster(name);
    if (select) select.value = "";
  });
  document.getElementById("monthRosterAddNewBtn")?.addEventListener("click", () => {
    const input = document.getElementById("monthRosterNewName");
    const name = input?.value?.trim();
    if (!name) return;
    addMonterToRoster(name);
    if (input) input.value = "";
  });
  document.getElementById("monthRosterNewName")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      document.getElementById("monthRosterAddNewBtn")?.click();
    }
  });
  document.getElementById("monthRosterDefaultBtn")?.addEventListener("click", () => {
    setMonthRosterNames(activeMonthKey, [...MONTERI_SEZNAM]);
    renderMonthRoster();
    renderMonthGrid();
    renderCards();
    saveMonthRosterToApi(activeMonthKey);
  });
  document.getElementById("monthRosterSaveBtn")?.addEventListener("click", () => {
    saveMonthRosterToApi(activeMonthKey);
  });
  populateMonthRosterSelect();
}

function renderMonthMembers() {
  renderMonthRoster();
  renderMonthGrid();
}

function updateOverview(index, key, value) {
  state.overviewRows[index][key] = value;
  persistAndRender();
}

function updateMonthRow(index, key, value) {
  getActiveMonthData().rows[index][key] = value;
  persistAndRender();
}

function updateMonthMember(index, key, value) {
  getActiveMonthData().members[index][key] = value;
  persistAndRender();
}

function persistAndRender() {
  saveState();
  scheduleSaveMesicZapis();
  renderCards();
  renderMonthGrid();
}

function updateMonthEditorLabel(monthKey = activeMonthKey) {
  const label = document.getElementById("monthEditorLabel");
  if (label) label.textContent = `Měsíční zápis – ${getMonthLabel(monthKey)}`;
}

function buildMonthTabs() {
  const tabsNav = document.getElementById("tabsNav");
  if (!tabsNav) return;
  MONTHS_2026.forEach(({ key, label }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tab";
    button.dataset.tab = "month";
    button.dataset.month = key;
    button.textContent = label.replace(" 2026", "");
    button.title = label;
    tabsNav.append(button);
  });
}

function setupTabs() {
  const tabsNav = document.getElementById("tabsNav");
  if (!tabsNav || tabsNav.dataset.tabsBound) return;
  tabsNav.dataset.tabsBound = "1";
  tabsNav.addEventListener("click", (event) => {
    const tabButton = event.target.closest(".tab");
    if (!tabButton) return;

    document.querySelectorAll(".tab").forEach((btn) => btn.classList.remove("is-active"));
    document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.remove("is-active"));
    tabButton.classList.add("is-active");

    const tabId = tabButton.dataset.tab;
    document.getElementById(tabId)?.classList.add("is-active");

    if (tabId === "month") {
      const monthKey = tabButton.dataset.month;
      if (!monthKey) return;
      activeMonthKey = monthKey;
      overviewMonthKey = monthKey;
      const overviewSelect = document.getElementById("overviewMonthKey");
      if (overviewSelect) overviewSelect.value = monthKey;
      applyKoefFromMonthKey(monthKey);
      pruneMemberCopySelection();
      clearGridRegionSelection();
      updateAppMonthBadge();
      updateMonthEditorLabel(activeMonthKey);
      fetchMesicFromApi(activeMonthKey);
    } else {
      updateAppMonthBadge();
    }
  });
}

function setupOverviewToolbar() {
  const monthSelect = document.getElementById("overviewMonthKey");
  if (!monthSelect) return;
  MONTHS_2026.forEach(({ key, label }) => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = label;
    if (key === overviewMonthKey) opt.selected = true;
    monthSelect.append(opt);
  });
  monthSelect.addEventListener("change", async () => {
    overviewMonthKey = monthSelect.value;
    activeMonthKey = overviewMonthKey;
    applyKoefFromMonthKey(overviewMonthKey);
    shiftOverviewObdobiToMonth(overviewMonthKey);
    updateAppMonthBadge();
    await saveAllObdobiSkupiny();
  });
  document.getElementById("syncRaynetBtn")?.addEventListener("click", async () => {
    const status = document.getElementById("apiStatus");
    await syncRaynetFromApi(status, async () => {
      await fetchPrehledFromApi();
      await fetchMesicFromApi(activeMonthKey);
    });
  });
  document.getElementById("refreshOverviewBtn").addEventListener("click", fetchPrehledFromApi);
  document.getElementById("savePodkladyBtn").addEventListener("click", savePodklady);
  document.getElementById("saveKoeficientyBtn").addEventListener("click", saveKoeficienty);
  document.getElementById("saveObdobiSkupinyBtn")?.addEventListener("click", saveAllObdobiSkupiny);
  document.getElementById("nastavenyMesic").addEventListener("change", () => {
    recomputePodkladyFromKoef();
    fetchPrehledFromApi();
  });
  document.getElementById("nastavenyRok").addEventListener("change", async () => {
    try {
      const rok = getNastavenyRok();
      const resp = await apiFetch(`/api/koeficienty-kraje?rok=${rok}`);
      if (resp.ok) {
        const data = await resp.json();
        overviewPrehled.koeficienty_kraje = KRAJE_LIST.map((kraj) => {
          const months = {};
          for (let m = 1; m <= 12; m += 1) {
            const found = (data.rows || []).find((r) => r.kraj === kraj && Number(r.mesic) === m);
            months[String(m)] = found ? found.koeficient : "";
          }
          return { kraj, mesice: months };
        });
      }
    } catch {
      overviewPrehled.koeficienty_kraje = defaultKoefGrid(getNastavenyRok());
    }
    fetchPrehledFromApi();
  });
}

function setupMesicToolbar() {
  updateMonthEditorLabel(activeMonthKey);
  document.getElementById("syncRaynetMesicBtn")?.addEventListener("click", async () => {
    const status = document.getElementById("mesicApiStatus");
    await syncRaynetFromApi(status, () => fetchMesicFromApi(activeMonthKey));
  });
  document.getElementById("refreshMesicBtn")?.addEventListener("click", () => fetchMesicFromApi(activeMonthKey));
}

function setupMemberCopyToolbar() {
  document.getElementById("selectAllMembersBtn")?.addEventListener("click", () => {
    const monthData = getActiveMonthData();
    getGridMembers(monthData).forEach((member) => {
      memberCopySelection.add(normName(member.name));
    });
    renderMonthMembers();
  });
  document.getElementById("clearMemberSelectionBtn")?.addEventListener("click", () => {
    memberCopySelection.clear();
    renderMonthMembers();
  });
  document.getElementById("fillSelectedRegionsBtn")?.addEventListener("click", () => {
    if (!fillSelectedRegionsFromAnchor()) {
      alert("Nejdřív nastavte kraj v jedné buňce a označte další buňky (táhnutím nebo Shift+klik).");
    }
  });
  document.getElementById("clearGridRegionSelectionBtn")?.addEventListener("click", () => {
    clearGridRegionSelection();
  });
}

async function loadMesicForOverview() {
  try {
    const resp = await apiFetch(`/api/mesic-data`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mesic_key: overviewMonthKey,
        members: [],
      }),
    });
    if (resp.ok) applyMesicData(await resp.json());
  } catch {
    /* bez API zůstane výchozí stav */
  }
}

async function loadAuthSession() {
  const el = document.getElementById("authEmail");
  const logout = document.getElementById("logoutBtn");
  const login = document.getElementById("loginBtn");
  try {
    const envRes = await fetch(`${API_URL}/api/auth/env-status`, { credentials: "same-origin" });
    const env = envRes.ok ? await envRes.json() : { authDisabled: false };

    const res = await fetch(`${API_URL}/api/auth/session`, { credentials: "same-origin" });
    const data = res.ok ? await res.json() : { ok: false };

    if (data?.ok) {
      if (el) {
        el.textContent = data.email;
        el.hidden = false;
      }
      if (logout) logout.hidden = false;
      if (login) login.hidden = true;
      return true;
    }

    if (el) el.hidden = true;
    if (logout) logout.hidden = true;
    if (login) login.hidden = !env.authDisabled;

    if (!env.authDisabled) {
      const next = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
      window.location.replace(`/login.html?next=${next}`);
      return false;
    }
    return true;
  } catch {
    if (login) login.hidden = false;
    return false;
  }
}

async function init() {
  try {
    const authed = await loadAuthSession();
    if (!authed) return;
    state = normalizeState(state);
    ensureOverviewRowsFromSkupiny();
    buildMonthTabs();
    setupTabs();
    setupMemberCopyToolbar();
    setupMesicToolbar();
    setupMonthRosterToolbar();
    setupOverviewToolbar();
    setupGridNavigation();
    setupGridRegionSelection();
    setupMonthGridScroll();
    renderMonthRoster();
    renderCiselnikSkupiny();
    renderKoeficienty();
    await loadMesicForOverview();
    await fetchPrehledFromApi();
    updateAppMonthBadge();
  } catch (err) {
    console.error("Init selhal:", err);
    const status = document.getElementById("apiStatus");
    if (status) {
      status.textContent = `Chyba inicializace (${err.message})`;
      status.className = "api-status is-error";
    }
  }
}

init();
