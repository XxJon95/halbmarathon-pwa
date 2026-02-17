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

// Datum im CSV-Format erzeugen (YYYY-MM-DD)
const heuteISO = heute.toISOString().split("T")[0];

// CSV laden
fetch("https://docs.google.com/spreadsheets/d/1wmLe1BIdWzQ2UYf0b20IRTae1E_a9eru0vd_bhDeRkw/export?format=csv")
    .then(response => response.text())
    .then(data => {

        const zeilen = data.split("\n");
        const header = zeilen[0].split(",");

        for (let i = 1; i < zeilen.length; i++) {

            const werte = zeilen[i].split(",");

            if (werte[0] === heuteISO) {

                document.getElementById("training").innerText = werte[1];
                document.getElementById("distanz").innerText = werte[2];
                document.getElementById("pace").innerText = werte[3];
                document.getElementById("notiz").innerText = werte[4];

                return;
            }
        }

        // Falls kein Training gefunden wurde
        document.getElementById("training").innerText = "Kein Eintrag";
        document.getElementById("distanz").innerText = "-";
        document.getElementById("pace").innerText = "-";
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

