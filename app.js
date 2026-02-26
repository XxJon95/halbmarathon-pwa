import { app, auth, db } from "./firebase.js";
import { signInWithGoogle, signOutUser, onAuthChange } from "./auth.js";
import { loadUserSettings, saveUserSettings } from "./settingsStore.js";

const firebasePreparedModules = {
  app,
  auth,
  db,
  signInWithGoogle,
  signOutUser,
  onAuthChange,
  loadUserSettings,
  saveUserSettings
};
void firebasePreparedModules;

const DEFAULT_SHEET_URL = "https://docs.google.com/spreadsheets/d/1wmLe1BIdWzQ2UYf0b20IRTae1E_a9eru0vd_bhDeRkw/export?format=csv";

const LEGACY_SETTINGS_KEY = "HM_DEV_SETTINGS";
const PLAN_STORAGE_KEY = "HM_PLAN_SETTINGS";

let ACTIVE_USER_UID = null;
let APP_INITIALIZED_UID = null;
let PLAN_SETTINGS = null;
let TODAY_DATE = null;
let SETTINGS_UI_BOUND = false;
let HIDE_SYNC_INDICATOR_TIMEOUT = null;
let HIDE_SYNC_INDICATOR_FADE_TIMEOUT = null;

const DEFAULT_PLAN_SETTINGS = {
  eventName: "Halbmarathon",
  season: "Sommer",
  year: 2026,
  start: "2026-01-01",
  race: "2026-07-05",
  p1: 8,
  p2: 8,
  p3: 4,
  p4: 2,
  sheetURL: DEFAULT_SHEET_URL
};

const SEASON_OPTIONS = ["Fruehling", "Sommer", "Herbst", "Winter"];

function normalizeEventName(value, fallback) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

function normalizeSeason(value, fallback) {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim() === "Frühling" ? "Fruehling" : value.trim();
  return SEASON_OPTIONS.includes(normalized) ? normalized : fallback;
}

function normalizeEventYear(value, fallback) {
  const parsed = parseInt(value, 10);
  if (!Number.isInteger(parsed)) return fallback;
  if (parsed < 2026 || parsed > 2050) return fallback;
  return parsed;
}

function safeJSONParse(value, fallback) {
  if (!value) return fallback;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function toPositiveInt(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeISODate(value, fallback) {
  if (!value || typeof value !== "string") return fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;

  const parsed = new Date(value + "T00:00:00");
  return Number.isNaN(parsed.getTime()) ? fallback : value;
}

function normalizeSheetURL(value, fallback) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

function toISODate(date) {
  return (
    date.getFullYear() + "-" +
    String(date.getMonth() + 1).padStart(2, "0") + "-" +
    String(date.getDate()).padStart(2, "0")
  );
}

function formatISODateForDisplay(isoDate) {
  if (!isoDate) return "-";
  const parts = isoDate.split("-");
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

function formatSeasonLabel(seasonValue) {
  if (seasonValue === "Fruehling") return "Frühling";
  return seasonValue;
}

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function addDays(dateString, days) {
  const d = new Date(dateString + "T00:00:00");
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

function addWeeks(dateString, weeks) {
  return addDays(dateString, weeks * 7);
}

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === "\"") {
      insideQuotes = !insideQuotes;
    } else if (char === "," && !insideQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);
  return result.map((field) => field.replace(/^"|"$/g, "").trim());
}

function parseSheetDate(rawDate) {
  if (!rawDate) return "";
  const value = rawDate.trim();
  if (!value) return "";

  if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(value)) {
    const [day, month, year] = value.split(".");
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return "";

  return toISODate(parsedDate);
}

function findColumnIndex(header, candidates) {
  const normalizedHeader = header.map((h) => h.trim().toLowerCase());

  for (const candidate of candidates) {
    const idx = normalizedHeader.indexOf(candidate.toLowerCase());
    if (idx !== -1) return idx;
  }

  return -1;
}

function readField(values, index, fallback) {
  if (index < 0 || index >= values.length) return fallback;
  const value = (values[index] || "").trim();
  return value || fallback;
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.innerText = value;
}

function debounce(fn, waitMs) {
  let timeoutId = null;

  return (...args) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      timeoutId = null;
      fn(...args);
    }, waitMs);
  };
}

function updateBodyScrollLock() {
  const weeksOverlay = document.getElementById("weeks-overlay");
  const settingsOverlay = document.getElementById("settings-overlay");
  const globalLoader = document.getElementById("global-loader");

  const hasBlockingLayer =
    (weeksOverlay && !weeksOverlay.classList.contains("hidden")) ||
    (settingsOverlay && !settingsOverlay.classList.contains("hidden")) ||
    (globalLoader && !globalLoader.classList.contains("hidden"));

  document.body.classList.toggle("no-scroll", Boolean(hasBlockingLayer));
}

function setGlobalLoaderVisible(isVisible) {
  const loader = document.getElementById("global-loader");
  if (!loader) return;

  loader.classList.toggle("hidden", !isVisible);
  updateBodyScrollLock();
}

