// Test der Showcase-Spec specs/showcase.json (je Template eine Seite, Modell „ZlatyLev Showcase“):
//   1. Aufbau: 28 Seiten, Gruppe, Kennung, Beschreibung, Layout-Vertrag (Kacheln ab x = 300, ganz auf der Seite),
//      Template-Objekte (template = templateApplied, Preset-Schalter wie im Visual), Rollen, die das Template braucht.
//   2. Felder gegen das TMDL showcase/ZlatyLev Showcase.SemanticModel (Bindungen, Sortierung, Filter, Slicer).
//   3. Mini-DAX je Kachel auf datasets/showcase.mjs mit den Slicer-Standards: Abfrage läuft, DataView passt,
//      Werte gegen die Kontrollwerte, Querfilter per Klick, executeQuery-Grenzen.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createEngine } from "./minidax.mjs";
import { readModel, resolveField } from "../../pbip/lib/tmdl.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const { daxQuery, buildDataView, ROLES } = await import(pathToFileURL(path.resolve(HERE, "../../visuals/dist/dwg-visuals.js")).href);
const spec = JSON.parse(fs.readFileSync(path.resolve(HERE, "../../specs/showcase.json"), "utf8"));
const MODEL_DIR = path.join(ROOT, "examples", "showcase", "ZlatyLev Showcase.SemanticModel");
const DATASET = path.join(HERE, "datasets", "showcase.mjs");
const CONTROL_JSON = path.join(ROOT, "examples", "showcase", "data", "control.json");

let n = 0;
const test = (name, fn) => { fn(); n++; console.log(`  ok  ${name}`); };
const tiles = function* () { for (const p of spec.pages) { for (const t of p.tiles) { yield { page: p, tile: t }; } } };
const main = p => p.tiles.find(t => t.id === "vorlage");

// ---------------------------------------------------------------- erwartete Presets (Quelle: Kitchen-Repo)
// ChartKitchen ibcsInspiredChartDeck/src/visual.ts CHART_TEMPLATES (1.51)
const CK = {
    C01: { orientation: "columns", comparisonMode: "auto", showAbsoluteVariance: false, showRelativeVariance: false, dualVariance: false, waterfallStyle: false },
    C02: { orientation: "bars", comparisonMode: "auto", showAbsoluteVariance: false, showRelativeVariance: false, dualVariance: false, waterfallStyle: false },
    C03: { orientation: "columns", comparisonMode: "py", showAbsoluteVariance: true, showRelativeVariance: true, dualVariance: false, waterfallStyle: false },
    C04: { orientation: "bars", comparisonMode: "plan", showAbsoluteVariance: true, showRelativeVariance: true, dualVariance: false, waterfallStyle: false },
    C05: { orientation: "intwaterfall", comparisonMode: "py", showAbsoluteVariance: true, showRelativeVariance: true, dualVariance: false },
    C06: { orientation: "catbridge", comparisonMode: "py", showAbsoluteVariance: true, showRelativeVariance: true, dualVariance: false, bridgeOrientation: "columns" },
    C08: { orientation: "line", comparisonMode: "auto", showAbsoluteVariance: true, showRelativeVariance: false, dualVariance: false },
    C09: { orientation: "scatter", comparisonMode: "auto", scatterQuadrant: "mean", scatterColorBy: "single" },
    C10: { orientation: "scatter", comparisonMode: "auto", scatterQuadrant: "mean", scatterColorBy: "single", scatterSizeLegend: true },
    C12: { orientation: "waterfall", comparisonMode: "auto", showAbsoluteVariance: true, showRelativeVariance: true, dualVariance: false },
    C13: { multiplesTotal: true, multiplesSameScale: true },
};
// zusätzliche Rollen je ChartKitchen-Vorlage (TEMPLATE_NEEDS bzw. Doku „Dazu binden“)
const CK_NEEDS = { C01: ["series"], C02: ["series"], C03: ["previousYear"], C04: ["plan"], C05: ["previousYear"], C06: ["previousYear"],
    C09: ["xValue"], C10: ["xValue", "bubbleSize"], C13: ["multiples"] };
