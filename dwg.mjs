#!/usr/bin/env node
// dwg cli (Arbeitsname): eine App-Spec für Fabric App und Power BI.
//
//   node dwg.mjs install | update | doctor                         einrichten, aktualisieren, prüfen (install.mjs)
//   node dwg.mjs visuals build [--kitchen <PowerBI-Kitchen-Klon>]   Adapter @visuals bauen
//   node dwg.mjs visuals update [--kitchen <Klon>] [--ref origin/main] [--dry-run] [--commit]   neues Visual-Release einspielen
//   node dwg.mjs app page --app <Rayfin-App> --spec <app-spec.json> --connector <name> [--model <Y.SemanticModel>]
//   node dwg.mjs pbip new|register|pages …                         Power-BI-Projekt (siehe dwg pbip)
//   node dwg.mjs validate [<X.Report> …]                           PBIR gegen die offiziellen Schemas prüfen
//   node dwg.mjs lint --spec <app-spec.json> [--json] [--strict]     Raster und Barrierefreiheit prüfen
//   node dwg.mjs check --spec <app-spec.json> [--model <X.SemanticModel>] [--json]   Spec ohne App und Bericht prüfen
//   node dwg.mjs mockup build [--kitchen <pfad>] [--check]          Pixelraster, Prüfungen, Skill-Konverter holen
//   node dwg.mjs mockup import --in <mockup-spec.json> --out <app-spec.json> [--model <Y.SemanticModel>]
//   node dwg.mjs templates [<ID>] [--visual chartkitchen|pnl] [--lang en] [--json]  Template-Katalog
//   node dwg.mjs tile add --spec <datei> --page <Seite> --template <ID> [--model <Y.SemanticModel>] …  Kachel anlegen
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { main as pbip, args } from "./pbip/dwg-pbip.mjs";
import { generateAppPages } from "./app/lib/app.mjs";
import { checkSpecFile, formatCheck } from "./app/lib/check.mjs";
import { lintSpec, formatFindings } from "./mockup/lib/lint.mjs";
import { importMockup } from "./mockup/lib/import.mjs";
import { findTemplate, formatList, formatTemplate, loadCatalog } from "./templates/lib/catalog.mjs";
import { addTile, formatResult } from "./templates/lib/tile.mjs";
import { readSpec } from "./templates/lib/readspec.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const HELP = `dwg · eine App-Spec für Fabric App und Power BI

  install | update | doctor              einrichten, aktualisieren (git pull), prüfen
  visuals build [--kitchen <pfad>]       Adapter bauen (ChartKitchen + P&L aus dem Kitchen-Repo)
  visuals update [--kitchen <klon>] [--ref origin/main] [--pbiviz <datei> …] [--no-test] [--force] [--dry-run] [--commit]
                                         Neues Visual-Release einspielen: Kitchen-Stand nach .kitchen/, Adapter bauen,
                                         .pbiviz übernehmen, Beispielberichte und Doku heben, CHANGELOG, npm test
  app page --app <Rayfin-App> --spec <datei> --connector <name> [--model <Y.SemanticModel>]
                                         Seiten in eine Rayfin-App schreiben
  pbip new|register|pages …              Power-BI-Projekt erzeugen (dwg pbip ohne Argumente: Hilfe)
  validate [<X.Report> …]                PBIR gegen die offiziellen Schemas prüfen
  lint --spec <datei> [--json] [--strict]
                                         Pixelraster (bündig, Zwischenräume) und Barrierefreiheit (Kontrast,
                                         Mindestgrößen, Titel) prüfen; Exit 1 bei Fehlern (--strict: auch Warnungen)
  check --spec <datei> [--model <X.SemanticModel>] [--json]
                                         Spec ohne App und Bericht prüfen: Aufbau, Rollen und Bindungen je Kachel,
                                         mit --model auch die Felder; Exit 1 bei Problemen
  mockup build [--kitchen <pfad>] [--check]
                                         Pixelraster, Prüfungen und Skill-Konverter aus dem Kitchen-Repo holen
  mockup import --in <mockup-spec.json> --out <app-spec.json> [--model <Y.SemanticModel>] [--width 1920 --height 1080]
                                         MockupKitchen-Export in eine App-Spec übersetzen, Nicht-Abbildbares als Hinweis
  templates [<ID>] [--visual chartkitchen|pnl] [--lang en] [--json]
                                         Templates von ChartKitchen und P&L: Zweck, Pflicht- und Kannrollen, Einstellungen
  tile add --spec <datei> (--page <Seite> | --new-page "<Name>" [--group "<Gruppe>"] [--description "…"]) --template <ID>
           [--model <Y.SemanticModel>] [--measure <Stamm>] [--<rolle> <feld> …] [--id <kachel>] [--rect x,y,b,h]
           [--title "…"] [--dry-run] [--json]
                                         Kachel aus einem Template anlegen; fehlende Felder schlägt dwg aus dem Modell
                                         vor (Stamm „Umsatz“ → Umsatz AC/PY/PL/FC, Monatsname, L1..Ln, GuV-Logik).
                                         --title ist die Titelzeile im Visual (ibcsTitle bzw. titleBlock), --description
                                         der Erklärtext der Seite