function showSyncIndicator() {
  const indicator = document.getElementById("sync-indicator");
  if (!indicator) return;

  if (HIDE_SYNC_INDICATOR_FADE_TIMEOUT) {
    clearTimeout(HIDE_SYNC_INDICATOR_FADE_TIMEOUT);
  }

  indicator.classList.remove("hidden");
  requestAnimationFrame(() => {
    indicator.classList.add("is-visible");
  });

  if (HIDE_SYNC_INDICATOR_TIMEOUT) {
    clearTimeout(HIDE_SYNC_INDICATOR_TIMEOUT);
  }

  HIDE_SYNC_INDICATOR_TIMEOUT = setTimeout(() => {
    indicator.classList.remove("is-visible");
    HIDE_SYNC_INDICATOR_FADE_TIMEOUT = setTimeout(() => {
      indicator.classList.add("hidden");
      HIDE_SYNC_INDICATOR_FADE_TIMEOUT = null;
    }, 250);
  }, 2000);
}

function setSettingsError(message) {
  const errorEl = document.getElementById("settings-error");
  if (!errorEl) return;

  if (message) {
    errorEl.innerText = message;
    errorEl.classList.remove("hidden");
    return;
  }

  errorEl.innerText = "";
  errorEl.classList.add("hidden");
}

const debouncedPersistUserSettings = debounce(async (uid, settings) => {
  if (!uid) return;

  try {
    await saveUserSettings(uid, settings);
    showSyncIndicator();
  } catch (error) {
    console.error("Firestore settings save failed, kept local cache:", error);
  }
}, 800);

function hasDisplayValue(value) {
  if (value === null || value === undefined) return false;
  const normalized = String(value).trim();
  return normalized !== "" && normalized !== "-" && normalized !== "—";
}

function derivePhase3Weeks(startISO, raceISO, p1, p2) {
  const msPerWeek = 1000 * 60 * 60 * 24 * 7;
  const phase3Start = new Date(addWeeks(startISO, p1 + p2) + "T00:00:00");
  const raceDate = new Date(raceISO + "T00:00:00");
  const rawWeeks = Math.round((raceDate - phase3Start) / msPerWeek);
  return rawWeeks > 0 ? rawWeeks : DEFAULT_PLAN_SETTINGS.p3;
}

function normalizePlanSettings(rawSettings, fallbackSettings = DEFAULT_PLAN_SETTINGS) {
  const eventName = normalizeEventName(rawSettings?.eventName, fallbackSettings.eventName);
  const season = normalizeSeason(rawSettings?.season, fallbackSettings.season);
  const year = normalizeEventYear(rawSettings?.year, fallbackSettings.year);
  const start = normalizeISODate(rawSettings?.start, fallbackSettings.start);
  const race = normalizeISODate(rawSettings?.race, fallbackSettings.race);
  const p1 = toPositiveInt(rawSettings?.p1, fallbackSettings.p1);
  const p2 = toPositiveInt(rawSettings?.p2, fallbackSettings.p2);
  const p4 = toPositiveInt(rawSettings?.p4, fallbackSettings.p4);
  const derivedP3 = derivePhase3Weeks(start, race, p1, p2);
  const p3 = toPositiveInt(rawSettings?.p3, derivedP3);
  const sheetURL = normalizeSheetURL(rawSettings?.sheetURL, fallbackSettings.sheetURL);

  return { eventName, season, year, start, race, p1, p2, p3, p4, sheetURL };
}

function loadCachedSettings() {
  const legacy = safeJSONParse(localStorage.getItem(LEGACY_SETTINGS_KEY), {}) || {};
  const storedPlan = safeJSONParse(localStorage.getItem(PLAN_STORAGE_KEY), {}) || {};

  const rawPlan = {
    eventName: storedPlan.eventName ?? legacy.eventName,
    season: storedPlan.season ?? legacy.season,
    year: storedPlan.year ?? legacy.year,
    start: storedPlan.start ?? legacy.start,
    race: storedPlan.race ?? legacy.race,
    p1: storedPlan.p1 ?? legacy.p1,
    p2: storedPlan.p2 ?? legacy.p2,
    p3: storedPlan.p3 ?? legacy.p3,
    p4: storedPlan.p4 ?? legacy.p4,
    sheetURL: storedPlan.sheetURL ?? legacy.sheetURL ?? DEFAULT_PLAN_SETTINGS.sheetURL
  };

  const planSettings = normalizePlanSettings(rawPlan, DEFAULT_PLAN_SETTINGS);

  localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(planSettings));

  return planSettings;
}

async function loadSettingsForUser(uid) {
  const cached = loadCachedSettings();

  try {
    let remoteSettings = await loadUserSettings(uid);

    if (!remoteSettings) {
      await saveUserSettings(uid, cached);
      remoteSettings = cached;
    }

    const mergedPlan = normalizePlanSettings(remoteSettings, cached);
    localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(mergedPlan));

    return mergedPlan;
  } catch (error) {
    console.error("Firestore settings load failed, using local cache:", error);
    return cached;
  }
}

