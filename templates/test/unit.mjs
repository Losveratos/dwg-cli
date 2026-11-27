// Template-Katalog und dwg tile add, geprüft gegen die Showcase-Spec (47 Seiten, je Template eine von Hand gebaute
// Kachel; T05A/T05B ab P&L 1.7 und die 17 Seiten für ChartKitchen 1.57 und P&L 1.8.3 noch nicht im Dienst abgenommen)
// und das Showcase-Modell:
//   1. Katalog: 24 ChartKitchen- und 23 P&L-Templates (ChartKitchen 1.57, P&L 1.8.3), Titel DE/EN, jede Rolle gibt es im Visual; Bestands-Templates
//      (T05A Bilanz, T05B Cashflow) mit statement.stockMode und Zeilentyp-Regel; AC Pflicht außer bei T01D, T02E, T02F (empfohlen)
//   2. Was das Template im Visual einstellt, steht genauso in der Showcase-Kachel (Extraktion stimmt)
//   3. Jede Pflichtrolle ist in der Showcase-Kachel gebunden (Rollen-Regeln nicht zu streng)
//   4. Vorschläge mit dem Kennzahlen-Stamm der Showcase-Kachel treffen deren Felder (Varianten wie „bis Ist“ als Alternative)
//   5. Kennzahl-Namen zerlegen, Kurzangaben auflösen
//   6. dwg tile add über die Kommandozeile: neue Spec, Seite, Kachel, Probelauf, Fehler bei fehlender Pflichtrolle;
//      T02E ohne AC durch tile add, lint (Warnung PNL_NO_AC), check und pbip pages; Serie nie wie die Kategorie
//
//   node templates/test/unit.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkSpec } from "../../app/lib/app.mjs";
import { readModel, parseRef } from "../../pbip/lib/tmdl.mjs";
import { loadCatalog, findTemplate } from "../lib/catalog.mjs";
import { fieldsOf, parseMeasureName, resolveInput, suggestBindings } from "../lib/suggest.mjs";
import { buildTile } from "../lib/tile.mjs";
import { ROLES } from "../../visuals/dist/dwg-visuals.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const SPEC = JSON.parse(fs.readFileSync(path.join(ROOT, "specs", "showcase.json"), "utf8"));
const MODEL_DIR = path.join(ROOT, "examples", "showcase", "ZlatyLev Showcase.SemanticModel");
const model = readModel(MODEL_DIR);
const cat = loadCatalog();

let n = 0;
const ok = (label, fn) => {
    try { fn(); n++; console.log(`  ok   ${label}`); }
    catch (e) { console.log(`  FEHL ${label}\n       ${e.message.split("\n").join("\n       ")}`); process.exitCode = 1; }
};

