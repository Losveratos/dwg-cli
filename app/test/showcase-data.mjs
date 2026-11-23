// Showcase-Datensatz: Mini-DAX rechnet die Measures des Modells „ZlatyLev Showcase“ (wörtlich aus dem TMDL exportiert)
// auf den Fixtures und trifft die Kontrollwerte aus showcase/CONTRACT.md. Dazu Kurztests der Mini-DAX-Erweiterungen
// (Plus/Minus, Zahlen, DIVIDE, AVERAGEX, mehrere Faktentabellen). Bilanz und Cashflow: Aktiva = Passiva, Kasse =
// Endbestand, Anfangsbestand = Endbestand des Vormonats, Abschreibungen aus der GuV. Seit 23.11.2026: Umsatz Δ% (C18),
// Liquidität (C20), Markt (C24), Rendite (11A) und Slicer auf Tabellen ohne Beziehung. Aufruf: node app/test/showcase-data.mjs
import assert from "node:assert/strict";
import { createEngine, splitSigned } from "./minidax.mjs";
import { model, CONTROL, CONTROL_STOCK, CONTROL_NEW } from "./datasets/showcase.mjs";

let n = 0;
const test = (name, fn) => { fn(); n++; console.log(`  ok  ${name}`); };
const near = (a, b, label, tol = 0.5) => assert.ok(a != null && Math.abs(a - b) < tol, `${label}: ${a} statt ${b}`);

// ---------------------------------------------------------------- Mini-DAX-Erweiterungen

test("Mini-DAX: splitSigned trennt nur auf oberster Ebene", () => {
    assert.deepEqual(splitSigned("[A] - [B] + 'T-1'[C-2] - -3"),
        [{ sign: 1, term: "[A]" }, { sign: -1, term: "[B]" }, { sign: 1, term: "'T-1'[C-2]" }, { sign: 1, term: "3" }]);
    assert.deepEqual(splitSigned("CALCULATE ( [X], 'K'[L1] = \"a-b\" )"), [{ sign: 1, term: "CALCULATE ( [X], 'K'[L1] = \"a-b\" )" }]);
    assert.deepEqual(splitSigned("- [A]"), [{ sign: -1, term: "[A]" }]);
});

test("Mini-DAX: Plus, Minus, Zahlen, DIVIDE und AVERAGEX wie in DAX", () => {
    const e = createEngine({
        fact: "F",
        tables: {
            F: { columns: ["k", "a", "b"], rows: [["x", 6, 2], ["x", 4, null], ["y", 3, 0], ["z", null, null]] },
            D: { columns: ["k", "g"], rows: [["x", "G1"], ["y", "G1"], ["z", "G2"]] },
        },
        relationships: [{ from: ["F", "k"], to: ["D", "k"] }],
        measures: {
            A: "SUM ( 'F'[a] )", B: "SUM ( 'F'[b] )", D: "[A] - [B] + 1", N: "- [A]",
            Q: "DIVIDE ( [A], [B] )", Q0: "DIVIDE ( [A], [B], 0 )", AVG: "AVERAGEX ( VALUES ( 'D'[k] ), CALCULATE ( [A] ) )",
            T: "CALCULATE ( [A], 'D'[g] = \"G1\" )",
        },
    });
    const q = g => e.query(`EVALUATE SUMMARIZECOLUMNS('D'[k], "d", [D], "n", [N], "q", [Q], "q0", [Q0])`).rows.find(r => r[0] === g);
    assert.deepEqual(q("x"), ["x", 9, -10, 5, 5]);           // 10 - 2 + 1, -(10), 10 / 2
    assert.deepEqual(q("y"), ["y", 4, -3, null, 0]);         // Division durch 0: BLANK bzw. Alternative
    const all = e.query(`EVALUATE SUMMARIZECOLUMNS("avg", [AVG], "t", [T], "b", [B])`).rows[0];
    assert.deepEqual(all, [6.5, 13, 2]);                     // (10 + 3) / 2, z ist leer und zählt nicht mit
});

// ---------------------------------------------------------------- Showcase-Daten

const engine = createEngine(model);
const value = (measure, filters = []) => {
    const f = [`TREATAS({2026}, 'Kalender'[Jahr])`, ...filters].join(", ");
    const r = engine.query(`EVALUATE SUMMARIZECOLUMNS(${f}, "v", [${measure}])`);
    return r.rows[0]?.[0] ?? null;
};