function renderCountdownDateLabels(planSettings) {
  setText("countdown-start-date", `Trainingsstart ${formatISODateForDisplay(planSettings.start)}`);
  setText("countdown-race-date", `Wettkampftag ${formatISODateForDisplay(planSettings.race)}`);
}

function renderTodayEntry(entry) {
  setText("training", hasDisplayValue(entry?.training) ? entry.training : "Kein Eintrag");
  setText("distanz", hasDisplayValue(entry?.distanz) ? entry.distanz : "-");
  setText("pace", hasDisplayValue(entry?.pace) ? entry.pace : "-");
  setText("heartrate", hasDisplayValue(entry?.heartrate) ? entry.heartrate : "-");
  setText("notiz", hasDisplayValue(entry?.notiz) ? entry.notiz : "Heute kein Training geplant.");
}

function renderUpcomingPreview(scheduleByDate, today) {
  const upcomingContainer = document.getElementById("upcoming-container");
  if (!upcomingContainer) return;

  upcomingContainer.innerHTML = "";
  const msPerDay = 1000 * 60 * 60 * 24;

  for (let d = 1; d <= 6; d++) {
    const nextDate = new Date(today.getTime() + d * msPerDay);
    const nextISO = toISODate(nextDate);
    const entry = scheduleByDate.get(nextISO);

    const card = document.createElement("div");
    card.classList.add("upcoming-card");

    const dateEl = document.createElement("div");
    dateEl.classList.add("upcoming-date");
    dateEl.innerText = nextDate.toLocaleDateString("de-DE", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit"
    });

    card.appendChild(dateEl);

    if (hasDisplayValue(entry?.training)) {
      const trainingEl = document.createElement("div");
      trainingEl.classList.add("upcoming-training");
      trainingEl.innerText = entry.training;
      card.appendChild(trainingEl);
    }

    if (hasDisplayValue(entry?.distanz)) {
      const distanzEl = document.createElement("div");
      distanzEl.classList.add("upcoming-meta");
      distanzEl.innerText = entry.distanz;
      card.appendChild(distanzEl);
    }

    if (hasDisplayValue(entry?.pace)) {
      const paceEl = document.createElement("div");
      paceEl.classList.add("upcoming-meta");
      paceEl.innerText = entry.pace;
      card.appendChild(paceEl);
    }

    if (hasDisplayValue(entry?.heartrate)) {
      const heartrateEl = document.createElement("div");
      heartrateEl.classList.add("upcoming-meta");
      heartrateEl.innerText = entry.heartrate;
      card.appendChild(heartrateEl);
    }

    upcomingContainer.appendChild(card);
  }
}

const WEEK_OVERLAY_STATE = {
  scheduleByDate: new Map(),
  weekStarts: [],
  currentIndex: 0,
  startISO: null,
  todayISO: null,
  handlersBound: false
};

function getWeekStartISO(isoDate) {
  const date = new Date(isoDate + "T00:00:00");
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  return toISODate(date);
}

function getWeekNumberFromStart(weekStartISO, startISO) {
  function isoToUtcDayIndex(isoDate) {
    const parts = isoDate.split("-").map(Number);
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return 0;
    const utcMs = Date.UTC(parts[0], parts[1] - 1, parts[2]);
    return Math.floor(utcMs / 86400000);
  }

  const startWeekISO = getWeekStartISO(startISO);
  const weekStartIndex = isoToUtcDayIndex(weekStartISO);
  const startWeekIndex = isoToUtcDayIndex(startWeekISO);
  const diffWeeks = Math.floor((weekStartIndex - startWeekIndex) / 7);

  return Math.max(1, diffWeeks + 1);
}

function formatWeekRange(weekStartISO) {
  const endISO = addDays(weekStartISO, 6);
  return `${formatISODateForDisplay(weekStartISO)} - ${formatISODateForDisplay(endISO)}`;
}

function createWeekStarts(scheduleByDate, todayISO) {
  const allDates = Array.from(scheduleByDate.keys()).sort();
  if (allDates.length === 0) return [getWeekStartISO(todayISO)];

  const weekSet = new Set(allDates.map(getWeekStartISO));
  return Array.from(weekSet).sort();
}

function getInitialWeekIndex(weekStarts, todayISO) {
  const todayWeek = getWeekStartISO(todayISO);
  const exactIndex = weekStarts.indexOf(todayWeek);
  if (exactIndex >= 0) return exactIndex;

  for (let i = 0; i < weekStarts.length; i++) {
    if (weekStarts[i] > todayWeek) return i;
  }

  return weekStarts.length - 1;
}

function updateWeekSelectOptions() {
  const menu = document.getElementById("week-select-menu");
  if (!menu) return;

  menu.innerHTML = "";

  WEEK_OVERLAY_STATE.weekStarts.forEach((weekStart, idx) => {
    const weekNumber = getWeekNumberFromStart(weekStart, WEEK_OVERLAY_STATE.startISO);
    const rangeText = formatWeekRange(weekStart);

    const item = document.createElement("button");
    item.type = "button";
    item.className = "week-select-item";
    if (idx === WEEK_OVERLAY_STATE.currentIndex) item.classList.add("is-active");
    item.dataset.weekIndex = String(idx);
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", idx === WEEK_OVERLAY_STATE.currentIndex ? "true" : "false");

    const primary = document.createElement("span");
    primary.className = "week-select-item-primary";
    primary.innerText = `Woche ${weekNumber}`;

    const secondary = document.createElement("span");
    secondary.className = "week-select-item-secondary";
    secondary.innerText = rangeText;

    item.appendChild(primary);
    item.appendChild(secondary);
    menu.appendChild(item);
  });
}