// 1 · Katalog
ok("Katalog: 24 ChartKitchen- und 23 P&L-Templates", () => {
    assert.equal(cat.templates.filter(t => t.visual === "chartkitchen").length, 24);
    assert.equal(cat.templates.filter(t => t.visual === "pnl").length, 23);
});
ok("Bestands-Templates (P&L 1.7): Gruppe balance, statement.stockMode, Zeilentyp bei T05B Pflicht, Periode empfohlen", () => {
    const need = (t, r) => t.roles.find(x => x.role === r).need;
    const a = findTemplate(cat, "T05A"), b = findTemplate(cat, "T05B");
    for (const t of [a, b]) {
        assert.equal(t.group.id, "balance");
        assert.equal(t.data, "balance");
        assert.equal(need(t, "period"), "recommended", `${t.id}: Periode`);
    }
    assert.deepEqual(a.objects.statement, { stockMode: "allStock" });
    assert.deepEqual(b.objects.statement, { stockMode: "auto" });
    assert.equal(need(a, "rowType"), "recommended", "T05A: ohne Token setzt das Template allStock");
    assert.equal(need(b, "rowType"), "required", "T05B: Anfangs- und Endbestand brauchen die Token");
    // die GuV-Templates bleiben ohne statement
    assert.ok(cat.templates.filter(t => t.visual === "pnl" && t.group.id !== "balance").every(t => !t.objects.statement));
});
// Forecast-Strukturtabellen: Monatsblock und YTD-Block zeigen FC, der Berichtsmonat wird später wählbar (FC ohne AC)
const FC_STRUCTURE = ["T01D", "T02E", "T02F"];
ok("AC: bei T01D, T02E, T02F empfohlen, bei allen anderen Templates Pflicht", () => {
    const ac = t => t.roles.find(x => x.role === "ac")?.need;
    for (const id of FC_STRUCTURE) {
        const t = findTemplate(cat, id);
        assert.equal(t.objects.columns.minuend, "fc", `${id}: Minuend`);
        assert.equal(ac(t), "recommended", `${id}: AC`);
        assert.equal(t.roles.find(x => x.role === "fc").need, "required", `${id}: FC bleibt Pflicht`);
    }
    // die FC-Statements (T03B, T04D, T04E) und alle übrigen P&L-Templates behalten AC als Pflicht
    const rest = cat.templates.filter(t => t.visual === "pnl" && !FC_STRUCTURE.includes(t.id));
    assert.deepEqual(rest.filter(t => ac(t) !== "required").map(t => t.id), []);
    assert.equal(ac(findTemplate(cat, "T01A")), "required");
    assert.equal(ac(findTemplate(cat, "T03B")), "required");
});
ok("Serie: bei Scatter (C10, C18, C23, C24) „Serie“ statt „Stack-Serie“, bei C24 optional mit Hinweis", () => {
    const series = id => findTemplate(cat, id).roles.find(x => x.role === "series");
    for (const id of ["C10", "C18", "C23", "C24"]) { assert.deepEqual(series(id).label, { de: "Serie", en: "Series" }, id); }
    assert.equal(series("C01").label.de, "Stack-Serie (Gestapelt)");
    assert.equal(series("C24").need, "optional");
    assert.match(series("C24").hint.de, /nicht dasselbe Feld wie category/);
    assert.match(spawnSync(process.execPath, [path.join(ROOT, "dwg.mjs"), "templates", "C24"], { encoding: "utf8", cwd: ROOT }).stdout, /series\s+optional\s+Spalte\s+Serie\s+· nicht dasselbe Feld wie category/);
});
ok("jedes Template mit Titel DE/EN, Gruppe und Rollen, die es im Visual gibt", () => {
    for (const t of cat.templates) {
        assert.ok(t.title.de && t.title.en && t.group?.title?.de, `${t.id}: Titel oder Gruppe fehlt`);
        // Eigennamen wie „Marimekko“ (C25) heißen in beiden Sprachen gleich; dann muss wenigstens der Zweck übersetzt sein
        assert.ok(t.title.de !== t.title.en || (t.use?.de && t.use.de !== t.use?.en), `${t.id}: deutscher Titel ist der englische`);
        for (const r of t.roles) { assert.ok(ROLES[t.visual].kind[r.role], `${t.id}: Rolle ${r.role} gibt es in ${t.visual} nicht`); }
        assert.equal(new Set(t.roles.map(r => r.role)).size, t.roles.length, `${t.id}: Rolle doppelt`);
        // Format-Objekte: kein Property-Name mit Punkt (ChartKitchen-Presets wie „scale.refLine“ gehören ins Objekt scale)
        for (const [obj, props] of Object.entries(t.objects)) {
            for (const k of Object.keys(props)) { assert.ok(!k.includes("."), `${t.id}: Property ${obj}.${k} mit Punkt`); }
        }
    }
});

// Showcase-Kacheln mit Template: die Hauptkachel der Seite (page.template). Die Ansichtsvorlage 11A (ROI-Baum) schreibt
// kein columns.template, sondern die Ansicht in state.uiState; deshalb nicht über objects.*.template suchen
const tiles = SPEC.pages.filter(p => p.template).map(p => ({ page: p, tile: p.tiles.find(t => t.id === "vorlage"), id: p.template }));
ok("Showcase-Hauptkacheln tragen ihr Template (chart.template, columns.template bzw. 11A die Baum-Ansicht)", () => {
    for (const { tile, id } of tiles) {
        assert.ok(tile, `${id}: Hauptkachel "vorlage"`);
        const own = (tile.objects?.chart ?? tile.objects?.columns)?.template;
        if (id === "11A") {
            assert.equal(own, undefined, "11A: Ansichtsvorlage ohne columns.template");
            assert.deepEqual(JSON.parse(tile.objects.state.uiState), { view: "tree", treeV: 2 }, "11A: Ansicht Baum");
        } else {
            assert.equal(own, id, `${id}: Template der Kachel`);
        }
    }
});
ok(`Showcase hat für jedes Template eine Kachel (${tiles.length})`, () => {
    assert.deepEqual([...new Set(tiles.map(x => x.id))].sort(), cat.templates.map(t => t.id).sort());
});

