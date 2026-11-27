// Test mit dem Budapest-Demo-Set: jede Kachel aus specs/budapest-demo.json → daxQuery() → Mini-DAX auf den CSV-Daten des
// Modells → Umsatz gegen die Kontrollwerte des Berichts (Jan bis Okt 2026, Ist-Monate) → buildDataView().
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createEngine } from "./minidax.mjs";
import { model, CONTROL } from "./datasets/budapest.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { daxQuery, buildDataView } = await import(pathToFileURL(path.resolve(HERE, "../../visuals/dist/dwg-visuals.js")).href);
const spec = JSON.parse(fs.readFileSync(path.resolve(HERE, "../../specs/budapest-demo.json"), "utf8"));
const engine = createEngine(model);

const near = (a, b, label) => assert.ok(Math.abs(a - b) < 0.05, `${label}: ${a} statt ${b}`);
const col = (t, name) => t.columns.findIndex(c => c.name === name);
const sumCol = (t, name) => t.rows.reduce((s, r) => s + (Number(r[col(t, name)]) || 0), 0);
const YEAR = { column: "'dim-datum'[Jahr]", values: [2026] };
const run = (pageId, tileId, filters = [YEAR]) => {
    const page = spec.pages.find(p => p.id === pageId);
    const tile = page.tiles.find(t => t.id === tileId);
    const q = daxQuery(tile.visual, tile.bindings, {
        filters: [...(page.filters ?? []), ...filters], sortBy: tile.sortBy, showItemsWithNoData: tile.showItemsWithNoData,
    });
    return { q, tile, table: engine.query(q.query) };
};

let n = 0;
const test = (name, fn) => { fn(); n++; console.log(`  ok  ${name}`); };

for (const page of spec.pages) {
    for (const tile of page.tiles) {
        test(`${page.name} · Kachel ${tile.id}: Abfrage läuft, DataView passt zu den Rollen`, () => {
            const { q, table } = run(page.id, tile.id);
            assert.ok(table.rows.length > 0);
            const dv = buildDataView(tile.visual, table, q.bindings, { objects: tile.objects });
            assert.equal(dv.categorical.values[0].values.length, table.rows.length);
        });
    }
}

test("Umsatz AC, PL, PY je Gesellschaft (Custom Viz, Plan gap) = Kontrollwerte", () => {
    const { table } = run("custom-viz", "company");
    assert.equal(table.rows.length, 9, "neun Gesellschaften");
    near(sumCol(table, "[actual]") / 1e6, CONTROL.revenue.ac, "Revenue AC");
    near(sumCol(table, "[plan]") / 1e6, CONTROL.revenue.pl, "Revenue PL");
    near(sumCol(table, "[previousYear]") / 1e6, CONTROL.revenue.py, "Revenue PY");
    near(sumCol(run("plan-gap", "company").table, "[actual]") / 1e6, CONTROL.revenue.ac, "Plan gap Revenue AC");
});

test("Umsatz je Monat: zehn Ist-Monate (Period Status = Actual), Summe = Kontrollwert", () => {
    const { table } = run("plan-gap", "months");
    assert.equal(table.rows.length, 10);
    near(sumCol(table, "[actual]") / 1e6, CONTROL.revenue.ac, "Revenue AC");
    near(sumCol(table, "[previousYear]") / 1e6, CONTROL.revenue.py, "Revenue PY");
});

test("Monate × Region (Small Multiples): drei Regionen, Summe = Kontrollwert", () => {
    const { table } = run("custom-viz", "months");
    assert.equal(new Set(table.rows.map(r => r[col(table, "dim-region[Region]")])).size, 3);
    near(sumCol(table, "[actual]") / 1e6, CONTROL.revenue.ac, "Revenue AC");
});

test("P&L: nur GuV-Konten, Umsatzkonten (mit Vorzeichen) = Kontrollwert", () => {
    const { table } = run("group-p-l", "pnl");
    const sign = col(table, "dim-konten[SignConvention]"), l1 = col(table, "dim-konten[L1 EN]");
    const rev = table.rows.filter(r => r[l1] === "Net revenue");
    near(rev.reduce((s, r) => s + (r[col(table, "[ac]")] ?? 0) * r[sign], 0) / 1e6, CONTROL.revenue.ac, "AC");
    near(rev.reduce((s, r) => s + (r[col(table, "[pl]")] ?? 0) * r[sign], 0) / 1e6, CONTROL.revenue.pl, "PL");
    assert.ok(table.rows.some(r => r[col(table, "dim-konten[RowType]")] !== "account"), "Formel- und Zwischensummenzeilen bleiben (ADDMISSINGITEMS)");
});

test("Slicer Region filtert alle Kacheln (TREATAS): EMEA unter der Konzernsumme", () => {
    const all = sumCol(run("custom-viz", "company").table, "[actual]");
    const emea = sumCol(run("custom-viz", "company", [YEAR, { column: "'dim-region'[Region]", values: ["EMEA"] }]).table, "[actual]");
    assert.ok(emea > 0 && emea < all, `${emea} vs ${all}`);
});

console.log(`\nBudapest-Demo-Set: ${n}/${n} grün`);