// P&L pnlByDatenWG/src/megatable.ts MEGA_PRESETS (1.4.2): Minuend, Wertspalten und Δ-Schalter
// Dezimalen bewusst abweichend vom Template-Preset: IBCS höchstens 4 Ziffern in Tabellen, deshalb Mio. EUR mit
// 2 Nachkommastellen (auch T02C in Tsd. hl, damit Monatswerte nicht auf 0,0 fallen) und Δ% einheitlich mit 1 Nachkommastelle; 12G ohne Margenzeilen,
// damit die EBIT-Zeile in die Kachel passt (IBCS-Prüfung 19.10.2026).
const PNL = {
    T01A: "ac py pl min dPyAbs dPyPct dPlAbs dPlPct second thresholds noSub 2/1",
    T01B: "ac py pl min dPyAbs dPyPct dPlAbs dPlPct second thresholds sub 2/1",
    T02A: "ac pl min dPlBar dPlPin second sub 2/1",
    T02B: "ac pl min dPlBar dPlPin second sub sort:min:ytd 2/1",
    T02C: "ac pl min dPlBar dPlPin second sub sort:delta:period 2/1",
    T02E: "fc py min dPyBar dPyPin second sub sort:delta:ytd 2/1",
    T02F: "fc pl min dPlBar dPlPin second sub sort:delta:ytd 2/1",
    T03A: "ac py pl min dPyAbs dPyPct dPlAbs dPlPct sub 2/1",
    T03B: "fc py pl min dPyAbs dPyPct dPlAbs dPlPct sub 2/1",
    T04A: "ac pl min dPlBar dPlPin sub 2/1",
    T04B: "ac pl min dPlWaterfall dPlPin sub headline 2/1",
    T04C: "ac py min dPyWaterfall dPyPin sub headline 2/1",
    T04D: "fc pl min dPlWaterfall dPlPin sub headline 2/1",
    T04E: "fc py min dPyWaterfall dPyPin sub headline 2/1",
    "12A": "ac py min cascade dPyBar dPyPin sub noPct headline 2/1",
    "12G": "ac py min cascade dPyBar dPyPin sub noPct fy headline 2/1",
    "12H": "pl py min cascade dPyBar dPyPin sub noPct headline 2/1",
};
const SWITCHES = ["dPyAbs", "dPyBar", "dPyWaterfall", "dPyPct", "dPyPin", "dPlAbs", "dPlBar", "dPlWaterfall", "dPlPct", "dPlPin"];
const GUV_TEMPLATES = ["T03A", "T03B", "T04A", "T04B", "T04C", "T04D", "T04E", "12A", "12G", "12H"];
const TEMPLATES = [...Object.keys(CK), ...Object.keys(PNL)];

// ---------------------------------------------------------------- 1. Aufbau
test("28 Seiten, je Template genau eine, mit Gruppe, Kennung und Beschreibung", () => {
    assert.equal(spec.name, "ChartKitchen & P&L Showcase");
    assert.ok(spec.about?.length > 50);
    assert.equal(spec.pages.length, 28);
    assert.deepEqual([...spec.pages.map(p => p.template)].sort(), [...TEMPLATES].sort());
    for (const p of spec.pages) {
        assert.match(p.group, /^(ChartKitchen|P&L) · \S/, `${p.template}: Gruppe`);
        assert.equal(p.group.startsWith("ChartKitchen"), p.template.startsWith("C"), `${p.template}: Gruppe passt zum Visual`);
        const s = p.description.split(/[.?!](\s|$)/).filter(x => x.trim().length > 3).length;
        assert.ok(s >= 2 && s <= 3, `${p.template}: Beschreibung mit ${s} Sätzen`);
        assert.ok(!/[–—]/.test(p.description + p.name), `${p.template}: Gedankenstrich im Text`);
        assert.ok(!/IBCS/.test(p.description), `${p.template}: IBCS in der Beschreibung`);
        assert.ok(!p.name.startsWith(p.template), `${p.template}: Name ohne Kennung`);
    }
    assert.ok(/an IBCS angelehnt/.test(spec.about), "about: IBCS nur angelehnt");
});

