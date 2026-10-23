// Browser-Test (Playwright/Chromium) für Datumswerte in Filtern: Slicer auf 'Kalender'[Datum] (Mehrfachauswahl
// Feb bis Apr 2026) und Querfilter per Klick auf einen Monat in einer Kachel mit derselben Spalte. Slicer-Werte kommen
// vom Konnektor als ISO-Text, der Klick liefert ein Date; beide müssen dasselbe DAX-Literal ergeben und eine nicht
// leere Schnittmenge bilden (vorher: Textliteral gegen DATE(…), Schnittmenge leer, Kachel auf BLANK gefiltert).
// Erzeugt die Spec mit `dwg app page --model` (Showcase-TMDL, 'Kalender'[Datum] ist dateTime) in eine Minimal-App
// und beantwortet die Abfragen per Mini-DAX auf dem Showcase-Datensatz.
//
//   node app/test/dates.mjs        Screenshots unter app/test/out/dates/
import esbuild from "esbuild";
import fs from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { minimalApp } from "./minimal-app.mjs";
import { createEngine } from "./minidax.mjs";
import { model } from "./datasets/showcase.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const OUT = path.join(HERE, "out", "dates");
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "harness"), { recursive: true });

const DATUM = "'Kalender'[Datum]";
const spec = {
    name: "Datum Test",
    resolution: "fullhd",
    visualHeaders: false,
    slicers: [{ column: DATUM, label: "Monat", default: ["2026-02-01", "2026-03-01T00:00:00", "2026-04-01"], multi: true }],
    pages: [{
        name: "Datum im Filter",
        width: 1920, height: 1080,
        tiles: [
            {
                id: "monate", visual: "chartkitchen", rect: [327, 123, 1566, 438],
                bindings: { category: DATUM, actual: "[Umsatz AC]", previousYear: "[Umsatz PY]" },
                objects: { chart: { orientation: "columns", comparisonMode: "py" } },
            },
            {
                id: "kunden", visual: "chartkitchen", rect: [327, 579, 1566, 438],
                bindings: { category: "'Kunde'[Kunde]", actual: "[Umsatz AC]", previousYear: "[Umsatz PY]" },
                objects: { chart: { orientation: "bars", comparisonMode: "py" } },
            },
        ],
    }],
};