function renderWeekSelectTrigger() {
  const primaryEl = document.getElementById("week-select-primary");
  const secondaryEl = document.getElementById("week-select-secondary");

  if (!primaryEl || !secondaryEl || WEEK_OVERLAY_STATE.weekStarts.length === 0) return;

  const weekStart = WEEK_OVERLAY_STATE.weekStarts[WEEK_OVERLAY_STATE.currentIndex];
  const weekNumber = getWeekNumberFromStart(weekStart, WEEK_OVERLAY_STATE.startISO);
  primaryEl.innerText = `Woche ${weekNumber}`;
  secondaryEl.innerText = formatWeekRange(weekStart);
}

function setWeekMenuVisible(isVisible) {
  const menu = document.getElementById("week-select-menu");
  const trigger = document.getElementById("week-select-trigger");
  if (!menu || !trigger) return;

  menu.classList.toggle("hidden", !isVisible);
  trigger.setAttribute("aria-expanded", isVisible ? "true" : "false");
}

function renderWeekOverlayContent() {
  const weekDaysEl = document.getElementById("week-days");
  const prevButton = document.getElementById("week-prev");
  const nextButton = document.getElementById("week-next");

  if (!weekDaysEl || !prevButton || !nextButton) return;
  if (WEEK_OVERLAY_STATE.weekStarts.length === 0) return;

  const weekStartISO = WEEK_OVERLAY_STATE.weekStarts[WEEK_OVERLAY_STATE.currentIndex];
  prevButton.disabled = WEEK_OVERLAY_STATE.currentIndex <= 0;
  nextButton.disabled = WEEK_OVERLAY_STATE.currentIndex >= WEEK_OVERLAY_STATE.weekStarts.length - 1;
  renderWeekSelectTrigger();

  weekDaysEl.innerHTML = "";

  for (let i = 0; i < 7; i++) {
    const dayISO = addDays(weekStartISO, i);
    const entry = WEEK_OVERLAY_STATE.scheduleByDate.get(dayISO);

    const row = document.createElement("div");
    row.classList.add("week-day-row");

    const head = document.createElement("div");
    head.classList.add("week-day-head");
    head.innerText = new Date(dayISO + "T00:00:00").toLocaleDateString("de-DE", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit"
    });
    row.appendChild(head);

    const body = document.createElement("div");
    body.classList.add("week-day-body");

    const left = document.createElement("div");
    left.classList.add("week-day-left");

    const values = document.createElement("div");
    values.classList.add("week-day-values");

    if (hasDisplayValue(entry?.training)) {
      const training = document.createElement("div");
      training.classList.add("week-day-training");
      training.innerText = entry.training;
      left.appendChild(training);
    }

    if (hasDisplayValue(entry?.distanz)) {
      const distanz = document.createElement("div");
      distanz.classList.add("week-day-value");
      distanz.innerText = entry.distanz;
      values.appendChild(distanz);
    }

    if (hasDisplayValue(entry?.pace)) {
      const pace = document.createElement("div");
      pace.classList.add("week-day-value");
      pace.innerText = entry.pace;
      values.appendChild(pace);
    }

    if (hasDisplayValue(entry?.heartrate)) {
      const heartrate = document.createElement("div");
      heartrate.classList.add("week-day-value");
      heartrate.innerText = entry.heartrate;
      values.appendChild(heartrate);
    }

    if (hasDisplayValue(entry?.notiz)) {
      const note = document.createElement("div");
      note.classList.add("week-day-note");
      note.innerText = entry.notiz;
      left.appendChild(note);
    }

    if (left.childElementCount === 0 && values.childElementCount === 0) {
      const empty = document.createElement("div");
      empty.classList.add("week-empty", "compact");
      empty.innerText = "Kein Eintrag";
      left.appendChild(empty);
    }

    body.appendChild(left);
    if (values.childElementCount > 0) body.appendChild(values);

    row.appendChild(body);
    weekDaysEl.appendChild(row);
  }
}

function setWeeksOverlayVisible(isVisible) {
  const overlay = document.getElementById("weeks-overlay");
  if (!overlay) return;

  overlay.classList.toggle("hidden", !isVisible);
  if (!isVisible) setWeekMenuVisible(false);
  updateBodyScrollLock();
}