test("Slicer Jahr, Region, Kanal, Sorte im Format {column, label, default, multi}", () => {
    assert.deepEqual(spec.slicers.map(s => s.label), ["Jahr", "Region", "Kanal", "Sorte"]);
    for (const s of spec.slicers) {
        assert.ok(s.column && s.label && Array.isArray(s.default) && typeof s.multi === "boolean", s.label);
    }
    assert.deepEqual(spec.slicers[0].default, [2026]);
    assert.equal(spec.slicers[0].multi, false, "Jahr einfach: FY-Measures und YTD gelten für ein Jahr");
});

test("Layout-Vertrag: 1920 × 1080, Kacheln ab x = 300, ganz auf der Seite, ohne Überlappung", () => {
    for (const p of spec.pages) {
        assert.equal(p.width, 1920); assert.equal(p.height, 1080);
        for (const t of p.tiles) {
            const [x, y, w, h] = t.rect;
            assert.ok(x >= 300 && y >= 0 && x + w <= 1920 && y + h <= 1080, `${p.template}/${t.id}: ${t.rect}`);
        }
        for (const a of p.tiles) {
            for (const b of p.tiles) {
                if (a === b) { continue; }
                const [ax, ay, aw, ah] = a.rect, [bx, by, bw, bh] = b.rect;
                assert.ok(ax + aw <= bx || bx + bw <= ax || ay + ah <= by || by + bh <= ay, `${p.template}: ${a.id} überlappt ${b.id}`);
            }
        }
        assert.ok(main(p), `${p.template}: Hauptkachel "vorlage"`);
    }
});

test("ChartKitchen: template = templateApplied, alle Preset-Schalter gesetzt, Rollen gebunden", () => {
    for (const p of spec.pages.filter(x => CK[x.template])) {
        const t = main(p);
        assert.equal(t.visual, "chartkitchen");
        const c = t.objects.chart;
        assert.equal(c.template, p.template); assert.equal(c.templateApplied, p.template);
        for (const [k, v] of Object.entries(CK[p.template])) { assert.equal(c[k], v, `${p.template}: chart.${k}`); }
        for (const r of ["category", "actual", ...(CK_NEEDS[p.template] ?? [])]) { assert.ok(t.bindings[r], `${p.template}: Rolle ${r}`); }
        if (p.template === "C13") { assert.ok(c.orientation, "C13 behält den Chart-Typ: orientation explizit"); }
    }
});

