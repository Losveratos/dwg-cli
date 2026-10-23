#!/usr/bin/env node
// dwg pbip: dieselbe App-Spec, aus der @visuals eine Fabric App rendert, als Power-BI-Bericht (PBIP/PBIR).
//
// Einstieg normalerweise über `node dwg.mjs pbip …`, direkt geht auch:
//   node pbip/dwg-pbip.mjs new      --out "dwg Spike.Report" --name "dwg Spike" --model "<X>.SemanticModel" --template "<Y>.Report"
//   node pbip/dwg-pbip.mjs register --report "dwg Spike.Report" --pbiviz <datei.pbiviz> [--pbiviz …]
//   node pbip/dwg-pbip.mjs pages    --report "dwg Spike.Report" --spec specs/spike.json
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readSpec } from "../templates/lib/readspec.mjs";
import { newReport, registerVisual, addPages, modelDirOf } from "./lib/report.mjs";

function args(argv) {
    const out = { _: [] };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (!a.startsWith("--")) { out._.push(a); continue; }
        const key = a.slice(2);
        const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
        out[key] = key in out ? [].concat(out[key], val) : val;
    }
    return out;
}

const need = (a, k) => {
    if (!a[k] || a[k] === true) { throw new Error(`--${k} fehlt.`); }
    return a[k];
};

const HELP = `dwg pbip · App-Spec → Power-BI-Projekt (PBIR)

  new       --out <X.Report> --name <Anzeigename> --model <Y.SemanticModel> --template <Z.Report>
  register  --report <X.Report> --pbiviz <datei.pbiviz> [--pbiviz …]
  pages     --report <X.Report> --spec <app-spec.json>
`;

export function main(argv) {
    const a = args(argv);
    const cmd = a._[0];
    if (cmd === "new") {
        const out = newReport({ out: need(a, "out"), name: need(a, "name"), modelDir: need(a, "model"), template: need(a, "template") });
        console.log(`Report angelegt: ${out} → Modell ${path.relative(process.cwd(), modelDirOf(out))}`);
    } else if (cmd === "register") {
        for (const f of [].concat(need(a, "pbiviz"))) {
            const r = registerVisual(need(a, "report"), f);
            console.log(`${r.replaced ? "aktualisiert" : "eingetragen"}: ${r.displayName} ${r.version} (${r.guid})`);
        }
    } else if (cmd === "pages") {
        const spec = readSpec(need(a, "spec"));
        const { created, warnings } = addPages(need(a, "report"), spec);
        for (const p of created) { console.log(`Seite „${p.name}“: ${p.tiles} Kacheln (${p.id})`); }
        for (const w of warnings) { console.log(`Hinweis: ${w}`); }
    } else {
        console.log(HELP);
        if (cmd) { throw new Error(`Unbekannter Befehl: ${cmd}`); }
    }
}

export { args };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try { main(process.argv.slice(2)); } catch (e) { console.error(`Fehler: ${e.message}`); process.exit(1); }
}