function setupWeeksOverlayInteractions() {
  if (WEEK_OVERLAY_STATE.handlersBound) return;

  const openButton = document.getElementById("open-weeks-overlay");
  const closeButton = document.getElementById("weeks-close");
  const prevButton = document.getElementById("week-prev");
  const nextButton = document.getElementById("week-next");
  const weekSelectTrigger = document.getElementById("week-select-trigger");
  const weekSelectMenu = document.getElementById("week-select-menu");
  const weekSelectWrap = document.querySelector(".week-select-wrap");
  const overlay = document.getElementById("weeks-overlay");

  if (!openButton || !closeButton || !prevButton || !nextButton || !weekSelectTrigger || !weekSelectMenu || !weekSelectWrap || !overlay) return;

  openButton.addEventListener("click", () => {
    setSettingsMenuVisible(false);
    setWeeksOverlayVisible(true);
    updateWeekSelectOptions();
    renderWeekOverlayContent();
  });

  closeButton.addEventListener("click", () => {
    setWeeksOverlayVisible(false);
  });

  prevButton.addEventListener("click", () => {
    if (WEEK_OVERLAY_STATE.currentIndex > 0) {
      WEEK_OVERLAY_STATE.currentIndex -= 1;
      renderWeekOverlayContent();
      updateWeekSelectOptions();
    }
  });

  nextButton.addEventListener("click", () => {
    if (WEEK_OVERLAY_STATE.currentIndex < WEEK_OVERLAY_STATE.weekStarts.length - 1) {
      WEEK_OVERLAY_STATE.currentIndex += 1;
      renderWeekOverlayContent();
      updateWeekSelectOptions();
    }
  });

  weekSelectTrigger.addEventListener("click", () => {
    const isOpen = !weekSelectMenu.classList.contains("hidden");
    setWeekMenuVisible(!isOpen);
  });

  weekSelectMenu.addEventListener("click", (event) => {
    const button = event.target.closest("[data-week-index]");
    if (!button) return;

    const selectedIndex = parseInt(button.dataset.weekIndex, 10);
    if (Number.isInteger(selectedIndex) && selectedIndex >= 0 && selectedIndex < WEEK_OVERLAY_STATE.weekStarts.length) {
      WEEK_OVERLAY_STATE.currentIndex = selectedIndex;
      renderWeekOverlayContent();
      updateWeekSelectOptions();
      setWeekMenuVisible(false);
    }
  });

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      setWeeksOverlayVisible(false);
      setWeekMenuVisible(false);
      return;
    }

    if (!weekSelectWrap.contains(event.target)) {
      setWeekMenuVisible(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setWeekMenuVisible(false);
      setWeeksOverlayVisible(false);
    }
  });

  WEEK_OVERLAY_STATE.handlersBound = true;
}

function updateWeeksOverlayData(scheduleByDate, todayISO, startISO) {
  const previousWeekStart = WEEK_OVERLAY_STATE.weekStarts[WEEK_OVERLAY_STATE.currentIndex];

  WEEK_OVERLAY_STATE.scheduleByDate = scheduleByDate;
  WEEK_OVERLAY_STATE.todayISO = todayISO;
  WEEK_OVERLAY_STATE.startISO = startISO;
  WEEK_OVERLAY_STATE.weekStarts = createWeekStarts(scheduleByDate, todayISO);

  const preservedIndex = WEEK_OVERLAY_STATE.weekStarts.indexOf(previousWeekStart);
  WEEK_OVERLAY_STATE.currentIndex =
    preservedIndex >= 0 ? preservedIndex : getInitialWeekIndex(WEEK_OVERLAY_STATE.weekStarts, todayISO);

  updateWeekSelectOptions();
  renderWeekOverlayContent();
}

function setSettingsMenuVisible(isVisible) {
  const menu = document.getElementById("settings-menu");
  const toggle = document.getElementById("settings-menu-toggle");
  if (!menu || !toggle) return;

  menu.classList.toggle("hidden", !isVisible);
  toggle.setAttribute("aria-expanded", isVisible ? "true" : "false");
}

function setSettingsModalVisible(isVisible) {
  const overlay = document.getElementById("settings-overlay");
  if (!overlay) return;

  overlay.classList.toggle("hidden", !isVisible);
  if (!isVisible) setSettingsError("");
  updateBodyScrollLock();
}

function populateYearSelectOptions() {
  const yearSelect = document.getElementById("settings-year");
  if (!yearSelect || yearSelect.options.length > 0) return;

  for (let year = 2026; year <= 2050; year++) {
    const option = document.createElement("option");
    option.value = String(year);
    option.innerText = String(year);
    yearSelect.appendChild(option);
  }
}

function populateSettingsForm(planSettings) {
  const eventNameInput = document.getElementById("settings-event-name");
  const seasonSelect = document.getElementById("settings-season");
  const yearSelect = document.getElementById("settings-year");
  const startInput = document.getElementById("settings-start");
  const raceInput = document.getElementById("settings-race");
  const p1Input = document.getElementById("settings-p1");
  const p2Input = document.getElementById("settings-p2");
  const p3Input = document.getElementById("settings-p3");
  const p4Input = document.getElementById("settings-p4");
  const sheetURLInput = document.getElementById("settings-sheet-url");

  if (eventNameInput) eventNameInput.value = planSettings.eventName;
  if (seasonSelect) seasonSelect.value = planSettings.season;
  if (yearSelect) yearSelect.value = String(planSettings.year);
  if (startInput) startInput.value = planSettings.start;
  if (raceInput) raceInput.value = planSettings.race;
  if (p1Input) p1Input.value = String(planSettings.p1);
  if (p2Input) p2Input.value = String(planSettings.p2);
  if (p3Input) p3Input.value = String(planSettings.p3);
  if (p4Input) p4Input.value = String(planSettings.p4);
  if (sheetURLInput) sheetURLInput.value = planSettings.sheetURL || "";
}

