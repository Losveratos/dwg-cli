// Browser-Test (Playwright/Chromium) einer von `dwg app page` erzeugten Seite. Erzeugt die Seite aus der Spec in eine
// Minimal-App (minimal-app.mjs), bündelt den echten App-Code mit einem Konnektor-Ersatz und prüft Rendern, eine Abfrage
// je Kachel, Querfilter per Klick (neue DAX-Abfragen mit TREATAS, geänderte Werte), Filter-Chip, Dark Mode und
// schmale Fenster.
//
//   node app/test/e2e.mjs [--page dwg-spike|guv-statement|guv-baum]
//
// dwg-spike:  specs/spike.json auf dem Demo-Modell, Antworten aus Demodaten (harness/mock-query.ts)
// guv-*:      specs/guv.json, GuV-Demo-Set (Jan bis Aug 2026) per Mini-DAX;
//             Seiten mit nur einer Kachel ohne Querfilter-Teil (click: null)
import esbuild from "esbuild";
import { execSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { minimalApp } from "./minimal-app.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const MODEL = path.join(ROOT, "examples", "ChartKitchen byDatenWG Demo.SemanticModel");
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const PAGE = arg("page", "dwg-spike");
const SPEC_OF = { "dwg-spike": "spike.json", "guv-statement": "guv.json", "guv-baum": "guv.json" };

const CASES = {
    "dwg-spike": {
        mock: "mock-query.ts", dataset: null,
        click: { tile: "umsatz", group: 2 }, filter: `TREATAS({"Mär"}, 'Calender'[Month Name Short])`, chip: "Mär",
    },
    "guv-statement": { mock: "mock-minidax.ts", dataset: path.join(HERE, "datasets", "guv.mjs"), click: null },
    "guv-baum": { mock: "mock-minidax.ts", dataset: path.join(HERE, "datasets", "guv.mjs"), click: null },
};
const C = CASES[PAGE];
if (!C) { console.error(`Unbekannte Seite ${PAGE}. Möglich: ${Object.keys(CASES).join(", ")}`); process.exit(1); }
const OUT = path.join(HERE, "out", PAGE);
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "harness"), { recursive: true });
const spec = JSON.parse(fs.readFileSync(path.join(ROOT, "specs", SPEC_OF[PAGE]), "utf8"));
const { app: APP, src: SRC } = await minimalApp(path.join(OUT, "app"), spec, { model: MODEL });

const withExt = p => [".tsx", ".ts", ""].map(e => p + e).find(f => fs.existsSync(f)) ?? p;
const harnessResolve = {
    name: "harness-resolve",
    setup(build) {
        build.onResolve({ filter: /^@\/hooks\/use-semantic-model-query$/ }, () => ({ path: path.join(HERE, "harness", C.mock) }));
        build.onResolve({ filter: /^@app\// }, a => ({ path: withExt(path.join(SRC, a.path.slice(5))) }));
        build.onResolve({ filter: /^@page$/ }, () => ({ path: withExt(path.join(SRC, "dwg", "pages", PAGE)) }));
        build.onResolve({ filter: /^@dataset$/ }, () => ({ path: C.dataset }));
    },
};
// Genau ein React im Bündel: aus der App, wenn sie installiert ist, sonst aus dwg/ (frischer Klon ohne npm install
// in der App). Ohne diese Festlegung zieht der Harness React aus dwg/, die App ihr eigenes: „reading 'useRef'“.
const reactBase = [path.join(APP, "node_modules"), path.join(HERE, "..", "..", "node_modules")]
    .find(d => fs.existsSync(path.join(d, "react", "package.json")));
const reactFrom = createRequire(path.join(reactBase, "x.js"));
const singleReact = {
    name: "single-react",
    setup(build) {
        build.onResolve({ filter: /^react(-dom)?(\/.*)?$/ }, a => ({ path: reactFrom.resolve(a.path) }));
    },
};
await esbuild.build({
    entryPoints: [path.join(HERE, "harness", "main.tsx")],
    bundle: true, format: "esm", splitting: true, outdir: path.join(OUT, "harness"),
    jsx: "automatic", plugins: [singleReact, harnessResolve],
    // React aus der App, sonst aus dwg/ (frischer Klon ohne npm install in der App)
    nodePaths: [path.join(APP, "node_modules"), path.join(HERE, "..", "..", "node_modules")],
    define: { "process.env.NODE_ENV": '"production"' }, logLevel: "warning",
});
fs.writeFileSync(path.join(OUT, "harness", "index.html"),
    '<!doctype html><html lang="de"><head><meta charset="utf-8"><title>dwg app · Test</title>' +
    '<style>body{margin:0;font:14px system-ui,sans-serif}[data-theme=dark] body{color:#e8eaed}</style></head>' +
    '<body><div id="root"></div><script type="module" src="main.js"></script></body></html>');

let chromium;
try { ({ chromium } = await import("playwright")); } catch {
    ({ chromium } = createRequire(path.join(execSync("npm root -g").toString().trim(), "x.js"))("playwright"));
}
const DIR = path.join(OUT, "harness");
const server = http.createServer((req, res) => {
    const p = path.join(DIR, decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (!p.startsWith(DIR) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "content-type": p.endsWith(".js") ? "text/javascript" : "text/html" });
    fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, r));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1500 } });
