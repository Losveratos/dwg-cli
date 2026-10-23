// GuV-Demo-Set (Modell „ChartKitchen byDatenWG Demo“, Tabellen fact-guv und dim-konten) aus den CSV-Quellen des
// Modells, Januar bis August 2026 (guv/build.mjs). Spaltennamen wie im Modell; der Kalender wird hier gerechnet
// wie im Modell. Kontrollwerte direkt aus fact-guv.csv (18.10.2026).
import konten from "./guv/konten.json" with { type: "json" };
import fakten from "./guv/fakten-2026.json" with { type: "json" };

export const CONTROL = {
    // Summe aller Konten, Jan bis Aug 2026
    ac: 4475245580, py: 3928701062, pl: 4357355145,
    netRevenue: { ac: 2385782201, py: 2063074409, pl: 2311759983, fcFy: 3696282198, plFy: 3581599996 },
    cogs: { ac: 1421550031, pl: 1390179990 },
    opex: { ac: 409948483, pl: 406119962 },
    accounts: 5000,
};

const months = [...new Set(fakten.rows.map(r => r[2]))];

export const model = {
    fact: "fact-guv",
    tables: {
        "fact-guv": {
            columns: ["AccountID", "Monat", "Datum", "AC Wert", "PY Wert", "PL Wert", "FC Wert", "FC_FY", "PL_FY"],
            rows: fakten.rows,
        },
        "dim-konten": konten,
        Calender: {
            columns: ["Date", "Year", "Month"],
            rows: months.map(d => [d, Number(d.slice(0, 4)), Number(d.slice(5, 7))]),
        },
    },
    relationships: [
        { from: ["fact-guv", "AccountID"], to: ["dim-konten", "AccountID"] },
        { from: ["fact-guv", "Datum"], to: ["Calender", "Date"] },
    ],
    measures: {
        "GuV AC": "SUM('fact-guv'[AC Wert])",
        "GuV PY": "SUM('fact-guv'[PY Wert])",
        "GuV PL": "SUM('fact-guv'[PL Wert])",
        "GuV FC": "SUM('fact-guv'[FC Wert])",
        "GuV FC FY": "MAX('fact-guv'[FC_FY])",
        "GuV PL FY": "MAX('fact-guv'[PL_FY])",
    },
};
