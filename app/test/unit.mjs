// Unit-Tests für `dwg app page` (Generator) an einer Minimal-App im Temp-Ordner.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { generateAppPages, connectorsOf, slug, checkSpec } from "../lib/app.mjs";
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

// Spec-Prüfung: jede Lücke eine Meldung mit Seite und Kachel, nie ein TypeError
const specMessage = spec => { try { checkSpec(spec); return ""; } catch (e) { return e.message; } };
const tileSpec = () => structuredClone({ name: "S", pages: [{ name: "P", tiles: [
    { id: "a", visual: "chartkitchen", rect: [0, 0, 100, 100], bindings: { category: "'T'[X]", actual: "'T'[Y]" } }] }] });

await test("checkSpec: pages, Seitenname, tiles", () => {
    assert.equal(specMessage(tileSpec()), "");
    const noPages = tileSpec(); delete noPages.pages;
    assert.match(specMessage(noPages), /pages fehlt oder ist keine Liste/);
    assert.match(specMessage({ name: "S", pages: "nope" }), /pages fehlt oder ist keine Liste/);
    const noName = tileSpec(); delete noName.pages[0].name;
    assert.match(specMessage(noName), /Seite 1: name fehlt/);
    const noTiles = tileSpec(); delete noTiles.pages[0].tiles;
    assert.match(specMessage(noTiles), /Seite „P“: tiles fehlt oder ist keine Liste/);
});

await test("checkSpec: Kachel id, visual, bindings", () => {
    const noId = tileSpec(); delete noId.pages[0].tiles[0].id;
    assert.match(specMessage(noId), /Seite „P“, Kachel 1: id fehlt/);
    const dup = tileSpec(); dup.pages[0].tiles.push(structuredClone(dup.pages[0].tiles[0]));
    assert.match(specMessage(dup), /Seite „P“, Kachel a: id kommt auf der Seite mehrfach vor/);
    const big = tileSpec(); big.pages[0].tiles[0].visual = "chartKitchen";
    assert.match(specMessage(big), /Seite „P“, Kachel a: visual „chartKitchen“ gibt es nicht \(gültig: chartkitchen, pnl/);
    const noBind = tileSpec(); delete noBind.pages[0].tiles[0].bindings;
    assert.match(specMessage(noBind), /Seite „P“, Kachel a: bindings fehlt oder ist kein Objekt/);
    // gleiche id auf zwei Seiten ist erlaubt
    const two = tileSpec(); two.pages.push({ name: "Q", tiles: structuredClone(two.pages[0].tiles) });
    assert.equal(specMessage(two), "");
});

await test("checkSpec: filters auf Seite und Kachel", () => {
    const f1 = tileSpec(); f1.pages[0].filters = "nope";
    assert.match(specMessage(f1), /Seite „P“: filters muss eine Liste sein/);
    const f2 = tileSpec(); f2.pages[0].tiles[0].filters = [{ column: "'T'[Jahr]" }];
    assert.match(specMessage(f2), /Seite „P“, Kachel a, Filter 1: values fehlt oder ist keine Liste/);
    const f3 = tileSpec(); f3.pages[0].filters = [{ column: "'T'[Jahr]", values: [] }];
    assert.match(specMessage(f3), /Seite „P“, Filter 1: values ist leer/);
    const f4 = tileSpec(); f4.pages[0].filters = [{ column: "Jahr", values: [2026] }, "x"];
    assert.match(specMessage(f4), /Filter 1: column muss eine Spalte mit Tabelle sein[^]*Filter 2: erwartet/);
    const ok = tileSpec(); ok.pages[0].filters = [{ column: "'T'[Jahr]", values: [2026] }]; ok.pages[0].tiles[0].filters = [{ column: "'T'[Region]", values: ["Nord"] }];
    assert.equal(specMessage(ok), "");
});

await test("app page zeigt die checkSpec-Meldung bei ungültiger Spec", async () => {
    const bad = tileSpec(); bad.pages[0].tiles[0].filters = [{ column: "'T'[Jahr]" }];
    await assert.rejects(generateAppPages({ appDir: fakeApp(), spec: bad, connector: "guv" }), /Spec passt nicht[^]*Kachel a, Filter 1: values fehlt/);
});

// dwg check über die Kommandozeile
const DWG = path.join(ROOT, "dwg.mjs");
const dwg = (...a) => spawnSync(process.execPath, [DWG, ...a], { encoding: "utf8", cwd: ROOT });
const SHOWCASE = path.join(ROOT, "specs", "showcase.json");
const SHOWCASE_MODEL = path.join(ROOT, "examples", "showcase", "ZlatyLev Showcase.SemanticModel");
const checkTmp = fs.mkdtempSync(path.join(os.tmpdir(), "dwg-check-"));

await test("dwg check: showcase.json gegen das Showcase-Modell ist grün", () => {
    const r = dwg("check", "--spec", SHOWCASE, "--model", SHOWCASE_MODEL);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /^28 Seiten, 56 Kacheln, 0 Probleme$/m);
    const j = JSON.parse(dwg("check", "--spec", SHOWCASE, "--json").stdout);
    assert.deepEqual(j, { pages: 28, tiles: 56, problems: [] });
});

await test("dwg check: kaputte Spec, Exit 1 und Meldungen mit Seite und Kachel", () => {
    const spec = JSON.parse(fs.readFileSync(SHOWCASE, "utf8"));
    const page = spec.pages[0], [t1, t2] = page.tiles;
    t1.visual = "chartKitchen";
    t2.bindings = { ...t2.bindings, gibtsnicht: "'Fakten'[Umsatz AC]" };
    const firstRole = Object.keys(spec.pages[1].tiles[0].bindings)[0];
    spec.pages[1].tiles[0].bindings[firstRole] = "'Fakten'[Gibt es nicht]";
    const file = path.join(checkTmp, "kaputt.json");
    fs.writeFileSync(file, JSON.stringify(spec));
    let r = dwg("check", "--spec", file, "--model", SHOWCASE_MODEL);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.ok(r.stdout.includes(`Seite „${page.name}“, Kachel ${t1.id}: visual „chartKitchen“ gibt es nicht`), r.stdout);
    assert.ok(r.stdout.includes(`Seite „${page.name}“, Kachel ${t2.id}: `) && /gibtsnicht/.test(r.stdout), r.stdout);
    assert.ok(r.stdout.includes(`Seite „${spec.pages[1].name}“, Kachel ${spec.pages[1].tiles[0].id}, Rolle ${firstRole}`), r.stdout);
    assert.match(r.stdout, /^28 Seiten, 56 Kacheln, [3-9] Probleme$/m);
    const j = JSON.parse(dwg("check", "--spec", file, "--model", SHOWCASE_MODEL, "--json").stdout);
    assert.equal(j.pages, 28);
    assert.ok(j.problems.length >= 3);
    // Spec ohne pages: eine Meldung, kein TypeError
    fs.writeFileSync(file, "{}");
    r = dwg("check", "--spec", file);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /pages fehlt oder ist keine Liste/);
    assert.doesNotMatch(r.stdout + r.stderr, /TypeError|Cannot read/);
    assert.equal(dwg("check").status, 1);
});

console.log(`app unit: ${n} Tests grün`);
