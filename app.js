const sheetURL = "https://docs.google.com/spreadsheets/d/1wmLe1BIdWzQ2UYf0b20IRTae1E_a9eru0vd_bhDeRkw/export?format=csv";

const LEGACY_SETTINGS_KEY = "HM_DEV_SETTINGS";
const PLAN_STORAGE_KEY = "HM_PLAN_SETTINGS";
const SIM_STORAGE_KEY = "HM_SIM_SETTINGS";

const DEFAULT_PLAN_SETTINGS = {
  start: "2026-01-01",
  race: "2026-07-05",
  p1: 8,
  p2: 8,
  p3: 4,
  p4: 2
};

const DEFAULT_SIM_SETTINGS = {
  date: null
};

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

function loadSettings() {
  const legacy = safeJSONParse(localStorage.getItem(LEGACY_SETTINGS_KEY), {}) || {};
  const storedPlan = safeJSONParse(localStorage.getItem(PLAN_STORAGE_KEY), {}) || {};
  const storedSim = safeJSONParse(localStorage.getItem(SIM_STORAGE_KEY), {}) || {};

  const start = normalizeISODate(storedPlan.start ?? legacy.start, DEFAULT_PLAN_SETTINGS.start);
  const race = normalizeISODate(storedPlan.race ?? legacy.race, DEFAULT_PLAN_SETTINGS.race);
  const p1 = toPositiveInt(storedPlan.p1 ?? legacy.p1, DEFAULT_PLAN_SETTINGS.p1);
  const p2 = toPositiveInt(storedPlan.p2 ?? legacy.p2, DEFAULT_PLAN_SETTINGS.p2);
  const p4 = toPositiveInt(storedPlan.p4 ?? legacy.p4, DEFAULT_PLAN_SETTINGS.p4);
  const derivedP3 = derivePhase3Weeks(start, race, p1, p2);
  const p3 = toPositiveInt(storedPlan.p3 ?? legacy.p3, derivedP3);

  const planSettings = { start, race, p1, p2, p3, p4 };
  const simSettings = {
    date: normalizeISODate(storedSim.date ?? legacy.date, DEFAULT_SIM_SETTINGS.date)
  };

  localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(planSettings));
  localStorage.setItem(SIM_STORAGE_KEY, JSON.stringify(simSettings));

  return { planSettings, simSettings };
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
  document.body.classList.toggle("no-scroll", isVisible);
  if (!isVisible) setWeekMenuVisible(false);
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
        bis zum Halbmarathon
      </div>
    `;
  } else {
    const tageLabel = diffDays === 1 ? "Tag" : "Tage";
    countdownText.innerHTML = `
      <div class="countdown-line-main">
        Noch <span class="big-number">${diffDays}</span> ${tageLabel}
      </div>
      <div class="countdown-line-sub">
        bis zum Halbmarathon
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

function setupDevPanel(planSettings, simSettings) {
  const panel = document.getElementById("dev-panel");
  if (!panel) return;

  const simDateInput = document.getElementById("sim-date");
  const simApplyButton = document.getElementById("sim-apply");
  const simClearButton = document.getElementById("sim-clear");

  const planStartInput = document.getElementById("plan-start");
  const planRaceInput = document.getElementById("plan-race");
  const planP1Input = document.getElementById("plan-p1");
  const planP2Input = document.getElementById("plan-p2");
  const planP3Input = document.getElementById("plan-p3");
  const planP4Input = document.getElementById("plan-p4");
  const planSaveButton = document.getElementById("plan-save");

  if (simDateInput) simDateInput.value = simSettings.date || "";

  if (planStartInput) planStartInput.value = planSettings.start;
  if (planRaceInput) planRaceInput.value = planSettings.race;
  if (planP1Input) planP1Input.value = planSettings.p1;
  if (planP2Input) planP2Input.value = planSettings.p2;
  if (planP3Input) planP3Input.value = planSettings.p3;
  if (planP4Input) planP4Input.value = planSettings.p4;

  document.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "d") {
      panel.classList.toggle("hidden");
    }
  });

  if (simApplyButton) {
    simApplyButton.addEventListener("click", () => {
      const updatedSim = {
        date: normalizeISODate(simDateInput?.value, null)
      };

      localStorage.setItem(SIM_STORAGE_KEY, JSON.stringify(updatedSim));
      location.reload();
    });
  }

  if (simClearButton) {
    simClearButton.addEventListener("click", () => {
      localStorage.setItem(SIM_STORAGE_KEY, JSON.stringify({ date: null }));
      location.reload();
    });
  }

  if (planSaveButton) {
    planSaveButton.addEventListener("click", () => {
      const updatedPlan = {
        start: normalizeISODate(planStartInput?.value, planSettings.start),
        race: normalizeISODate(planRaceInput?.value, planSettings.race),
        p1: toPositiveInt(planP1Input?.value, planSettings.p1),
        p2: toPositiveInt(planP2Input?.value, planSettings.p2),
        p3: toPositiveInt(planP3Input?.value, planSettings.p3),
        p4: toPositiveInt(planP4Input?.value, planSettings.p4)
      };

      localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(updatedPlan));
      location.reload();
    });
  }
}

function loadTrainingData(todayISO, today) {
  fetch(sheetURL)
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

const { planSettings: PLAN_SETTINGS, simSettings: SIM_SETTINGS } = loadSettings();

const heute = SIM_SETTINGS.date
  ? new Date(SIM_SETTINGS.date + "T00:00:00")
  : new Date();
heute.setHours(0, 0, 0, 0);

const heuteISO = toISODate(heute);

const datumEl = document.getElementById("datum");
if (datumEl) {
  datumEl.innerText = heute.toLocaleDateString("de-DE", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

renderCountdownDateLabels(PLAN_SETTINGS);
renderCountdown(PLAN_SETTINGS, heute);
renderPhases(PLAN_SETTINGS, heute);
renderTodayEntry(null);
renderUpcomingPreview(new Map(), heute);
updateWeeksOverlayData(new Map(), heuteISO, PLAN_SETTINGS.start);
loadTrainingData(heuteISO, heute);

document.addEventListener("DOMContentLoaded", () => {
  setupDevPanel(PLAN_SETTINGS, SIM_SETTINGS);
  setupWeeksOverlayInteractions();
  renderWeekOverlayContent();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js");
  });
}
