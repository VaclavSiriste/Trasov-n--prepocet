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
  members: [
    { name: "Tomáš Körner", availability: "17.11. - 5.12." },
    { name: "Petr Svoboda", availability: "17.11. - 5.12." },
    { name: "Adam Hurban", availability: "1.12. - 19.12." },
    { name: "Denis David", availability: "1.12. - 19.12." },
    { name: "Lubomír Micov", availability: "1.12. - 19.12." },
    { name: "Václav Paletář", availability: "15.12. - 3.1.2026" },
    { name: "Daniel Mácha", availability: "15.12. - 3.1.2026" },
    { name: "Jan Holec", availability: "15.12. - 3.1.2026" },
    { name: "Jaromír Rozsíval", availability: "16.2. - 27.2.2026" },
    { name: "Vojtěch Slavinský", availability: "16.3. - 27.3.2026" },
    { name: "Zbyněk Jergl", availability: "16.3. - 27.3.2026" },
    { name: "Antonín Trenkner", availability: "16.3. - 27.3.2026" },
    { name: "Zdeněk Pokorný", availability: "16.3. - 27.3.2026" },
    { name: "David Duch", availability: "30.3. - 10.4.2026" },
    { name: "Dominik Šípek", availability: "30.3. - 10.4.2026" },
    { name: "Jindřich Baštář", availability: "30.3. - 10.4.2026" },
    { name: "Daniel Král", availability: "30.3. - 10.4.2026" },
    { name: "Martin Onderka", availability: "6.4. - 24.4.2026" },
    { name: "Jan Veverka", availability: "6.4. - 24.4.2026" },
    { name: "Michal Macháček", availability: "4.5. - 22.5.2026" },
    { name: "Vilém Mazák", availability: "4.5. - 22.5.2026" },
    { name: "Jiří Staněk", availability: "18.5. - 5.6.2026" },
    { name: "René Berger", availability: "" },
    { name: "Ivan Tokoš", availability: "" },
    { name: "Michal Kurfiřt", availability: "" },
    { name: "Radek Smoček", availability: "" },
    { name: "Roman Marejka", availability: "" },
    { name: "Roman Zwolski", availability: "" },
    { name: "Dominik Žihala", availability: "" },
    { name: "Jakub Krejza", availability: "" },
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

function loadState() {
  try {
    const savedV2 = localStorage.getItem(STORAGE_KEY);
    if (savedV2) {
      return normalizeState({ ...structuredClone(defaultState), ...JSON.parse(savedV2) });
    }

    const savedV1 = localStorage.getItem("trasovani-reporting-v1");
    if (savedV1) {
      const parsed = JSON.parse(savedV1);
      const migrated = { ...structuredClone(defaultState), ...parsed };
      if (parsed.juneRows) {
        migrated.months = migrated.months || {};
        migrated.months["2026-06"] = {
          rows: parsed.juneRows,
          members: parsed.juneMembers || [],
        };
      }
      delete migrated.juneRows;
      delete migrated.juneMembers;
      return normalizeState(migrated);
    }

    return normalizeState(structuredClone(defaultState));
  } catch {
    return normalizeState(structuredClone(defaultState));
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

const MONTH_LEFT_COLS = 6;
const MEMBER_FIELD_COUNT = 4;

const MONTERI_JMENA = new Set(
  [
    "Jaroslav Balog", "Dominik Žihala", "Mirek Truhelka", "Jakub Krejza", "Vojtěch Žihala",
    "Karel Vengřinovič", "Tomáš Bok", "Stanislav Ivanov", "Roman Bek", "Filip Špígl",
    "Viktor Heger", "Adam Blažej", "Martin Strakoš", "Vladimír Novotný", "Petr Griač",
    "Kamil Beneš", "Radomír Ipri", "Arnošt Mynář", "Josef Fojtík", "Rostislav Vjačka",
    "Milan Smutný", "Miroslav Pecháček", "David Vallo", "Jakub Bečvář", "Jiří Dvořák",
    "Michal Kurfiřt", "Roman Marejka", "Jan Lorenc", "Radek Smoček", "René Berger",
    "Martin Bursík", "Petr Orel", "David Dočkal", "Matěj Čerych", "Maksim Dziarabkin",
    "Denis Willert", "Vladimir Chmelík", "Norbert Bider", "Tomáš Nesvačil", "Martin Žák",
    "Daniel Krkoška", "Jakub Fišer", "René Rovňak", "Jan Zemčík", "Lukáš Pospíšil",
    "Ondřej Crha", "Radovan Tesař", "Jan Perlík", "Václav Vála", "Tomáš Stoklasa", "Pavel Čejka",
  ].map((n) => n.trim().toLowerCase()),
);

function normName(name) {
  return (name || "").trim().toLowerCase();
}

function isMonterName(name) {
  return MONTERI_JMENA.has(normName(name));
}

/** Montéři pro měsíční mřížku – jen skuteční montéři, případně s hodinami v měsíci. */
const DEFAULT_GRID_MONTERI = [
  "Dominik Žihala", "Jakub Krejza", "Martin Strakoš", "Jan Zemčík", "Radovan Tesař",
  "Josef Fojtík", "Daniel Krkoška", "Maksim Dziarabkin", "Vladimír Novotný", "Denis Willert",
];

function getGridMembers(monthData) {
  const all = monthData.members || [];
  const withHours = all
    .filter((m) => sumMemberDailyHours(m) > 0 || Number(m.mountedHours || 0) > 0)
    .sort((a, b) => Number(b.mountedHours || 0) - Number(a.mountedHours || 0));
  if (withHours.length) return withHours.slice(0, 20);
  const mont = all.filter((m) => isMonterName(m.name));
  if (mont.length) return mont.slice(0, 20);
  const fromHours = all.filter((m) => sumMemberDailyHours(m) > 0 || Number(m.mountedHours || 0) > 0);
  if (fromHours.length) return fromHours;
  return DEFAULT_GRID_MONTERI.map((name) => {
    const found = all.find((m) => normName(m.name) === normName(name));
    return found || {
      name,
      mountedHours: 0,
      dailyHours: {},
      dailyCells: {},
      targetFlag: 0,
      destinationRegion: "MSK",
      actualFlag: 0,
    };
  });
}

function isMonthTabActive() {
  return document.getElementById("month")?.classList.contains("is-active");
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

function getMemberDayField(member, date, field) {
  const day = member.dailyCells?.[date];
  if (day && Object.prototype.hasOwnProperty.call(day, field)) return day[field];
  if (field === "targetFlag") {
    const hours = Number(member.dailyHours?.[date] || 0);
    return hours > 0 ? 1 : (member.targetFlag ?? 0);
  }
  if (field === "destinationRegion") return member.destinationRegion ?? "MSK";
  if (field === "actualFlag") return member.actualFlag ?? 0;
  return "";
}

function setMemberDayField(memberIdx, date, field, value) {
  const member = getActiveMonthData().members[memberIdx];
  if (!member.dailyCells) member.dailyCells = {};
  if (!member.dailyCells[date]) member.dailyCells[date] = {};
  member.dailyCells[date][field] = value;
}

function createDefaultMonthMembers(members = []) {
  return members.map((member) => ({
    name: member.name,
    mountedHours: 0,
    dailyHours: {},
    dailyCells: {},
    targetFlag: 0,
    destinationRegion: "MSK",
    actualFlag: 0,
  }));
}

function ensureMonthIn(months, key, members) {
  if (!months[key]) {
    months[key] = { rows: [], members: createDefaultMonthMembers(members) };
  }
  if (!Array.isArray(months[key].rows)) months[key].rows = [];
  if (!Array.isArray(months[key].members)) months[key].members = createDefaultMonthMembers(members);
  months[key].members.forEach((m) => {
    if (!m.dailyHours) m.dailyHours = {};
    if (!m.dailyCells) m.dailyCells = {};
  });
  return months[key];
}

function syncMonthMembersFor(monthData, members) {
  members.forEach((member) => {
    if (!monthData.members.some((entry) => entry.name === member.name)) {
      monthData.members.push({
        name: member.name,
        mountedHours: 0,
        dailyHours: {},
        dailyCells: {},
        targetFlag: 0,
        destinationRegion: "MSK",
        actualFlag: 0,
      });
    }
  });
}

function ensureMonth(key) {
  return ensureMonthIn(state.months, key, state.members);
}

function normalizeState(sourceState) {
  const normalized = sourceState;
  if (!normalized.months || typeof normalized.months !== "object") normalized.months = {};
  if (!Array.isArray(normalized.members)) normalized.members = [];
  if (!Array.isArray(normalized.overviewRows)) normalized.overviewRows = [];

  const members = normalized.members;
  MONTHS_2026.forEach(({ key }) => ensureMonthIn(normalized.months, key, members));
  Object.values(normalized.months).forEach((monthData) => {
    syncMonthMembersFor(monthData, members);
    pruneImplicitDailyRosterCells(monthData);
  });

  return normalized;
}

function getMonthLabel(key) {
  return MONTHS_2026.find((m) => m.key === key)?.label || key;
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
    <div class="card"><p>Členové týmu</p><h3>${fmt(state.members.length, 0)}</h3></div>
  `;
  }

  const monthData = getActiveMonthData();
  const totalMontages = monthData.rows.reduce((acc, row) => acc + Number(row.montageCount || 0), 0);
  const totalHours = monthData.rows.reduce((acc, row) => acc + Number(row.monterHours || 0), 0);
  const activeCount = monthData.members.reduce((acc, row) => acc + Number(row.actualFlag || 0), 0);

  const monthCards = document.getElementById("monthCards");
  if (!monthCards) return;
  monthCards.innerHTML = `
    <div class="card"><p>Montáže za měsíc</p><h3>${fmt(totalMontages, 0)}</h3></div>
    <div class="card"><p>Montéro-hodiny celkem</p><h3>${fmt(totalHours)}</h3></div>
    <div class="card"><p>Robí skutečnost (součet 1)</p><h3>${fmt(activeCount, 0)}</h3></div>
    <div class="card"><p>Vybráno celkem</p><h3>${fmt(monthData.rows.reduce((a, r) => a + Number(r.collected || 0), 0))}</h3></div>
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

function createGridSelect(value, options, onChange, navMeta) {
  const select = document.createElement("select");
  select.classList.add("grid-nav-input", "grid-nav-select");
  select.dataset.row = String(navMeta.row);
  select.dataset.col = String(navMeta.col);
  select.dataset.field = navMeta.field || "";
  const emptyOption = document.createElement("option");
  emptyOption.value = "";
  emptyOption.textContent = "—";
  if (value === "") emptyOption.selected = true;
  select.append(emptyOption);
  options.forEach((code) => {
    const option = document.createElement("option");
    option.value = code;
    option.textContent = code;
    if (value === code) option.selected = true;
    select.append(option);
  });
  select.addEventListener("change", () => onChange(select.value));
  return select;
}

function focusGridCell(row, col) {
  const el = document.querySelector(
    `#monthGridTable .grid-nav-input[data-row="${row}"][data-col="${col}"]`,
  );
  if (el) {
    el.focus();
    if (el.select) el.select();
  }
}

function handleGridArrowKey(e) {
  const el = e.target;
  if (!el.matches(".grid-nav-input")) return;
  const row = Number(el.dataset.row);
  const col = Number(el.dataset.col);
  const monthData = getActiveMonthData();
  const maxRow = monthData.rows.length;
  const memberCount = monthData.members.length;
  const maxMemberCol = MONTH_LEFT_COLS + memberCount * MEMBER_FIELD_COUNT - 1;

  if (e.key === "ArrowDown" && row < maxRow) {
    e.preventDefault();
    focusGridCell(row + 1, col);
    return;
  }
  if (e.key === "ArrowUp" && row > 0) {
    e.preventDefault();
    focusGridCell(row - 1, col);
    return;
  }
  if (e.key === "ArrowRight") {
    e.preventDefault();
    if (col < MONTH_LEFT_COLS - 1) {
      focusGridCell(row, col + 1);
      return;
    }
    if (col >= MONTH_LEFT_COLS) {
      const rel = col - MONTH_LEFT_COLS;
      const fieldIdx = rel % MEMBER_FIELD_COUNT;
      const memberIdx = Math.floor(rel / MEMBER_FIELD_COUNT);
      if (fieldIdx === 0 && memberIdx + 1 < memberCount) {
        focusGridCell(row, MONTH_LEFT_COLS + (memberIdx + 1) * MEMBER_FIELD_COUNT);
      } else if (fieldIdx < MEMBER_FIELD_COUNT - 1) {
        focusGridCell(row, col + 1);
      } else if (memberIdx + 1 < memberCount) {
        focusGridCell(row, MONTH_LEFT_COLS + (memberIdx + 1) * MEMBER_FIELD_COUNT);
      }
      return;
    }
    if (memberCount > 0) {
      focusGridCell(row, MONTH_LEFT_COLS);
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
        focusGridCell(row, MONTH_LEFT_COLS + (memberIdx - 1) * MEMBER_FIELD_COUNT);
      } else {
        focusGridCell(row, col - 1);
      }
      return;
    }
    if (col === MONTH_LEFT_COLS) {
      focusGridCell(row, MONTH_LEFT_COLS - 1);
      return;
    }
    if (col > 0) focusGridCell(row, col - 1);
  }
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
    destination_region: m.destinationRegion || "MSK",
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
      const implicitDest = !hasDest || dest === "MSK";
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

/** Jen ruční úpravy z mřížky – server doplní MSK z Raynetu. */
function getDailyRosterOverrides() {
  const monthData = state.months[overviewMonthKey];
  if (!monthData?.members?.length) return [];
  const entries = [];
  const days = monthData.rows?.length ? monthData.rows.map((r) => r.date) : daysInMonthKey(overviewMonthKey);
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
        destination_region: "MSK",
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
        roster: getRosterPayload(),
        daily_roster: getDailyRosterPayload(),
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
        : " – výchozí MSK z Raynetu";
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
      objednano_ks: row.orderedNotPlanned || 0,
      lze_objednat_ks: missing != null ? missing - (row.orderedNotPlanned || 0) : null,
      posunout_vyrobu: row.shiftProduction || "NE",
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
  const monthData = ensureMonthIn(state.months, monthKey, state.members);
  const existingByDate = new Map((monthData.rows || []).map((r) => [r.date, r]));
  const denniByDate = new Map((data.denni || []).map((d) => [d.datum, d]));
  const zapisByDate = new Map((data.zapis_den || []).map((z) => [z.datum, z]));

  monthData.rows = daysInMonthKey(monthKey).map((date) => {
    const d = denniByDate.get(date);
    const old = existingByDate.get(date) || {};
    const z = zapisByDate.get(date);
    return {
      date,
      monterHours: d?.monter_hours ?? old.monterHours ?? 0,
      montageCount: d?.montage_count ?? old.montageCount ?? 0,
      avgPerDay: d?.avg_per_day ?? old.avgPerDay ?? 0,
      collected: z?.collected ?? old.collected ?? 0,
      reason: z?.reason ?? old.reason ?? "",
    };
  });

  (data.members || []).forEach((m) => {
    const mem = ensureMemberInMonth(monthData, { name: m.name });
    mem.dailyHours = m.daily_hours || {};
    mem.mountedHours = m.mounted_hours ?? sumMemberDailyHours(mem);
    mem.actualFlag = m.actual_flag;
  });

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
    const mem = ensureMemberInMonth(monthData, { name: entry.jmeno });
    if (!mem.dailyCells) mem.dailyCells = {};
    if (!mem.dailyCells[entry.datum]) mem.dailyCells[entry.datum] = {};
    mem.dailyCells[entry.datum].targetFlag = entry.target_flag;
    mem.dailyCells[entry.datum].destinationRegion = entry.destination_region;
  });

  saveState();
  renderMonthGrid();
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

async function saveMesicZapisToApi() {
  await apiFetch(`/api/mesic-zapis`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mesic_key: overviewMonthKey,
      daily_roster: getDailyRosterPayload(),
      zapis_den: getZapisDenPayload(),
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
  status.textContent = "Načítám měsíc z PostgreSQL…";
  status.className = "api-status";
  showMonthGridError("");

  try {
    const resp = await apiFetch(`/api/mesic-data`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mesic_key: monthKey, members: [] }),
    });
    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error || resp.statusText);
    }
    const data = await resp.json();
    if (monthKey === activeMonthKey) {
      applyMesicData(data);
      status.textContent = `Načteno z PostgreSQL (${data.denni?.length || 0} dní, ${data.members?.length || 0} montérů)`;
      status.className = "api-status is-ok";
    }
  } catch (e) {
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
  if (!["objednano_ks", "posunout_vyrobu"].includes(key)) return;
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
          posunout_vyrobu: row.posunout_vyrobu,
        }),
      });
      recomputePodkladyFromKoef();
    } catch {
      /* lokální režim */
    }
  }
}