// 2 · Einstellungen
// Bewusste Abweichungen der Showcase-Kacheln vom Template (nach dem Anwenden geändert, wie es ein Autor tut):
// Nachkommastellen passend zu Mio. EUR, C24 mit Kacheln je Land (Blatt 10G) und kleineren Blasen; seit Welle 2 (27.11.2026)
// C16 mit Rest-Zeile (topN; C14 und C15 nicht, Top N wählt nach AC, die Seiten sortieren nach ΔPL) und C10 als Portfolio (Farbe je Sorte, Werte in den Blasen statt Größenlegende).
const SHOWCASE_OWN = {
    C24: ["chart.scatterMaxRadius"], C16: ["chart.topN"],
    C10: ["chart.scatterColorBy", "chart.scatterSizeLegend"],
};
ok("Schalter des Templates (chart bzw. columns) stehen so in der Showcase-Kachel", () => {
    const diffs = [];
    for (const { tile, id } of tiles) {
        const t = findTemplate(cat, id);
        for (const [obj, props] of Object.entries(t.objects)) {
            if (obj === "numbers") { continue; }
            for (const [k, v] of Object.entries(props)) {
                if ((SHOWCASE_OWN[id] ?? []).includes(`${obj}.${k}`)) { continue; }
                if (tile.objects[obj]?.[k] !== v) { diffs.push(`${id} ${obj}.${k}: Template ${v}, Showcase ${tile.objects[obj]?.[k]}`); }
            }
        }
    }
    assert.deepEqual(diffs, []);
});

// 3 · Pflichtrollen
ok("jede Pflichtrolle ist in der Showcase-Kachel gebunden", () => {
    const miss = [];
    for (const { tile, id } of tiles) {
        for (const r of findTemplate(cat, id).roles.filter(x => x.need === "required")) {
            if (!tile.bindings[r.role] && !(r.alt ?? []).every(a => tile.bindings[a])) { miss.push(`${id}: ${r.role}`); }
        }
    }
    assert.deepEqual(miss, []);
});

