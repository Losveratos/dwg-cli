// Test mit dem GuV-Demo-Set: jede Kachel der Spec specs/guv.json → daxQuery() → Mini-DAX auf den
// CSV-Daten des Modells → Summen gegen die Kontrollwerte → buildDataView() fürs Visual.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createEngine } from "./minidax.mjs";
import { model, CONTROL } from "./datasets/guv.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { daxQuery, buildDataView } = await import(pathToFileURL(path.resolve(HERE, "../../visuals/dist/dwg-visuals.js")).href);
const spec = JSON.parse(fs.readFileSync(path.resolve(HERE, "../../specs/guv.json"), "utf8"));
const engine = createEngine(model);

const near = (a, b, label) => assert.ok(Math.abs(a - b) < 0.5, `${label}: ${a} statt ${b}`);
const col = (t, name) => t.columns.findIndex(c => c.name === name);
const sumCol = (t, name) => t.rows.reduce((s, r) => s + (Number(r[col(t, name)]) || 0), 0);
const tileOf = id => { for (const p of spec.pages) { const t = p.tiles.find(x => x.id === id); if (t) { return { page: p, tile: t }; } } throw new Error(id); };
const run = (id, filters = []) => {
    const { page, tile } = tileOf(id);
    const q = daxQuery(tile.visual, tile.bindings, {
        filters: [...(page.filters ?? []), ...(tile.filters ?? []), ...filters], sortBy: tile.sortBy, showItemsWithNoData: tile.showItemsWithNoData,
    });
    return { q, tile, table: engine.query(q.query) };
};

let n = 0;
const test = (name, fn) => { fn(); n++; console.log(`  ok  ${name}`); };

for (const page of spec.pages) {
    for (const tile of page.tiles) {
        test(`${page.name} · Kachel ${tile.id}: Abfrage läuft, DataView passt zu den Rollen`, () => {
            const { q, table } = run(tile.id);
            assert.ok(table.rows.length > 0);
            const dv = buildDataView(tile.visual, table, q.bindings, { objects: tile.objects });
            assert.equal(dv.categorical.values[0].values.length, table.rows.length);
        });
    }
}

test("GuV-Kacheln: alle 5.000 Konten inkl. Summen, Formeln und verwaister Konsolidierung, Summen = Kontrollwerte", () => {
    for (const id of ["statement", "baum"]) {
        const { table } = run(id);
        assert.equal(table.rows.length, CONTROL.accounts, `${id}: Konten`);
        near(sumCol(table, "[ac]"), CONTROL.ac, `${id} AC`);
        near(sumCol(table, "[pl]"), CONTROL.pl, `${id} PL`);
        near(sumCol(table, "[py]"), CONTROL.py, `${id} PY`);
        const types = new Set(table.rows.map(r => r[col(table, "dim-konten[RowType]")]));
        for (const t of ["Account", "Subtotal", "Formula", "KPI", "Separator"]) { assert.ok(types.has(t), `${id}: RowType ${t}`); }
        assert.ok(table.rows.some(r => r[col(table, "dim-konten[AccountID]")] === "899001-9999"), `${id}: Konsolidierungskonto`);
    }
});

test("Net revenue (roh, je Konto summiert): AC, PY und PL = Kontrollwerte", () => {
    const { table } = run("statement");
    const rev = table.rows.filter(r => r[col(table, "dim-konten[L1]")] === "Net revenue");
    near(rev.reduce((s, r) => s + (r[col(table, "[ac]")] ?? 0), 0), CONTROL.netRevenue.ac, "AC");
    near(rev.reduce((s, r) => s + (r[col(table, "[py]")] ?? 0), 0), CONTROL.netRevenue.py, "PY");
    near(rev.reduce((s, r) => s + (r[col(table, "[pl]")] ?? 0), 0), CONTROL.netRevenue.pl, "PL");
});

test("Statement: FY-Ausblick je Konto (MAX), Net revenue FC FY und PL FY = Kontrollwerte", () => {
    const { table } = run("statement");
    const rev = table.rows.filter(r => r[col(table, "dim-konten[L1]")] === "Net revenue");
    near(rev.reduce((s, r) => s + (r[col(table, "[fcFy]")] ?? 0), 0), CONTROL.netRevenue.fcFy, "FC FY");
    near(rev.reduce((s, r) => s + (r[col(table, "[plFy]")] ?? 0), 0), CONTROL.netRevenue.plFy, "PL FY");
});

test("Abfragen bleiben unter den Grenzen der executeQuery-API (100.000 Zeilen, 1 Mio. Werte)", () => {
    for (const p of spec.pages) {
        for (const t of p.tiles) {
            const { table } = run(t.id);
            assert.ok(table.rows.length <= 100000 && table.rows.length * table.columns.length <= 1000000,
                `${t.id}: ${table.rows.length} Zeilen × ${table.columns.length} Spalten`);
        }
    }
});

console.log(`\nGuV-Demo-Set: ${n}/${n} grün`);