function renderMembers() {
  const membersList = document.getElementById("membersList");
  membersList.innerHTML = "";
  state.members.forEach((member, idx) => {
    const div = document.createElement("div");
    div.className = "member-card";
    div.innerHTML = `<h4>${member.name}</h4><p>${member.availability || "Bez termínu"}</p>`;

    const remove = document.createElement("button");
    remove.className = "secondary-btn";
    remove.textContent = "Odebrat";
    remove.style.marginTop = "0.45rem";
    remove.addEventListener("click", () => {
      const removed = state.members[idx];
      state.members.splice(idx, 1);
      Object.values(state.months).forEach((monthData) => {
        const memberIdx = monthData.members.findIndex((entry) => entry.name === removed.name);
        if (memberIdx >= 0) monthData.members.splice(memberIdx, 1);
      });
      renderMonthMembers();
      persistAndRender();
    });
    div.append(remove);
    membersList.append(div);
  });
}

function formatGridDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${Number(d)}.${Number(m)}.`;
}

function renderMonthGrid() {
  try {
    showMonthGridError("");
    const monthData = getActiveMonthData();
    const monthLabel = getMonthLabel(activeMonthKey);
    const titleEl = document.getElementById("monthDailyTitle");
    const badgeEl = document.getElementById("monthBadge");
    const head = document.getElementById("monthGridHead");
    const body = document.getElementById("monthGridBody");
    const foot = document.getElementById("monthGridFoot");
    if (!titleEl || !head || !body || !foot) {
      showMonthGridError("Chybí HTML mřížky – obnovte stránku (Cmd+Shift+R).");
      return;
    }

    titleEl.textContent = `Měsíční zápis – ${monthLabel}`;
    if (badgeEl) badgeEl.textContent = monthLabel;

    ensureMonthRowsComplete(monthData, activeMonthKey);
    const members = getGridMembers(monthData);
    head.innerHTML = "";
    body.innerHTML = "";
    foot.innerHTML = "";

  const headRow1 = document.createElement("tr");
  const leftTitles = ["Datum", "Montéro-hodiny", "Kolik vybral", "Počet montáží", "Průměr/den", "Důvod"];
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
  head.append(headRow1);

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
  head.append(headRow2);

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

  monthData.rows.forEach((row, rowIdx) => {
    const tr = document.createElement("tr");
    const reasonClass = row.reason ? "warn" : "ok";

    const tdDate = document.createElement("td");
    tdDate.className = "sticky-left";
    tdDate.textContent = formatGridDate(row.date);
    tr.append(tdDate);

    const tdHours = document.createElement("td");
    tdHours.className = "sticky-left-2 koef-readonly";
    tdHours.textContent = fmt(row.monterHours);
    tr.append(tdHours);

    const tdCollected = document.createElement("td");
    tdCollected.append(
      createInput(row.collected, (val) => updateMonthRow(rowIdx, "collected", Number(val)), "number", "0.1", {
        row: rowIdx,
        col: 2,
        field: "collected",
      }),
    );
    tr.append(tdCollected);

    const tdMont = document.createElement("td");
    tdMont.className = "koef-readonly";
    tdMont.textContent = fmt(row.montageCount, 0);
    tr.append(tdMont);

    const tdAvg = document.createElement("td");
    tdAvg.className = "koef-readonly";
    tdAvg.textContent = fmt(row.avgPerDay, 2);
    tr.append(tdAvg);

    const tdReason = document.createElement("td");
    const reasonInput = createInput(row.reason, (val) => updateMonthRow(rowIdx, "reason", val), "text", "", {
      row: rowIdx,
      col: 5,
      field: "reason",
    });
    reasonInput.placeholder = row.reason || "OK";
    reasonInput.classList.add(reasonClass);
    tdReason.append(reasonInput);
    tr.append(tdReason);

    members.forEach((member, mIdx) => {
      const stored = ensureMemberInMonth(monthData, member);
      const realIdx = monthData.members.indexOf(stored);
      const baseCol = MONTH_LEFT_COLS + mIdx * MEMBER_FIELD_COUNT;
      const hours = member.dailyHours?.[row.date];
      const tdH = document.createElement("td");
      tdH.className = "month-grid-hours month-grid-col-hours month-grid-member-block-start";
      const hourInput = document.createElement("input");
      hourInput.readOnly = true;
      hourInput.tabIndex = 0;
      hourInput.className = "grid-nav-input month-grid-hours-input";
      hourInput.value = hours ? fmt(hours) : "";
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
          getMemberDayField(member, row.date, "targetFlag"),
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
      tdReg.append(
        createGridSelect(
          getMemberDayField(member, row.date, "destinationRegion"),
          REGION_CODES,
          (val) => {
            setMemberDayField(realIdx, row.date, "destinationRegion", val);
            saveState();
            scheduleSaveMesicZapis();
          },
          { row: rowIdx, col: baseCol + 2, field: "region" },
        ),
      );
      tr.append(tdReg);

      const tdAct = document.createElement("td");
      tdAct.className = "month-grid-col-actual";
      tdAct.append(
        createInput(
          getMemberDayField(member, row.date, "actualFlag"),
          (val) => {
            setMemberDayField(realIdx, row.date, "actualFlag", Number(val));
            saveState();
          },
          "number",
          "1",
          { row: rowIdx, col: baseCol + 3, field: "actual" },
        ),
      );
      tr.append(tdAct);
    });

    body.append(tr);
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

  const tdSumColl = document.createElement("td");
  tdSumColl.textContent = fmt(monthData.rows.reduce((a, r) => a + Number(r.collected || 0), 0));
  totalRow.append(tdSumColl);

  const tdSumMont = document.createElement("td");
  tdSumMont.textContent = fmt(monthData.rows.reduce((a, r) => a + Number(r.montageCount || 0), 0), 0);
  totalRow.append(tdSumMont);

  totalRow.append(document.createElement("td"));
  totalRow.append(document.createElement("td"));

  members.forEach((member) => {
    const sum = member.mountedHours ?? sumMemberDailyHours(member);
    member.mountedHours = sum;
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

  foot.append(totalRow);
    setupGridNavigation();
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
  const source = monthData.members[sourceIdx];
  if (!source) return;

  const copyTarget = fields === "both" || fields === "target";
  const copyRegion = fields === "both" || fields === "region";
  let count = 0;

  monthData.members.forEach((member, idx) => {
    if (idx === sourceIdx) return;
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

function renderMonthMembers() {
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

function buildMonthTabs() {
  const tabsNav = document.getElementById("tabsNav");
  MONTHS_2026.forEach(({ key, label }) => {
    const button = document.createElement("button");
    button.className = "tab";
    button.dataset.tab = "month";
    button.dataset.month = key;
    button.textContent = label;
    tabsNav.append(button);
  });
}

function setupTabs() {
  document.querySelectorAll(".tab").forEach((tabButton) => {
    tabButton.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((btn) => btn.classList.remove("is-active"));
      document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.remove("is-active"));
      tabButton.classList.add("is-active");

      const tabId = tabButton.dataset.tab;
      document.getElementById(tabId).classList.add("is-active");

      if (tabId === "month") {
        activeMonthKey = tabButton.dataset.month;
        pruneMemberCopySelection();
        document.getElementById("monthBadge").textContent = getMonthLabel(activeMonthKey);
        renderMonthGrid();
        renderCards();
        fetchMesicFromApi(activeMonthKey);
      } else {
        document.getElementById("monthBadge").textContent = "2026";
      }
    });
  });
}

function wireDialogCancel(dialog, form) {
  form.querySelector(".dialog-cancel-btn")?.addEventListener("click", () => {
    dialog.close();
    form.reset();
  });
}

function setupDialogs() {
  const memberDialog = document.getElementById("memberDialog");
  const memberForm = document.getElementById("memberForm");
  const addMemberBtn = document.getElementById("addMemberBtn");
  if (!memberDialog || !memberForm || !addMemberBtn) return;
  addMemberBtn.addEventListener("click", () => memberDialog.showModal());
  wireDialogCancel(memberDialog, memberForm);
  memberForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(memberForm);
    const name = String(data.get("name") || "").trim();
    if (!name) return;
    state.members.push({
      name,
      availability: String(data.get("availability") || "").trim(),
    });
    Object.values(state.months).forEach((monthData) => {
      monthData.members.push({
        name,
        mountedHours: 0,
        dailyHours: {},
        dailyCells: {},
        targetFlag: 0,
        destinationRegion: "MSK",
        actualFlag: 0,
      });
    });
    saveState();
    renderMembers();
    renderMonthMembers();
    renderCards();
    memberDialog.close();
    memberForm.reset();
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
  monthSelect.addEventListener("change", () => {
    overviewMonthKey = monthSelect.value;
    fetchPrehledFromApi();
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
}

async function loadMesicForOverview() {
  try {
    const resp = await apiFetch(`/api/mesic-data`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mesic_key: overviewMonthKey, members: [] }),
    });
    if (resp.ok) applyMesicData(await resp.json());
  } catch {
    /* localStorage fallback */
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
    setupDialogs();
    setupMemberCopyToolbar();
    setupMesicToolbar();
    setupOverviewToolbar();
    setupGridNavigation();
    renderMembers();
    renderCiselnikSkupiny();
    renderKoeficienty();
    await loadMesicForOverview();
    await fetchPrehledFromApi();
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