test("Fixtures: 14.124 Faktzeilen 2026, 21 Konten, 83 Measures aus dem Modell (52 GuV, 13 Bilanz und Cashflow, 18 neu)", () => {
    assert.equal(model.tables.Fakten.rows.length, CONTROL.rows);
    assert.equal(CONTROL.accounts, 21);
    // 50 GuV + 2 Umsatz Δ% (Fakten), 13 Bilanz und Cashflow, 4 Liquidität, 10 Markt, 4 Rendite
    assert.equal(Object.keys(model.measures).length, 83);
    assert.equal(model.tables.Liquiditaet.rows.length, 24 * 5, "Liquidität 2025 und 2026: 5 Arten × 24 Monate");
    assert.equal(model.tables.Markt.rows.length, 12 * 16, "Markt 2026: 16 Segmente × 12 Monate");
    assert.equal(model.tables.Rendite.rows.length, 3 * 3, "Rendite: 3 Konten × 3 Jahre (KPI-Zeilen ohne Fakten)");
    assert.equal(model.tables.Bilanz.rows.length, 12 * 8, "Bilanz 2026: 8 Positionen × 12 Monate");
    assert.equal(model.tables.Cashflow.rows.length, 12 * 9, "Cashflow 2026: 9 Positionen × 12 Monate (Endbestand ohne Faktzeilen)");
});

test("Kontrollwerte 2026: GuV roh, FY, Umsatz, DB, Kosten, EBIT, Absatz", () => {
    for (const m of ["GuV AC", "GuV PY", "GuV PL", "GuV FC", "GuV FC FY", "GuV PL FY", "Umsatz AC", "Umsatz PY bis Ist",
        "Umsatz PL bis Ist", "Umsatz PL", "Umsatz FC", "Wareneinsatz AC", "DB AC", "Kosten AC", "EBIT AC", "EBIT PL bis Ist"]) {
        near(value(m), CONTROL[m], m);
    }
    near(value("Absatz hl AC"), CONTROL["Absatz hl AC"], "Absatz hl AC", 0.05);
    near(value("Absatz hl PL bis Ist"), CONTROL["Absatz hl PL bis Ist"], "Absatz hl PL bis Ist", 0.05);
    near(value("DB-Marge % AC"), CONTROL["DB-Marge % AC"], "DB-Marge % AC", 1e-9);
    near(value("Umsatz FC FY"), CONTROL["Umsatz FC"], "Umsatz FC FY = Umsatz FC ganzes Jahr");
    near(value("Umsatz PL FY"), CONTROL["Umsatz PL"], "Umsatz PL FY = Umsatz PL ganzes Jahr");
    near(value("Erlös je hl AC"), CONTROL["Umsatz AC"] / CONTROL["Absatz hl AC"], "Erlös je hl AC", 1e-6);
});

test("Geschichten: Polen über Plan, Praha Premium unter Plan, Logistik über Plan", () => {
    const pl = CONTROL.stories["Region Polen"], pr = CONTROL.stories["Praha Premium 13°"], lo = CONTROL.stories.Logistik;
    near(value("Umsatz AC", [`TREATAS({"Polen"}, 'Kunde'[Region])`]), pl["Umsatz AC"], "Polen AC");
    near(value("Umsatz PL bis Ist", [`TREATAS({"Polen"}, 'Kunde'[Region])`]), pl["Umsatz PL"], "Polen PL");
    near(value("Umsatz AC", [`TREATAS({"P03"}, 'Produkt'[ProduktID])`]), pr["Umsatz AC"], "Praha AC");
    near(value("Umsatz PL bis Ist", [`TREATAS({"P03"}, 'Produkt'[ProduktID])`]), pr["Umsatz PL"], "Praha PL");
    near(value("Kosten AC", [`TREATAS({"Logistik"}, 'Konto'[Konto])`]), lo.AC, "Logistik AC");
    near(value("Kosten PL bis Ist", [`TREATAS({"Logistik"}, 'Konto'[Konto])`]), lo.PL, "Logistik PL");
    assert.ok(pl["Umsatz AC"] > pl["Umsatz PL"] * 1.1 && pr["Umsatz AC"] < pr["Umsatz PL"] * 0.8 && lo.AC > lo.PL * 1.1);
});

test("Ist endet im August: AC je Periode leer ab September, FC = AC in Ist-Monaten, PL läuft weiter", () => {
    const r = engine.query(`EVALUATE SUMMARIZECOLUMNS('Kalender'[Periode], TREATAS({2026}, 'Kalender'[Jahr]), "ac", [GuV AC], "fc", [GuV FC], "pl", [GuV PL]) ORDER BY 'Kalender'[Periode]`);
    assert.equal(r.rows.length, 12);
    for (const [per, ac, fc, pl] of r.rows) {
        const ist = per <= "2026-08";
        assert.equal(ac != null, ist, `${per}: AC`);
        if (ist) { assert.equal(fc, ac, `${per}: FC = AC`); }
        assert.ok(pl > 0, `${per}: PL`);
    }
});

