// Template-Katalog und dwg tile add, geprüft gegen die Showcase-Spec (30 Seiten, je Template eine von Hand gebaute
// Kachel; T05A/T05B ab P&L 1.7 noch nicht im Dienst abgenommen) und das Showcase-Modell:
//   1. Katalog: 11 ChartKitchen- und 19 P&L-Templates, Titel DE/EN, jede Rolle gibt es im Visual; Bestands-Templates
//      (T05A Bilanz, T05B Cashflow) mit statement.stockMode und Zeilentyp-Regel
//   2. Was das Template im Visual einstellt, steht genauso in der Showcase-Kachel (Extraktion stimmt)
//   3. Jede Pflichtrolle ist in der Showcase-Kachel gebunden (Rollen-Regeln nicht zu streng)
//   4. Vorschläge mit dem Kennzahlen-Stamm der Showcase-Kachel treffen deren Felder (Varianten wie „bis Ist“ als Alternative)
//   5. Kennzahl-Namen zerlegen, Kurzangaben auflösen
//   6. dwg tile add über die Kommandozeile: neue Spec, Seite, Kachel, Probelauf, Fehler bei fehlender Pflichtrolle
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
ok("Katalog: 11 ChartKitchen- und 19 P&L-Templates", () => {
    assert.equal(cat.templates.filter(t => t.visual === "chartkitchen").length, 11);
    assert.equal(cat.templates.filter(t => t.visual === "pnl").length, 19);
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
ok("jedes Template mit Titel DE/EN, Gruppe und Rollen, die es im Visual gibt", () => {
    for (const t of cat.templates) {
        assert.ok(t.title.de && t.title.en && t.group?.title?.de, `${t.id}: Titel oder Gruppe fehlt`);
        assert.notEqual(t.title.de, t.title.en, `${t.id}: deutscher Titel ist der englische`);
        for (const r of t.roles) { assert.ok(ROLES[t.visual].kind[r.role], `${t.id}: Rolle ${r.role} gibt es in ${t.visual} nicht`); }
        assert.equal(new Set(t.roles.map(r => r.role)).size, t.roles.length, `${t.id}: Rolle doppelt`);
    }
});

// Showcase-Kacheln mit Template
const tiles = SPEC.pages.flatMap(p => p.tiles.filter(t => (t.objects?.chart ?? t.objects?.columns)?.template)
    .map(t => ({ page: p, tile: t, id: (t.objects.chart ?? t.objects.columns).template })));
ok(`Showcase hat für jedes Template eine Kachel (${tiles.length})`, () => {
    assert.deepEqual([...new Set(tiles.map(x => x.id))].sort(), cat.templates.map(t => t.id).sort());
});

// 2 · Einstellungen
// Bewusste Abweichungen der Showcase-Kacheln vom Template (nach dem Anwenden geändert, wie es ein Autor tut):
// Nachkommastellen passend zu Mio. EUR, 12G ohne Prozentzeilen.
const SHOWCASE_OWN = { "12G": ["columns.showPctRows"] };
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
const STRUCT = new Set(["category", "series", "multiples", "xValue", "xPrevious", "bubbleSize", "comment", "comments", "period", "colCategory"]);
ok("Vorschläge treffen die Felder der Showcase-Kacheln (Kennzahlen, Zeitachse, Ebenen, GuV-Logik)", () => {
    const bad = [];
    for (const { tile, id } of tiles) {
        const t = findTemplate(cat, id);
        const acRole = t.visual === "pnl" ? "ac" : "actual";
        const stem = parseMeasureName(parseRef(tile.bindings[acRole]).name).stem;
        // Strukturrollen (Achse in Strukturseiten, Serie, X-Achse …) gibt der Nutzer an; die Zeitachse schlägt dwg vor
        // P&L-Strukturtabellen: die Ebenen (Region, Kunde …) gibt der Nutzer an
        const given = Object.fromEntries(Object.entries(tile.bindings).filter(([r]) => (STRUCT.has(r) && !(r === "category" && t.group.id === "time"))
            || (r === "levels" && t.data === "structure")));
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
