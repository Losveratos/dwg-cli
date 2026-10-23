// Unit-Tests für daxQuery, buildDataView und applyPersist (ohne Browser). Geprüft wird das committete dist/,
// also genau das, was die Apps bekommen; nach Änderungen an src/ erst `node dwg.mjs visuals build`.
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { daxQuery, daxLiteral, col, buildDataView, columnIndex, normalizeRef, applyPersist } =
    await import(pathToFileURL(path.join(HERE, "../dist/dwg-visuals.js")).href);

let n = 0;
const test = (name, fn) => { fn(); n++; console.log(`  ok  ${name}`); };

test("normalizeRef entfernt Tabellen-Hochkommas", () => {
    assert.equal(normalizeRef("'Pipeline Status'[Sort Order]"), "Pipeline Status[Sort Order]");
    assert.equal(normalizeRef("'O''Brien'[Name]"), "O'Brien[Name]");
    assert.equal(normalizeRef("[AC]"), "[AC]");
});

test("col maskiert Tabellen- und Spaltennamen", () => {
    assert.equal(col("Pipeline Status", "Sort Order"), "'Pipeline Status'[Sort Order]");
    assert.equal(col("O'Brien", "a]b"), "'O''Brien'[a]]b]");
});

test("daxLiteral", () => {
    assert.equal(daxLiteral(0), "0");
    assert.equal(daxLiteral('Sag "Hallo"'), '"Sag ""Hallo"""');
    assert.equal(daxLiteral(true), "TRUE()");
    assert.equal(daxLiteral(null), "BLANK()");
    assert.equal(daxLiteral(new Date(2026, 2, 5)), "DATE(2026, 3, 5)");
});