test("FY-Measures: in jeder Periode und je Konto derselbe Jahreswert (P&L-Visual)", () => {
    const r = engine.query(`EVALUATE SUMMARIZECOLUMNS('Kalender'[Periode], TREATAS({2026}, 'Kalender'[Jahr]), "fy", [GuV FC FY], "plfy", [GuV PL FY])`);
    for (const [per, fy, plfy] of r.rows) {
        near(fy, CONTROL["GuV FC FY"], `${per} FC FY`);
        near(plfy, CONTROL["GuV PL FY"], `${per} PL FY`);
    }
    const k = engine.query(`EVALUATE SUMMARIZECOLUMNS('Konto'[KontoID], TREATAS({2026}, 'Kalender'[Jahr]), "fc", [GuV FC], "fy", [GuV FC FY])`);
    for (const [id, fc, fy] of k.rows) { near(fy, fc, `Konto ${id}: FC FY = Summe FC des Jahres`); }
});

test("P&L-Statement: ADDMISSINGITEMS liefert alle 21 Konten inkl. Summen, Formeln und KPIs", () => {
    const r = engine.query(`EVALUATE ADDMISSINGITEMS('Konto'[KontoID], 'Konto'[RowType], 'Konto'[SortOrder], SUMMARIZECOLUMNS('Konto'[KontoID], 'Konto'[RowType], 'Konto'[SortOrder], TREATAS({2026}, 'Kalender'[Jahr]), "ac", [GuV AC], "pl", [GuV PL bis Ist]), 'Konto'[KontoID], 'Konto'[RowType], 'Konto'[SortOrder]) ORDER BY 'Konto'[SortOrder]`);
    assert.equal(r.rows.length, 21);
    assert.deepEqual([...new Set(r.rows.map(x => x[1]))].sort(), ["Account", "Formula", "KPI", "Subtotal"]);
    near(r.rows.reduce((s, x) => s + (x[3] ?? 0), 0), CONTROL["GuV AC"], "Summe AC");
});

test("GuV ± über alle Konten = EBIT, Umsatz = Nettoumsatz mit Vorzeichen der Rabatte", () => {
    near(value("GuV ± AC"), CONTROL["EBIT AC"], "GuV ± AC");
    const brutto = value("GuV AC", [`TREATAS({"4000"}, 'Konto'[KontoID])`]);
    const rabatt = value("GuV AC", [`TREATAS({"4100"}, 'Konto'[KontoID])`]);
    const sonst = value("GuV AC", [`TREATAS({"4200"}, 'Konto'[KontoID])`]);
    near(brutto - rabatt + sonst, CONTROL["Umsatz AC"], "Brutto - Rabatte + Sonstige");
});

// ---------------------------------------------------------------- Bilanz und Cashflow

const byPeriod = (measure, filters = []) => {
    const f = [`TREATAS({2026}, 'Kalender'[Jahr])`, ...filters].join(", ");
    const r = engine.query(`EVALUATE SUMMARIZECOLUMNS('Kalender'[Periode], ${f}, "v", [${measure}]) ORDER BY 'Kalender'[Periode]`);
    return Object.fromEntries(r.rows.map(([p, v]) => [p, v]));
};
const L1 = (t, v) => `TREATAS({"${v}"}, '${t}'[L1])`;
const S = CONTROL_STOCK;

test("Bilanz: Aktiva = Passiva in jedem Monat und Szenario, Stand am Stichtag = Kontrollwert", () => {
    for (const s of ["AC", "PY", "PL", "FC"]) {
        const a = byPeriod(`Bilanz ${s}`, [L1("Bilanzkonto", "Aktiva")]), p = byPeriod(`Bilanz ${s}`, [L1("Bilanzkonto", "Passiva")]);
        assert.equal(Object.keys(a).length, s === "AC" ? 8 : 12, `${s}: Monate`);
        for (const per of Object.keys(a)) { assert.equal(a[per], p[per], `${s} ${per}: Aktiva = Passiva`); }
    }
    near(value("Bilanz Stichtag AC", [L1("Bilanzkonto", "Aktiva")]), S["Aktiva AC"], "Aktiva AC am Stichtag");
    near(value("Bilanz Stichtag AC", [L1("Bilanzkonto", "Passiva")]), S["Passiva AC"], "Passiva AC am Stichtag");
    near(value("Bilanz Stichtag PY", [L1("Bilanzkonto", "Aktiva")]), S["Aktiva PY"], "Aktiva PY am Stichtag");
    near(value("Bilanz Stichtag PL", [L1("Bilanzkonto", "Aktiva")]), S["Aktiva PL"], "Aktiva PL am Stichtag");
    near(value("Bilanz AC", [`TREATAS({"2026-08"}, 'Kalender'[Periode])`, L1("Bilanzkonto", "Aktiva")]), S["Aktiva AC"], "Stichtag = August");
});

