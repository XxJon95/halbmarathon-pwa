const sheetURL = "https://docs.google.com/spreadsheets/d/1wmLe1BIdWzQ2UYf0b20IRTae1E_a9eru0vd_bhDeRkw/export?format=csv";

/* CSV Parser */
function parseCSVLine(line) {
    const result = [];
    let current = "";
    let insideQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            insideQuotes = !insideQuotes;
        } else if (char === ',' && !insideQuotes) {
            result.push(current);
            current = "";
        } else {
            current += char;
        }
    }

    result.push(current);
    return result.map(field => field.replace(/^"|"$/g, ""));
}

function addDays(dateString, days) {
  const d = new Date(dateString);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function addWeeks(dateString, weeks) {
  const d = new Date(dateString);
  d.setDate(d.getDate() + weeks * 7);
  return d.toISOString().split("T")[0];
}

let DEV_SETTINGS = JSON.parse(localStorage.getItem("HM_DEV_SETTINGS")) || {
  date: null,
  start: "2026-01-01",
  race: "2026-07-05",
  p1: 8,
  p2: 8,
  p4: 2
};

/* HEUTIGES DATUM */
const heute = DEV_SETTINGS.date 
  ? new Date(DEV_SETTINGS.date)
  : new Date();
heute.setHours(0, 0, 0, 0);

document.getElementById("datum").innerText =
    heute.toLocaleDateString("de-DE", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
    });

const heuteISO =
  heute.getFullYear() + "-" +
  String(heute.getMonth() + 1).padStart(2, "0") + "-" +
  String(heute.getDate()).padStart(2, "0");

/* GOOGLE SHEETS LADEN */
fetch(sheetURL)
    .then(response => response.text())
    .then(data => {

        const zeilen = data.trim().split(/\r?\n/);
        const header = parseCSVLine(zeilen[0]);

        const index = {
            date: header.indexOf("Date"),
            training: header.indexOf("Session Type"),
            distanz: header.indexOf("Duration/Distance"),
            heartrate: header.indexOf("Heart Rate Target"),
            pace: header.indexOf("Pace Target"),
            notiz: header.indexOf("Notes")
        };

        for (let i = 1; i < zeilen.length; i++) {

            const werte = parseCSVLine(zeilen[i]);

            const rawDate = werte[index.date].trim();

            let sheetDateISO = "";

            // Wenn deutsches Format DD.MM.YYYY
            if (rawDate.includes(".")) {
                const parts = rawDate.split(".");
                sheetDateISO = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
            }
            // Wenn ISO oder US-Format
            else {
                const parsedDate = new Date(rawDate);
                if (!isNaN(parsedDate)) {
                    sheetDateISO = parsedDate.toISOString().split("T")[0];
                }
            }

            if (sheetDateISO === heuteISO) {

                document.getElementById("training").innerText =
                    werte[index.training] || "Kein Eintrag";

                document.getElementById("distanz").innerText =
                    werte[index.distanz] || "-";

                document.getElementById("pace").innerText =
                    werte[index.pace] || "-";

                document.getElementById("heartrate").innerText =
                    werte[index.heartrate] || "-";

                document.getElementById("notiz").innerText =
                    werte[index.notiz] || "Heute kein Training geplant.";

                return;
            }
        }

    });

/* COUNTDOWN */

const trainingsStart = new Date(DEV_SETTINGS.start);
const raceDate = new Date(DEV_SETTINGS.race);

const gesamtTage = Math.ceil((raceDate - trainingsStart) / (1000*60*60*24));
const restTage = Math.ceil((raceDate - heute) / (1000*60*60*24));

const countdownText = document.getElementById("countdown-text");
const progressBar = document.getElementById("progress-bar");

