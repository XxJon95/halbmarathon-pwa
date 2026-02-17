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
const sheetURL = "HIER_DEINE_CSV_URL_EINFÜGEN";

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

            const werte = zeilen[i].split(",");

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