test("Cashflow: Endbestand = Anfangsbestand + Cashflows = Kasse der Bilanz, Anfangsbestand = Endbestand des Vormonats", () => {
    const id = v => `TREATAS({"${v}"}, 'Cashflowkonto'[KontoID])`;
    for (const s of ["AC", "PY", "PL", "FC"]) {
        const anf = byPeriod(`Cashflow ${s}`, [id("CF-ANF")]);
        const flows = Object.fromEntries(Object.keys(anf).map(p => [p, 0]));
        for (const blk of ["Operativer Cashflow", "Investiver Cashflow", "Finanzierungs-Cashflow"]) {
            for (const [p, v] of Object.entries(byPeriod(`Cashflow ${s}`, [L1("Cashflowkonto", blk)]))) { flows[p] += v; }
        }
        const kasse = byPeriod(`Bilanz ${s}`, [`TREATAS({"A-KASSE"}, 'Bilanzkonto'[KontoID])`]);
        const pers = Object.keys(anf).sort();
        assert.equal(pers.length, s === "AC" ? 8 : 12, `${s}: Monate`);
        pers.forEach((p, i) => {
            assert.equal(anf[p] + flows[p], kasse[p], `${s} ${p}: Endbestand = Kasse`);
            if (i > 0) { assert.equal(anf[p], kasse[pers[i - 1]], `${s} ${p}: Anfangsbestand = Endbestand Vormonat`); }
        });
    }
    near(value("Cashflow AC", [L1("Cashflowkonto", "Operativer Cashflow")]), S["Operativer Cashflow AC"], "operativ AC");
    near(value("Cashflow PY bis Ist", [L1("Cashflowkonto", "Operativer Cashflow")]), S["Operativer Cashflow PY bis Ist"], "operativ PY bis Ist");
    near(value("Cashflow AC", [L1("Cashflowkonto", "Investiver Cashflow")]), S["Investiver Cashflow AC"], "investiv AC");
    near(value("Cashflow AC", [L1("Cashflowkonto", "Finanzierungs-Cashflow")]), S["Finanzierungs-Cashflow AC"], "finanziell AC");
    near(S["Anfangsbestand AC"] + S["Operativer Cashflow AC"] + S["Investiver Cashflow AC"] + S["Finanzierungs-Cashflow AC"],
        S["Endbestand AC"], "Brücke Jan bis Aug");
});

test("Cashflow aus der GuV: Abschreibungen = Konto 7000, Jahresüberschuss = EBIT nach Zinsen und Steuern", () => {
    const afa = value("Cashflow AC", [`TREATAS({"CF-AFA"}, 'Cashflowkonto'[KontoID])`]);
    near(afa, value("GuV AC", [`TREATAS({"7000"}, 'Konto'[KontoID])`]), "Abschreibungen");
    near(afa, S["Abschreibungen AC"], "Abschreibungen Kontrollwert");
    const jue = value("Cashflow AC", [`TREATAS({"CF-JUE"}, 'Cashflowkonto'[KontoID])`]);
    near(jue, S["Jahresüberschuss AC"], "Jahresüberschuss");
    assert.ok(jue > 0.5 * CONTROL["EBIT AC"] && jue < 0.75 * CONTROL["EBIT AC"], `Jahresüberschuss ${jue} zu EBIT ${CONTROL["EBIT AC"]}`);
});

test("Mini-DAX mit mehreren Faktentabellen: Faktentabelle der Measures, Filter ohne Beziehung wirken nicht", () => {
    const all = value("Bilanz Stichtag AC", [L1("Bilanzkonto", "Aktiva")]);
    near(value("Bilanz Stichtag AC", [L1("Bilanzkonto", "Aktiva"), `TREATAS({"Polen"}, 'Kunde'[Region])`]), all, "Kunde filtert die Bilanz nicht");
    assert.throws(() => engine.query(`EVALUATE SUMMARIZECOLUMNS('Bilanzkonto'[L1], "a", [GuV AC])`), /keine Beziehung zu 'Bilanzkonto'/);
    assert.throws(() => engine.query(`EVALUATE SUMMARIZECOLUMNS("a", [GuV AC], "b", [Bilanz AC])`), /mehreren Faktentabellen/);
    const r = engine.query(`EVALUATE ADDMISSINGITEMS('Cashflowkonto'[KontoID], SUMMARIZECOLUMNS('Cashflowkonto'[KontoID], TREATAS({2026}, 'Kalender'[Jahr]), "ac", [Cashflow AC]), 'Cashflowkonto'[KontoID])`);
    assert.equal(r.rows.length, 10, "alle 10 Cashflow-Zeilen inkl. Endbestand (Formel ohne Fakten)");
});

