// Browser-Test (Playwright/Chromium) des App-Rahmens DwgShell: Filter-Panel (Slicer mit Werten per DAX),
// Navigation (Gruppen, Seiten mit Template-Kennung), Erklärtext, Slicer und Querfilter gemeinsam per TREATAS,
// Abfragen nur bei Filterwechsel bzw. für die neue Seite, Zurücksetzen, Dark Mode, schmales Fenster.
// Auflösungsmodus: Seite in Full HD bzw. HD als Ganzes skaliert, Visuals rechnen in Seitenpixeln; Zonen nach dem
// Pixelraster (layout/pixelgrid.mjs); Kopfleiste bleibt beim Scrollen stehen; Kopfzeilen der Visuals per Schalter ohne Abfrage.
// Erzeugt die Test-Spec (rahmen-spec.json) mit `dwg app page` in eine Minimal-App unter out/shell/app und
// beantwortet die Abfragen per Mini-DAX auf synthetischen Daten (datasets/rahmen.mjs).
//
//   node app/test/shell.mjs        Screenshots unter app/test/out/shell/
import esbuild from "esbuild";
import { execSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateAppPages } from "../lib/app.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const OUT = path.join(HERE, "out", "shell");
const APP = path.join(OUT, "app");
const SRC = path.join(APP, "packages", "frontend", "src");
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "harness"), { recursive: true });

// Minimal-App und Seiten aus der Test-Spec, Felder gegen das TMDL des Demo-Modells
fs.mkdirSync(path.join(APP, "rayfin"), { recursive: true });
fs.mkdirSync(path.join(SRC, "hooks"), { recursive: true });
fs.writeFileSync(path.join(SRC, "hooks", "use-semantic-model-query.ts"), "");
fs.writeFileSync(path.join(APP, "rayfin", "rayfin.yml"), "connectors:\n  - name: test\n    type: fabric-semanticmodel\n");
const spec = JSON.parse(fs.readFileSync(path.join(HERE, "rahmen-spec.json"), "utf8"));
const gen = await generateAppPages({ appDir: APP, spec, connector: "test", model: path.join(ROOT, "examples", "ChartKitchen byDatenWG Demo.SemanticModel") });