function collectSettingsDraft() {
  return {
    eventName: document.getElementById("settings-event-name")?.value || "",
    season: document.getElementById("settings-season")?.value || "",
    year: document.getElementById("settings-year")?.value || "",
    start: document.getElementById("settings-start")?.value || "",
    race: document.getElementById("settings-race")?.value || "",
    p1: document.getElementById("settings-p1")?.value || "",
    p2: document.getElementById("settings-p2")?.value || "",
    p3: document.getElementById("settings-p3")?.value || "",
    p4: document.getElementById("settings-p4")?.value || "",
    sheetURL: document.getElementById("settings-sheet-url")?.value || ""
  };
}

function validatePlanSettingsDraft(draft, fallbackSettings) {
  const eventName = normalizeEventName(draft.eventName, "");
  if (!eventName) {
    return { isValid: false, error: "Bitte einen Projektnamen eintragen." };
  }

  const season = normalizeSeason(draft.season, "");
  if (!season) {
    return { isValid: false, error: "Bitte eine gueltige Saison waehlen." };
  }

  const year = normalizeEventYear(draft.year, 0);
  if (!year) {
    return { isValid: false, error: "Bitte ein Jahr zwischen 2026 und 2050 waehlen." };
  }

  const start = normalizeISODate(draft.start, "");
  if (!start) {
    return { isValid: false, error: "Bitte gueltigen Trainingsstart waehlen." };
  }

  const race = normalizeISODate(draft.race, "");
  if (!race) {
    return { isValid: false, error: "Bitte gueltigen Wettkampftag waehlen." };
  }

  const startDate = new Date(start + "T00:00:00");
  const raceDate = new Date(race + "T00:00:00");
  if (raceDate <= startDate) {
    return { isValid: false, error: "Wettkampftag muss nach Trainingsstart liegen." };
  }

  const p1 = toPositiveInt(draft.p1, 0);
  const p2 = toPositiveInt(draft.p2, 0);
  const p3 = toPositiveInt(draft.p3, 0);
  const p4 = toPositiveInt(draft.p4, 0);

  if (!p1 || !p2 || !p3 || !p4) {
    return { isValid: false, error: "Phase 1-4 muessen positive Zahlen sein." };
  }

  const sheetURL = normalizeSheetURL(draft.sheetURL, "");
  if (!sheetURL || !/^https?:\/\//i.test(sheetURL)) {
    return { isValid: false, error: "Bitte eine gueltige CSV URL eintragen." };
  }

  const nextSettings = normalizePlanSettings(
    { eventName, season, year, start, race, p1, p2, p3, p4, sheetURL },
    fallbackSettings || DEFAULT_PLAN_SETTINGS
  );

  return {
    isValid: true,
    error: "",
    settings: nextSettings
  };
}