// ---------------------------------------------------------------- Seit 23.11.2026: C18, C20, C24, 11A

const N = CONTROL_NEW;
const q = dax => engine.query(dax).rows;

test("C18: Umsatz ΔPY % und ΔPL % gegen Vorjahr und Plan über dieselben Ist-Monate, je Kunde mit Kanal", () => {
    near(value("Umsatz ΔPY %"), CONTROL["Umsatz AC"] / CONTROL["Umsatz PY bis Ist"] - 1, "ΔPY % gesamt", 1e-9);
    near(value("Umsatz ΔPL %"), CONTROL["Umsatz AC"] / CONTROL["Umsatz PL bis Ist"] - 1, "ΔPL % gesamt", 1e-9);
    const pl = CONTROL.stories["Region Polen"];
    near(value("Umsatz ΔPL %", [`TREATAS({"Polen"}, 'Kunde'[Region])`]), pl["Umsatz AC"] / pl["Umsatz PL"] - 1, "Polen ΔPL %", 1e-9);
    near(value("Umsatz ΔPY %", [`TREATAS({"Polen"}, 'Kunde'[Region])`]), pl["Umsatz AC"] / pl["Umsatz PY"] - 1, "Polen ΔPY %", 1e-9);
    const r = q(`EVALUATE SUMMARIZECOLUMNS('Kunde'[Kunde], 'Kunde'[Kanal], TREATAS({2026}, 'Kalender'[Jahr]), "y", [Umsatz ΔPL %], "x", [Umsatz ΔPY %], "s", [Umsatz AC])`);
    assert.equal(r.length, 12, "12 Kunden");
    for (const [k, , y, x, size] of r) {
        assert.ok(Math.abs(x) < 0.6 && Math.abs(y) < 0.6 && size > 0, `${k}: ΔPY % ${x}, ΔPL % ${y}`);
    }
    assert.ok(r.some(x => x[2] > 0 && x[3] > 0) && r.some(x => x[2] < 0), "Punkte in mehreren Quadranten");
});

test("C20 Liquidität: je Monat eine Bestandszeile, Kasse = Anfangsbestand plus Flüsse = Bilanz, Token passen zum Vorzeichen", () => {
    const L = N.liquiditaet;
    for (const s of ["AC", "PY", "PL", "FC"]) {
        const r = q(`EVALUATE SUMMARIZECOLUMNS('Kalender'[Periode], 'Liquiditaetsart'[Art], 'Liquiditaetsart'[Art Sort], 'Liquiditaetsart'[Fluss], TREATAS({2026}, 'Kalender'[Jahr]), "v", [Liquidität ${s}]) ORDER BY 'Kalender'[Periode], 'Liquiditaetsart'[Art Sort]`);
        const by = {};
        for (const [per, art, , fluss, v] of r) {
            const b = (by[per] ??= { flows: 0, stock: null });
            if (fluss === "stock") { b.stock = v; continue; }
            b.flows += v;
            if (fluss === "outflow") { assert.ok(v <= 0, `${s} ${per} ${art}: Abfluss ${v}`); }
            if (fluss === "inflow") { assert.ok(v >= 0, `${s} ${per} ${art}: Zufluss ${v}`); }
            if (fluss == null) { assert.equal(art, "Operativer Cashflow"); }
        }
        const pers = Object.keys(by).sort();
        assert.equal(pers.length, s === "AC" ? 8 : 12, `${s}: Monate`);
        const anf = byPeriod(`Cashflow ${s}`, [`TREATAS({"CF-ANF"}, 'Cashflowkonto'[KontoID])`]);
        const kasse = byPeriod(`Bilanz ${s}`, [`TREATAS({"A-KASSE"}, 'Bilanzkonto'[KontoID])`]);
        pers.forEach((per, i) => {
            assert.ok(by[per].stock != null, `${s} ${per}: Bestandszeile fehlt`);
            assert.equal(by[per].stock, kasse[per], `${s} ${per}: Kasse = Bilanz`);
            assert.equal(anf[per] + by[per].flows, by[per].stock, `${s} ${per}: Anfangsbestand + Flüsse = Kasse`);
            if (i > 0) { assert.equal(by[pers[i - 1]].stock + by[per].flows, by[per].stock, `${s} ${per}: Kasse Vormonat + Flüsse`); }
        });
    }
    const id = v => `TREATAS({"${v}"}, 'Liquiditaetsart'[ArtID])`;
    near(value("Liquidität AC", [id("L-KASSE"), `TREATAS({"2026-08"}, 'Kalender'[Periode])`]), L["Kasse und Bank AC (Stichtag)"], "Kasse August");
    near(value("Liquidität FC", [id("L-KASSE"), `TREATAS({"2026-12"}, 'Kalender'[Periode])`]), L["Kasse und Bank FC Dezember"], "Kasse FC Dezember");
    near(value("Liquidität PL", [id("L-KASSE"), `TREATAS({"2026-12"}, 'Kalender'[Periode])`]), L["Kasse und Bank PL Dezember"], "Kasse PL Dezember");
    near(value("Liquidität AC", [id("L-OP")]), CONTROL_STOCK["Operativer Cashflow AC"], "Operativer Cashflow = Cashflow-Tabelle");
    near(value("Liquidität AC", [id("L-INV")]), CONTROL_STOCK["Investiver Cashflow AC"], "Investitionen = investiver Cashflow");
    near(value("Liquidität AC", [id("L-DAR"), `TREATAS({"2026-06"}, 'Kalender'[Periode])`]), 3_000_000, "Darlehen Juni");
});

