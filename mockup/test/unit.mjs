// Tests für die MockupKitchen-Bausteine in dwg: geholte Dateien unverändert (Manifest), `dwg lint` und
// `dwg mockup import` mit dem Beispiel-Mockup test/beispiel/mockup-spec.json (in MockupKitchen auf dem Modell
// „ZlatyLev Showcase“ gebaut, zwei Seiten, Pixelraster an). Der Import läuft bis in einen Power-BI-Bericht
// (Kopie von „DWG GuV.Report“ auf dem Showcase-TMDL) und wird gegen die PBIR-Schemas geprüft.
//   node mockup/test/unit.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyVendor, FILES } from "../build.mjs";
import { lintSpec, shellPalette, formatFindings } from "../lib/lint.mjs";
import { importMockup, daxRef } from "../lib/import.mjs";
import { PG } from "../lib/shared.mjs";
import { addPages } from "../../pbip/lib/report.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DWG = path.resolve(HERE, "../..");
const ROOT = DWG;
const MODEL = path.join(ROOT, "examples", "showcase", "ZlatyLev Showcase.SemanticModel");
const MOCKUP = path.join(HERE, "beispiel", "mockup-spec.json");
const readJson = f => JSON.parse(fs.readFileSync(f, "utf8"));
const clone = o => JSON.parse(JSON.stringify(o));

let n = 0, skipped = 0;
const test = (name, fn) => { fn(); n++; console.log(`  ok  ${name}`); };
const codes = r => r.findings.map(f => f.code);

// ---------------------------------------------------------------- geholte Dateien
test("mockup build: geholte Dateien unverändert (manifest.json), ES-Modul mit allen Exporten", () => {
    const { bad, manifest } = verifyVendor();
    assert.deepEqual(bad, []);
    assert.equal(Object.keys(manifest.files).length, FILES.length);
    const api = Object.keys(PG).filter(k => k !== "default").sort();
    assert.deepEqual(api, ["DWG_CHROME", "MOCKUP_CHROME", "R", "SPACING", "cellOf", "clamp", "frac", "inside", "kOf", "lattice", "layout", "line",
        "lines", "pixelBlock", "place", "placeFrac", "slicerStack", "solveMargins", "spans", "transfer", "zones"]);
});

// ---------------------------------------------------------------- dwg lint
const SHOWCASE = readJson(path.join(DWG, "specs", "showcase.json"));
const LIGHT_OK = { bg: "#f4f4f1", surface: "#ffffff", panel: "#fbfaf7", text: "#1f2328", muted: "#5f6368", accent: "#a84a22", onAccent: "#ffffff" };
const palette = { light: LIGHT_OK, dark: { ...LIGHT_OK } };