test("P&L: template = templateApplied, Preset-Schalter und Dezimalen wie im Visual, Rollen je Template", () => {
    for (const p of spec.pages.filter(x => PNL[x.template])) {
        const t = main(p);
        assert.equal(t.visual, "pnl");
        const c = t.objects.columns, nb = t.objects.numbers, words = PNL[p.template].split(" ");
        assert.equal(c.template, p.template); assert.equal(c.templateApplied, p.template);
        assert.equal(c.minuend, words[0], `${p.template}: Minuend`);
        assert.equal(c.showPY, words.slice(1).includes("py"), `${p.template}: showPY`);
        assert.equal(c.showPL, words.slice(1).includes("pl"), `${p.template}: showPL`);
        assert.equal(c.showMinuend, true);
        assert.equal(c.valueCascade, words.includes("cascade"), `${p.template}: valueCascade`);
        for (const s of SWITCHES) { assert.equal(c[s], words.includes(s), `${p.template}: ${s}`); }
        assert.equal(c.secondBlock, words.includes("second"), `${p.template}: secondBlock`);
        assert.equal(c.thresholds, words.includes("thresholds"), `${p.template}: thresholds`);
        assert.equal(c.structureSubtotals, !words.includes("noSub"), `${p.template}: structureSubtotals`);
        assert.equal(c.showPctRows, !words.includes("noPct"), `${p.template}: showPctRows`);
        assert.equal(c.blockKind, words.includes("fy") ? "fy" : "ytd");
        assert.equal(c.leftBlockKind, "month");
        const sort = words.find(w => w.startsWith("sort:"))?.split(":") ?? ["sort", "cat", "ytd"];
        assert.equal(c.sort, sort[1], `${p.template}: sort`); assert.equal(c.sortBlock, sort[2], `${p.template}: sortBlock`);
        const [d, pd] = words.at(-1).split("/").map(Number);
        assert.equal(nb.decimals, d, `${p.template}: decimals`); assert.equal(nb.pctDecimals, pd, `${p.template}: pctDecimals`);
        assert.equal(t.objects.titleBlock.headline === true, words.includes("headline"), `${p.template}: headline`);
        // Rollen: Minuend und Referenzen gebunden. Periode nur bei Struktur-Templates mit AC-Minuend (Monat | YTD,
        // periodengleich); GuV-Templates mit AC nutzen „bis Ist“-Measures, FC- und PL-Templates zeigen das Gesamtjahr
        for (const r of [c.minuend, ...(c.showPY ? ["py"] : []), ...(c.showPL ? ["pl"] : [])]) { assert.ok(t.bindings[r], `${p.template}: Rolle ${r}`); }
        assert.ok(t.bindings.ac, `${p.template}: AC ist Pflicht`);
        const guv = GUV_TEMPLATES.includes(p.template);
        assert.equal(Boolean(t.bindings.period), !guv && c.minuend === "ac", `${p.template}: Periode nur bei Struktur mit AC-Minuend`);
        if (guv && c.minuend === "ac" && c.blockKind !== "fy") {
            for (const r of ["py", "pl"]) { if (t.bindings[r]) { assert.match(t.bindings[r], /bis Ist\]$/, `${p.template}: ${r} bis Ist`); } }
        }
        if (p.template === "12G") { assert.ok(t.bindings.fcFy && t.bindings.plFy && t.bindings.fc, "12G: FC und FY-Werte"); }
        if (GUV_TEMPLATES.includes(p.template)) {
            for (const r of ["account", "rowType", "formulaDef", "signConvention", "displayInvert", "varianceInvert", "sortOrder"]) {
                assert.ok(t.bindings[r], `${p.template}: GuV-Rolle ${r}`);
            }
            assert.equal(t.showItemsWithNoData, true, `${p.template}: Summen und Formeln ohne Faktenzeilen`);
        } else {
            assert.ok(!t.bindings.account && t.bindings.levels?.length, `${p.template}: Strukturdimension über Ebenen`);
            assert.equal(c.pctRevenue, false, `${p.template}: kein % vom Umsatz bei Strukturdaten`);
        }
    }
});

test("Rollen und Formatbereich-Objekte gibt es im jeweiligen Visual", () => {
    for (const { page, tile } of tiles()) {
        daxQuery(tile.visual, tile.bindings, { filters: tile.filters, sortBy: tile.sortBy, showItemsWithNoData: tile.showItemsWithNoData });
        assert.ok(ROLES[tile.visual], `${page.template}/${tile.id}`);
    }
});

// Objekte gegen die capabilities.json der Visuals, wenn das Kitchen-Repo da ist (DWG_KITCHEN, sonst neben diesem Repo)
const KITCHEN = [process.env.DWG_KITCHEN, path.join(ROOT, "../PowerBI-Kitchen-")]
    .filter(Boolean).find(d => fs.existsSync(path.join(d, "ibcsInspiredChartDeck", "capabilities.json")));