function renderDateLabel(today) {
  const datumEl = document.getElementById("datum");
  if (!datumEl) return;

  datumEl.innerText = today.toLocaleDateString("de-DE", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

function renderProjectHeading(planSettings) {
  const heading = document.querySelector("#app-screen h1");
  if (!heading) return;

  const seasonLabel = formatSeasonLabel(planSettings.season);
  const safeEventName = escapeHTML(planSettings.eventName);
  const safeSeasonLabel = escapeHTML(seasonLabel);
  const safeYear = escapeHTML(planSettings.year);
  heading.innerHTML = `<span class="title-main">${safeEventName}</span><span class="title-sub">${safeSeasonLabel} ${safeYear}</span>`;
}

function renderAppWithCurrentState() {
  if (!PLAN_SETTINGS || !TODAY_DATE) return;

  const todayISO = toISODate(TODAY_DATE);

  renderProjectHeading(PLAN_SETTINGS);
  renderDateLabel(TODAY_DATE);
  renderCountdownDateLabels(PLAN_SETTINGS);
  renderCountdown(PLAN_SETTINGS, TODAY_DATE);
  renderPhases(PLAN_SETTINGS, TODAY_DATE);
  renderTodayEntry(null);
  renderUpcomingPreview(new Map(), TODAY_DATE);
  updateWeeksOverlayData(new Map(), todayISO, PLAN_SETTINGS.start);
  loadTrainingData(todayISO, TODAY_DATE);
}

function handleSettingsSaveRequest() {
  if (!PLAN_SETTINGS) return;

  const draft = collectSettingsDraft();
  const validation = validatePlanSettingsDraft(draft, PLAN_SETTINGS);

  if (!validation.isValid) {
    setSettingsError(validation.error);
    return;
  }

  setSettingsError("");

  PLAN_SETTINGS = validation.settings;
  localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(PLAN_SETTINGS));
  setSettingsModalVisible(false);
  renderAppWithCurrentState();
  debouncedPersistUserSettings(ACTIVE_USER_UID, PLAN_SETTINGS);
}

function setupSettingsUI() {
  if (SETTINGS_UI_BOUND) return;

  populateYearSelectOptions();

  const settingsToggle = document.getElementById("settings-menu-toggle");
  const settingsMenu = document.getElementById("settings-menu");
  const openSettingsButton = document.getElementById("open-settings-modal");
  const logoutButton = document.getElementById("logout-btn");
  const settingsOverlay = document.getElementById("settings-overlay");
  const settingsCloseButton = document.getElementById("settings-close");
  const settingsSaveButton = document.getElementById("settings-save");

  if (!settingsToggle || !settingsMenu || !openSettingsButton || !logoutButton || !settingsOverlay || !settingsCloseButton || !settingsSaveButton) {
    return;
  }

  settingsToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    const isOpen = !settingsMenu.classList.contains("hidden");
    setSettingsMenuVisible(!isOpen);
  });

  openSettingsButton.addEventListener("click", () => {
    setSettingsMenuVisible(false);
    populateSettingsForm(PLAN_SETTINGS || DEFAULT_PLAN_SETTINGS);
    setSettingsModalVisible(true);
  });

  logoutButton.addEventListener("click", async () => {
    setSettingsMenuVisible(false);
    setSettingsModalVisible(false);
    try {
      await signOutUser();
    } catch (error) {
      console.error("Logout failed:", error);
    }
  });

  settingsCloseButton.addEventListener("click", () => {
    setSettingsModalVisible(false);
  });

  settingsOverlay.addEventListener("click", (event) => {
    if (event.target === settingsOverlay) {
      setSettingsModalVisible(false);
    }
  });

  settingsSaveButton.addEventListener("click", () => {
    handleSettingsSaveRequest();
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!target || settingsMenu.classList.contains("hidden")) return;
    if (settingsToggle.contains(target) || settingsMenu.contains(target)) return;
    setSettingsMenuVisible(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setSettingsMenuVisible(false);
      setSettingsModalVisible(false);
    }
  });

  SETTINGS_UI_BOUND = true;
}

function renderCountdown(planSettings, today) {
  const trainingsStart = new Date(planSettings.start + "T00:00:00");
  const raceDate = new Date(planSettings.race + "T00:00:00");

  if (Number.isNaN(trainingsStart.getTime()) || Number.isNaN(raceDate.getTime())) return;

  const countdownText = document.getElementById("countdown-text");
  const progressBar = document.getElementById("progress-bar");
  if (!countdownText || !progressBar) return;

  const msPerDay = 1000 * 60 * 60 * 24;
  const totalDays = Math.max(1, Math.ceil((raceDate - trainingsStart) / msPerDay));
  const diffDays = Math.floor((raceDate - today) / msPerDay);
  const eventName = escapeHTML(planSettings.eventName || "Halbmarathon");

  if (today.getTime() === raceDate.getTime()) {
    countdownText.innerHTML = `
      <div class="countdown-finish">
        Heute ist der gro\u00dfe Tag!
      </div>
    `;
    progressBar.style.width = "100%";
    return;
  }

  if (today > raceDate) {
    countdownText.innerHTML = `
      <div class="countdown-finish">
        Geschafft!
      </div>
    `;
    progressBar.style.width = "100%";
    return;
  }

  if (diffDays > 30) {
    const remainingWeeks = Math.ceil(diffDays / 7);

    countdownText.innerHTML = `
      <div class="countdown-line-main">
        Noch <span class="big-number">${remainingWeeks}</span> Wochen
      </div>
      <div class="countdown-line-sub">
        bis zum ${eventName}
      </div>
    `;
  } else {
    const tageLabel = diffDays === 1 ? "Tag" : "Tage";
    countdownText.innerHTML = `
      <div class="countdown-line-main">
        Noch <span class="big-number">${diffDays}</span> ${tageLabel}
      </div>
      <div class="countdown-line-sub">
        bis zum ${eventName}
      </div>
    `;
  }

  const elapsedDays = Math.floor((today - trainingsStart) / msPerDay);
  let progress = (elapsedDays / totalDays) * 100;
  if (progress < 0) progress = 0;
  if (progress > 100) progress = 100;

  progressBar.style.width = progress + "%";
}

