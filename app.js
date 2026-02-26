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
  const todayEntry = entry || {
    training: "Kein Eintrag",
    distanz: "-",
    pace: "-",
    heartrate: "-",
    notiz: "Heute kein Training geplant."
  };

  setText("training", todayEntry.training);
  setText("distanz", todayEntry.distanz);
  setText("pace", todayEntry.pace);
  setText("heartrate", todayEntry.heartrate);
  setText("notiz", todayEntry.notiz);
}

function renderUpcomingPreview(scheduleByDate, today) {
  const upcomingContainer = document.getElementById("upcoming-container");
  if (!upcomingContainer) return;

  upcomingContainer.innerHTML = "";
  const msPerDay = 1000 * 60 * 60 * 24;

  for (let d = 1; d <= 5; d++) {
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

    const trainingEl = document.createElement("div");
    trainingEl.classList.add("upcoming-training");
    trainingEl.innerText = entry?.training || "-";

    const distanzEl = document.createElement("div");
    distanzEl.classList.add("upcoming-meta");
    distanzEl.innerText = entry?.distanz || "-";

    const paceEl = document.createElement("div");
    paceEl.classList.add("upcoming-meta");
    paceEl.innerText = entry?.pace || "-";

    const heartrateEl = document.createElement("div");
    heartrateEl.classList.add("upcoming-meta");
    heartrateEl.innerText = entry?.heartrate || "-";

    card.appendChild(dateEl);
    card.appendChild(trainingEl);
    card.appendChild(distanzEl);
    card.appendChild(paceEl);
    card.appendChild(heartrateEl);
    upcomingContainer.appendChild(card);
  }
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
    countdownText.innerHTML = `
      <div class="countdown-line-main">
        Noch <span class="big-number">${diffDays}</span> Tage
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
          training: readField(values, index.training, "Kein Eintrag"),
          distanz: readField(values, index.distanz, "-"),
          pace: readField(values, index.pace, "-"),
          heartrate: readField(values, index.heartrate, "-"),
          notiz: readField(values, index.notiz, "Heute kein Training geplant.")
        });
      }

      renderTodayEntry(scheduleByDate.get(todayISO) || null);
      renderUpcomingPreview(scheduleByDate, today);
    })
    .catch(() => {
      renderTodayEntry(null);
      renderUpcomingPreview(new Map(), today);
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
loadTrainingData(heuteISO, heute);

document.addEventListener("DOMContentLoaded", () => {
  setupDevPanel(PLAN_SETTINGS, SIM_SETTINGS);
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js");
  });
}