// 4 · Vorschläge
// C18 bindet Abweichungen als Achsen (ΔPL % als y, ΔPY % als x): diese Kennzahlen nennt der Nutzer (--actual), dwg schlägt
// aus dem Stamm „Umsatz“ sonst Umsatz AC vor
const USER_MEASURES = { C18: ["actual"] };
const STRUCT = new Set(["category", "series", "multiples", "xValue", "xPrevious", "bubbleSize", "bubbleShare", "comment", "comments", "period", "colCategory"]);
ok("Vorschläge treffen die Felder der Showcase-Kacheln (Kennzahlen, Zeitachse, Ebenen, GuV-Logik)", () => {
    const bad = [];
    for (const { tile, id } of tiles) {
        const t = findTemplate(cat, id);
        const acRole = t.visual === "pnl" ? "ac" : "actual";
        const stem = parseMeasureName(parseRef(tile.bindings[acRole]).name).stem;
        // Strukturrollen (Achse in Strukturseiten, Serie, X-Achse …) gibt der Nutzer an; die Zeitachse schlägt dwg vor
        // P&L-Strukturtabellen: die Ebenen (Region, Kunde …) gibt der Nutzer an
        // ChartKitchen-Zeilentyp (C20 Token stock/inflow/outflow, C12 sum/delta) ist eine Strukturspalte des Nutzers; P&L-Zeilentyp schlägt dwg vor
        const given = Object.fromEntries(Object.entries(tile.bindings).filter(([r]) => (STRUCT.has(r) && !(r === "category" && t.group.id === "time"))
            || (r === "levels" && t.data === "structure") || (r === "rowType" && t.visual === "chartkitchen")
            || (USER_MEASURES[id] ?? []).includes(r)));
        const r = suggestBindings(model, t, given, stem);
        assert.deepEqual(r.problems, [], `${id}: ${r.problems.join("; ")}`);
        for (const row of r.rows) {
            const want = tile.bindings[row.role];
            if (!want || !row.value) { continue; }
            const w = [].concat(want);
            if (JSON.stringify(row.value) === JSON.stringify(w)) { continue; }
            const variant = w.length === 1 && parseMeasureName(parseRef(w[0]).name).variants.length > 0;
            if (variant && row.alternatives.includes(w[0])) { continue; }    // „GuV PL bis Ist“: bewusst gewählte Variante
            bad.push(`${id} ${row.role}: Vorschlag ${row.value.join(", ")}, Showcase ${w.join(", ")}`);
        }
        // was die Showcase-Kachel bindet und dwg als Pflicht oder Empfehlung kennt, schlägt dwg auch vor
        for (const row of r.rows.filter(x => x.need !== "optional" && !x.value && tile.bindings[x.role])) {
            bad.push(`${id} ${row.role}: kein Vorschlag, Showcase ${[].concat(tile.bindings[row.role]).join(", ")}`);
        }
    }
    assert.deepEqual(bad, []);
});
ok("ohne Stamm und bei mehreren Kennzahl-Familien fragt dwg nach (keine geratene Kennzahl)", () => {
    const r = suggestBindings(model, findTemplate(cat, "C03"), {}, null);
    assert.equal(r.rows.find(x => x.role === "actual").value, null);
    assert.match(r.problems.join("\n"), /--measure <Stamm>.*umsatz/);
});
ok("P&L-Strukturtabelle: Ebenen nicht geraten, Dimensionen als Kandidaten", () => {
    const r = suggestBindings(model, findTemplate(cat, "T01A"), {}, "Umsatz");
    const lv = r.rows.find(x => x.role === "levels");
    assert.equal(lv.value, null);
    assert.ok(lv.alternatives.includes("'Kunde'[Region]"), lv.alternatives.join(", "));
    assert.match(r.problems.join("\n"), /Pflichtrolle levels/);
});
ok("P&L ohne Stamm nimmt die GuV-Familie und die Ebenen der Kontotabelle", () => {
    const r = suggestBindings(model, findTemplate(cat, "T03A"), {}, null);
    assert.equal(r.stem, "guv");
    assert.deepEqual(r.rows.find(x => x.role === "levels").value, ["'Konto'[L1]", "'Konto'[L2]"]);
    assert.deepEqual(r.rows.find(x => x.role === "rowType").value, ["'Konto'[RowType]"]);
});
ok("Mehrere Kontentabellen: Ebenen aus der Tabelle, die mit der Kennzahl verbunden ist (Bilanz, Cashflow)", () => {
    for (const [tpl, stem, table] of [["T05A", "Bilanz", "Bilanzkonto"], ["T05B", "Cashflow", "Cashflowkonto"]]) {
        const r = suggestBindings(model, findTemplate(cat, tpl), {}, stem);
        assert.deepEqual(r.problems, [], `${tpl}: ${r.problems.join("; ")}`);
        assert.deepEqual(r.rows.find(x => x.role === "levels").value, [`'${table}'[L1]`, `'${table}'[L2]`], tpl);
        assert.deepEqual(r.rows.find(x => x.role === "rowType").value, [`'${table}'[RowType]`], tpl);
        assert.deepEqual(r.rows.find(x => x.role === "period").value, ["'Kalender'[Periode]"], tpl);
    }
    // ohne Stamm: zwei Bestands-Familien (Bilanz, Cashflow), dwg fragt nach
    const r = suggestBindings(model, findTemplate(cat, "T05B"), {}, null);
    assert.match(r.problems.join("\n"), /Pflichtrolle ac .*--measure/);
});

