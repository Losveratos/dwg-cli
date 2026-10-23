// Paritätstest Power BI gegen App: rendert jede ChartKitchen- und P&L-Kachel eines erzeugten Berichts so, wie
// Power BI sie dem Visual übergibt, und prüft die Fehlerbilder, die es im Dienst gab (21.10.2026), in der App aber nicht.
// Was Power BI anders macht als die App und hier nachgestellt wird:
//   1. Projektionen mit `active` (Drill-Zustand): Hat eine Rolle mit mehreren Feldern aktive Projektionen, fragt Power BI
//      nur diese ab, auch bei Visuals ohne drilldown-Capability (P&L `levels`: sonst kommt nur L1 an).
//   2. Anzeigename: `displayName` der Projektion, sonst der Name im Modell. Die App nimmt `displayNames` der Spec.
//   3. Format: Power BI gibt den Formatstring des Measures aus dem TMDL mit, die App nur `formats` der Spec.
//   4. Viewport: Kachel minus Innenabstand und Rahmen des Visual-Containers (visualContainerObjects, sonst Theme;
//      Fluent2: 16/14/16/16 px). Die App zieht 8 px Innenabstand und 1 px Rand ab.
// Daten: Mini-DAX auf dem Showcase-Datensatz (wie showcase-spec.mjs), Filter aus Slicer-Startauswahl, Seiten- und
// Visual-Filtern des Berichts.
//
//   node pbip/test/parity.mjs [--report <*.Report>] [--only T03A,C12] [--app]
//   --app: dieselben Prüfungen unter App-Bedingungen (Spec statt PBIP), muss immer grün sein.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createEngine } from "../../app/test/minidax.mjs";
import { readModel } from "../lib/tmdl.mjs";
import { modelDirOf, VISUAL_KINDS } from "../lib/report.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DWG = path.resolve(HERE, "../..");
const ROOT = DWG;
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const REPORT = path.resolve(arg("report", path.join(ROOT, "examples", "showcase", "ZlatyLev Showcase.Report")));
const SPEC = path.resolve(arg("spec", path.join(DWG, "specs", "showcase.json")));
const ONLY = arg("only") ? new Set(arg("only").split(",")) : null;
const APP_MODE = process.argv.includes("--app");
const OUT = path.join(HERE, "out", APP_MODE ? "parity-app" : "parity");
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const { daxQuery } = await import(pathToFileURL(path.join(DWG, "visuals", "dist", "dwg-visuals.js")).href);
const { model: data } = await import(pathToFileURL(path.join(DWG, "app", "test", "datasets", "showcase.mjs")).href);
const engine = createEngine(data);
const readJson = f => JSON.parse(fs.readFileSync(f, "utf8"));
const model = readModel(modelDirOf(REPORT));
const kindOf = type => Object.entries(VISUAL_KINDS).find(([, prefix]) => type.startsWith(prefix))?.[0];
const ref = f => `'${f.Expression.SourceRef.Entity.replace(/'/g, "''")}'[${f.Property}]`;

/** PBIR-Literal → JS-Wert ('text' → text, 2D → 2, 5L → 5, true → true) */
function literal(v) {
    if (v === "null") { return null; }
    if (v === "true" || v === "false") { return v === "true"; }
    if (/^'.*'$/s.test(v)) { return v.slice(1, -1).replace(/''/g, "'"); }
    const m = /^(-?\d+(?:\.\d+)?)[DLM]?$/.exec(v);
    return m ? Number(m[1]) : v;
}
const exprValue = p => p?.expr?.Literal ? literal(p.expr.Literal.Value) : p?.solid?.color?.expr?.Literal ? literal(p.solid.color.expr.Literal.Value) : undefined;
function plainObjects(objs = {}) {
    const out = {};
    for (const [o, arr] of Object.entries(objs)) {
        out[o] = {};
        for (const [k, v] of Object.entries(arr[0]?.properties ?? {})) { const x = exprValue(v); if (x !== undefined) { out[o][k] = x; } }
    }
    return out;
}
/** Kategorischer Filter (In) → { column, values } */
function inFilter(f) {
    const cond = f?.Where?.[0]?.Condition?.In;
    if (!cond) { return null; }
    const ent = Object.fromEntries((f.From ?? []).map(x => [x.Name, x.Entity]));
    const c = cond.Expressions[0].Column;
    return { column: `'${ent[c.Expression.SourceRef.Source]}'[${c.Property}]`, values: cond.Values.map(v => literal(v[0].Literal.Value)) };
}

