// Unit-Tests für `dwg pbip pages` mit App-Rahmen: Seitennamen mit Template-Kennung, Textfeld mit Erklärtext,
// native Slicer mit Sync-Gruppe und Startauswahl, Layout-Vertrag. Arbeitet auf einer Kopie von „DWG GuV.Report“
// im Temp-Ordner (Custom Visuals sind dort eingetragen) und prüft das Ergebnis mit validate.mjs gegen die
// offiziellen PBIR-Schemas.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addPages, pageLabel } from "../lib/report.mjs";
import { queryState, TILE_FRAME } from "../lib/pbir.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const MODEL = path.join(ROOT, "examples", "ChartKitchen byDatenWG Demo.SemanticModel");
const SPEC = JSON.parse(fs.readFileSync(path.join(ROOT, "app", "test", "rahmen-spec.json"), "utf8"));
const readJson = f => JSON.parse(fs.readFileSync(f, "utf8"));

function reportCopy() {
    const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "dwg-pbip-")), "Test.Report");
    fs.cpSync(path.join(ROOT, "examples", "DWG GuV.Report"), dir, { recursive: true });
    const pbir = readJson(path.join(dir, "definition.pbir"));
    pbir.datasetReference.byPath.path = path.relative(dir, MODEL).split(path.sep).join("/");
    fs.writeFileSync(path.join(dir, "definition.pbir"), JSON.stringify(pbir, null, 2));
    return dir;
}

function pageVisuals(dir, pageId) {
    const vdir = path.join(dir, "definition", "pages", pageId, "visuals");
    return fs.readdirSync(vdir).map(v => readJson(path.join(vdir, v, "visual.json")));
}

let n = 0;
const test = (name, fn) => { fn(); n++; console.log(`  ok  ${name}`); };

const dir = reportCopy();
const { created } = addPages(dir, SPEC);

test("Seitennamen mit Template-Kennung", () => {
    assert.deepEqual(created.map(c => c.name), ["C03 Säulen im Zeitverlauf", "C05 Brücke über die Monate", "C07 Abweichung nach Land"]);
    assert.equal(pageLabel({ name: "C13 Tabelle", template: "C13" }), "C13 Tabelle");
    for (const c of created) {
        assert.equal(readJson(path.join(dir, "definition", "pages", c.id, "page.json")).displayName, c.name);
    }
});

test("Kopf mit Titel, Gruppe und Erklärtext, Fußleiste mit Fußtext (Zonen des Pixelrasters)", () => {
    const tb = pageVisuals(dir, created[0].id).filter(v => v.visual.visualType === "textbox").sort((a, b) => a.position.y - b.position.y);
    assert.equal(tb.length, 2);
    const [head, foot] = tb;
    const paras = head.visual.objects.general[0].properties.paragraphs;
    assert.deepEqual(paras[0].textRuns.map(r => r.value.trim()), ["C03 Säulen im Zeitverlauf", "ChartKitchen · Zeitverlauf"]);
    assert.match(paras[1].textRuns[0].value, /^Wie entwickelt sich der Umsatz/);
    assert.deepEqual([head.position.x, head.position.y, head.position.width, head.position.height], [27, 0, 1866, 96]);
    assert.deepEqual([foot.position.x, foot.position.y, foot.position.width, foot.position.height], [27, 1044, 1866, 36]);
    assert.match(foot.visual.objects.general[0].properties.paragraphs[0].textRuns[0].value, /^Demodaten/);
});

test("Slicer je Seite, synchronisiert über eine Sync-Gruppe je Spalte", () => {
    const groups = created.map(c => pageVisuals(dir, c.id).filter(v => v.visual.visualType === "slicer")
        .sort((a, b) => a.position.y - b.position.y).map(v => v.visual.syncGroup.groupName));
    assert.deepEqual(groups[0], ["dwg-calender-year", "dwg-sales-demo-country"]);
    assert.deepEqual(groups[1], groups[0]);
    assert.deepEqual(groups[2], groups[0]);
    const slicers = pageVisuals(dir, created[1].id).filter(v => v.visual.visualType === "slicer");
    for (const s of slicers) {
        assert.equal(s.visual.syncGroup.fieldChanges, true);
        assert.equal(s.visual.syncGroup.filterChanges, true);
    }
    // Slicer-Stapel im Filter-Panel: Einzug gleich Rand, Abstand g, Oberkante auf content.y
    const pos = slicers.sort((a, b) => a.position.y - b.position.y).map(s => [s.position.x, s.position.y, s.position.width, s.position.height]);
    assert.deepEqual(pos, [[27, 123, 246, 78], [27, 219, 246, 78]]);
});