if (restTage > 0) {

  if (restTage > 30) {

    const restWochen = Math.ceil(restTage / 7);

    countdownText.innerHTML = `
      <div class="countdown-line-main">
        Noch <span class="big-number">${restWochen}</span> Wochen
      </div>
      <div class="countdown-line-sub">
        bis zum Halbmarathon
      </div>
    `;

  } else {

    countdownText.innerHTML = `
      <div class="countdown-line-main">
        Noch <span class="big-number">${restTage}</span> Tage
      </div>
      <div class="countdown-line-sub">
        bis zum Halbmarathon
      </div>
    `;

  }

  const vergangeneTage = gesamtTage - restTage;
  let fortschritt = (vergangeneTage / gesamtTage) * 100;

  if (fortschritt < 0) fortschritt = 0;
  if (fortschritt > 100) fortschritt = 100;

  progressBar.style.width = fortschritt + "%";

} else if (restTage === 0) {

  countdownText.innerHTML = `
    <div class="countdown-finish">
      Heute ist der große Tag!
    </div>
  `;

  progressBar.style.width = "100%";

} else {

  countdownText.innerHTML = `
    <div class="countdown-finish">
      Geschafft!
    </div>
  `;

  progressBar.style.width = "100%";

}

/* =========================
   TRAININGSPHASEN
========================= */

const phases = [
  { name: "Phase 1", subtitle: "Initial", start: DEV_SETTINGS.start, durationWeeks: DEV_SETTINGS.p1 },
  { name: "Phase 2", subtitle: "Progression", start: addWeeks(DEV_SETTINGS.start, DEV_SETTINGS.p1), durationWeeks: DEV_SETTINGS.p2 },
  { name: "Phase 3", subtitle: "Taper", start: addWeeks(addWeeks(DEV_SETTINGS.start, DEV_SETTINGS.p1), DEV_SETTINGS.p2), untilRace: true },
  { 
    name: "Phase 4",
    subtitle: "Recovery",
    start: addDays(DEV_SETTINGS.race, 1),
    durationWeeks: DEV_SETTINGS.p4
  }
];

const phasesContainer = document.getElementById("phases-container");

if (phasesContainer) {

  phasesContainer.innerHTML = "";

  phases.forEach((phase) => {

    const startDate = new Date(phase.start);
    let endDate;

    if (phase.untilRace) {
      endDate = new Date(raceDate);
    } else {
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + (phase.durationWeeks * 7));
    }

    const card = document.createElement("div");
    card.classList.add("phase-card");

    let statusText = "";
    let statusClass = "";

    if (heute < startDate) {

      statusText = "ab " + startDate.toLocaleDateString("de-DE", {
        day: "numeric",
        month: "numeric"
      });

      statusClass = "phase-future";

    } else if (heute >= startDate && heute <= endDate) {

      if (phase.untilRace) {

        const diffDays = Math.ceil((raceDate - heute) / (1000 * 60 * 60 * 24));
        statusText = diffDays + " Tage";

      } else {

        const diffDays = Math.floor((heute - startDate) / (1000 * 60 * 60 * 24));
        const currentWeek = Math.floor(diffDays / 7) + 1;
        statusText = "Woche " + currentWeek + "/" + phase.durationWeeks;
      }

      statusClass = "phase-active";

    } else {

      statusText = "✔";
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

/* =========================
   DEV-Panel
========================= */

document.addEventListener("DOMContentLoaded", () => {

  const panel = document.getElementById("dev-panel");
  const applyButton = document.getElementById("dev-apply");

  // 🔹 Toggle mit Taste "d"
  document.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "d") {
      if (panel) {
        panel.classList.toggle("hidden");
      }
    }
  });

  // 🔹 Apply Button
  if (applyButton) {

    applyButton.addEventListener("click", () => {

      DEV_SETTINGS.date = document.getElementById("dev-date")?.value || null;
      DEV_SETTINGS.start = document.getElementById("dev-start")?.value;
      DEV_SETTINGS.race = document.getElementById("dev-race")?.value;
      DEV_SETTINGS.p1 = parseInt(document.getElementById("dev-p1")?.value);
      DEV_SETTINGS.p2 = parseInt(document.getElementById("dev-p2")?.value);
      DEV_SETTINGS.p4 = parseInt(document.getElementById("dev-p4")?.value);

      // 🔥 Persistenz
      localStorage.setItem("HM_DEV_SETTINGS", JSON.stringify(DEV_SETTINGS));

      location.reload();

    });

  }

});

/* SERVICE WORKER */
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("service-worker.js");
    });
}