// Innenabstand und Rahmen des Visual-Containers: Visual > benutzerdefiniertes Theme > Basis-Theme
const rj = readJson(path.join(REPORT, "definition", "report.json"));
const themeFiles = [rj.themeCollection?.baseTheme, rj.themeCollection?.customTheme].filter(Boolean).map(t => {
    const pkg = rj.resourcePackages.find(p => p.type === t.type);
    const item = pkg?.items.find(i => i.name === t.name || i.name === `${t.name}.json`);
    return item ? readJson(path.join(REPORT, "StaticResources", pkg.name, item.path)) : {};
});
function containerBox(vco = {}) {
    const pick = key => {
        let v = null;
        for (const th of themeFiles) { const x = th.visualStyles?.["*"]?.["*"]?.[key]?.[0]; if (x) { v = { ...v, ...x }; } }
        const own = vco[key]?.[0]?.properties;
        if (own) { v = { ...v, ...Object.fromEntries(Object.entries(own).map(([k, x]) => [k, exprValue(x)])) }; }
        return v ?? {};
    };
    const pad = pick("padding"), border = pick("border");
    const bw = border.show ? (border.width ?? 1) : 0;
    return { l: (pad.left ?? 0) + bw, r: (pad.right ?? 0) + bw, t: (pad.top ?? 0) + bw, b: (pad.bottom ?? 0) + bw };
}

// ---------------------------------------------------------------- Kacheln einsammeln
const jobs = [];
if (APP_MODE) {
    const spec = readJson(SPEC);
    const slicerDefaults = (spec.slicers ?? []).filter(s => s.default?.length).map(s => ({ column: s.column, values: s.default }));
    for (const page of spec.pages) {
        if (ONLY && !ONLY.has(page.template)) { continue; }
        for (const tile of page.tiles) {
            const q = daxQuery(tile.visual, tile.bindings, {
                filters: [...slicerDefaults, ...(page.filters ?? []), ...(tile.filters ?? [])], sortBy: tile.sortBy, showItemsWithNoData: tile.showItemsWithNoData,
            });
            // App-Kachel: 8 px Innenabstand (p-200) und 1 px Rand
            jobs.push({ page: page.template, tile: tile.id, visual: tile.visual, table: engine.query(q.query), bindings: q.bindings,
                objects: tile.objects ?? {}, displayNames: { ...q.displayNames, ...tile.displayNames }, formats: tile.formats ?? {},
                levels: [].concat(tile.bindings.levels ?? []), roles: Object.keys(tile.bindings),
                width: tile.rect[2] - 18, height: tile.rect[3] - 18 });
        }
    }
} else {
    const pagesDir = path.join(REPORT, "definition", "pages");
    for (const id of readJson(path.join(pagesDir, "pages.json")).pageOrder) {
        const pj = readJson(path.join(pagesDir, id, "page.json"));
        const template = pj.displayName.split(" ")[0];
        if (ONLY && !ONLY.has(template)) { continue; }
        const visuals = fs.readdirSync(path.join(pagesDir, id, "visuals")).map(v => readJson(path.join(pagesDir, id, "visuals", v, "visual.json")));
        const pageFilters = (pj.filterConfig?.filters ?? []).map(f => inFilter(f.filter)).filter(Boolean);
        const slicerFilters = visuals.filter(v => v.visual.visualType === "slicer")
            .map(v => inFilter(v.visual.objects?.general?.[0]?.properties?.filter?.filter)).filter(Boolean);
        for (const v of visuals) {
            const kind = kindOf(v.visual.visualType);
            if (!kind) { continue; }
            const bindings = {}, displayNames = {}, formats = {}, sortBy = {};
            let showAll = false;
            for (const [role, st] of Object.entries(v.visual.query.queryState)) {
                const act = st.projections.filter(p => p.active);
                const used = st.projections.length > 1 && act.length ? act : st.projections;
                showAll ||= Boolean(st.showAll);
                const refs = [];
                for (const p of used) {
                    if (p.field.Measure) {
                        const m = p.field.Measure;
                        refs.push(ref(m));
                        displayNames[`[${role}]`] = p.displayName ?? m.Property;
                        const fmt = model.tables.get(m.Expression.SourceRef.Entity)?.formats.get(m.Property);
                        if (fmt) { formats[`[${role}]`] = fmt; }
                    } else {
                        const c = p.field.Column;
                        refs.push(ref(c));
                        if (p.displayName) { displayNames[ref(c)] = p.displayName; }
                        const sb = model.tables.get(c.Expression.SourceRef.Entity)?.columns.get(c.Property)?.sortBy;
                        if (sb) { sortBy[ref(c)] = `'${c.Expression.SourceRef.Entity}'[${sb}]`; }
                    }
                }
                bindings[role] = refs.length === 1 ? refs[0] : refs;
            }
            const visualFilters = (v.filterConfig?.filters ?? []).map(f => inFilter(f.filter)).filter(Boolean);
            const q = daxQuery(kind, bindings, { filters: [...slicerFilters, ...pageFilters, ...visualFilters], sortBy, showItemsWithNoData: showAll });
            const box = containerBox(v.visual.visualContainerObjects);
            const levels = (v.visual.query.queryState.levels?.projections ?? []).map(p => ref(p.field.Column));
            jobs.push({ page: template, tile: v.name, visual: kind, table: engine.query(q.query), bindings: q.bindings,
                objects: plainObjects(v.visual.objects), displayNames: { ...q.displayNames, ...displayNames }, formats,
                levels, roles: Object.keys(bindings),
                width: v.position.width - box.l - box.r, height: v.position.height - box.t - box.b });
        }
    }
}

