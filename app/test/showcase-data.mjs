// Showcase-Datensatz: Mini-DAX rechnet die Measures des Modells „ZlatyLev Showcase“ (wörtlich aus dem TMDL exportiert)
// auf den Fixtures und trifft die Kontrollwerte aus showcase/CONTRACT.md. Dazu Kurztests der Mini-DAX-Erweiterungen
// (Plus/Minus, Zahlen, DIVIDE, AVERAGEX, mehrere Faktentabellen). Bilanz und Cashflow: Aktiva = Passiva, Kasse =
// Endbestand, Anfangsbestand = Endbestand des Vormonats, Abschreibungen aus der GuV. Aufruf: node app/test/showcase-data.mjs
import assert from "node:assert/strict";
import { createEngine, splitSigned } from "./minidax.mjs";
import { model, CONTROL, CONTROL_STOCK } from "./datasets/showcase.mjs";

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

test("Fixtures: 14.124 Faktzeilen 2026, 21 Konten, 63 Measures aus dem Modell (50 GuV, 13 Bilanz und Cashflow)", () => {
    assert.equal(model.tables.Fakten.rows.length, CONTROL.rows);
    assert.equal(CONTROL.accounts, 21);
    assert.equal(Object.keys(model.measures).length, 63);
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

console.log(`showcase-data: ${n} Tests grün`);