function renderPhases(planSettings, today) {
  const phasesContainer = document.getElementById("phases-container");
  if (!phasesContainer) return;

  const phases = [
    {
      name: "Phase 1",
      subtitle: "Initial",
      start: planSettings.start,
      durationWeeks: planSettings.p1
    },
    {
      name: "Phase 2",
      subtitle: "Progression",
      start: addWeeks(planSettings.start, planSettings.p1),
      durationWeeks: planSettings.p2
    },
    {
      name: "Phase 3",
      subtitle: "Taper",
      start: addWeeks(planSettings.start, planSettings.p1 + planSettings.p2),
      durationWeeks: planSettings.p3
    },
    {
      name: "Phase 4",
      subtitle: "Recovery",
      start: addDays(planSettings.race, 1),
      durationWeeks: planSettings.p4
    }
  ];

  phasesContainer.innerHTML = "";
  const msPerDay = 1000 * 60 * 60 * 24;

  phases.forEach((phase) => {
    const startDate = new Date(phase.start + "T00:00:00");
    const endDate = new Date(addWeeks(phase.start, phase.durationWeeks) + "T00:00:00");

    const card = document.createElement("div");
    card.classList.add("phase-card");

    let statusText = "";
    let statusClass = "";

    if (today < startDate) {
      statusText = "ab " + startDate.toLocaleDateString("de-DE", {
        day: "numeric",
        month: "numeric"
      });
      statusClass = "phase-future";
    } else if (today >= startDate && today < endDate) {
      const diffDays = Math.floor((today - startDate) / msPerDay);
      const currentWeek = Math.min(phase.durationWeeks, Math.floor(diffDays / 7) + 1);
      statusText = "Woche " + currentWeek + "/" + phase.durationWeeks;
      statusClass = "phase-active";
    } else {
      statusText = "OK";
      statusClass = "phase-complete";
    }

    card.classList.add(statusClass);
    card.innerHTML = `
      <div class="phase-title">${phase.name}</div>
      <div class="phase-sub">${phase.subtitle}</div>
      <div class="phase-status">${statusText}</div>
    `;

    phasesContainer.appendChild(card);
  });
}

function loadTrainingData(todayISO, today) {
  fetch(PLAN_SETTINGS?.sheetURL || DEFAULT_SHEET_URL)
    .then((response) => response.text())
    .then((data) => {
      const lines = data.trim().split(/\r?\n/).filter(Boolean);
      if (lines.length === 0) return;

      const header = parseCSVLine(lines[0]);
      const index = {
        date: findColumnIndex(header, ["Date", "datum"]),
        training: findColumnIndex(header, ["Session Type", "training"]),
        distanz: findColumnIndex(header, ["Duration/Distance", "distanz"]),
        heartrate: findColumnIndex(header, ["Heart Rate Target", "heartrate"]),
        pace: findColumnIndex(header, ["Pace Target", "pace"]),
        notiz: findColumnIndex(header, ["Notes", "notiz"])
      };

      const scheduleByDate = new Map();

      for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        const sheetDateISO = parseSheetDate(values[index.date]);

        if (!sheetDateISO) continue;

        scheduleByDate.set(sheetDateISO, {
          training: readField(values, index.training, ""),
          distanz: readField(values, index.distanz, ""),
          pace: readField(values, index.pace, ""),
          heartrate: readField(values, index.heartrate, ""),
          notiz: readField(values, index.notiz, "")
        });
      }

      renderTodayEntry(scheduleByDate.get(todayISO) || null);
      renderUpcomingPreview(scheduleByDate, today);
      updateWeeksOverlayData(scheduleByDate, todayISO, PLAN_SETTINGS.start);
    })
    .catch(() => {
      renderTodayEntry(null);
      renderUpcomingPreview(new Map(), today);
      updateWeeksOverlayData(new Map(), todayISO, PLAN_SETTINGS.start);
    });
}

function showAuthScreen() {
  const authScreen = document.getElementById("auth-screen");
  const appScreen = document.getElementById("app-screen");

  if (authScreen) authScreen.classList.remove("hidden");
  if (appScreen) appScreen.classList.add("hidden");

  setSettingsMenuVisible(false);
  setSettingsModalVisible(false);
  setWeeksOverlayVisible(false);
}

function showAppScreen() {
  const authScreen = document.getElementById("auth-screen");
  const appScreen = document.getElementById("app-screen");

  if (authScreen) authScreen.classList.add("hidden");
  if (appScreen) appScreen.classList.remove("hidden");
}

async function initializeAppForUser(uid) {
  PLAN_SETTINGS = await loadSettingsForUser(uid);
  TODAY_DATE = new Date();
  TODAY_DATE.setHours(0, 0, 0, 0);

  setupWeeksOverlayInteractions();
  setupSettingsUI();
  renderAppWithCurrentState();
  populateSettingsForm(PLAN_SETTINGS);
}

function setupAuthGate() {
  const loginButton = document.getElementById("login-btn");
  if (loginButton) {
    loginButton.addEventListener("click", async () => {
      setGlobalLoaderVisible(true);
      try {
        await signInWithGoogle();
      } catch (error) {
        console.error("Google login failed:", error);
        setGlobalLoaderVisible(false);
      }
    });
  }

  onAuthChange(async (user) => {
    if (!user) {
      ACTIVE_USER_UID = null;
      APP_INITIALIZED_UID = null;
      PLAN_SETTINGS = null;
      showAuthScreen();
      setGlobalLoaderVisible(false);
      return;
    }

    ACTIVE_USER_UID = user.uid;
    showAppScreen();

    if (APP_INITIALIZED_UID === user.uid) {
      setGlobalLoaderVisible(false);
      return;
    }
    APP_INITIALIZED_UID = user.uid;

    setGlobalLoaderVisible(true);
    try {
      await initializeAppForUser(user.uid);
    } finally {
      setGlobalLoaderVisible(false);
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setupAuthGate();
  updateBodyScrollLock();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js");
  });
}