// ---------------------------------------------------------------- im Browser rendern
fs.writeFileSync(path.join(OUT, "index.html"), `<!doctype html><html lang="de"><head><meta charset="utf-8">
<style>body{margin:0;font-family:"Segoe UI",system-ui,sans-serif;background:#fff}.v{position:relative;margin:0 0 8px}</style></head>
<body><div id="root"></div><script type="module">
import { mountVisual } from "/visuals/dist/dwg-visuals.js";
const jobs = await (await fetch("/pbip/test/out/${path.basename(OUT)}/jobs.json")).json();
for (const j of jobs) {
  const el = document.createElement("div");
  el.className = "v"; el.dataset.key = j.page + "/" + j.tile;
  el.style.width = j.width + "px"; el.style.height = j.height + "px";
  document.getElementById("root").appendChild(el);
  await new Promise(res => { mountVisual(el, { visual: j.visual, table: j.table, bindings: j.bindings, objects: j.objects,
    displayNames: j.displayNames, formats: j.formats, onRendered: res, onError: e => { el.dataset.error = String(e); res(); } }); });
}
document.body.dataset.ready = "1";
</script></body></html>`);
fs.writeFileSync(path.join(OUT, "jobs.json"), JSON.stringify(jobs));

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".map": "application/json" };
const server = http.createServer((req, res) => {
    const p = path.join(DWG, decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (!p.startsWith(DWG) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "content-type": TYPES[path.extname(p)] ?? "application/octet-stream" });
    fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, r));
const { chromium } = await import("playwright");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1200 } });
const errors = [];
page.on("pageerror", e => errors.push(e.message));
await page.goto(`http://localhost:${server.address().port}/pbip/test/out/${path.basename(OUT)}/index.html`);
await page.waitForSelector("body[data-ready='1']", { timeout: 180000 });
await page.waitForTimeout(500);
const seen = await page.$$eval("div.v", els => els.map(el => ({
    key: el.dataset.key, error: el.dataset.error ?? null,
    texts: [...el.querySelectorAll("text, div, span, td, th")].filter(n => !n.children.length).map(n => n.textContent.trim()).filter(Boolean),
    scaleMag: el.querySelectorAll("[data-pnl='scale-mag']").length,
})));
await page.screenshot({ path: path.join(OUT, "alle.png"), fullPage: true });
await browser.close();
server.close();

