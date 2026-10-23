// Unit-Tests für `dwg app page` (Generator) an einer Minimal-App im Temp-Ordner.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateAppPages, connectorsOf, slug } from "../lib/app.mjs";
import { layoutOf } from "../lib/app.mjs";
import { place } from "../../layout/pixelgrid.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const MODEL = path.join(ROOT, "examples", "ChartKitchen byDatenWG Demo.SemanticModel");
const SPEC = JSON.parse(fs.readFileSync(path.join(ROOT, "specs", "spike.json"), "utf8"));

function fakeApp(yml) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dwg-app-"));
    fs.mkdirSync(path.join(dir, "rayfin"), { recursive: true });
    fs.mkdirSync(path.join(dir, "packages/frontend/src/hooks"), { recursive: true });
    fs.writeFileSync(path.join(dir, "packages/frontend/src/hooks/use-semantic-model-query.ts"), "");
    fs.writeFileSync(path.join(dir, "rayfin/rayfin.yml"), yml ?? "id: x\nconnectors:\n  - name: guv\n    type: fabric-semanticmodel\n    config: {}\n");
    return dir;
}

let n = 0;
const test = async (name, fn) => { await fn(); n++; console.log(`  ok  ${name}`); };

await test("slug", () => {
    assert.equal(slug("dwg Spike"), "dwg-spike");
    assert.equal(slug("Übersicht & Märkte"), "ubersicht-markte");
});

await test("connectorsOf liest Name und Typ", () => {
    const app = fakeApp("connectors:\n  - name: a\n    type: fabric-semanticmodel\n  - name: b\n    type: fabric-sqlanalytics\n");
    assert.deepEqual(connectorsOf(app), [{ name: "a", type: "fabric-semanticmodel" }, { name: "b", type: "fabric-sqlanalytics" }]);
});

await test("schreibt Adapter, Vorlagen, Seite und DAX", async () => {
    const app = fakeApp();
    const r = await generateAppPages({ appDir: app, spec: SPEC, connector: "guv", model: MODEL });
    const src = path.join(app, "packages/frontend/src");
    for (const f of ["vendor/dwg-visuals/dwg-visuals.js", "vendor/dwg-visuals/dwg-visuals.d.ts", "dwg/DwgPage.tsx", "dwg/DwgVisual.tsx", "dwg/dwg-page.ts", "dwg/pages/dwg-spike.ts", "dwg/pages/dwg-spike.dax"]) {
        assert.ok(fs.existsSync(path.join(src, f)), f);
    }
    assert.ok(!fs.readdirSync(path.join(src, "vendor/dwg-visuals/chunks")).some(f => f.endsWith(".map")), "keine Source-Maps");
    const dax = fs.readFileSync(path.join(src, "dwg/pages/dwg-spike.dax"), "utf8");
    assert.equal((dax.match(/^EVALUATE/gm) ?? []).length, 4);
    assert.match(dax, /ADDMISSINGITEMS/);
    assert.equal(r.connector, "guv");
});

await test("lehnt fehlenden oder falschen Konnektor ab", async () => {
    await assert.rejects(generateAppPages({ appDir: fakeApp(), spec: SPEC, connector: "sales" }), /Konnektor "sales" fehlt/);
    const app = fakeApp("connectors:\n  - name: guv\n    type: fabric-sqlanalytics\n");
    await assert.rejects(generateAppPages({ appDir: app, spec: SPEC, connector: "guv" }), /gebraucht wird fabric-semanticmodel/);
});

await test("prüft Rollen und Felder gegen das Modell", async () => {
    const bad = structuredClone(SPEC);
    bad.pages[0].tiles[0].bindings.kategorie = "'Sales Demo'[KPI]";
    await assert.rejects(generateAppPages({ appDir: fakeApp(), spec: bad, connector: "guv" }), /kennt die Rolle "kategorie" nicht/);
    const bad2 = structuredClone(SPEC);
    bad2.pages[0].tiles[1].bindings.actual = "'Sales Demo'[Umsatz AC]";
    await assert.rejects(generateAppPages({ appDir: fakeApp(), spec: bad2, connector: "guv", model: MODEL }), /Umsatz AC\] ist kein Measure/);
    // ohne Modell sind freie DAX-Ausdrücke in Measure-Rollen erlaubt (nur App)
    const free = structuredClone(SPEC);
    free.pages[0].tiles[1].bindings.actual = "CALCULATE('Sales Demo'[AC], 'Sales Demo'[Scenario] = \"AC\")";
    await generateAppPages({ appDir: fakeApp(), spec: free, connector: "guv", model: MODEL });
});

const RAHMEN = JSON.parse(fs.readFileSync(path.join(HERE, "rahmen-spec.json"), "utf8"));

