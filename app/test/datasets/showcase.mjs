// Showcase-Set (Modell „ZlatyLev Showcase“, Brauerei-Demo, synthetisch): Tabellen und Spaltennamen wie im Modell,
// Fakten nur 2026 (Ist Jan bis Aug, PY/PL/FC ganzes Jahr), Kalender 2025 und 2026. Daten aus
// showcase/data/gen_showcase.py, Measures wörtlich aus dem Modell (showcase/model/export_measures.csx).
// Dazu Bilanz und Cashflow 2026 (eigene Konten- und Faktentabellen, für T05A und T05B; Mini-DAX nimmt je Abfrage
// die Faktentabelle der Measures). Vertrag und Kontrollwerte: showcase/CONTRACT.md.
// Seit 23.11.2026: Liquidität 2026 (C20), Markt 2026 (C24) und Rendite 2024 bis 2026 (11A; alle Jahre, weil 'Rendite'
// keine Beziehung zum Kalender hat und der Jahr-Slicer sie nicht filtert).
import kalender from "./showcase/kalender.json" with { type: "json" };
import produkt from "./showcase/produkt.json" with { type: "json" };
import kunde from "./showcase/kunde.json" with { type: "json" };
import konto from "./showcase/konto.json" with { type: "json" };
import fakten from "./showcase/fakten-2026.json" with { type: "json" };
import bilanzkonto from "./showcase/bilanzkonto.json" with { type: "json" };
import bilanz from "./showcase/bilanz-2026.json" with { type: "json" };
import cashflowkonto from "./showcase/cashflowkonto.json" with { type: "json" };
import cashflow from "./showcase/cashflow-2026.json" with { type: "json" };
import liquiditaetsart from "./showcase/liquiditaetsart.json" with { type: "json" };
import liquiditaet from "./showcase/liquiditaet-2026.json" with { type: "json" };
import marktsegment from "./showcase/marktsegment.json" with { type: "json" };
import markt from "./showcase/markt-2026.json" with { type: "json" };
import renditekonto from "./showcase/renditekonto.json" with { type: "json" };
import rendite from "./showcase/rendite.json" with { type: "json" };
import measures from "./showcase/measures.json" with { type: "json" };
import control from "../../../examples/showcase/data/control.json" with { type: "json" };

// Kontrollwerte 2026 (alle Kunden, Produkte, Konten) und die drei Geschichten (Jan bis Aug 2026)
export const CONTROL = { ...control["2026"], rows: control.rows.fakten2026, accounts: konto.rows.length, stories: control["Geschichten Jan bis Aug 2026"] };
// Bilanz und Cashflow 2026: Stand am Stichtag (August) und Cashflows Jan bis August
export const CONTROL_STOCK = control["Bilanz und Cashflow 2026"];
// Liquidität 2026 (C20), Markt 2026 (C24), Rendite je Jahr (11A) und die Vorjahreswerte 2025 für Abgleiche
export const CONTROL_NEW = { liquiditaet: control["Liquidität 2026"], markt: control["Markt 2026"], rendite: control.Rendite, y2025: control["2025"] };

export const model = {
    fact: "Fakten",
    tables: {
        Fakten: fakten, Kalender: kalender, Produkt: produkt, Kunde: kunde, Konto: konto,
        Bilanz: bilanz, Bilanzkonto: bilanzkonto, Cashflow: cashflow, Cashflowkonto: cashflowkonto,
        Liquiditaetsart: liquiditaetsart, Liquiditaet: liquiditaet, Marktsegment: marktsegment, Markt: markt,
        Renditekonto: renditekonto, Rendite: rendite,
    },
    relationships: [
        { from: ["Fakten", "Datum"], to: ["Kalender", "Datum"] },
        { from: ["Fakten", "KontoID"], to: ["Konto", "KontoID"] },
        { from: ["Fakten", "KundeID"], to: ["Kunde", "KundeID"] },
        { from: ["Fakten", "ProduktID"], to: ["Produkt", "ProduktID"] },
        { from: ["Bilanz", "Datum"], to: ["Kalender", "Datum"] },
        { from: ["Bilanz", "KontoID"], to: ["Bilanzkonto", "KontoID"] },
        { from: ["Cashflow", "Datum"], to: ["Kalender", "Datum"] },
        { from: ["Cashflow", "KontoID"], to: ["Cashflowkonto", "KontoID"] },
        { from: ["Liquiditaet", "Datum"], to: ["Kalender", "Datum"] },
        { from: ["Liquiditaet", "ArtID"], to: ["Liquiditaetsart", "ArtID"] },
        { from: ["Markt", "Datum"], to: ["Kalender", "Datum"] },
        { from: ["Markt", "SegmentID"], to: ["Marktsegment", "SegmentID"] },
        { from: ["Rendite", "KontoID"], to: ["Renditekonto", "KontoID"] },   // keine Beziehung zum Kalender
    ],
    measures,
};