// ---------------------------------------------------------------- Prüfungen je Befund
const byKey = new Map(seen.map(s => [s.key, s]));
const failures = [];
const fail = (job, msg) => failures.push(`${job.page}/${job.tile}: ${msg}`);
const distinct = r => {
    const m = /^'(.+)'\[(.+)\]$/.exec(r), t = data.tables[m[1]];
    return [...new Set(t.rows.map(x => x[t.columns.indexOf(m[2])]).filter(v => v != null && v !== ""))];
};
const L1 = distinct("'Konto'[L1]");
for (const job of jobs) {
    const s = byKey.get(`${job.page}/${job.tile}`);
    if (!s) { fail(job, "nicht gerendert"); continue; }
    if (s.error) { fail(job, `Fehler ${s.error}`); }
    const all = s.texts.join(" | ");
    if (job.visual === "pnl") {
        // Befund 1: Formelzeilen finden ihre Bezugszeilen, L1-Gruppen sind da
        const bad = s.texts.filter(t => /unbekannte Referenz|unknown reference/.test(t));
        if (bad.length) { fail(job, `Formelfehler: ${bad[0]}`); }
        if (job.roles.includes("account") && !L1.filter(n => s.texts.includes(n)).length) { fail(job, "keine L1-Gruppenzeile"); }
        // Befund 2: die unterste Ebene kommt an (Werte, die es auf der obersten nicht gibt: Region, Kunde)
        if (job.levels.length >= 2 && !job.roles.includes("account")) {
            const top = new Set(distinct(job.levels[0]));
            const lower = distinct(job.levels.at(-1)).filter(n => !top.has(n));
            if (!lower.some(n => s.texts.includes(n))) { fail(job, `nur die oberste Ebene ${job.levels[0]}, nichts aus ${job.levels.at(-1)}`); }
        }
        // Befund 3 (12G): Δ-Spalte nicht still vergrößert, wenn die Spec feste Maxima setzt
        const mag = s.texts.find(t => /^Δ\S+ ×\d/.test(t));
        if (job.objects.numbers?.fixedVarMax && (s.scaleMag || mag)) { fail(job, `Δ-Spalte mit Lupe trotz fixedVarMax („${mag}“)`); }
    } else {
        // Befund 3: kein doppeltes Vorzeichen, keine Achsentitel „AC (AC)“, Karten mit ΔPL und ΔPY
        const dbl = s.texts.find(t => /^\+\+|\+\+\d/.test(t));
        if (dbl) { fail(job, `doppeltes Vorzeichen „${dbl}“`); }
        if (/\bAC \(AC\)/.test(all)) { fail(job, "Achsentitel „AC (AC)“"); }
        if (job.objects.chart?.orientation === "cards" && job.roles.includes("plan") && job.roles.includes("previousYear")) {
            const py = s.texts.filter(t => t === "ΔPY").length, pl = s.texts.filter(t => t === "ΔPL").length;
            if (!py || !pl) { fail(job, `Karten nur mit ${py ? "ΔPY" : "ΔPL"} (ΔPY ${py}×, ΔPL ${pl}×)`); }
        }
    }
}
fs.writeFileSync(path.join(OUT, "texts.json"), JSON.stringify(seen, null, 1));
for (const e of errors) { failures.push(`Seitenfehler: ${e}`); }
console.log(`${APP_MODE ? "App" : "Power BI"} · ${jobs.length} Kacheln aus ${APP_MODE ? path.basename(SPEC) : path.basename(REPORT)}`);
for (const f of failures) { console.log(`  FAIL ${f}`); }
console.log(failures.length ? `${failures.length} Befund(e)` : "  ok  keine Befunde");
process.exitCode = failures.length ? 1 : 0;
