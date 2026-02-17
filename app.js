// Heutiges Datum anzeigen
const heute = new Date();

const options = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
};

document.getElementById("datum").innerText =
    heute.toLocaleDateString("de-DE", options);

// ISO Datum erzeugen (YYYY-MM-DD)
const heuteISO = heute.toISOString().split("T")[0];

// Google Sheets CSV URL
const sheetURL = "https://docs.google.com/spreadsheets/d/1wmLe1BIdWzQ2UYf0b20IRTae1E_a9eru0vd_bhDeRkw/export?format=csv";

function parseCSVLine(line) {
    const result = [];
    let current = "";
    let insideQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            insideQuotes = !insideQuotes;
        } 
        else if (char === ',' && !insideQuotes) {
            result.push(current);
            current = "";
        } 
        else {
            current += char;
        }
    }

    result.push(current);

    // Entfernt äußere Anführungszeichen
    return result.map(field => field.replace(/^"|"$/g, ""));
}


// CSV laden
fetch(sheetURL)
    .then(response => response.text())
    .then(data => {

        // Zeilen sauber trennen (Windows + Unix kompatibel)
        const zeilen = data.trim().split(/\r?\n/);

        // Header auslesen
        const header = zeilen[0].split(",");

        // Spaltenindex dynamisch bestimmen
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

            // Datum aus Sheet (ggf. mit Uhrzeit abschneiden)
            const sheetDate = werte[index.date].split(" ")[0];

            if (sheetDate === heuteISO) {

                document.getElementById("training").innerText =
                    werte[index.training] || "-";

                document.getElementById("distanz").innerText =
                    werte[index.distanz] || "-";

                document.getElementById("pace").innerText =
                    werte[index.pace] || "-";

		document.getElementById("heartrate").innerText =
    		    werte[index.heartrate] || "-";

                document.getElementById("notiz").innerText =
                    werte[index.notiz] || "-";

                return;
            }
        }

        // Kein Eintrag gefunden
        document.getElementById("training").innerText = "Kein Eintrag";
        document.getElementById("distanz").innerText = "-";
        document.getElementById("pace").innerText = "-";
	document.getElementById("heartrate").innerText = "-";
        document.getElementById("notiz").innerText = "Heute kein Training geplant.";

    })
    .catch(error => {
        console.error("Fehler beim Laden der CSV:", error);
    });


// Service Worker registrieren
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("service-worker.js")
            .then(registration => {
                console.log("Service Worker registriert:", registration);
            })
            .catch(error => {
                console.log("Service Worker Registrierung fehlgeschlagen:", error);
            });
    });
}
