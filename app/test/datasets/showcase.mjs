// Showcase-Set (Modell „ZlatyLev Showcase“, Brauerei-Demo, synthetisch): Tabellen und Spaltennamen wie im Modell,
// Fakten nur 2026 (Ist Jan bis Aug, PY/PL/FC ganzes Jahr), Kalender 2025 und 2026. Daten aus
// showcase/data/gen_showcase.py, Measures wörtlich aus dem Modell (showcase/model/export_measures.csx).
// Vertrag und Kontrollwerte: showcase/CONTRACT.md.
import kalender from "./showcase/kalender.json" with { type: "json" };
import produkt from "./showcase/produkt.json" with { type: "json" };
import kunde from "./showcase/kunde.json" with { type: "json" };
import konto from "./showcase/konto.json" with { type: "json" };
import fakten from "./showcase/fakten-2026.json" with { type: "json" };
import measures from "./showcase/measures.json" with { type: "json" };
import control from "../../../examples/showcase/data/control.json" with { type: "json" };

// Kontrollwerte 2026 (alle Kunden, Produkte, Konten) und die drei Geschichten (Jan bis Aug 2026)
export const CONTROL = { ...control["2026"], rows: control.rows.fakten2026, accounts: konto.rows.length, stories: control["Geschichten Jan bis Aug 2026"] };

export const model = {
    fact: "Fakten",
    tables: { Fakten: fakten, Kalender: kalender, Produkt: produkt, Kunde: kunde, Konto: konto },
    relationships: [
        { from: ["Fakten", "Datum"], to: ["Kalender", "Datum"] },
        { from: ["Fakten", "KontoID"], to: ["Konto", "KontoID"] },
        { from: ["Fakten", "KundeID"], to: ["Kunde", "KundeID"] },
        { from: ["Fakten", "ProduktID"], to: ["Produkt", "ProduktID"] },
    ],
    measures,
};