if (KITCHEN) {
    const caps = {
        chartkitchen: JSON.parse(fs.readFileSync(path.join(KITCHEN, "ibcsInspiredChartDeck", "capabilities.json"), "utf8")).objects,
        pnl: JSON.parse(fs.readFileSync(path.join(KITCHEN, "pnlByDatenWG", "capabilities.json"), "utf8")).objects,
    };
    test("Formatbereich-Objekte und Werte gibt es in der capabilities.json des Visuals", () => {
        const problems = [];
        for (const { page, tile } of tiles()) {
            for (const [obj, props] of Object.entries(tile.objects ?? {})) {
                const o = caps[tile.visual][obj];
                if (!o) { problems.push(`${page.template}/${tile.id}: Objekt ${obj}`); continue; }
                for (const [k, v] of Object.entries(props)) {
                    const p = o.properties?.[k];
                    if (!p) { problems.push(`${page.template}/${tile.id}: ${obj}.${k}`); continue; }
                    const t = p.type;
                    const ok = t.enumeration ? t.enumeration.some(e => e.value === v) : t.bool ? typeof v === "boolean"
                        : t.numeric || t.integer ? typeof v === "number" : t.text ? typeof v === "string" : true;
                    if (!ok) { problems.push(`${page.template}/${tile.id}: ${obj}.${k} = ${JSON.stringify(v)}`); }
                }
            }
        }
        assert.deepEqual(problems, []);
    });
} else {
    console.log("  --  Kitchen-Repo nicht gefunden: Objekte nicht gegen capabilities.json geprüft (DWG_KITCHEN setzen)");
}

