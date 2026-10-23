// Prüft *.Report-Ordner gegen die offiziellen PBIR-Schemas (Spiegel auf GitHub:
// microsoft/json-schemas) und auf Querbezüge: Seitenreihenfolge, eingetragene Custom
// Visuals, Felder gegen das TMDL-Modell.
//
//   node pbip/test/validate.mjs ["dwg Spike.Report" …]   (Standard: dwg Spike, DWG GuV + Demo-Report als Gegenprobe)
import Ajv from "ajv";
import addFormats from "ajv-formats";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readModel, resolveField } from "../lib/tmdl.mjs";
import { modelDirOf } from "../lib/report.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const CACHE = path.join(HERE, ".schema-cache");
const MIRROR = "https://raw.githubusercontent.com/microsoft/json-schemas/main/";
const ORIGIN = "https://developer.microsoft.com/json-schemas/";

async function loadSchema(uri) {
    const rel = uri.replace(ORIGIN, "").split("#")[0];
    const file = path.join(CACHE, rel);
    if (fs.existsSync(file)) { return JSON.parse(fs.readFileSync(file, "utf8")); }
    const res = await fetch(MIRROR + rel);
    if (!res.ok) { throw new Error(`Schema ${rel}: HTTP ${res.status}`); }
    const text = await res.text();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
    return JSON.parse(text);
}

const ajv = new Ajv({ allErrors: true, strict: false, loadSchema });
addFormats(ajv);
const compiled = new Map();
async function validator(uri) {
    if (!compiled.has(uri)) {
        const existing = ajv.getSchema(uri);
        compiled.set(uri, existing ?? await ajv.compileAsync(await loadSchema(uri)));
    }
    return compiled.get(uri);
}

const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);

async function checkReport(reportDir) {
    const problems = [];
    let validated = 0;
    // 1. Schemas (alle JSON-Dateien mit $schema, außer Custom-Visual-Paketen und Themes)
    for (const f of walk(reportDir).filter(f => f.endsWith(".json") || f.endsWith(".pbir") || f.endsWith(".platform"))) {
        if (f.includes(`${path.sep}CustomVisuals${path.sep}`) || f.includes(`${path.sep}StaticResources${path.sep}`)) { continue; }
        const data = JSON.parse(fs.readFileSync(f, "utf8"));
        if (!data.$schema) { continue; }
        const validate = await validator(data.$schema);
        validated++;
        if (!validate(data)) {
            for (const e of validate.errors.slice(0, 5)) {
                problems.push(`${path.relative(reportDir, f)}: ${e.instancePath || "/"} ${e.message}${e.params?.additionalProperty ? ` (${e.params.additionalProperty})` : ""}`);
            }
        }
    }
    // 2. Seiten
    const pagesDir = path.join(reportDir, "definition", "pages");
    const pages = JSON.parse(fs.readFileSync(path.join(pagesDir, "pages.json"), "utf8"));
    for (const id of pages.pageOrder) {
        if (!fs.existsSync(path.join(pagesDir, id, "page.json"))) { problems.push(`pages.json nennt Seite ${id}, Ordner fehlt`); }
    }
    // 3. Custom Visuals eingetragen? Felder im Modell?
    const report = JSON.parse(fs.readFileSync(path.join(reportDir, "definition", "report.json"), "utf8"));
    const registered = new Set((report.resourcePackages ?? []).filter(p => p.type === "CustomVisual").map(p => p.name));
    const publicVisuals = new Set(report.publicCustomVisuals ?? []);
    const model = readModel(modelDirOf(reportDir));
    let visuals = 0;
    for (const f of walk(pagesDir).filter(f => f.endsWith("visual.json"))) {
        const v = JSON.parse(fs.readFileSync(f, "utf8")).visual;
        if (!v) { continue; }
        visuals++;
        const t = v.visualType;
        if (/[A-F0-9]{32}$/.test(t ?? "") && !registered.has(t) && !publicVisuals.has(t)) {
            problems.push(`${path.relative(reportDir, f)}: Custom Visual ${t} ist nicht eingetragen`);
        }
        if (registered.has(t) && !fs.existsSync(path.join(reportDir, "CustomVisuals", t, "resources", `${t}.pbiviz.json`))) {
            problems.push(`Custom Visual ${t}: Paketdateien fehlen unter CustomVisuals/`);
        }
        for (const [role, st] of Object.entries(v.query?.queryState ?? {})) {
            for (const p of st.projections ?? []) {
                const node = p.field?.Measure ? "Measure" : p.field?.Column ? "Column" : null;
                if (!node) { continue; }
                const f2 = p.field[node];
                const entity = f2.Expression?.SourceRef?.Entity;
                try { resolveField(model, `'${entity}'[${f2.Property}]`, node === "Measure" ? "Measure" : "Grouping"); }
                catch (e) { problems.push(`${path.relative(reportDir, f)} (${role}): ${e.message}`); }
            }
        }
    }
    return { validated, visuals, pages: pages.pageOrder.length, problems };
}

const targets = process.argv.slice(2).length ? process.argv.slice(2)
    : ["DWG GuV.Report", "showcase/ZlatyLev Showcase.Report"].map(r => path.join(ROOT, "examples", r));
let failed = 0;
for (const t of targets) {
    const r = await checkReport(path.resolve(t));
    const ok = r.problems.length === 0;
    if (!ok) { failed++; }
    console.log(`${ok ? "ok  " : "FAIL"} ${path.basename(t)}: ${r.validated} Dateien gegen Schema, ${r.pages} Seiten, ${r.visuals} Visuals`);
    for (const p of r.problems.slice(0, 25)) { console.log(`       ${p}`); }
    if (r.problems.length > 25) { console.log(`       … ${r.problems.length - 25} weitere`); }
}
process.exit(failed ? 1 : 0);