await test("schreibt die App-Datei für DwgShell (Slicer, Seiten, Gruppen)", async () => {
    const app = fakeApp();
    const r = await generateAppPages({ appDir: app, spec: RAHMEN, connector: "guv", model: MODEL });
    const src = path.join(app, "packages/frontend/src");
    assert.ok(fs.existsSync(path.join(src, "dwg/DwgShell.tsx")));
    assert.equal(r.app, "dwg-rahmen-test");
    const ts = fs.readFileSync(path.join(src, "dwg/apps/dwg-rahmen-test.ts"), "utf8");
    assert.match(ts, /import \{ page as p0 \} from '\.\.\/pages\/saulen-im-zeitverlauf';/);
    assert.match(ts, /"pages": \[p0, p1, p2\]/);
    assert.match(ts, /"resolution": "fullhd"/);
    assert.match(ts, /"visualHeaders": false/);
    assert.match(ts, /"footer": "Demodaten/);
    assert.match(ts, /"label": "Jahr"/);
    const page = fs.readFileSync(path.join(src, "dwg/pages/saulen-im-zeitverlauf.ts"), "utf8");
    for (const k of ['"template": "C03"', '"group": "ChartKitchen · Zeitverlauf"', '"description": "Wie entwickelt']) { assert.ok(page.includes(k), k); }
    // Zonen nach dem Pixelraster (FHD: Kopf 96, Filter 300, Fuß 36, Rand 27, Inhalt 1566 × 894)
    const zones = JSON.parse(page.slice(page.indexOf('"zones": ') + 9, page.indexOf('"filters"')).trim().replace(/,$/, ""));
    assert.deepEqual(zones.content, { x: 327, y: 123, w: 1566, h: 894 });
    assert.deepEqual(zones.filter, { x: 0, y: 96, w: 300, h: 948 });
    assert.deepEqual(zones.footer, { x: 0, y: 1044, w: 1920, h: 36 });
    // Kachelfeld formats (nur App) und Boolean-Kachelfilter kommen in die Seiten-Spec bzw. die Abfrage
    const withFormats = structuredClone(RAHMEN);
    withFormats.pages[2].tiles[0].formats = { "[actual]": "0.0 %" };
    withFormats.pages[2].tiles[0].filters = [{ column: "'Calender'[Year]", values: [true] }];
    const app3 = fakeApp();
    await generateAppPages({ appDir: app3, spec: withFormats, connector: "guv" });
    const p3 = path.join(app3, "packages/frontend/src/dwg/pages/abweichung-nach-land");
    assert.match(fs.readFileSync(`${p3}.ts`, "utf8"), /"formats": \{\s*"\[actual\]": "0\.0 %"/);
    assert.match(fs.readFileSync(`${p3}.dax`, "utf8"), /TREATAS\(\{TRUE\(\)\}, 'Calender'\[Year\]\)/);
    const dax = fs.readFileSync(path.join(src, "dwg/apps/dwg-rahmen-test.dax"), "utf8");
    assert.match(dax, /EVALUATE\nSUMMARIZECOLUMNS\('Calender'\[Year\]\)\nORDER BY 'Calender'\[Year\]/);
    // ohne Slicer: App-Datei trotzdem (Navigation), aber keine Slicer-Abfragen
    const app2 = fakeApp();
    await generateAppPages({ appDir: app2, spec: SPEC, connector: "guv" });
    assert.match(fs.readFileSync(path.join(app2, "packages/frontend/src/dwg/apps/dwg-spike.ts"), "utf8"), /"slicers": \[\]/);
    assert.ok(!fs.existsSync(path.join(app2, "packages/frontend/src/dwg/apps/dwg-spike.dax")));
});

await test("Layout-Vertrag: Kacheln im Inhaltsbereich des Pixelrasters", async () => {
    const bad = structuredClone(RAHMEN);
    bad.pages[0].tiles[0].rect = [300, 123, 1593, 438];
    bad.pages[1].tiles[0].rect = [327, 123, 1566, 920];
    await assert.rejects(generateAppPages({ appDir: fakeApp(), spec: bad, connector: "guv" }),
        e => e.message.includes("Kachel monat: [300, 123, 1593, 438] liegt nicht im Inhaltsbereich (x 327 bis 1893, y 123 bis 1017")
            && /Kachel bruecke: .* liegt nicht im Inhaltsbereich/.test(e.message));
    // ohne Slicer und Auflösung gilt der Vertrag nicht (bestehende Seiten)
    const free = structuredClone(bad);
    delete free.slicers;
    delete free.resolution;
    await generateAppPages({ appDir: fakeApp(), spec: free, connector: "guv" });
});

await test("Pixelraster aus layout/pixelgrid.mjs: Generator prüft damit, App bekommt das Modul", async () => {
    const z = layoutOf(RAHMEN, RAHMEN.pages[0]);
    assert.deepEqual(z.content, { x: 327, y: 123, w: 1566, h: 894 });
    assert.deepEqual(place(z, 0, 6, 6, 12), RAHMEN.pages[0].tiles[1].rect);
    const app = fakeApp();
    await generateAppPages({ appDir: app, spec: RAHMEN, connector: "guv" });
    const grid = path.join(app, "packages/frontend/src/vendor/dwg-pixelgrid");
    assert.ok(fs.existsSync(path.join(grid, "pixelgrid.js")) && fs.existsSync(path.join(grid, "pixelgrid.d.ts")));
    assert.equal(fs.readFileSync(path.join(grid, "pixelgrid.js"), "utf8"), fs.readFileSync(path.join(HERE, "../../layout/pixelgrid.mjs"), "utf8"));
    const ts = fs.readFileSync(path.join(app, "packages/frontend/src/dwg/apps/dwg-rahmen-test.ts"), "utf8");
    assert.match(ts, /"chrome": {/);
});

await test("prüft Slicer und Seitenkennungen", async () => {
    const s1 = structuredClone(RAHMEN);
    s1.slicers.push({ column: "Jahr", label: "Kaputt" }, { column: "'Calender'[Year]", label: "Doppelt" });
    s1.slicers[0].default = [2025, 2026];
    s1.pages[2].template = "C03";
    await assert.rejects(generateAppPages({ appDir: fakeApp(), spec: s1, connector: "guv" }), e =>
        /Kaputt.*Spalte mit Tabelle/.test(e.message) && /Doppelt.*gibt es schon/.test(e.message)
        && /Einfachauswahl mit 2 Startwerten/.test(e.message) && /Kennung „c03“/.test(e.message));
    const s2 = structuredClone(RAHMEN);
    s2.slicers[1].column = "'Sales Demo'[Land]";
    await assert.rejects(generateAppPages({ appDir: fakeApp(), spec: s2, connector: "guv", model: MODEL }), /Slicer „Land“/);
});

await test("Datumswerte: Spaltentyp aus dem TMDL in die Spec, Filterwerte gegen den Datentyp geprüft", async () => {
    const bad = structuredClone(RAHMEN);
    bad.slicers[1].default = [2026];
    bad.pages[0].tiles[0].filters = [{ column: "'fact-guv'[Datum]", values: ["März"] }];
    bad.pages[1].filters = [{ column: "'fact-guv'[Datum]", values: [20260301] }];
    await assert.rejects(generateAppPages({ appDir: fakeApp(), spec: bad, connector: "guv", model: MODEL }), e =>
        e.message.includes("Slicer „Land“, default, 'Sales Demo'[Country]: 2026 ist kein Text")
        && e.message.includes(`Kachel monat, Filter, 'fact-guv'[Datum]: "März" ist kein Datum`)
        && e.message.includes("Seite „Brücke über die Monate“, Filter, 'fact-guv'[Datum]: 20260301 ist kein Datum"));
    const ok = structuredClone(RAHMEN);
    ok.pages[0].tiles[0].filters = [{ column: "'fact-guv'[Datum]", values: ["2026-03-01"] }];
    const app = fakeApp();
    await generateAppPages({ appDir: app, spec: ok, connector: "guv", model: MODEL });
    const dir = path.join(app, "packages/frontend/src/dwg");
    const page = fs.readFileSync(path.join(dir, "pages/saulen-im-zeitverlauf.ts"), "utf8");
    assert.match(page, /"columnTypes": \{[^}]*"'fact-guv'\[Datum\]": "dateTime"/);
    assert.match(page, /"'Sales Demo'\[Country\]": "string"/);
    assert.match(fs.readFileSync(path.join(dir, "pages/saulen-im-zeitverlauf.dax"), "utf8"), /TREATAS\(\{DATE\(2026, 3, 1\)\}, 'fact-guv'\[Datum\]\)/);
    assert.match(fs.readFileSync(path.join(dir, "apps/dwg-rahmen-test.ts"), "utf8"), /"columnTypes": \{\s*"'Sales Demo'\[Country\]": "string"\s*\}/);
    // ohne Modell keine Typen: die App liest ISO-Text als Datum (bisheriges Verhalten)
    const app2 = fakeApp();
    await generateAppPages({ appDir: app2, spec: ok, connector: "guv" });
    assert.ok(!fs.readFileSync(path.join(app2, "packages/frontend/src/dwg/pages/saulen-im-zeitverlauf.ts"), "utf8").includes("columnTypes"));
});

console.log(`app unit: ${n} Tests grün`);