// ---------------------------------------------------------------- 2. Felder gegen das TMDL
const fieldsOf = () => {
    const out = [];
    for (const { page, tile } of tiles()) {
        const kinds = ROLES[tile.visual].kind;
        for (const [role, refs] of Object.entries(tile.bindings)) {
            for (const ref of [].concat(refs)) { out.push({ where: `${page.template}/${tile.id}/${role}`, ref, kind: kinds[role] === "Measure" ? "Measure" : "Grouping" }); }
        }
        for (const [c, s] of Object.entries(tile.sortBy ?? {})) {
            out.push({ where: `${page.template}/${tile.id}/sortBy`, ref: c, kind: "Grouping", sortBy: s });
        }
        for (const f of [...(page.filters ?? []), ...(tile.filters ?? [])]) { out.push({ where: `${page.template}/${tile.id}/filter`, ref: f.column, kind: "Grouping" }); }
        if (tile.objects?.chart || tile.objects?.columns) {
            assert.ok(Object.values(tile.bindings).flat().every(r => !/^\s*\[/.test(r)), `${page.template}/${tile.id}: nur Modell-Measures mit Tabelle`);
        }
    }
    for (const s of spec.slicers) {
        out.push({ where: `Slicer ${s.label}`, ref: s.column, kind: "Grouping", ...(s.sortBy ? { sortBy: s.sortBy } : {}) });
    }
    return out;
};
if (fs.existsSync(MODEL_DIR)) {
    const model = readModel(MODEL_DIR);
    test("Alle Felder, Sortierungen, Filter und Slicer gibt es im Modell (Power-BI-tauglich)", () => {
        const problems = [];
        for (const f of fieldsOf()) {
            try {
                const r = resolveField(model, f.ref, f.kind);
                if (f.sortBy) {
                    resolveField(model, f.sortBy, "Grouping");
                    const want = /\[(.+)\]$/.exec(f.sortBy)[1];
                    if (r.sortBy !== want) { problems.push(`${f.where}: ${f.ref} ist im Modell nicht nach ${want} sortiert (${r.sortBy ?? "ohne"})`); }
                }
            } catch (e) { problems.push(`${f.where}: ${e.message}`); }
        }
        assert.deepEqual(problems, []);
    });
} else {
    throw new Error(`TMDL fehlt: ${MODEL_DIR}`);
}

// ---------------------------------------------------------------- 3. Mini-DAX
if (!fs.existsSync(DATASET)) { throw new Error(`Datensatz fehlt: ${DATASET}`); }
const { model: data } = await import(pathToFileURL(DATASET).href);
const CONTROL = JSON.parse(fs.readFileSync(CONTROL_JSON, "utf8"));
const engine = createEngine(data);
const slicerFilters = (year = 2026) => spec.slicers.filter(s => s.default?.length).map(s => ({ column: s.column, values: s.column.includes("[Jahr]") ? [year] : s.default }));
const run = (page, tile, extra = [], year = 2026) => {
    const q = daxQuery(tile.visual, tile.bindings, {
        filters: [...slicerFilters(year), ...(page.filters ?? []), ...(tile.filters ?? []), ...extra], sortBy: tile.sortBy, showItemsWithNoData: tile.showItemsWithNoData,
    });
    return { q, table: engine.query(q.query) };
};
const colIdx = (t, name) => t.columns.findIndex(c => c.name === name);
const sum = (t, name) => { const i = colIdx(t, name); assert.ok(i >= 0, `Spalte ${name}`); return t.rows.reduce((s, r) => s + (Number(r[i]) || 0), 0); };
const near = (a, b, label, tol = 1) => assert.ok(Math.abs(a - b) <= tol, `${label}: ${a} statt ${b}`);
const C26 = CONTROL["2026"];
const P = Object.fromEntries(spec.pages.map(p => [p.template, p]));

// Der Datensatz hat Fakten nur für 2026 (datasets/showcase.mjs), deshalb nur der Jahres-Standard des Slicers
for (const year of [2026]) {
    test(`${year}: jede Kachel liefert Zeilen, DataView passt zu den Rollen, Grenzen der executeQuery-API`, () => {
        for (const { page, tile } of tiles()) {
            const { q, table } = run(page, tile, [], year);
            assert.ok(table.rows.length > 0, `${page.template}/${tile.id}: keine Zeilen`);
            assert.ok(table.rows.length <= 100000 && table.rows.length * table.columns.length <= 1000000,
                `${page.template}/${tile.id}: ${table.rows.length} × ${table.columns.length}`);
            const dv = buildDataView(tile.visual, table, q.bindings, { objects: tile.objects, displayNames: q.displayNames });
            assert.equal(dv.categorical.values[0].values.length, table.rows.length, `${page.template}/${tile.id}`);
            const measures = Object.keys(q.bindings).filter(r => ROLES[tile.visual].kind[r] === "Measure");
            for (const m of measures) {
                const i = colIdx(table, `[${m}]`);
                assert.ok(table.rows.some(r => r[i] != null && r[i] !== 0), `${page.template}/${tile.id}: [${m}] überall leer`);
            }
        }
    });
}

test("Zeitverlauf: Summen je Monat = Kontrollwerte 2026 (AC bis Aug, PY und FC ganzes Jahr)", () => {
    const { table } = run(P.C03, main(P.C03));
    near(sum(table, "[actual]"), C26["Umsatz AC"], "C03 Umsatz AC");
    near(sum(table, "[previousYear]"), C26["Umsatz PY"], "C03 Umsatz PY");
    near(sum(table, "[forecast]"), C26["Umsatz FC"], "C03 Umsatz FC");
    assert.equal(table.rows.length, 12, "C03: 12 Monate");
    const ac = colIdx(table, "[actual]");
    assert.equal(table.rows.filter(r => r[ac] != null).length, 8, "C03: Ist bis August");
    const c08 = run(P.C08, main(P.C08)).table;
    near(sum(c08, "[actual]"), C26["Absatz hl AC"], "C08 Absatz hl AC", 0.5);
});

test("Strukturseiten auf Ist-Monaten: Plan über denselben Zeitraum = PL bis Ist", () => {
    const { table } = run(P.C04, main(P.C04));
    near(sum(table, "[actual]"), C26["Umsatz AC"], "C04 Umsatz AC");
    near(sum(table, "[plan]"), C26["Umsatz PL bis Ist"], "C04 Umsatz PL");
    const c06 = run(P.C06, main(P.C06)).table;
    near(sum(c06, "[previousYear]"), C26["Umsatz PY bis Ist"], "C06 Umsatz PY");
    for (const p of spec.pages) {
        const k = p.tiles.find(t => t.id === "karten");
        if (!k || !/Umsatz/.test(k.bindings.actual)) { continue; }
        const t = run(p, k).table;
        // Gesamtjahr-Seiten: Karten AC&FC gegen PY bzw. PL ganzes Jahr, sonst Ist-Monate gegen „bis Ist“
        // 12H: Plan gegen Vorjahr, Karten zeigen PL Gesamtjahr gegen PY Gesamtjahr
        if (/PL\]$/.test(k.bindings.actual)) {
            near(sum(t, "[actual]"), C26["Umsatz PL"], `${p.template} Karten PL`);
            near(sum(t, "[previousYear]"), C26["Umsatz PY"], `${p.template} Karten PY`);
            assert.equal(k.bindings.plan, undefined, `${p.template}: keine zweite PL-Rolle`);
            continue;
        }
        if (/FC\]$/.test(k.bindings.actual)) {
            near(sum(t, "[actual]"), C26["Umsatz FC"], `${p.template} Karten AC&FC`);
            near(sum(t, "[plan]"), C26["Umsatz PL"], `${p.template} Karten PL`);
            near(sum(t, "[previousYear]"), C26["Umsatz PY"], `${p.template} Karten PY`);
            continue;
        }
        near(sum(t, "[actual]"), C26["Umsatz AC"], `${p.template} Karten AC`);
        near(sum(t, "[plan]"), C26["Umsatz PL bis Ist"], `${p.template} Karten PL bis Ist`);
        near(sum(t, "[previousYear]"), C26["Umsatz PY bis Ist"], `${p.template} Karten PY bis Ist`);
    }
});