const errors = [];
page.on("pageerror", e => errors.push(e.message));
page.on("console", m => { if (m.type() === "error") { errors.push(m.text()); } });
const checks = [];
const check = (name, ok, detail = "") => { checks.push(ok); console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${detail ? ` · ${detail}` : ""}`); };
const svgIn = id => page.$$eval(`[data-dwg-tile="${id}"] svg *`, els => els.length);
const tileText = id => page.$eval(`[data-dwg-tile="${id}"]`, el => el.textContent);

await page.goto(`http://localhost:${server.address().port}/index.html`);
const tiles = await page.evaluate(() => 0);   // Platzhalter, echte Zahl nach dem Rendern
await page.waitForFunction(() => document.querySelectorAll("[data-dwg-tile]").length > 0
    && [...document.querySelectorAll("[data-dwg-tile]")].every(t => t.querySelector("svg") || t.querySelector("[role=alert]")), null, { timeout: 30000 });
await page.waitForTimeout(500);
const ids = await page.$$eval("[data-dwg-tile]", els => els.map(e => e.dataset.dwgTile));
void tiles;
for (const id of ids) {
    const n = await svgIn(id);
    check(`Kachel ${id} rendert`, n > 20, `${n} SVG-Elemente`);
}
check("keine Kachel meldet einen Fehler", !(await page.$("[data-dwg-tile] [role=alert]")),
    await page.$$eval("[data-dwg-tile] [role=alert]", els => els.map(e => e.textContent).join(" | ")));
const q0 = await page.evaluate(() => window.__dwgQueries.length);
check("eine DAX-Abfrage je Kachel", q0 === ids.length, `${q0} Abfragen für ${ids.length} Kacheln`);
await page.screenshot({ path: path.join(OUT, "1-hell.png"), fullPage: true });

let after = [], back = [];
if (C.click) {
    // Klick auf eine Kategorie: Punkt auf einem Rechteck der Gruppe, das dort auch oben liegt
    const pt = await page.$$eval(`[data-dwg-tile="${C.click.tile}"] g.icd-cat`, (els, gi) => {
        const g = els[gi];
        if (!g) { return null; }
        for (const r of [...g.querySelectorAll("rect")].sort((a, b) => b.getBBox().height * b.getBBox().width - a.getBBox().height * a.getBBox().width)) {
            const b = r.getBoundingClientRect();
            const x = b.x + b.width / 2, y = b.y + b.height / 2;
            if (b.width > 2 && b.height > 2 && g.contains(document.elementFromPoint(x, y))) { return { x, y }; }
        }
        return null;
    }, C.click.group);
    check(`Kategorie in Kachel ${C.click.tile} ist klickbar`, pt !== null);
    const before = Object.fromEntries(await Promise.all(ids.filter(i => i !== C.click.tile).map(async i => [i, await tileText(i)])));
    if (pt) { await page.mouse.click(pt.x, pt.y); }
    await page.waitForTimeout(900);
    after = await page.evaluate(n => window.__dwgQueries.slice(n), q0);
    check("Klick löst je andere Kachel genau eine neue Abfrage aus", after.length === ids.length - 1, `${after.length} neue Abfragen`);
    check("neue Abfragen tragen den Querfilter (TREATAS)", after.length > 0 && after.every(q => q.includes(C.filter)));
    for (const id of Object.keys(before)) {
        check(`Kachel ${id} zeigt gefilterte Werte`, (await tileText(id)) !== before[id]);
    }
    check("keine Kachel meldet nach dem Filtern einen Fehler", !(await page.$("[data-dwg-tile] [role=alert]")));
    const chip = await page.$eval("button[title='Filter aufheben']", el => el.textContent).catch(() => "");
    check("Filter-Chip erscheint", chip.includes(C.chip), chip.trim());
    await page.screenshot({ path: path.join(OUT, "2-filter.png"), fullPage: true });

    if (chip) { await page.click("button[title='Filter aufheben']"); }
    await page.waitForTimeout(900);
    back = await page.evaluate(n => window.__dwgQueries.slice(n), q0 + after.length);
    check("Chip hebt den Filter auf, die Kacheln fragen wieder ungefiltert ab",
        back.length === ids.length - 1 && back.every(q => !q.includes(C.filter)) && !(await page.$("button[title='Filter aufheben']")));
    for (const id of Object.keys(before)) {
        if ((await tileText(id)) !== before[id]) { check(`Kachel ${id} zeigt wieder die Ausgangswerte`, false); }
    }
}

await page.click("#theme");
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(OUT, "3-dunkel.png"), fullPage: true });
await page.setViewportSize({ width: 760, height: 1500 });
await page.waitForTimeout(800);
const stacked = await page.$$eval("[data-dwg-tile]", els => els.map(e => Math.round(e.getBoundingClientRect().left)));
check("schmales Fenster: Kacheln untereinander", new Set(stacked).size === 1, `links: ${[...new Set(stacked)].join(", ")}`);
await page.screenshot({ path: path.join(OUT, "4-schmal.png"), fullPage: true });
const total = await page.evaluate(() => window.__dwgQueries.length);
check("Theme und Fenstergröße lösen keine neuen Abfragen aus", total === q0 + after.length + back.length, `${total} Abfragen insgesamt`);
check("keine Fehler in der Konsole", errors.length === 0, errors.slice(0, 3).join(" | "));

await browser.close();
server.close();
const failed = checks.filter(c => !c).length;
console.log(failed ? `\n${PAGE}: ${failed} Prüfung(en) fehlgeschlagen` : `\n${PAGE}: alle Prüfungen grün`);
process.exit(failed ? 1 : 0);