// 5 · Namen und Kurzangaben
ok("Kennzahl-Namen zerlegen", () => {
    const p = (s) => { const x = parseMeasureName(s); return [x.scen, x.stem, x.fy, x.delta, x.variants.join("+")].join("|"); };
    assert.equal(p("Umsatz AC"), "AC|umsatz|false|false|");
    assert.equal(p("GuV PL bis Ist"), "PL|guv|false|false|bisist");
    assert.equal(p("GuV FC FY"), "FC|guv|true|false|");
    assert.equal(p("GuV ± PY"), "PY|guv|false|false|±");
    assert.equal(p("Δ PL %"), "PL||false|true|");
    assert.equal(p("FC_FY"), "FC||true|false|");
    assert.equal(p("PL2"), "PL||false|false|2");
    assert.equal(p("DB-Marge % AC"), "AC|db marge %|false|false|");
    assert.equal(p("Umsatz"), "|umsatz|false|false|");
    assert.equal(p("€ Value Angebot AC"), "AC|value angebot|false|false|");
    assert.equal(p("# Anzahl Kunden"), "|anzahl kunden|false|false|");
    assert.equal(p("Angebotswert BM"), "BM|angebotswert|false|false|");
});
ok("P&L-Periode: Monat mit Jahr vor Monatsname (Demo-Modell)", () => {
    const demo = readModel(path.join(ROOT, "examples", "ChartKitchen byDatenWG Demo.SemanticModel"));
    const r = suggestBindings(demo, findTemplate(cat, "T01A"), { levels: "'Sales Demo'[Region]" }, "AC");
    const top = r.rows.find(x => x.role === "period").alternatives[0] ?? r.rows.find(x => x.role === "period").value?.[0];
    assert.match(top, /Year Month|Start of Month/, top);
});
ok("Benchmark-Kennzahl ist nie Ist", () => {
    const m = { tables: new Map([["F", { columns: new Map(), measures: new Set(["Angebotswert BM", "Angebotswert"]), formats: new Map() }]]),
        measureHome: new Map() };
    const r = suggestBindings(m, findTemplate(cat, "C08"), {}, "Angebotswert");
    assert.equal(r.rows.find(x => x.role === "actual").value?.[0], "'F'[Angebotswert]");
});
ok("Kurzangaben auflösen: Measure-Name, Tabelle.Spalte, eindeutiger Spaltenname, volle Referenz", () => {
    const f = fieldsOf(model);
    assert.equal(resolveInput(model, f, "Umsatz AC", "Measure"), "'Fakten'[Umsatz AC]");
    assert.equal(resolveInput(model, f, "Kunde.Region", "Grouping"), "'Kunde'[Region]");
    assert.equal(resolveInput(model, f, "Monatsname", "Grouping"), "'Kalender'[Monatsname]");
    assert.equal(resolveInput(model, f, "'Konto'[L1]", "Grouping"), "'Konto'[L1]");
    assert.throws(() => resolveInput(model, f, "KontoID", "Grouping"), /mehrfach/);
    assert.throws(() => resolveInput(model, f, "Gibtsnicht", "Measure"), /fehlt/);
});
ok("Kachel: Sortierspalte und Anzeigenamen wie in der Showcase-Kachel C03", () => {
    const page = { name: "x", tiles: [] };
    const { tile, problems } = buildTile({ spec: { resolution: "fullhd", pages: [page] }, page, template: findTemplate(cat, "C03"), model, measure: "Umsatz" });
    const sc = tiles.find(x => x.id === "C03").tile;
    assert.deepEqual(problems, []);
    assert.deepEqual(tile.bindings, sc.bindings);
    assert.deepEqual(tile.sortBy, sc.sortBy);
    assert.deepEqual(tile.displayNames, sc.displayNames);
});