test("lint: Farben kommen aus DwgShell.tsx (hell und dunkel, alle Schlüssel)", () => {
    const p = shellPalette();
    for (const mode of ["light", "dark"]) { for (const k of ["bg", "surface", "panel", "text", "muted", "accent", "onAccent"]) { assert.match(p[mode][k], /^#[0-9a-f]{6}$/i, `${mode}.${k}`); } }
});

test("lint: Showcase (28 Seiten im Raster) ohne Fehler und ohne Rasterbefunde", () => {
    const r = lintSpec(SHOWCASE, { palette });
    assert.equal(r.counts.error, 0, formatFindings(r));
    for (const c of ["OFF_LATTICE", "NOT_FLUSH", "OUTSIDE_CONTENT", "EDGE_NEAR_X", "EDGE_NEAR_Y", "GUTTER_MISMATCH", "OVERLAP"]) { assert.ok(!codes(r).includes(c), c); }
});

test("lint: 2 px daneben, überlappend, zu klein, ohne Titel, außerhalb, Kontrast", () => {
    const spec = clone(SHOWCASE);
    spec.pages = [clone(SHOWCASE.pages[0])];
    const page = spec.pages[0], [a, b] = page.tiles;
    const want = [...a.rect];
    a.rect = [a.rect[0] + 2, a.rect[1], a.rect[2], a.rect[3]];
    page.tiles.push({ id: "winzig", visual: "chartkitchen", rect: [b.rect[0], b.rect[1], 90, 50], bindings: {} });
    page.tiles.push({ id: "draussen", visual: "pnl", rect: [10, 500, 200, 200], bindings: {}, title: "GuV" });
    const r = lintSpec(spec, { palette: { light: { ...LIGHT_OK, muted: "#b0b0b0" }, dark: LIGHT_OK } });
    const off = r.findings.find(f => f.code === "OFF_LATTICE" && f.tile === a.id);
    assert.ok(off, formatFindings(r));
    assert.deepEqual(off.fix, want, "Vorschlag = Rechteck auf der Rasterlinie");
    assert.match(off.text, /linke Kante bei x = \d+, Rasterlinie bei \d+/);
    assert.ok(r.findings.some(f => f.code === "OVERLAP" && f.level === "error"));
    assert.ok(r.findings.some(f => f.code === "A11Y_TILE_SMALL" && f.tile === "winzig" && f.level === "error"));
    assert.ok(r.findings.some(f => f.code === "A11Y_TITLE_MISSING" && f.tile === "winzig"));
    assert.ok(r.findings.some(f => f.code === "OUTSIDE_CONTENT" && f.tile === "draussen"));
    assert.ok(r.findings.some(f => f.code === "A11Y_CONTRAST_SHELL" && /Grauschrift/.test(f.text)));
    assert.match(formatFindings(r), /\d+ Fehler, \d+ Warnungen, \d+ Hinweise\./);
});

test("lint: Spec ohne App-Rahmen (GuV) ohne Rasterfehler", () => {
    const r = lintSpec(readJson(path.join(DWG, "specs", "guv.json")), { palette });
    assert.equal(r.counts.error, 0, formatFindings(r));
    assert.ok(!codes(r).includes("OFF_LATTICE"));
});

// ---------------------------------------------------------------- dwg mockup import
test("import: Feldreferenzen Tabelle.Feld → 'Tabelle'[Feld]", () => {
    assert.equal(daxRef("Fakten.Umsatz AC"), "'Fakten'[Umsatz AC]");
    assert.equal(daxRef("Kunde's.Name.lang"), "'Kunde''s'[Name.lang]");
});

const python = ["python", "python3", "py"].some(c => spawnSync(c, ["--version"], { encoding: "utf8" }).status === 0);
if (!python) {
    console.log("  --  import mit dem Skill-Konverter übersprungen: Python 3 fehlt");
    skipped++;
} else {
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "dwg-import-")), "app-spec.json");
    const { spec, hints } = importMockup({ input: MOCKUP, output: out, modelDir: MODEL });
    const page = name => spec.pages.find(p => p.name === name);
    const tile = (p, id) => page(p).tiles.find(t => t.id === id);

    test("import: Seiten, Slicer, Erklärtext aus dem Mockup", () => {
        assert.deepEqual(readJson(out), spec);
        assert.equal(spec.name, "ZLATÝ LEV Vertrieb");
        assert.deepEqual(spec.pages.map(p => p.name), ["Umsatz und Absatz", "GuV"]);
        assert.match(page("GuV").description, /Vorjahr und Plan/);
        assert.deepEqual(spec.slicers, [
            { column: "'Kalender'[Jahr]", label: "Jahr", multi: false, default: [2026] },
            { column: "'Produkt'[Sorte]", label: "Sorte", multi: true, sortBy: "'Produkt'[Sorte Sort]" },
        ]);
    });

    test("import: ChartKitchen-Rollen und Formatbereich vom Skill-Konverter", () => {
        const mon = tile("Umsatz und Absatz", "mon");
        assert.equal(mon.visual, "chartkitchen");
        assert.deepEqual(mon.bindings, { category: "'Kalender'[Monatsname]", actual: "'Fakten'[Umsatz AC]", previousYear: "'Fakten'[Umsatz PY]" });
        assert.equal(mon.objects.chart.orientation, "columns");
        assert.equal(mon.objects.chart.comparisonMode, "py");
        assert.equal(mon.objects.colors?.appearance, undefined, "Hell/Dunkel bestimmt die App");
        assert.deepEqual(mon.sortBy, { "'Kalender'[Monatsname]": "'Kalender'[Monat]" });
        const reg = tile("Umsatz und Absatz", "reg");
        assert.deepEqual(reg.bindings.plan, "'Fakten'[Umsatz PL bis Ist]");
        assert.equal(reg.objects.chart.orientation, "bars");
        assert.equal(reg.objects.chart.topN, 5);
    });

    test("import: KPI-Kacheln als ChartKitchen-Karten, GuV als P&L", () => {
        const kpi = tile("Umsatz und Absatz", "kpiU");
        assert.deepEqual(kpi.bindings, { actual: "'Fakten'[Umsatz AC]", plan: "'Fakten'[Umsatz PL bis Ist]" });
        assert.equal(kpi.objects.chart.orientation, "cards");
        const guv = tile("GuV", "guv");
        assert.equal(guv.visual, "pnl");
        assert.deepEqual(guv.bindings, { levels: ["'Konto'[L1]", "'Konto'[L2]"], ac: "'Fakten'[GuV AC]", py: "'Fakten'[GuV PY bis Ist]",
            pl: "'Fakten'[GuV PL bis Ist]", rowType: "'Konto'[RowType]" });
        assert.equal(guv.showItemsWithNoData, true);
    });

    test("import: Lage über die Brüche des Mockups exakt ins dwg-Raster (Full HD, Filter links)", () => {
        const z = PG.zones({ w: 1920, h: 1080 }, { ...PG.DWG_CHROME });
        // Mockup: KPI-Zeile 1/4 hoch, drei Drittel; Hauptzeile 2/3 + 1/3
        assert.deepEqual(tile("Umsatz und Absatz", "kpiU").rect, PG.place(z, 0, 4, 0, 3));
        assert.deepEqual(tile("Umsatz und Absatz", "kpiD").rect, PG.place(z, 8, 12, 0, 3));
        assert.deepEqual(tile("Umsatz und Absatz", "mon").rect, PG.place(z, 0, 8, 3, 12));
        assert.deepEqual(tile("GuV", "guv").rect, PG.place(z, 0, 8, 0, 12));
        assert.deepEqual(tile("Umsatz und Absatz", "kpiU").rect, [327, 123, 510, 210]);
    });

    test("import: Nicht Abbildbares als Hinweis (natives Visual, Text, KPI-Karte, Mockup-Warnung)", () => {
        assert.equal(page("GuV").tiles.length, 1);
        assert.ok(hints.some(h => /EBIT: natives Power-BI-Visual \(card\) gibt es in dwg nicht/.test(h)), hints.join("\n"));
        assert.ok(hints.some(h => /Kernaussage: Text-Kachel .*Kosten über Plan/.test(h)));
        assert.ok(hints.some(h => /ibcsKpiCard/.test(h)));
        assert.ok(hints.some(h => /Mockup „GuV“/.test(h)), "Warnung aus dem Mockup-Export");
        assert.ok(!hints.some(h => /fehlt im Modell|kein Measure/.test(h)), "alle Felder im Modell");
    });

    test("import → lint: ohne Fehler und ohne Rasterbefunde", () => {
        const r = lintSpec(spec, { palette });
        assert.equal(r.counts.error, 0, formatFindings(r));
        assert.ok(!codes(r).some(c => ["OFF_LATTICE", "NOT_FLUSH", "EDGE_NEAR_X", "EDGE_NEAR_Y", "GUTTER_MISMATCH"].includes(c)), formatFindings(r));
    });

    test("import → dwg pbip pages: Bericht schemagültig", () => {
        const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "dwg-mockup-pbip-")), "Test.Report");
        fs.cpSync(path.join(ROOT, "examples", "DWG GuV.Report"), dir, { recursive: true });
        const pbir = readJson(path.join(dir, "definition.pbir"));
        pbir.datasetReference.byPath.path = path.relative(dir, MODEL).split(path.sep).join("/");
        fs.writeFileSync(path.join(dir, "definition.pbir"), JSON.stringify(pbir, null, 2));
        // nur die Custom Visuals der Vorlage behalten, ihre GuV-Seiten hängen am Kitchen-Modell
        const pagesDir = path.join(dir, "definition", "pages"), pj = readJson(path.join(pagesDir, "pages.json"));
        for (const id of pj.pageOrder) { fs.rmSync(path.join(pagesDir, id), { recursive: true, force: true }); }
        fs.writeFileSync(path.join(pagesDir, "pages.json"), JSON.stringify({ ...pj, pageOrder: [], activePageName: undefined }, null, 2));
        const { created } = addPages(dir, spec);
        assert.deepEqual(created.map(c => c.name), ["Umsatz und Absatz", "GuV"]);
        const v = spawnSync(process.execPath, [path.join(DWG, "pbip", "test", "validate.mjs"), dir], { encoding: "utf8" });
        assert.equal(v.status, 0, v.stdout + v.stderr);
    });
}

console.log(`mockup: ${n} Tests grün${skipped ? `, ${skipped} übersprungen` : ""}`);