`;

/** Optionen von tile add, die keine Datenrolle sind */
/** gültige Werte für templates --visual */
const VISUALS = ["chartkitchen", "pnl"];

const TILE_OPTS = new Set(["_", "spec", "page", "new-page", "group", "description", "template", "model", "measure", "id", "rect", "title", "dry-run", "json"]);

function node(script, rest) {
    const r = spawnSync(process.execPath, [path.join(HERE, script), ...rest], { stdio: "inherit" });
    process.exit(r.status ?? 1);
}

const [cmd, sub, ...rest] = process.argv.slice(2);
try {
    if (cmd === "install" || cmd === "update" || cmd === "doctor") {
        const flag = { install: [], update: ["--update"], doctor: ["--check"] }[cmd];
        node("install.mjs", [...flag, ...[sub, ...rest].filter(Boolean)]);
    } else if (cmd === "visuals" && sub === "build") {
        node("visuals/build.mjs", rest);
    } else if (cmd === "visuals" && sub === "update") {
        node("visuals/update.mjs", rest);
    } else if (cmd === "app" && sub === "page") {
        const a = args(rest);
        for (const k of ["app", "spec", "connector"]) { if (!a[k] || a[k] === true) { throw new Error(`--${k} fehlt.`); } }
        const spec = readSpec(a.spec);
        const r = await generateAppPages({ appDir: a.app, spec, connector: a.connector, model: a.model === true ? undefined : a.model });
        for (const f of r.written) { console.log(`  ${f}`); }
        console.log(r.slicers
            ? `\nIn der App einbinden (App.tsx), ganze Spec mit Navigation und Filter-Panel:\n  import { DwgShell } from './dwg/DwgShell';\n  import { app } from './dwg/apps/${r.app}';\n  <DwgShell app={app} connection="${r.connector}" isDark={isDark} />`
            : `\nIn der App einbinden (z. B. App.tsx):\n  import { DwgPage } from './dwg/DwgPage';\n  import { page } from './dwg/pages/<seite>';\n  <DwgPage page={page} connection="${r.connector}" isDark={isDark} />\n` +
              `  oder alle Seiten mit Navigation: <DwgShell app={app} …/> aus './dwg/apps/${r.app}'`);
    } else if (cmd === "pbip") {
        pbip([sub, ...rest].filter(Boolean));
    } else if (cmd === "lint") {
        const a = args([sub, ...rest].filter(Boolean));
        if (!a.spec || a.spec === true) { throw new Error("--spec fehlt."); }
        const res = lintSpec(readSpec(a.spec));
        console.log(a.json ? JSON.stringify(res, null, 2) : formatFindings(res, path.basename(a.spec)));
        process.exit(res.counts.error || (a.strict && res.counts.warn) ? 1 : 0);
    } else if (cmd === "check") {
        const a = args([sub, ...rest].filter(Boolean));
        if (!a.spec || a.spec === true) { throw new Error("--spec fehlt."); }
        const res = await checkSpecFile(readSpec(a.spec), { modelDir: a.model === true ? undefined : a.model });
        console.log(a.json ? JSON.stringify(res, null, 2) : formatCheck(res));
        process.exit(res.problems.length ? 1 : 0);
    } else if (cmd === "mockup" && sub === "build") {
        node("mockup/build.mjs", rest);
    } else if (cmd === "mockup" && sub === "import") {
        const a = args(rest);
        for (const k of ["in", "out"]) { if (!a[k] || a[k] === true) { throw new Error(`--${k} fehlt.`); } }
        const num = v => (v == null || v === true ? undefined : Number(v));
        const r = importMockup({ input: a.in, output: a.out, modelDir: a.model === true ? undefined : a.model, width: num(a.width), height: num(a.height) });
        const tiles = r.spec.pages.reduce((s, p) => s + p.tiles.length, 0);
        if (a.json) { console.log(JSON.stringify(r, null, 2)); }
        else {
            console.log(`${a.out}: ${r.spec.pages.length} Seiten, ${tiles} Kacheln, ${(r.spec.slicers ?? []).length} Slicer`);
            if (r.hints.length) { console.log(`\nHinweise (${r.hints.length}):\n  ${r.hints.join("\n  ")}`); }
            const l = lintSpec(r.spec);
            console.log(`\ndwg lint: ${l.counts.error} Fehler, ${l.counts.warn} Warnungen, ${l.counts.info} Hinweise (Details: node dwg.mjs lint --spec ${a.out})`);
            console.log(`Weiter: node dwg.mjs app page --app <Rayfin-App> --spec ${a.out} --connector <name>${a.model && a.model !== true ? ` --model "${a.model}"` : ""}`);
        }
    } else if (cmd === "templates") {
        const a = args([sub, ...rest].filter(Boolean));
        const cat = loadCatalog();
        const lang = a.lang === "en" ? "en" : "de";
        if (a._[0]) {
            const t = findTemplate(cat, a._[0]);
            console.log(a.json ? JSON.stringify(t, null, 2) : formatTemplate(t, lang));
        } else {
            const visual = a.visual && a.visual !== true ? String(a.visual) : null;
            if (visual && !VISUALS.includes(visual)) { throw new Error(`--visual „${visual}“ gibt es nicht. Gültig: ${VISUALS.join(", ")}.`); }
            console.log(a.json ? JSON.stringify(visual ? { ...cat, templates: cat.templates.filter(t => t.visual === visual) } : cat, null, 2)
                : formatList(cat, lang, visual));
        }
    } else if (cmd === "tile" && sub === "add") {
        const a = args(rest);
        for (const k of ["spec", "template"]) { if (!a[k] || a[k] === true) { throw new Error(`--${k} fehlt.`); } }
        const template = findTemplate(loadCatalog(), a.template);
        const val = k => (a[k] == null || a[k] === true ? undefined : a[k]);
        const given = Object.fromEntries(Object.entries(a).filter(([k, v]) => !TILE_OPTS.has(k) && v !== true));
        const r = addTile({ specPath: a.spec, pageRef: val("page"), newPage: val("new-page"), group: val("group"), description: val("description"), template,
            modelDir: val("model"), given, measure: val("measure"), id: val("id"), rect: val("rect"), title: val("title"), dryRun: !!a["dry-run"] });
        console.log(a.json ? JSON.stringify({ written: r.written, tile: r.tile, rows: r.rows, problems: r.problems, stem: r.stem }, null, 2)
            : formatResult(r, template, a.spec));
        if (r.problems.length) { process.exit(1); }
    } else if (cmd === "validate") {
        node("pbip/test/validate.mjs", [sub, ...rest].filter(Boolean));
    } else {
        console.log(HELP);
        if (cmd) { process.exit(1); }
    }
} catch (e) {
    console.error(`Fehler: ${e.message}`);
    process.exit(1);
}