test("C12 Ergebnisbrücke: Beiträge der GuV-Blöcke summieren sich zum EBIT, Kosten negativ", () => {
    const { table } = run(P.C12, main(P.C12));
    near(sum(table, "[actual]"), C26["EBIT AC"], "C12 EBIT AC");
    const cat = colIdx(table, "Konto[L1]"), ac = colIdx(table, "[actual]");
    const byBlock = Object.fromEntries(table.rows.map(r => [r[cat], r[ac]]));
    assert.ok(byBlock.Nettoumsatz > 0 && byBlock.Wareneinsatz < 0 && byBlock.Betriebskosten < 0, JSON.stringify(byBlock));
    assert.ok(table.rows.length <= 6, "nur Blöcke mit Faktenzeilen, keine Formelzeilen");
});

test("Scatter: DB-Marge je Kunde bzw. Bier als Anteil zwischen 0 und 1, ein Punkt je Kategorie", () => {
    for (const tpl of ["C09", "C10"]) {
        const { table } = run(P[tpl], main(P[tpl]));
        const i = colIdx(table, "[actual]");
        assert.ok(table.rows.every(r => r[i] > 0 && r[i] < 1), `${tpl}: Marge`);
        assert.equal(new Set(table.rows.map(r => r[0])).size, table.rows.length, `${tpl}: Kategorien eindeutig`);
    }
});

test("P&L Struktur: Regionen summieren sich zum Umsatz, 12 Perioden; Forecast-Seiten ohne Periode (Gesamtjahr)", () => {
    const { table } = run(P.T01A, main(P.T01A));
    near(sum(table, "[ac]"), C26["Umsatz AC"], "T01A AC");
    near(sum(table, "[pl]"), C26["Umsatz PL"], "T01A PL (alle Monate, das Visual rechnet YTD periodengleich)");
    assert.equal(new Set(table.rows.map(r => r[colIdx(table, "Kalender[Periode]")])).size, 12);
    const e = run(P.T02E, main(P.T02E)).table;
    near(sum(e, "[fc]"), C26["Umsatz FC"], "T02E FC Gesamtjahr");
    near(sum(e, "[py]"), C26["Umsatz PY"], "T02E PY Gesamtjahr");
});

