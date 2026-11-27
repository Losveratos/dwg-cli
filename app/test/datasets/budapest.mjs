// Budapest-Demo-Set (Modell „PnL ChartkitchenDemoKit“, Semantikmodell „Budapest BI Forum“, synthetische DWG Industries SE)
// aus den CSV-Quellen des Modells (budapest/build.mjs), 2026, nur GuV. Spaltennamen wie im Modell.
// Mini-DAX kennt nur Beziehungen von der Faktentabelle aus: Die Fakten bekommen deshalb die Region ihrer Gesellschaft
// (Schneeflocke dim-gesellschaft → dim-region flachgeklopft) und den Abschlussstatus „Closed WD3“ (die Statustabelle des
// Modells hat keine Beziehung; die Korrektur am dritten Arbeitstag ist hier nicht nachgebildet). Measures wie in _Measures,
// im Mini-DAX-Umfang: AC/PY/PL/FC = SUM; Revenue = Nettoumsatz mit dem Vorzeichen des Kontos (SignConvention) wie SUMX im Modell.
import konten from "./budapest/konten.json" with { type: "json" };
import fakten from "./budapest/fakten-2026.json" with { type: "json" };
import gesellschaften from "./budapest/gesellschaften.json" with { type: "json" };
import regionen from "./budapest/regionen.json" with { type: "json" };
import kalender from "./budapest/kalender-2026.json" with { type: "json" };

/** Kontrollwerte Jan bis Okt 2026, Ist-Monate, Mio. EUR (aus dem Power-BI-Bericht, Briefing vom 17.11.2026) */
export const CONTROL = {
    revenue: { ac: 2817.6, pl: 2782.1, py: 2498.1 },
    grossProfit: { ac: 942.8, pl: 957.0 },
    ebitda: { ac: 400.5, pl: 424.2 },
    netIncome: { ac: 151.6, pl: 176.3 },
};

const region = new Map(gesellschaften.rows.map(r => [r[0], r[4]]));
const signed = (scenario) =>
    `CALCULATE(SUMX(VALUES('dim-konten'[SignConvention]), SUM('fact-abschluss'[${scenario} Wert]) * 'dim-konten'[SignConvention]), 'dim-konten'[L1 EN] = "Net revenue")`;

export const model = {
    fact: "fact-abschluss",
    tables: {
        "fact-abschluss": {
            columns: [...fakten.columns, "RegionID", "Close status"],
            rows: fakten.rows.map(r => [...r, region.get(r[1]) ?? null, "Closed WD3"]),
        },
        "dim-konten": konten,
        "dim-gesellschaft": gesellschaften,
        "dim-region": regionen,
        "dim-datum": kalender,
        "close-status": { columns: ["Close status", "Close status Sort"], rows: [["Closed WD3", 1], ["Incl. day-3 adjustment", 2]] },
    },
    relationships: [
        { from: ["fact-abschluss", "AccountID"], to: ["dim-konten", "AccountID"] },
        { from: ["fact-abschluss", "EntityID"], to: ["dim-gesellschaft", "EntityID"] },
        { from: ["fact-abschluss", "RegionID"], to: ["dim-region", "RegionID"] },
        { from: ["fact-abschluss", "Datum"], to: ["dim-datum", "Datum"] },
        { from: ["fact-abschluss", "Close status"], to: ["close-status", "Close status"] },
    ],
    measures: {
        AC: "SUM('fact-abschluss'[AC Wert])",
        PY: "SUM('fact-abschluss'[PY Wert])",
        PL: "SUM('fact-abschluss'[PL Wert])",
        FC: "SUM('fact-abschluss'[FC Wert])",
        "Revenue AC": signed("AC"),
        "Revenue PY": signed("PY"),
        "Revenue PL": signed("PL"),
        "Revenue FC": signed("FC"),
    },
};