test("C20 alle Jahre: Kasse semi-additiv (letzter Monat mit Wert), Flüsse als Summe, auch ohne Jahr-Slicer", () => {
    const L = N.liquiditaet;
    const kasse = `TREATAS({"L-KASSE"}, 'Liquiditaetsart'[ArtID])`, op = `TREATAS({"L-OP"}, 'Liquiditaetsart'[ArtID])`;
    // Rohwerte je Periode ohne Jahr-Filter: eine Bestandszeile je Monat, beide Jahre
    const raw = (m, f) => Object.fromEntries(q(`EVALUATE SUMMARIZECOLUMNS('Kalender'[Periode], ${f}, "v", [${m}])`).map(r => [r[0], r[1]]));
    const ac = raw("Liquidität AC", kasse), pl = raw("Liquidität PL", kasse), flowAc = raw("Liquidität AC", op);
    assert.equal(Object.keys(pl).length, 24, "PL: 24 Monate Kasse");
    assert.equal(Object.keys(ac).length, 20, "AC: Jan 2025 bis Aug 2026");
    // ganzer Zeitraum (Jahr-Slicer „Alle“): Kasse = letzter Monat mit Wert, nicht die Summe über 20 bzw. 24 Monate
    const all = (m, f) => q(`EVALUATE SUMMARIZECOLUMNS(${f}, "v", [${m}])`)[0][0];
    near(all("Liquidität AC", kasse), L["Kasse und Bank AC (Stichtag)"], "AC alle Jahre = Kasse August 2026");
    near(all("Liquidität PL", kasse), L["Kasse und Bank PL Dezember"], "PL alle Jahre = Kasse Plan Dezember 2026");
    near(all("Liquidität AC", op), Object.values(flowAc).reduce((a, b) => a + b, 0), "Fluss alle Jahre = Summe der Monate");
    // je Jahr: 2025 endet im Dezember, 2026 im letzten Ist-Monat
    near(value("Liquidität AC", [kasse]), L["Kasse und Bank AC (Stichtag)"], "2026: Kasse August");
    near(q(`EVALUATE SUMMARIZECOLUMNS(TREATAS({2025}, 'Kalender'[Jahr]), ${kasse}, "v", [Liquidität AC])`)[0][0], ac["2025-12"], "2025: Kasse Dezember");
    // Monatsname ohne Jahr (Kategorie der Seite C20 bei „Alle“): Jan = Kasse Januar 2026, Sep = Kasse September 2025
    const byName = (m, f) => Object.fromEntries(q(`EVALUATE SUMMARIZECOLUMNS('Kalender'[Monatsname], ${f}, "v", [${m}])`).map(r => [r[0], r[1]]));
    const nAc = byName("Liquidität AC", kasse), nFlow = byName("Liquidität AC", op);
    near(nAc.Jan, ac["2026-01"], "Jan: Bestand 2026, nicht 2025 + 2026");
    assert.ok(Math.abs(nAc.Jan - (ac["2025-01"] + ac["2026-01"])) > 1e6, "Jan: die Summe beider Jahre wäre falsch");
    near(nAc.Sep, ac["2025-09"], "Sep: letzter Monat mit Ist ist September 2025");
    near(nFlow.Jan, flowAc["2025-01"] + flowAc["2026-01"], "Jan: Fluss = Summe beider Jahre");
    // Mini-DAX: KEEPFILTERS, <> und LASTNONBLANK wie DAX (Zeile mit Fluss = stock kippt nicht in die Flüsse)
    const r = q(`EVALUATE SUMMARIZECOLUMNS('Liquiditaetsart'[Fluss], TREATAS({2026}, 'Kalender'[Jahr]), "v", [Liquidität AC])`);
    near(r.find(x => x[0] === "stock")[1], L["Kasse und Bank AC (Stichtag)"], "Gruppe stock = Kasse August");
});

