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

/* HEUTIGES DATUM */
const heute = new Date();
heute.setHours(0, 0, 0, 0);

document.getElementById("datum").innerText =
    heute.toLocaleDateString("de-DE", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
    });

const heuteISO = heute.toISOString().split("T")[0];

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

const trainingsStart = new Date("2026-01-01");
const wettkampf = new Date("2026-07-05");

const gesamtTage = Math.ceil((wettkampf - trainingsStart) / (1000 * 60 * 60 * 24));
const restTage = Math.ceil((wettkampf - heute) / (1000 * 60 * 60 * 24));

const countdownText = document.getElementById("countdown-text");
const progressBar = document.getElementById("progress-bar");

if (restTage > 0) {

    if (restTage > 30) {
        const restWochen = Math.ceil(restTage / 7);

        countdownText.innerHTML = `
      <div class="countdown-line1">Noch</div>
      <div class="countdown-line2">
        <span class="big-number">${restWochen}</span>
        Wochen
      </div>
      <div class="countdown-line3">bis zum Halbmarathon</div>
    `;
    } else {
        countdownText.innerHTML = `
      <div class="countdown-line1">Noch</div>
      <div class="countdown-line2">
        <span class="big-number">${restTage}</span>
        Tage
      </div>
      <div class="countdown-line3">bis zum Halbmarathon</div>
    `;
    }

    const vergangeneTage = gesamtTage - restTage;
    let fortschritt = (vergangeneTage / gesamtTage) * 100;

    if (fortschritt < 0) fortschritt = 0;
    if (fortschritt > 100) fortschritt = 100;

    progressBar.style.width = fortschritt + "%";

} else {
    countdownText.innerHTML = `<div class="big-number">Heute ist der große Tag!</div>`;
    progressBar.style.width = "100%";
}

/* SERVICE WORKER */
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("service-worker.js");
    });
}
