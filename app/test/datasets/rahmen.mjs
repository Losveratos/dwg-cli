// Kleiner synthetischer Datensatz für den Test des App-Rahmens (DwgShell: Filter-Panel, Navigation).
// Namen wie im Modell „ChartKitchen byDatenWG Demo“ ('Sales Demo', 'Calender'), damit dieselbe Test-Spec
// auch gegen das TMDL geprüft und als PBIP erzeugt werden kann. Werte deterministisch, keine echten Zahlen.

const COUNTRIES = ["Germany", "France", "Austria", "Italy", "Spain", "Poland"];
const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

const calender = [];
const fact = [];
for (const year of [2025, 2026]) {
    for (let m = 1; m <= 12; m++) {
        const date = `${year}-${String(m).padStart(2, "0")}-01T00:00:00`;
        calender.push([date, year, m, MONTHS[m - 1]]);
        COUNTRIES.forEach((country, i) => {
            const base = (900 - i * 110) * (1 + 0.08 * Math.sin(m / 2)) * (year === 2026 ? 1.06 : 1);
            const ac = Math.round(base * (0.9 + 0.2 * rnd()));
            fact.push([country, date, ac, Math.round(base / 1.06 * (0.9 + 0.2 * rnd())), Math.round(base * 1.02)]);
        });
    }
}

// Zeilen ohne Land (wie Faktzeilen ohne Kunde im Showcase): der Slicer zeigt „(leer)“ nur auf Wunsch
for (const [date] of calender) { fact.push([null, date, 40, 38, 41]); }

export const model = {
    fact: "Sales Demo",
    tables: {
        "Sales Demo": { columns: ["Country", "Date", "AC Wert", "PY Wert", "PL Wert"], rows: fact },
        Calender: { columns: ["Date", "Year", "Month", "Month Name Short"], rows: calender },
    },
    relationships: [{ from: ["Sales Demo", "Date"], to: ["Calender", "Date"] }],
    measures: {
        AC: "SUM('Sales Demo'[AC Wert])",
        PY: "SUM('Sales Demo'[PY Wert])",
        PL: "SUM('Sales Demo'[PL Wert])",
    },
};