const checks = [];
const check = (name, ok, detail = "") => { checks.push(ok); console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${detail ? ` · ${detail}` : ""}`); };

const { app: APP, src: SRC, gen } = await minimalApp(path.join(OUT, "app"), spec,
    { connector: "showcase", model: path.join(ROOT, "examples", "showcase", "ZlatyLev Showcase.SemanticModel") });
const pageTs = fs.readFileSync(path.join(SRC, "dwg", "pages", "datum-im-filter.ts"), "utf8");
const appTs = fs.readFileSync(path.join(SRC, "dwg", "apps", `${gen.app}.ts`), "utf8");
check("Generator schreibt den Spaltentyp aus dem TMDL in Seite und App",
    pageTs.includes(`"'Kalender'[Datum]": "dateTime"`) && pageTs.includes(`"'Kunde'[Kunde]": "string"`) && appTs.includes(`"'Kalender'[Datum]": "dateTime"`));

const withExt = p => [".tsx", ".ts", ""].map(e => p + e).find(f => fs.existsSync(f)) ?? p;
const harnessResolve = {
    name: "harness-resolve",
    setup(build) {
        build.onResolve({ filter: /^@\/hooks\/use-semantic-model-query$/ }, () => ({ path: path.join(HERE, "harness", "mock-minidax.ts") }));
        build.onResolve({ filter: /^@app\// }, a => ({ path: withExt(path.join(SRC, a.path.slice(5))) }));
        build.onResolve({ filter: /^@shell$/ }, () => ({ path: path.join(SRC, "dwg", "apps", `${gen.app}.ts`) }));
        build.onResolve({ filter: /^@dataset$/ }, () => ({ path: path.join(HERE, "datasets", "showcase.mjs") }));
    },
};
const reactBase = [path.join(APP, "node_modules"), path.join(ROOT, "node_modules")]
    .find(d => fs.existsSync(path.join(d, "react", "package.json")));
const reactFrom = createRequire(path.join(reactBase, "x.js"));
const singleReact = {
    name: "single-react",
    setup(build) { build.onResolve({ filter: /^react(-dom)?(\/.*)?$/ }, a => ({ path: reactFrom.resolve(a.path) })); },
};
await esbuild.build({
    entryPoints: [path.join(HERE, "harness", "shell-main.tsx")],
    bundle: true, format: "esm", splitting: true, outdir: path.join(OUT, "harness"),
    jsx: "automatic", plugins: [singleReact, harnessResolve],
    define: { "process.env.NODE_ENV": '"production"' }, logLevel: "warning",
});
fs.writeFileSync(path.join(OUT, "harness", "index.html"),
    '<!doctype html><html lang="de"><head><meta charset="utf-8"><title>dwg Datum · Test</title>' +
    '<style>html,body,#root{margin:0;height:100%}body{font-family:Geist,"Segoe UI",system-ui,sans-serif}</style></head>' +
    '<body><div id="root"></div><script type="module" src="shell-main.js"></script></body></html>');

const { chromium } = await import("playwright");
const DIR = path.join(OUT, "harness");
const server = http.createServer((req, res) => {
    const p = path.join(DIR, decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (!p.startsWith(DIR) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "content-type": p.endsWith(".js") ? "text/javascript" : "text/html" });
    fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, r));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
const errors = [];
page.on("pageerror", e => errors.push(e.message));
page.on("console", m => { if (m.type() === "error") { errors.push(m.text()); } });

const engine = createEngine(model);
const queries = () => page.evaluate(() => window.__dwgQueries.slice());
let seen = 0;
const fresh = async () => { const all = await queries(); const out = all.slice(seen); seen = all.length; return out; };
const isTile = q => q.includes('"actual"');
const settle = async () => {
    await page.waitForTimeout(300);
    await page.waitForFunction(() => [...document.querySelectorAll("[data-dwg-tile]")].length > 0
        && [...document.querySelectorAll("[data-dwg-tile]")].every(t => t.querySelector("svg") || t.querySelector("[role=alert]")), null, { timeout: 30000 });
    await page.waitForTimeout(600);
};
const noAlerts = async () => !(await page.$("[data-dwg-tile] [role=alert], [data-dwg-slicer] [role=alert]"));
const DAYS = "DATE(2026, 2, 1), DATE(2026, 3, 1), DATE(2026, 4, 1)";

await page.goto(`http://localhost:${server.address().port}/index.html`);
await page.waitForSelector('[data-dwg-slicer="Monat"] button[data-value]', { timeout: 30000, state: "attached" })
    .catch(async e => { console.log(errors.join(" | "), (await page.textContent("body")).slice(0, 800)); throw e; });
await settle();

// 1. Slicer: Werte vom Konnektor (ISO-Text) werden Date, Startauswahl aus der Spec (ISO-Text, mit und ohne Uhrzeit)
const checked = await page.$$eval('[data-dwg-slicer="Monat"] button[data-value][aria-pressed=true]', els => els.map(e => e.dataset.value));
check("Startauswahl der Spec ist im Slicer gesetzt (Feb bis Apr 2026)",
    checked.join() === "2026-02-01T00:00:00,2026-03-01T00:00:00,2026-04-01T00:00:00", checked.join(", "));
const label = await page.$eval('[data-dwg-slicer="Monat"]', el => el.textContent);
check("Slicer zeigt Datumswerte deutsch", label.includes("01.03.2026"));
let q = await fresh();
check("Kachelabfragen tragen den Slicer als DATE-Literale", q.filter(isTile).length === 2 && q.filter(isTile).every(x => x.includes(`TREATAS({${DAYS}}, ${DATUM})`)),
    q.filter(isTile).map(x => /TREATAS\(\{[^}]*\}, 'Kalender'\[Datum\]\)/.exec(x)?.[0]).join(" | "));