test("C24 Markt: Eigenabsatz = Absatz der Fakten je Land und Sorte, Eigenanteil 5 bis 60 %, zwei Segmente mit relativem Anteil über 1", () => {
    const M = N.markt;
    near(value("Eigenabsatz hl AC"), CONTROL["Absatz hl AC"], "Eigenabsatz = Absatz hl AC", 0.01);
    near(value("Marktvolumen hl AC"), M["Marktvolumen hl AC"], "Marktvolumen", 0.01);
    near(value("Wettbewerber hl AC"), M["Wettbewerber hl AC"], "Wettbewerber", 0.01);
    near(value("Marktwachstum %"), M["Marktvolumen hl AC"] / M["Marktvolumen hl PY bis Ist"] - 1, "Marktwachstum gesamt", 1e-9);
    const r = q(`EVALUATE SUMMARIZECOLUMNS('Marktsegment'[Land], 'Marktsegment'[Land Sort], 'Marktsegment'[Sorte], 'Marktsegment'[Sorte Sort], TREATAS({2026}, 'Kalender'[Jahr]), "y", [Marktwachstum %], "x", [Relativer Marktanteil], "size", [Marktvolumen hl AC], "share", [Eigenabsatz hl AC], "a", [Marktanteil %]) ORDER BY 'Marktsegment'[Land Sort], 'Marktsegment'[Sorte Sort]`);
    assert.equal(r.length, 16, "4 Länder × 4 Sorten");
    for (const [land, , sorte, , y, x, size, share, a] of r) {
        const seg = `${land} · ${sorte}`;
        assert.ok(a > 0.045 && a < 0.62, `${seg}: Eigenanteil ${a}`);
        near(a, M["Eigenanteil je Segment"][seg], `${seg}: Eigenanteil`, 1e-4);
        assert.ok(share < size && Math.abs(y) < 0.25 && x > 0, `${seg}: Anteil ${share}/${size}, Wachstum ${y}`);
        const own = value("Absatz hl AC", [`TREATAS({"${land}"}, 'Kunde'[Land])`, `TREATAS({"${sorte}"}, 'Produkt'[Sorte])`]);
        near(share, own, `${seg}: Eigenabsatz = Absatz hl AC der Fakten`, 0.01);
    }
    assert.equal(r.filter(x => x[5] > 1).length, 2, "relativer Marktanteil über 1 (Marktführer)");
});