const withExt = p => [".tsx", ".ts", ""].map(e => p + e).find(f => fs.existsSync(f)) ?? p;
const harnessResolve = {
    name: "harness-resolve",
    setup(build) {
        build.onResolve({ filter: /^@\/hooks\/use-semantic-model-query$/ }, () => ({ path: path.join(HERE, "harness", "mock-minidax.ts") }));
        build.onResolve({ filter: /^@app\// }, a => ({ path: withExt(path.join(SRC, a.path.slice(5))) }));
        build.onResolve({ filter: /^@shell$/ }, () => ({ path: withExt(path.join(SRC, "dwg", "apps", gen.app)) }));
        build.onResolve({ filter: /^@dataset$/ }, () => ({ path: path.join(HERE, "datasets", "rahmen.mjs") }));
    },
};
const reactFrom = createRequire(path.join(HERE, "..", "..", "node_modules", "x.js"));
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
    '<!doctype html><html lang="de"><head><meta charset="utf-8"><title>dwg Rahmen · Test</title>' +
    '<style>html,body,#root{margin:0;height:100%}body{font-family:Geist,"Segoe UI",system-ui,sans-serif}</style></head>' +
    '<body><div id="root"></div><script type="module" src="shell-main.js"></script></body></html>');

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
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
const errors = [];
page.on("pageerror", e => errors.push(e.message));
page.on("console", m => { if (m.type() === "error") { errors.push(m.text()); } });
const checks = [];
const check = (name, ok, detail = "") => { checks.push(ok); console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${detail ? ` · ${detail}` : ""}`); };

const queries = () => page.evaluate(() => window.__dwgQueries.slice());
const isTile = q => q.includes('"actual"');
let seen = 0;
/** neue Abfragen seit dem letzten Aufruf */
const fresh = async () => { const all = await queries(); const out = all.slice(seen); seen = all.length; return out; };
const settle = async () => {
    await page.waitForTimeout(300);
    await page.waitForFunction(() => [...document.querySelectorAll("[data-dwg-tile]")].length > 0
        && [...document.querySelectorAll("[data-dwg-tile]")].every(t => t.querySelector("svg") || t.querySelector("[role=alert]")), null, { timeout: 30000 });
    await page.waitForTimeout(600);
};
const tileIds = () => page.$$eval("[data-dwg-tile]", els => els.map(e => e.dataset.dwgTile));
const tileTexts = () => page.$$eval("[data-dwg-tile]", els => Object.fromEntries(els.map(e => [e.dataset.dwgTile, e.textContent])));
const pressed = label => page.$$eval(`[data-dwg-slicer="${label}"] button[aria-pressed=true]`, els => els.map(e => e.textContent.trim()));
const slicerButton = (label, value) => `[data-dwg-slicer="${label}"] button[data-value="${value}"]`;
const noAlerts = async () => !(await page.$("[data-dwg-tile] [role=alert], [data-dwg-slicer] [role=alert]"));

await page.goto(`http://localhost:${server.address().port}/index.html`);
await page.waitForSelector(slicerButton("Jahr", "2026"), { timeout: 30000 });
await settle();

// 1. Aufbau
const groups = await page.$$eval("nav[aria-label=Gruppen] a", els => els.map(e => e.textContent.trim()));
check("Navigation zeigt die Gruppen", groups.join("|") === "ChartKitchen · Zeitverlauf|ChartKitchen · Struktur", groups.join(" | "));
const pagesNav = await page.$$eval("nav[aria-label=Seiten] a", els => els.map(e => e.textContent.trim()));
check("Seiten der Gruppe mit Template-Kennung", pagesNav.length === 2 && pagesNav[0].startsWith("C03") && pagesNav[1].startsWith("C05"), pagesNav.join(" | "));
const heading = await page.$eval("[data-dwg-title]", e => e.textContent);
check("Seitentitel mit Kennung", heading === "C03 Säulen im Zeitverlauf", heading);
const desc = await page.$eval("[data-dwg-description]", e => e.textContent).catch(() => "");
check("Erklärtext sichtbar", desc.startsWith("Wie entwickelt sich der Umsatz"));
const years = await page.$$eval('[data-dwg-slicer="Jahr"] button[data-value]', els => els.map(e => e.textContent.trim()));
const countries = await page.$$eval('[data-dwg-slicer="Land"] button[data-value]', els => els.map(e => e.textContent.trim()));
check("Slicer-Werte kommen aus dem Modell", years.join(",") === "2025,2026" && countries.length === 6, `Jahr ${years.join(", ")} · Land ${countries.length} Werte`);
check("leere Werte im Slicer ausgeblendet", !(await page.$(slicerButton("Land", "null"))));
await page.click("[data-dwg-toggle=empty]");
await page.waitForTimeout(200);
check("„Leere Werte zeigen“ blendet (leer) ein", (await page.$eval(slicerButton("Land", "null"), e => e.textContent).catch(() => "")) === "(leer)");
await page.click("[data-dwg-toggle=empty]");
check("Startauswahl Jahr 2026, Land alle", (await pressed("Jahr")).join() === "2026" && (await pressed("Land")).join() === "Alle");
const q0 = await fresh();
const ids = await tileIds();
check("eine Abfrage je Kachel plus eine je Slicer", q0.filter(isTile).length === ids.length && q0.filter(q => !isTile(q)).length === 2,
    `${q0.filter(isTile).length} Kacheln, ${q0.filter(q => !isTile(q)).length} Slicer`);
check("Kachelabfragen tragen den Jahres-Slicer", q0.filter(isTile).every(q => q.includes("TREATAS({2026}, 'Calender'[Year])")));
const box = await page.evaluate(() => {
    const aside = document.querySelector("aside[aria-label=Filter]").getBoundingClientRect();
    const tiles = [...document.querySelectorAll("[data-dwg-tile]")].map(t => t.closest("section").getBoundingClientRect());
    return { asideRight: aside.right, asideWidth: aside.width, tileLeft: Math.min(...tiles.map(t => t.left)) };
});
const stage = await page.evaluate(() => {
    const st = document.querySelector("[data-dwg-stage]");
    const sec = document.querySelector('[data-dwg-tile="monat"]').closest("section");
    const svg = document.querySelector('[data-dwg-tile="monat"] svg');
    return {
        mode: document.querySelector("[data-dwg-shell]").dataset.dwgMode, scale: Number(st?.dataset.dwgScale), stageW: st?.offsetWidth,
        tile: [sec.offsetLeft, sec.offsetTop, sec.offsetWidth, sec.offsetHeight], tileShown: sec.getBoundingClientRect().width,
        svgW: svg?.width.baseVal.value ?? 0,
    };
});
const s0 = 1600 / 1920;
check("Full HD: Bühne 1920 px, als Ganzes skaliert", stage.mode === "fullhd" && stage.stageW === 1920 && Math.abs(stage.scale - s0) < 0.002, `Faktor ${stage.scale}`);
check("Kachel liegt auf dem Raster (Spec-Rechteck in Seitenpixeln)", stage.tile.join() === "327,123,1566,438", stage.tile.join(", "));
check("Visual rechnet in Seitenpixeln, angezeigt skaliert", stage.svgW > 1500 && Math.abs(stage.tileShown / stage.tile[2] - s0) < 0.01, `SVG ${stage.svgW} px, angezeigt ${Math.round(stage.tileShown)} px`);
check("Filter-Panel links, Kacheln rechts davon", box.tileLeft > box.asideRight && Math.abs(box.asideWidth - 300 * s0) < 1, `Panel ${Math.round(box.asideWidth)} px, Kacheln ab ${Math.round(box.tileLeft)} px`);
const titleShown = await page.$eval('[data-dwg-tile="monat"]', el => el.textContent.includes("Umsatz"));
check("Kopfzeilen der Visuals sind aus (Spec-Standard)", (await page.$eval("[data-dwg-toggle=headers]", e => e.getAttribute("aria-pressed"))) === "false");
void titleShown;
check("keine Kachel und kein Slicer meldet einen Fehler", await noAlerts());
await page.screenshot({ path: path.join(OUT, "1-shell.png"), fullPage: true });

// 2. Slicer: Land Germany, dann Jahr 2025
let before = await tileTexts();
await page.click(slicerButton("Land", "Germany"));
await settle();
let q = await fresh();
check("Slicer-Wechsel fragt jede Kachel genau einmal neu ab, Slicer-Werte nicht", q.length === ids.length && q.every(isTile), `${q.length} neue Abfragen`);
check("neue Abfragen tragen beide Slicer", q.every(x => x.includes(`TREATAS({"Germany"}, 'Sales Demo'[Country])`) && x.includes("TREATAS({2026}, 'Calender'[Year])")));
let after = await tileTexts();
check("Kacheln zeigen gefilterte Werte", ids.every(id => after[id] !== before[id]));
await page.click(slicerButton("Land", "Austria"));
await settle();
q = await fresh();
check("Mehrfachauswahl: zwei Länder in einer TREATAS-Liste", q.length === ids.length && q.every(x => x.includes(`TREATAS({"Germany", "Austria"}, 'Sales Demo'[Country])`)));
await page.click(slicerButton("Jahr", "2025"));
await settle();
q = await fresh();
check("Einfachauswahl: Jahr 2025 ersetzt 2026", q.length === ids.length && q.every(x => x.includes("TREATAS({2025}, 'Calender'[Year])") && !x.includes("{2026}")));
check("Slicer zeigen die Auswahl", (await pressed("Jahr")).join() === "2025" && (await pressed("Land")).length === 2);

// 3. Querfilter per Klick zusammen mit den Slicern
const pt = await page.$$eval('[data-dwg-tile="monat"] g.icd-cat', (els) => {
    const g = els[2];
    if (!g) { return null; }
    for (const r of [...g.querySelectorAll("rect")].sort((a, b) => b.getBBox().height * b.getBBox().width - a.getBBox().height * a.getBBox().width)) {
        const b = r.getBoundingClientRect();
        const x = b.x + b.width / 2, y = b.y + b.height / 2;
        if (b.width > 2 && b.height > 2 && g.contains(document.elementFromPoint(x, y))) { return { x, y }; }
    }
    return null;
}, null);
check("Monat in der Kachel ist klickbar", pt !== null);
if (pt) { await page.mouse.click(pt.x, pt.y); }
await settle();
q = await fresh();
check("Querfilter fragt nur die anderen Kacheln neu ab", q.length === ids.length - 1, `${q.length} neue Abfragen`);
check("Querfilter und Slicer gelten gemeinsam", q.length > 0 && q.every(x => x.includes(`TREATAS({"Mär"}, 'Calender'[Month Name Short])`)
    && x.includes("TREATAS({2025}, 'Calender'[Year])") && x.includes(`'Sales Demo'[Country]`)));
const chip = await page.$eval("button[title='Filter aufheben']", el => el.textContent).catch(() => "");
check("Filter-Chip erscheint", chip.includes("Mär"), chip.trim());
check("keine Fehler nach dem Filtern", await noAlerts());
await page.screenshot({ path: path.join(OUT, "2-filter.png"), fullPage: true });

// 4. Zurücksetzen
if (chip) { await page.click("button[title='Filter aufheben']"); }
await settle();
await fresh();
await page.click("aside[aria-label=Filter] >> text=Zurücksetzen");
await settle();
q = await fresh();
check("Zurücksetzen: Startauswahl, jede Kachel einmal neu", q.length === ids.length && q.every(x => x.includes("TREATAS({2026}, 'Calender'[Year])") && !x.includes("'Sales Demo'[Country])")),
    `${q.length} neue Abfragen`);
check("Zurücksetzen ist danach inaktiv",
    await page.$$eval("aside[aria-label=Filter] button", els => els.some(e => e.textContent === "Zurücksetzen" && e.disabled)));

// 5. Seitenwechsel: nur die neue Seite fragt ab, Slicer bleiben
await page.click(slicerButton("Land", "Germany"));
await settle();
await fresh();
await page.click("nav[aria-label=Gruppen] >> text=ChartKitchen · Struktur");
await settle();
q = await fresh();
const ids2 = await tileIds();
check("Seitenwechsel fragt nur die Kacheln der neuen Seite ab", ids2.join() === "laender" && q.length === 1, `${q.length} Abfragen, Kacheln ${ids2.join(", ")}`);
check("Slicer gelten auch auf der neuen Seite", q.every(x => x.includes(`TREATAS({"Germany"}, 'Sales Demo'[Country])`)));
check("Link und Titel der neuen Seite", (await page.evaluate(() => location.hash)) === "#c07" && (await page.$eval("[data-dwg-title]", e => e.textContent)) === "C07 Abweichung nach Land");
await page.screenshot({ path: path.join(OUT, "3-seite.png"), fullPage: true });
await page.goto(`http://localhost:${server.address().port}/index.html#c05`);
await page.waitForSelector(slicerButton("Jahr", "2026"), { timeout: 30000 });
await settle();
check("Link #c05 öffnet die Seite", (await page.$eval("[data-dwg-title]", e => e.textContent)) === "C05 Brücke über die Monate");
seen = (await queries()).length;

// 6. Auflösung, Kopfzeilen, sticky Kopf: keine neuen Abfragen
const textOf = () => page.$eval('[data-dwg-tile="bruecke"]', el => el.textContent);
const withoutHeader = await textOf();
await page.click("[data-dwg-toggle=headers]");
await page.waitForTimeout(600);
const withHeader = await textOf();
check("Kopfzeilen an: Titelblock erscheint im Visual", withHeader.length > withoutHeader.length && withHeader.includes("Umsatz"), `${withoutHeader.length} → ${withHeader.length} Zeichen`);
await page.click("[data-dwg-toggle=headers]");
await page.waitForTimeout(400);
await page.click("[data-dwg-resolution=hd]");
await page.waitForTimeout(800);
const hd = await page.evaluate(() => {
    const st = document.querySelector("[data-dwg-stage]");
    const sec = document.querySelector('[data-dwg-tile="bruecke"]').closest("section");
    return { mode: document.querySelector("[data-dwg-shell]").dataset.dwgMode, stageW: st?.offsetWidth, tileW: sec.offsetWidth, scale: Number(st?.dataset.dwgScale) };
});
check("HD: Bühne 1280 px, Kachel 2/3 so breit, größer skaliert", hd.mode === "hd" && hd.stageW === 1280 && hd.tileW === 1044 && Math.abs(hd.scale - 1600 / 1280) < 0.002, `Kachel ${hd.tileW} px, Faktor ${hd.scale}`);
await page.screenshot({ path: path.join(OUT, "4a-hd.png"), fullPage: true });
await page.click("[data-dwg-resolution=responsive]");
await page.waitForTimeout(800);
check("Fließend: keine Bühne, Kacheln skalieren", (await page.$("[data-dwg-stage]")) === null && (await page.$eval("[data-dwg-shell]", e => e.dataset.dwgMode)) === "responsive");
await page.screenshot({ path: path.join(OUT, "4b-fliessend.png"), fullPage: true });
await page.click("[data-dwg-resolution=fullhd]");
await page.waitForTimeout(800);
await page.setViewportSize({ width: 1600, height: 600 });
await page.mouse.wheel(0, 400);
await page.waitForTimeout(300);
const sticky = await page.$eval("[data-dwg-topbar]", e => Math.round(e.getBoundingClientRect().top));
check("Kopfleiste bleibt beim Scrollen stehen", sticky === 0 && (await page.evaluate(() => window.scrollY)) > 0, `top ${sticky} px`);
await page.evaluate(() => window.scrollTo(0, 0));
await page.setViewportSize({ width: 1000, height: 900 });
await page.waitForTimeout(800);
const minScale = await page.evaluate(() => ({ scale: Number(document.querySelector("[data-dwg-stage]")?.dataset.dwgScale), scroll: document.querySelector("[data-dwg-body]").scrollWidth }));
check("unter 1152 px: Mindestfaktor, waagerecht scrollen", Math.abs(minScale.scale - 0.6) < 0.001 && minScale.scroll >= 1152, `Faktor ${minScale.scale}, Breite ${minScale.scroll} px`);
await page.setViewportSize({ width: 1600, height: 1100 });
await page.waitForTimeout(600);
q = await fresh();
check("Auflösung, Kopfzeilen und Fenstergröße lösen keine Abfragen aus", q.length === 0, `${q.length} Abfragen`);

// 7. Dark Mode und schmales Fenster ohne neue Abfragen
await page.click("#theme");
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(OUT, "4-dunkel.png"), fullPage: true });
await page.setViewportSize({ width: 760, height: 1300 });
await page.waitForTimeout(900);
const narrow = await page.evaluate(() => {
    const aside = document.querySelector("aside[aria-label=Filter]").getBoundingClientRect();
    const tile = document.querySelector("[data-dwg-tile]").closest("section").getBoundingClientRect();
    return { asideBottom: aside.bottom, asideWidth: aside.width, tileTop: tile.top, scroll: document.documentElement.scrollWidth };
});
check("schmal: Filter-Panel über den Kacheln, volle Breite", narrow.asideBottom <= narrow.tileTop && narrow.asideWidth > 700, `Panel ${Math.round(narrow.asideWidth)} px`);
check("schmal: kein seitliches Scrollen", narrow.scroll <= 760, `${narrow.scroll} px`);
await page.screenshot({ path: path.join(OUT, "5-schmal.png"), fullPage: true });
q = await fresh();
check("Theme und Fenstergröße lösen keine Abfragen aus", q.length === 0, `${q.length} Abfragen`);
check("keine Fehler in der Konsole", errors.length === 0, errors.slice(0, 3).join(" | "));

await browser.close();
server.close();
const failed = checks.filter(c => !c).length;
console.log(failed ? `\nshell: ${failed} Prüfung(en) fehlgeschlagen` : `\nshell: alle ${checks.length} Prüfungen grün`);
process.exit(failed ? 1 : 0);