check("kein Datum als Textliteral", q.every(x => !/"\d{4}-\d{2}-\d{2}/.test(x)));
const months = await page.$$eval('[data-dwg-tile="monate"] g.icd-cat', els => els.length);
check("Kachel mit 'Kalender'[Datum] zeigt die drei gewählten Monate", months === 3, `${months} Kategorien`);
check("keine Kachel meldet einen Fehler", await noAlerts());

// 2. Klick auf März: Querfilter (Date aus dem Visual) und Slicer (ISO-Text) auf derselben Spalte → Schnittmenge März
const pt = await page.$$eval('[data-dwg-tile="monate"] g.icd-cat', (els) => {
    const g = els[1];
    if (!g) { return null; }
    for (const r of [...g.querySelectorAll("rect")].sort((a, b) => b.getBBox().height * b.getBBox().width - a.getBBox().height * a.getBBox().width)) {
        const b = r.getBoundingClientRect();
        const x = b.x + b.width / 2, y = b.y + b.height / 2;
        if (b.width > 2 && b.height > 2 && g.contains(document.elementFromPoint(x, y))) { return { x, y }; }
    }
    return null;
}, null);
check("März in der Kachel ist klickbar", pt !== null);
if (pt) { await page.mouse.click(pt.x, pt.y); }
await settle();
q = await fresh();
const kunden = q.filter(x => x.includes("'Kunde'[Kunde]"));
check("Querfilter fragt nur die andere Kachel neu ab", q.length === 1 && kunden.length === 1, `${q.length} neue Abfragen`);
const kq = kunden[0] ?? "";
check("Schnittmenge aus Slicer und Klick ist März", kq.includes(`TREATAS({DATE(2026, 3, 1)}, ${DATUM})`) && (kq.match(/'Kalender'\[Datum\]/g) ?? []).length === 1,
    /TREATAS\(\{[^}]*\}, 'Kalender'\[Datum\]\)/.exec(kq)?.[0] ?? "");
check("Kachel ist nicht auf BLANK gefiltert", !kq.includes("BLANK()"));
const rows = kq ? engine.query(kq).rows.length : 0;
check("Abfrage liefert Daten (Mini-DAX auf dem Showcase-Datensatz)", rows > 0, `${rows} Zeilen`);
const bars = await page.$$eval('[data-dwg-tile="kunden"] g.icd-cat', els => els.length);
check("Kachel zeigt Kunden", bars > 0 && await noAlerts(), `${bars} Kategorien`);
const chip = await page.$eval("button[title='Filter aufheben']", el => el.textContent).catch(() => "");
check("Filter-Chip zeigt das Datum deutsch", chip.includes("01.03.2026"), chip.trim());
await page.screenshot({ path: path.join(OUT, "1-datum.png"), fullPage: true });

// 3. Slicer ohne März: Klickauswahl liegt außerhalb, die Kachel filtert dann auf BLANK (wie Power BI: keine Daten)
await page.click('[data-dwg-slicer="Monat"] button[data-value="2026-03-01T00:00:00"]');
await settle();
q = await fresh();
const out = q.find(x => x.includes("'Kunde'[Kunde]")) ?? "";
check("Auswahl außerhalb des Slicers: BLANK statt Datum", out.includes(`TREATAS({BLANK()}, ${DATUM})`), /TREATAS\(\{[^}]*\}, 'Kalender'\[Datum\]\)/.exec(out)?.[0] ?? "");
check("keine Fehler in der Konsole", errors.length === 0, errors.slice(0, 3).join(" | "));

await browser.close();
server.close();
const failed = checks.filter(c => !c).length;
console.log(failed ? `\ndates: ${failed} Prüfung(en) fehlgeschlagen` : `\ndates: alle ${checks.length} Prüfungen grün`);
process.exit(failed ? 1 : 0);