// Kontrollsummen roh aus den Faktenzeilen des Datensatzes (unabhängig von Mini-DAX): Jahr 2026, optional nur Ist-Monate
const rawSum = (col, istOnly) => {
    const f = data.tables[data.fact], k = data.tables.Kalender;
    const fi = c => f.columns.indexOf(c), ki = c => k.columns.indexOf(c);
    const cal = new Map(k.rows.map(r => [String(r[ki("Datum")]), r]));
    let sum = 0;
    for (const r of f.rows) {
        const c = cal.get(String(r[fi("Datum")]));
        if (!c || c[ki("Jahr")] !== 2026 || (istOnly && c[ki("Ist")] !== true)) { continue; }
        sum += Number(r[fi(col)]) || 0;
    }
    return sum;
};

test("P&L GuV: alle 21 Konten inkl. Summen, Formeln und KPIs; AC-Templates mit PY und PL bis Ist, sonst Gesamtjahr", () => {
    for (const tpl of GUV_TEMPLATES) {
        const t = main(P[tpl]);
        const { table } = run(P[tpl], t);
        const ids = new Set(table.rows.map(r => r[colIdx(table, "Konto[KontoID]")]));
        assert.equal(ids.size, 21, `${tpl}: Konten`);
        assert.equal(table.rows.length, 21, `${tpl}: eine Zeile je Konto (ohne Periode)`);
        near(sum(table, "[ac]"), C26["GuV AC"], `${tpl} GuV AC`);
        for (const s of ["py", "pl", "fc"]) {
            if (!t.bindings[s]) { continue; }
            const ist = /bis Ist\]$/.test(t.bindings[s]);
            near(sum(table, `[${s}]`), rawSum(s.toUpperCase(), ist), `${tpl} GuV ${s}${ist ? " bis Ist" : ""}`);
        }
        const types = new Set(table.rows.map(r => r[colIdx(table, "Konto[RowType]")]));
        for (const x of ["Account", "Subtotal", "Formula", "KPI"]) { assert.ok(types.has(x), `${tpl}: RowType ${x}`); }
    }
    near(rawSum("PY", false), C26["GuV PY"], "Rohsumme PY = Kontrollwert");
    // 12G: FY-Skalare je Konto, Summe über die Konten = GuV FC FY und PL FY
    const { table } = run(P["12G"], main(P["12G"]));
    near(sum(table, "[fcFy]"), C26["GuV FC FY"], "12G FC FY");
    near(sum(table, "[plFy]"), C26["GuV PL FY"], "12G PL FY");
});

test("Vorzeichen-Trio der Konten: kein -1 zusammen mit VarianceInvert true (doppelte Umkehr färbt Kostenüberschreitung günstig)", () => {
    const k = data.tables.Konto, i = c => k.columns.indexOf(c);
    const bad = k.rows.filter(r => Number(r[i("SignConvention")]) === -1 && String(r[i("VarianceInvert")]).toLowerCase() === "true");
    assert.deepEqual(bad.map(r => r[i("KontoID")]), []);
});

test("Querfilter: Klick auf eine Kanal-Karte filtert die Hauptkachel, die Kanäle ergeben zusammen das Ganze", () => {
    const t = main(P.C03);
    const total = sum(run(P.C03, t).table, "[actual]");
    const kanal = run(P.C03, P.C03.tiles.find(x => x.id === "karten")).table;
    const kanaele = kanal.rows.map(r => r[colIdx(kanal, "Kunde[Kanal]")]);
    assert.equal(kanaele.length, 4);
    let parts = 0;
    for (const k of kanaele) {
        const s = sum(run(P.C03, t, [{ column: "'Kunde'[Kanal]", values: [k] }]).table, "[actual]");
        assert.ok(s > 0 && s < total, `${k}: ${s}`);
        parts += s;
    }
    near(parts, total, "Summe der Kanäle");
    const g = run(P.T03A, main(P.T03A), [{ column: "'Kunde'[Kanal]", values: [kanaele[0]] }]).table;
    assert.ok(sum(g, "[ac]") < C26["GuV AC"], "GuV folgt dem Querfilter");
});

console.log(`\nShowcase-Spec: ${n}/${n} grün`);