test("daxQuery ChartKitchen: Gruppen, Measures, Sortierung, Filter", () => {
    const q = daxQuery("chartkitchen", {
        category: "'Kalender'[Monat]", actual: "[Umsatz AC]", previousYear: "[Umsatz PY]",
    }, {
        sortBy: { "'Kalender'[Monat]": "'Kalender'[MonatNr]" },
        filters: [{ column: "'Pipeline Status'[Sort Order]", values: [0] }],
    });
    assert.match(q.query, /^EVALUATE\n {4}SUMMARIZECOLUMNS\(/);
    assert.match(q.query, /'Kalender'\[Monat\],\n {8}'Kalender'\[MonatNr\],/);
    assert.match(q.query, /TREATAS\(\{0\}, 'Pipeline Status'\[Sort Order\]\)/);
    assert.match(q.query, /"actual", \[Umsatz AC\],\n {8}"previousYear", \[Umsatz PY\]/);
    assert.match(q.query, /ORDER BY 'Kalender'\[MonatNr\]$/);
    assert.deepEqual(q.bindings, { category: "Kalender[Monat]", actual: "[actual]", previousYear: "[previousYear]" });
    assert.deepEqual(q.displayNames, { "[actual]": "Umsatz AC", "[previousYear]": "Umsatz PY" });
});

test("daxQuery mit tabellenqualifizierten Measures", () => {
    const q = daxQuery("chartkitchen", {
        category: "'Calender'[Month Name Short]", actual: "'Sales Demo'[AC]", previousYear: "'Sales Demo'[PY]",
    }, { sortBy: { "'Calender'[Month Name Short]": "'Calender'[Month]" }, filters: [{ column: "'Calender'[Year]", values: [2026] }] });
    assert.match(q.query, /"actual", 'Sales Demo'\[AC\]/);
    assert.match(q.query, /TREATAS\(\{2026\}, 'Calender'\[Year\]\)/);
    assert.match(q.query, /ORDER BY 'Calender'\[Month\]$/);
    assert.deepEqual(q.displayNames, { "[actual]": "AC", "[previousYear]": "PY" });
    assert.equal(q.bindings.category, "Calender[Month Name Short]");
});

test("daxQuery P&L: levels als Liste, ADDMISSINGITEMS für Formelzeilen", () => {
    const q = daxQuery("pnl", {
        levels: ["'Konten'[Ebene 1]", "'Konten'[Ebene 2]"], rowType: "'Konten'[Zeilentyp]", ac: "[AC]",
    }, { showItemsWithNoData: true });
    assert.match(q.query, /ADDMISSINGITEMS\(/);
    assert.deepEqual(q.bindings.levels, ["Konten[Ebene 1]", "Konten[Ebene 2]"]);
});

test("daxQuery lehnt Unbekanntes ab", () => {
    assert.throws(() => daxQuery("chartkitchen", { kategorie: "'K'[M]" }), /kennt die Rolle "kategorie" nicht/);
    assert.throws(() => daxQuery("chartkitchen", { category: "[Umsatz]" }), /keine Spaltenreferenz/);
    assert.throws(() => daxQuery("chartkitchen", { category: "'K'[M]" }, { filters: [{ column: "x); EVALUATE Y", values: [1] }] }), /keine Spaltenreferenz/);
});

const table = {
    columns: [{ name: "Kalender[Monat]" }, { name: "Region[Monat]" }, { name: "[actual]" }, { name: "[plan]" }],
    rows: [["Jan ", "x", "100", 90], ["Feb", "y", null, 95]],
};

test("columnIndex: exakt, ohne Tabelle, mehrdeutig, fehlend", () => {
    assert.equal(columnIndex(table, "'Kalender'[Monat]"), 0);
    assert.equal(columnIndex(table, "actual"), 2);
    assert.throws(() => columnIndex(table, "Monat"), /nicht eindeutig/);
    assert.throws(() => columnIndex(table, "[forecast]"), /fehlt im Abfrageergebnis/);
});

test("buildDataView: Rollen, Typen, Trim, Reihenfolge der Mapping-Definition", () => {
    const dv = buildDataView("chartkitchen", table,
        { plan: "[plan]", actual: "[actual]", category: "Kalender[Monat]" },
        { formats: { "[actual]": "#,0 €" }, displayNames: { "[actual]": "Umsatz" }, objects: { chart: { orientation: "columns" } } });
    assert.deepEqual(dv.categorical.categories[0].values, ["Jan", "Feb"]);
    assert.deepEqual(dv.categorical.categories[0].source.roles, { category: true });
    assert.deepEqual(dv.categorical.values.map(v => Object.keys(v.source.roles)[0]), ["actual", "plan"]);
    assert.deepEqual(dv.categorical.values[0].values, [100, null]);
    assert.equal(dv.categorical.values[0].source.format, "#,0 €");
    assert.equal(dv.categorical.values[0].source.displayName, "Umsatz");
    assert.equal(dv.metadata.objects.chart.orientation, "columns");
});

test("buildDataView: ISO-Datum aus dem Konnektor wird Date (wie in Power BI), Text bleibt Text", () => {
    const t = { columns: [{ name: "Utilization[Date]" }, { name: "[actual]" }], rows: [["2021-06-07T00:00:00", 1], ["2021-06-08", 2]] };
    const v = buildDataView("chartkitchen", t, { category: "Utilization[Date]", actual: "[actual]" }).categorical.categories[0].values;
    assert.ok(v[0] instanceof Date && v[1] instanceof Date);
    assert.equal(v[0].getFullYear(), 2021); assert.equal(v[0].getMonth(), 5); assert.equal(v[0].getDate(), 7);
    const t2 = { columns: [{ name: "K[Name]" }, { name: "[actual]" }], rows: [["2021 Plan", 1]] };
    assert.equal(buildDataView("chartkitchen", t2, { category: "K[Name]", actual: "[actual]" }).categorical.categories[0].values[0], "2021 Plan");
});

test("buildDataView prüft Rollen und Höchstzahl", () => {
    assert.throws(() => buildDataView("pnl", table, { category: "[actual]" }), /kennt die Rolle "category" nicht/);
    assert.throws(() => buildDataView("chartkitchen", table, { category: ["Kalender[Monat]", "Region[Monat]"] }), /höchstens 1/);
});

test("applyPersist: merge, replace, remove", () => {
    const a = { chart: { orientation: "table", tableSort: "none" }, colors: { appearance: "auto" } };
    const b = applyPersist(a, { merge: [{ objectName: "chart", selector: null, properties: { tableSort: "dabs_desc" } }] });
    assert.equal(b.chart.tableSort, "dabs_desc");
    assert.equal(b.chart.orientation, "table");
    assert.equal(a.chart.tableSort, "none", "Original bleibt unverändert");
    const c = applyPersist(b, { remove: [{ objectName: "chart", properties: { tableSort: null } }], replace: [{ objectName: "colors", properties: { appearance: "dark" } }] });
    assert.equal(c.chart.tableSort, undefined);
    assert.deepEqual(c.colors, { appearance: "dark" });
});

console.log(`unit: ${n} Tests grün`);