test("Einfachauswahl mit Startwert, Mehrfachauswahl ohne", () => {
    const slicers = pageVisuals(dir, created[0].id).filter(v => v.visual.visualType === "slicer");
    const year = slicers.find(s => s.visual.query.queryState.Values.projections[0].displayName === "Jahr");
    const land = slicers.find(s => s.visual.query.queryState.Values.projections[0].displayName === "Land");
    assert.equal(year.visual.objects.selection[0].properties.singleSelect.expr.Literal.Value, "true");
    const where = year.visual.objects.general[0].properties.filter.filter.Where[0].Condition.In;
    assert.deepEqual(where.Values, [[{ Literal: { Value: "2026L" } }]]);
    assert.equal(year.filterConfig.filters[0].field.Column.Property, "Year");
    assert.equal(land.visual.objects.selection[0].properties.singleSelect.expr.Literal.Value, "false");
    assert.equal(land.visual.objects.general, undefined);
    // leere Werte: Visual-Filter „ist nicht leer“ auf dem Slicer
    for (const s of [year, land]) {
        const not = s.filterConfig.filters[0].filter.Where[0].Condition.Not.Expression.In;
        assert.deepEqual(not.Values, [[{ Literal: { Value: "null" } }]]);
    }
    const shown = structuredClone(SPEC);
    shown.slicers[1].showEmpty = true;
    const d2 = reportCopy();
    const { created: c2 } = addPages(d2, shown);
    const land2 = pageVisuals(d2, c2[0].id).find(v => v.visual.query?.queryState?.Values?.projections[0].displayName === "Land");
    assert.equal(land2.filterConfig.filters[0].filter, undefined);
});

test("Kacheln mit denselben Rechtecken wie in der App, Lauf ist wiederholbar", () => {
    const tiles = pageVisuals(dir, created[0].id).filter(v => !["slicer", "textbox"].includes(v.visual.visualType));
    assert.equal(tiles.length, 3);
    assert.deepEqual(tiles.map(t => [t.position.x, t.position.y, t.position.width, t.position.height]).sort((a, b) => a[1] - b[1] || a[0] - b[0]),
        SPEC.pages[0].tiles.map(t => t.rect).sort((a, b) => a[1] - b[1] || a[0] - b[0]));
    const before = readJson(path.join(dir, "definition", "pages", "pages.json")).pageOrder.length;
    addPages(dir, SPEC);
    assert.equal(readJson(path.join(dir, "definition", "pages", "pages.json")).pageOrder.length, before);
});

test("Layout-Vertrag wird auch für Power BI geprüft", () => {
    const bad = structuredClone(SPEC);
    bad.pages[0].tiles[0].rect = [100, 20, 1600, 500];
    assert.throws(() => addPages(reportCopy(), bad), /liegt nicht im Inhaltsbereich/);
    const bad2 = structuredClone(SPEC);
    bad2.slicers[0].column = "'Calender'[Jahr]";
    assert.throws(() => addPages(reportCopy(), bad2), /'Calender'\[Jahr\] fehlt/);
});

test("active nur für Drill-Rollen: P&L levels liefert in Power BI sonst nur L1 (Befund 21.10.2026)", () => {
    const col = name => ({ node: "Column", table: "Konto", name, ref: `'Konto'[${name}]` });
    const roles = {
        levels: { kind: "Grouping", fields: [col("L1"), col("L2")] },
        account: { kind: "Grouping", fields: [col("KontoID")] },
        ac: { kind: "Measure", fields: [{ node: "Measure", table: "Fakten", name: "GuV AC", ref: "'Fakten'[GuV AC]" }] },
    };
    const pnl = queryState(roles, { drillRoles: [] });
    assert.ok(Object.values(pnl).every(r => r.projections.every(p => !("active" in p))), "P&L ohne active");
    const ck = queryState({ category: { kind: "Grouping", fields: [col("L1")] } }, { drillRoles: ["category"] });
    assert.equal(ck.category.projections[0].active, true, "ChartKitchen category (drilldown) bleibt aktiv");
    const tiles = pageVisuals(dir, created[0].id).filter(v => !["slicer", "textbox"].includes(v.visual.visualType));
    for (const t of tiles) {
        for (const [role, st] of Object.entries(t.visual.query.queryState)) {
            assert.equal(st.projections.some(p => p.active), role === "category", `${role}: active nur auf category`);
        }
    }
});

test("Anzeigenamen je Rolle ([actual]) wie in der App, je Feld vorrangig", () => {
    const m = name => ({ node: "Measure", table: "Fakten", name, ref: `'Fakten'[${name}]` });
    const st = queryState({ actual: { kind: "Measure", fields: [m("DB-Marge % AC")] }, xValue: { kind: "Measure", fields: [m("Absatz hl AC")] } },
        { displayNames: { "[actual]": "DB-Marge %", "'Fakten'[Absatz hl AC]": "Absatz hl", "[xValue]": "nicht dieser" } });
    assert.equal(st.actual.projections[0].displayName, "DB-Marge %");
    assert.equal(st.xValue.projections[0].displayName, "Absatz hl");
});

test("Kachelrahmen wie in der App: 8 px Innenabstand, 1 px Rand (statt Fluent2 16/14/16/16)", () => {
    const tiles = pageVisuals(dir, created[0].id).filter(v => !["slicer", "textbox"].includes(v.visual.visualType));
    for (const t of tiles) {
        const vco = t.visual.visualContainerObjects;
        const pad = Object.fromEntries(Object.entries(vco.padding[0].properties).map(([k, v]) => [k, v.expr.Literal.Value]));
        assert.deepEqual(pad, { top: `${TILE_FRAME.padding}D`, bottom: `${TILE_FRAME.padding}D`, left: `${TILE_FRAME.padding}D`, right: `${TILE_FRAME.padding}D` });
        assert.equal(vco.border[0].properties.show.expr.Literal.Value, "true");
        assert.equal(vco.border[0].properties.width.expr.Literal.Value, "1D");
    }
});

test("Ergebnis gilt gegen die offiziellen PBIR-Schemas", () => {
    const r = spawnSync(process.execPath, [path.join(HERE, "validate.mjs"), dir], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stdout + r.stderr);
});

console.log(`pbip unit: ${n} Tests grün`);