// 6 · Kommandozeile
const DWG = path.join(ROOT, "dwg.mjs");
const run = (...a) => spawnSync(process.execPath, [DWG, ...a], { encoding: "utf8", cwd: ROOT });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dwg-tile-"));
const specFile = path.join(tmp, "demo.json");
ok("tile add: neue Spec, neue Seite, Kachel im Inhaltsbereich des App-Rahmens", () => {
    const r = run("tile", "add", "--spec", specFile, "--new-page", "Umsatz", "--group", "Vertrieb", "--template", "C03",
        "--model", MODEL_DIR, "--measure", "Umsatz", "--json");
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const spec = JSON.parse(fs.readFileSync(specFile, "utf8"));
    assert.equal(spec.resolution, "fullhd");
    assert.equal(spec.pages[0].group, "Vertrieb");
    const t = spec.pages[0].tiles[0];
    assert.equal(t.objects.chart.template, "C03");
    assert.ok(t.rect[0] > 0 && t.rect[1] > 0, `rect ${t.rect}`);
    checkSpec(spec);
});
ok("tile add: zweite Kachel braucht --rect, Probelauf schreibt nichts", () => {
    const before = fs.readFileSync(specFile, "utf8");
    let r = run("tile", "add", "--spec", specFile, "--page", "umsatz", "--template", "C04", "--model", MODEL_DIR, "--measure", "Umsatz", "--category", "Kunde.Region");
    assert.equal(r.status, 1);
    assert.match(r.stdout, /--rect/);
    r = run("tile", "add", "--spec", specFile, "--page", "umsatz", "--template", "C04", "--model", MODEL_DIR, "--measure", "Umsatz",
        "--category", "Kunde.Region", "--rect", "327,700,700,300", "--dry-run");
    assert.equal(r.status, 0, r.stdout);
    assert.equal(fs.readFileSync(specFile, "utf8"), before);
});
ok("tile add: fehlende Pflichtrolle bricht ab und nennt Kandidaten", () => {
    const r = run("tile", "add", "--spec", specFile, "--new-page", "Streu", "--template", "C09", "--model", MODEL_DIR, "--measure", "Umsatz");
    assert.equal(r.status, 1);
    assert.match(r.stdout, /Pflichtrolle xValue/);
    assert.match(r.stdout, /Pflichtrolle category .*--category/);
});
ok("tile add: GuV-Seite mit T04B ohne weitere Angaben", () => {
    const r = run("tile", "add", "--spec", specFile, "--new-page", "GuV", "--template", "T04B", "--model", MODEL_DIR);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const t = JSON.parse(fs.readFileSync(specFile, "utf8")).pages.find(p => p.name === "GuV").tiles[0];
    assert.equal(t.visual, "pnl");
    assert.equal(t.showItemsWithNoData, true);
    assert.equal(t.objects.columns.dPlWaterfall, true);
});
ok("tile add ohne --model: Pflichtrollen müssen angegeben sein, Ersatzrollen zählen", () => {
    const before = fs.readFileSync(specFile, "utf8");
    // nichts angegeben: nichts geschrieben, alle Pflichtrollen genannt
    let r = run("tile", "add", "--spec", specFile, "--new-page", "Leer", "--template", "C03");
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /Pflichtrolle category/);
    assert.match(r.stdout, /Pflichtrolle actual/);
    assert.equal(fs.readFileSync(specFile, "utf8"), before);
    // unbekannte Rolle ist ein Fehler
    r = run("tile", "add", "--spec", specFile, "--new-page", "Leer", "--template", "C03", "--category", "'Kalender'[Monatsname]",
        "--actual", "'Fakten'[Umsatz AC]", "--previousYear", "'Fakten'[Umsatz PY]", "--mesure", "x");
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /Rolle „mesure“ gehört nicht/);
    // alle Pflichtrollen angegeben: geschrieben; P&L mit account + parent statt levels ebenfalls
    r = run("tile", "add", "--spec", specFile, "--new-page", "Leer", "--template", "C03", "--category", "'Kalender'[Monatsname]",
        "--actual", "'Fakten'[Umsatz AC]", "--previousYear", "'Fakten'[Umsatz PY]");
    assert.equal(r.status, 0, r.stdout + r.stderr);
    r = run("tile", "add", "--spec", specFile, "--new-page", "Konten", "--template", "T04B", "--account", "'Konto'[KontoID]",
        "--parent", "'Konto'[ParentID]", "--ac", "'Fakten'[GuV AC]", "--pl", "'Fakten'[GuV PL]");
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const t = JSON.parse(fs.readFileSync(specFile, "utf8")).pages.find(p => p.name === "Konten").tiles[0];
    assert.equal(t.bindings.levels, undefined);
    assert.equal(t.bindings.account, "'Konto'[KontoID]");
});
const NO_AC = /P&L 1\.8\.4 zeichnet ohne AC nichts; AC binden, bis der Berichtsmonat wählbar ist/;
ok("ohne AC: T02E besteht tile add und lint mit Warnung, check und pbip pages (schemagültig), T01A bricht ab", () => {
    const f = path.join(tmp, "ohne-ac.json");
    // ohne Modell: nur Ebenen, PY und FC
    let r = run("tile", "add", "--spec", f, "--new-page", "Forecast", "--template", "T02E", "--levels", "'Kunde'[Land]",
        "--levels", "'Kunde'[Region]", "--py", "'Fakten'[Umsatz PY]", "--fc", "'Fakten'[Umsatz FC]");
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /ac\s+empfohlen/);
    assert.match(r.stdout, /Warnungen \(1\):/);
    assert.match(r.stdout, NO_AC);
    const spec = JSON.parse(fs.readFileSync(f, "utf8"));
    assert.equal(spec.pages[0].tiles[0].bindings.ac, undefined);
    checkSpec(spec);
    r = run("lint", "--spec", f, "--json");
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const noAc = JSON.parse(r.stdout).findings.filter(x => x.code === "PNL_NO_AC");
    assert.equal(noAc.length, 1);
    assert.equal(noAc[0].level, "warn");
    assert.equal(noAc[0].tile, "t02e");
    assert.match(noAc[0].text, NO_AC);
    r = run("check", "--spec", f, "--model", MODEL_DIR);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /0 Probleme/);
    // Power-BI-Seite in einer Kopie von „DWG GuV.Report“ (Visuals eingetragen) ohne deren Seiten, am Showcase-Modell
    const rep = path.join(tmp, "OhneAc.Report");
    fs.cpSync(path.join(ROOT, "examples", "DWG GuV.Report"), rep, { recursive: true });
    const pagesDir = path.join(rep, "definition", "pages");
    for (const d of fs.readdirSync(pagesDir)) { if (d !== "pages.json") { fs.rmSync(path.join(pagesDir, d), { recursive: true }); } }
    const meta = JSON.parse(fs.readFileSync(path.join(pagesDir, "pages.json"), "utf8"));
    fs.writeFileSync(path.join(pagesDir, "pages.json"), JSON.stringify({ $schema: meta.$schema, pageOrder: [] }, null, 2));
    const pbir = JSON.parse(fs.readFileSync(path.join(rep, "definition.pbir"), "utf8"));
    pbir.datasetReference.byPath.path = path.relative(rep, MODEL_DIR).split(path.sep).join("/");
    fs.writeFileSync(path.join(rep, "definition.pbir"), JSON.stringify(pbir, null, 2));
    r = run("pbip", "pages", "--report", rep, "--spec", f);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    r = spawnSync(process.execPath, [path.join(ROOT, "pbip", "test", "validate.mjs"), rep], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    // T01A (Minuend AC) ohne AC: Pflichtrolle fehlt, nichts geschrieben
    const before = fs.readFileSync(f, "utf8");
    r = run("tile", "add", "--spec", f, "--new-page", "Ist", "--template", "T01A", "--levels", "'Kunde'[Region]",
        "--py", "'Fakten'[Umsatz PY]", "--pl", "'Fakten'[Umsatz PL]");
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /Pflichtrolle ac/);
    assert.equal(fs.readFileSync(f, "utf8"), before);
    // mit Modell bindet tile add AC bei T02F weiter (P&L 1.8.4 zeichnet ohne AC noch nichts)
    const page = () => ({ name: "x", tiles: [] });
    let t = buildTile({ spec: { resolution: "fullhd", pages: [page()] }, page: page(),
        template: findTemplate(cat, "T02F"), model, measure: "Umsatz", given: { levels: ["'Kunde'[Kanal]", "'Kunde'[Kunde]"] } });
    assert.deepEqual(t.problems, []);
    assert.deepEqual(t.warnings, []);
    assert.equal(t.tile.bindings.ac, "'Fakten'[Umsatz AC]");
    // ohne --measure trägt die Minuend-Rolle (FC) den Kennzahlen-Stamm: AC kommt dazu, keine Warnung
    t = buildTile({ spec: { resolution: "fullhd", pages: [page()] }, page: page(), template: findTemplate(cat, "T02E"), model,
        given: { levels: ["'Kunde'[Land]", "'Kunde'[Region]"], fc: ["'Fakten'[Umsatz FC]"], py: ["'Fakten'[Umsatz PY]"] } });
    assert.deepEqual(t.problems, []);
    assert.equal(t.stem, "umsatz");
    assert.equal(t.tile.bindings.ac, "'Fakten'[Umsatz AC]");
    assert.deepEqual(t.warnings, []);
});
ok("Serie nie dasselbe Feld wie die Kategorie: nicht als Vorschlag oder Alternative, angegeben eine Warnung", () => {
    const tpl = findTemplate(cat, "C24");
    const given = { category: ["'Marktsegment'[Sorte]"] };
    const r = suggestBindings(model, tpl, given, "Marktvolumen hl");
    const s = r.rows.find(x => x.role === "series");
    assert.equal(s.value, null, "Serie bei C24 optional: kein Vorschlag");
    assert.ok(!s.alternatives.includes("'Marktsegment'[Sorte]"), s.alternatives.join(", "));
    const page = () => ({ name: "x", tiles: [] });
    const t = buildTile({ spec: { resolution: "fullhd", pages: [page()] }, page: page(), template: tpl, model,
        given: { category: ["'Produkt'[Sorte]"], series: ["'Produkt'[Sorte]"], actual: ["'Fakten'[Umsatz AC]"], xValue: ["'Fakten'[Absatz hl AC]"],
            bubbleSize: ["'Fakten'[Umsatz AC]"], bubbleShare: ["'Fakten'[Umsatz AC]"] } });
    assert.deepEqual(t.problems, []);
    assert.match(t.warnings.join(" "), /series ist dasselbe Feld wie category/);
});
ok("tile add: Titel im Visual statt im Container, --description als Erklärtext, Kopfzeilen an", () => {
    const f = path.join(tmp, "titel.json");
    let r = run("tile", "add", "--spec", f, "--new-page", "Umsatz", "--description", "Wo liegt der Umsatz gegen Vorjahr?",
        "--template", "C03", "--model", MODEL_DIR, "--measure", "Umsatz");
    assert.equal(r.status, 0, r.stdout + r.stderr);
    r = run("tile", "add", "--spec", f, "--new-page", "GuV", "--template", "T04B", "--model", MODEL_DIR, "--title", "GuV in Mio. EUR");
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const spec = JSON.parse(fs.readFileSync(f, "utf8"));
    assert.equal(spec.visualHeaders, true, "neue Spec zeigt die Kopfzeilen der Visuals");
    const [c03, t04b] = spec.pages.map(p => p.tiles[0]);
    assert.equal(spec.pages[0].description, "Wo liegt der Umsatz gegen Vorjahr?");
    assert.equal(c03.title, undefined, "kein Containertitel (App und Power BI zeigen ihn verschieden)");
    assert.deepEqual(c03.objects.ibcsTitle, { show: true, kpi: "Säulen mit Vorjahres-Abweichung" });
    assert.equal(t04b.objects.titleBlock.show, true);
    assert.equal(t04b.objects.titleBlock.measureLine, "GuV in Mio. EUR");
    assert.equal(t04b.objects.titleBlock.headline, undefined, "Template-Einstellungen bleiben, nur Titelzeile ergänzt");
});
ok("templates: Liste und Detail", () => {
    let r = run("templates");
    assert.equal(r.status, 0);
    assert.match(r.stdout, /C03\s+Säulen mit Vorjahres-Abweichung/);
    r = run("templates", "t04b", "--lang", "en");
    assert.match(r.stdout, /T04B · P&L with Δ waterfall/);
    assert.equal(run("templates", "X99").status, 1);
});
ok("templates --visual foo: Meldung mit den gültigen Werten, Exit 1", () => {
    let r = run("templates", "--visual", "foo");
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stderr, /--visual „foo“ gibt es nicht\. Gültig: chartkitchen, pnl/);
    assert.equal(run("templates", "--visual", "pnl").status, 0);
});
ok("Spec-Fehler nennen die Datei: fehlend und kaputtes JSON (tile add, lint, pbip pages, mockup import)", () => {
    const kaputt = path.join(tmp, "kaputt.json");
    fs.writeFileSync(kaputt, '{ "pages": [');
    let r = run("tile", "add", "--spec", kaputt, "--new-page", "X", "--template", "C03", "--model", MODEL_DIR, "--measure", "Umsatz");
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Spec .*kaputt\.json: /);
    r = run("lint", "--spec", kaputt);
    assert.match(r.stderr, /Spec .*kaputt\.json: /);
    const fehlt = path.join(tmp, "fehlt.json");
    for (const args of [["lint", "--spec", fehlt], ["pbip", "pages", "--report", "x.Report", "--spec", fehlt],
        ["app", "page", "--app", "x", "--spec", fehlt, "--connector", "c"]]) {
        r = run(...args);
        assert.equal(r.status, 1, args.join(" "));
        assert.match(r.stderr, /Spec .*fehlt\.json nicht gefunden/, args.join(" "));
    }
    r = run("mockup", "import", "--in", fehlt, "--out", path.join(tmp, "o.json"));
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Mockup .*fehlt\.json nicht gefunden/);
});
ok("pbip: fehlender Bericht, Vorlagenbericht und Modellordner mit klarer Meldung", () => {
    const spec = path.join(tmp, "demo.json");
    let r = run("pbip", "pages", "--report", path.join(tmp, "Nix.Report"), "--spec", spec);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Bericht .*Nix\.Report nicht gefunden \(definition\.pbir fehlt\)/);
    const tpl = path.join(ROOT, "examples", "showcase", "ZlatyLev Showcase.Report");
    r = run("pbip", "new", "--out", path.join(tmp, "N.Report"), "--name", "N", "--model", path.join(tmp, "KeinModell"), "--template", tpl);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Modellordner .*KeinModell nicht gefunden/);
    r = run("pbip", "new", "--out", path.join(tmp, "N.Report"), "--name", "N", "--model", MODEL_DIR, "--template", path.join(tmp, "KeineVorlage.Report"));
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Vorlagenbericht .*KeineVorlage\.Report nicht gefunden/);
    assert.ok(!fs.existsSync(path.join(tmp, "N.Report")), "nichts angelegt");
});
fs.rmSync(tmp, { recursive: true, force: true });

console.log(process.exitCode ? "\nTemplates: Fehler" : `\nTemplates: ${n}/${n} grün`);