test("11A Rendite: P&L-Abfrage mit Jahr als Periode liefert alle Jahre und die KPI-Zeilen, Werte passen zu GuV und Bilanz", () => {
    const R = N.rendite;
    const cols = ["'Renditekonto'[KontoID]", "'Renditekonto'[Konto]", "'Renditekonto'[SortOrder]", "'Renditekonto'[RowType]",
        "'Renditekonto'[FormulaDef]", "'Rendite'[Jahr]"].join(", ");
    const jahr = `TREATAS({2026}, 'Kalender'[Jahr])`;            // Jahr-Slicer der App: ohne Beziehung wirkungslos
    const r = q(`EVALUATE CALCULATETABLE(ADDMISSINGITEMS(${cols}, SUMMARIZECOLUMNS(${cols}, ${jahr}, "ac", [Rendite AC], "pl", [Rendite PL], "fc", [Rendite FC]), ${cols}), ${jahr}) ORDER BY 'Renditekonto'[SortOrder], 'Rendite'[Jahr]`);
    assert.equal(r.length, 6 * 3, "6 Zeilen × 3 Jahre (KPI-Zeilen aufgefüllt)");
    const cell = (id, y, i) => r.find(x => x[0] === id && x[5] === y)[i];
    const AC = 6, PL = 7, FC = 8;
    near(cell("R-EBIT", 2025, AC), N.y2025["EBIT AC"], "EBIT 2025 = GuV");
    near(cell("R-UMS", 2025, AC), N.y2025["Umsatz AC"], "Nettoumsatz 2025 = GuV");
    near(cell("R-UMS", 2026, FC), CONTROL["Umsatz FC"], "Nettoumsatz FC 2026 = Umsatz FC");
    near(cell("R-UMS", 2026, PL), CONTROL["Umsatz PL"], "Nettoumsatz PL 2026 = Umsatz PL");
    near(cell("R-EBIT", 2026, FC), value("GuV ± FC"), "EBIT FC 2026 = GuV ± FC");
    near(cell("R-EBIT", 2026, PL), value("GuV ± PL"), "EBIT PL 2026 = GuV ± PL");
    const aktiva = (m, per) => value(m, [L1("Bilanzkonto", "Aktiva"), `TREATAS({"${per}"}, 'Kalender'[Periode])`]);
    near(cell("R-KAP", 2025, AC), aktiva("Bilanz PY", "2026-12"), "Kapital 2025 = Aktiva Dezember 2025");
    near(cell("R-KAP", 2026, FC), aktiva("Bilanz FC", "2026-12"), "Kapital FC 2026 = Aktiva FC Dezember 2026");
    near(cell("R-KAP", 2026, PL), aktiva("Bilanz PL", "2026-12"), "Kapital PL 2026 = Aktiva PL Dezember 2026");
    for (const y of [2024, 2025]) {
        assert.equal(cell("R-EBIT", y, PL), null, `kein Plan ${y}`);
        assert.equal(cell("R-UMS", y, FC), cell("R-UMS", y, AC), `FC ${y} = AC`);
    }
    assert.equal(cell("R-UMS", 2026, AC), null, "2026 ist Forecast-Jahr ohne Ist");
    for (const k of ["R-UR", "R-KU", "R-ROI"]) { assert.equal(cell(k, 2025, AC), null, `${k}: KPI ohne Fakten`); }
    // Zeilentypen und Formeln nach dem P&L-Vertrag 11A, Formeln referenzieren vorhandene Kontonamen
    const dim = model.tables.Renditekonto, ix = c => dim.columns.indexOf(c);
    const names = new Set(dim.rows.map(x => x[ix("Konto")]));
    assert.deepEqual(dim.rows.map(x => x[ix("RowType")]), ["Account", "Account", "Account stock", "KPI", "KPI factor", "KPI"]);
    for (const x of dim.rows) {
        for (const m of (x[ix("FormulaDef")] ?? "").matchAll(/\[([^\]]+)\]/g)) { assert.ok(names.has(m[1]), `Formel ${x[ix("Konto")]}: ${m[1]}`); }
    }
    // DuPont: ROI = Umsatzrendite × Kapitalumschlag = EBIT / Kapital
    for (const [k, v] of Object.entries(R)) { near(v.ROI, v.Umsatzrendite * v.Kapitalumschlag, `ROI ${k}`, 1e-12); }
});

test("App-Slicer ohne Beziehung: Region, Kanal, Sorte filtern Liquidität, Markt und Rendite nicht, das Jahr nur Liquidität und Markt", () => {
    const slicer = [`TREATAS({"Polen", "Prag"}, 'Kunde'[Region])`, `TREATAS({"Export"}, 'Kunde'[Kanal])`, `TREATAS({"Alkoholfrei"}, 'Produkt'[Sorte])`];
    for (const m of ["Liquidität AC", "Liquidität FC", "Marktvolumen hl AC", "Eigenabsatz hl AC", "Marktwachstum %"]) {
        near(value(m, slicer), value(m), `${m}: Kunden- und Produkt-Slicer wirken nicht`, 1e-6);
    }
    assert.ok(value("Absatz hl AC", slicer) < value("Absatz hl AC"), "die Fakten dagegen sind gefiltert");
    near(value("Liquidität AC", [`TREATAS({"2026-01"}, 'Kalender'[Periode])`, `TREATAS({"L-KASSE"}, 'Liquiditaetsart'[ArtID])`]),
        value("Bilanz AC", [`TREATAS({"2026-01"}, 'Kalender'[Periode])`, `TREATAS({"A-KASSE"}, 'Bilanzkonto'[KontoID])`]), "Kalender filtert die Liquidität");
    const all = q(`EVALUATE SUMMARIZECOLUMNS("v", [Rendite FC])`)[0][0];
    const sliced = q(`EVALUATE SUMMARIZECOLUMNS(TREATAS({2026}, 'Kalender'[Jahr]), ${slicer.join(", ")}, "v", [Rendite FC])`)[0][0];
    assert.equal(sliced, all, "Rendite: kein Slicer wirkt, auch nicht das Jahr");
    assert.throws(() => q(`EVALUATE SUMMARIZECOLUMNS('Kalender'[Monatsname], "v", [Rendite AC])`), /keine Beziehung zu 'Kalender'/,
        "Gruppieren nach Kalender auf der Rendite ist ein Fehler, keine stille Wiederholung");
});

console.log(`showcase-data: ${n} Tests grün`);
