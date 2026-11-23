// Browser-Durchlauf der Showcase-Spec (specs/showcase.json, in eine Minimal-App erzeugt): echter Code, Konnektor per Mini-DAX auf dem
// Showcase-Datensatz (datasets/showcase.mjs). Jede Seite einmal: Kacheln rendern ohne Fehler, eine Abfrage je
// Kachel, Erklärtext sichtbar, Δ in Basisskala (ChartKitchen); Screenshot je Seite unter app/test/out/showcase/<nr>-<template>.png.
//
// Die Bühne passt in die Fensterhöhe (ganze Seite ohne senkrechtes Scrollen), P&L-Tabellen laufen nicht über ihre Kachel.
//
//   node app/test/showcase-e2e.mjs [--only C03,T03A] [--width 1440 --height 900] [--panel closed] [--dark]
import esbuild from "esbuild";
import fs from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { minimalApp } from "./minimal-app.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
// --spec: eine andere Spec auf dem Showcase-Modell (z. B. aus `dwg mockup import`), --name: Ordner unter out/
const argOf = k => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : null; };
const SPEC_FILE = path.resolve(argOf("spec") ?? path.join(ROOT, "specs", "showcase.json"));
const PANEL = argOf("panel") === "closed" ? "closed" : "open";
const DARK = process.argv.includes("--dark");
const OUT = path.join(HERE, "out", argOf("name") ?? [argOf("width") ? `showcase-${argOf("width")}` : "showcase", PANEL === "closed" ? "zu" : "", DARK ? "dunkel" : ""].filter(Boolean).join("-"));
const onlyArg = process.argv.indexOf("--only");
const ONLY = onlyArg > 0 ? new Set(process.argv[onlyArg + 1].split(",")) : null;
const num = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? Number(process.argv[i + 1]) : d; };
const VIEW = { width: num("width", 1920), height: num("height", 1200) };
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "harness"), { recursive: true });

const showcaseSpec = JSON.parse(fs.readFileSync(SPEC_FILE, "utf8"));
const { app: APP, src: SRC } = await minimalApp(path.join(OUT, "app"), showcaseSpec,
    { connector: "showcase", model: path.join(ROOT, "examples", "showcase", "ZlatyLev Showcase.SemanticModel") });
const appFile = fs.readdirSync(path.join(SRC, "dwg", "apps")).find(f => f.endsWith(".ts"));
const withExt = p => [".tsx", ".ts", ""].map(e => p + e).find(f => fs.existsSync(f)) ?? p;
const harnessResolve = {
    name: "harness-resolve",
    setup(build) {
        build.onResolve({ filter: /^@\/hooks\/use-semantic-model-query$/ }, () => ({ path: path.join(HERE, "harness", "mock-minidax.ts") }));
        build.onResolve({ filter: /^@app\// }, a => ({ path: withExt(path.join(SRC, a.path.slice(5))) }));
        build.onResolve({ filter: /^@shell$/ }, () => ({ path: path.join(SRC, "dwg", "apps", appFile) }));
        build.onResolve({ filter: /^@dataset$/ }, () => ({ path: path.join(HERE, "datasets", "showcase.mjs") }));
    },
};
const reactBase = [path.join(APP, "node_modules"), path.join(HERE, "..", "..", "node_modules")]
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
    '<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Showcase · Test</title>' +
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
const base = `http://localhost:${server.address().port}/index.html`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: VIEW });
// Filter-Panel eingeklappt starten (Zustand der Shell im localStorage)
await page.addInitScript(p => { try { localStorage.setItem("dwg-filter-panel", p); } catch { /* ohne Speicher */ } }, PANEL);
let errors = [];
page.on("pageerror", e => errors.push(e.message));
page.on("console", m => { if (m.type() === "error") { errors.push(m.text()); } });

const settle = async () => {
    await page.waitForTimeout(300);
    await page.waitForFunction(() => [...document.querySelectorAll("[data-dwg-tile]")].length > 0
        && [...document.querySelectorAll("[data-dwg-tile]")].every(t => t.querySelector("svg") || t.querySelector("[role=alert]")), null, { timeout: 45000 });
    await page.waitForTimeout(800);
};

await page.goto(base);
await page.waitForSelector("nav[aria-label=Gruppen] a", { timeout: 45000 });
if (DARK) { await page.click("#theme"); }
// alle Seiten-Links einsammeln: je Gruppe anklicken, dann die Seiten-Links lesen
const groupCount = await page.$$eval("nav[aria-label=Gruppen] a", els => els.length);
const pages = [];
for (let g = 0; g < groupCount; g++) {
    await page.$$eval("nav[aria-label=Gruppen] a", (els, i) => els[i].click(), g);
    await page.waitForTimeout(200);
    for (const p of await page.$$eval("nav[aria-label=Seiten] a", els => els.map(e => ({ href: e.getAttribute("href"), label: e.textContent.trim() })))) {
        if (!pages.some(x => x.href === p.href)) { pages.push(p); }
    }
}

const results = [];
let n = 0;
let persistChecked = false;
for (const p of pages) {
    const tpl = (/^(C\d\d|T\d\d[A-Z]|1[12][A-Z])/.exec(p.label) ?? [p.label.split(/\s+/)[0]])[0];
    if (ONLY && !ONLY.has(tpl)) { continue; }
    n++;
    errors = [];
    const before = await page.evaluate(() => window.__dwgQueries.length);
    await page.evaluate(h => { window.location.hash = h; }, p.href.replace(/^.*#/, "#"));
    let ok = true, detail = "";
    try { await settle(); } catch { ok = false; detail = "Timeout beim Rendern"; }
    const tiles = await page.$$eval("[data-dwg-tile]", els => els.map(e => ({
        id: e.dataset.dwgTile, svg: e.querySelectorAll("svg *").length, alert: e.querySelector("[role=alert]")?.textContent ?? "",
    })));
    const queries = (await page.evaluate(() => window.__dwgQueries.length)) - before;
    const desc = await page.$eval("[data-dwg-description]", e => e.textContent.trim()).catch(() => "");
    // IBCS: absolute Abweichung in derselben Skala wie die Basis (ISO 24896). Je Kategoriegruppe von ChartKitchen:
    // Δ-Element (Teal/Rot/Schraffur) muss so lang sein wie |AC − Vergleich|; eine ausgewiesene Lupe (data-icd=scale-zoom,
    // data-factor) gilt als zulässiger Faktor. Gemessen wird ohne Beschriftungen direkt an den Rechtecken.
    const scale = await page.$$eval("[data-dwg-tile]", (els) => els.map((el) => {
        const AC = "#404040", PY = "#B3B3B3", GOOD = "#1E8F9E", BAD = "#D64541";
        const zoomEl = el.querySelector('[data-icd="scale-zoom"]');
        const zoom = zoomEl ? parseFloat(zoomEl.getAttribute("data-factor")) || 1 : 1;
        const fill = (r) => (r.getAttribute("fill") || "").toUpperCase();
        const num = (r, a) => parseFloat(r.getAttribute(a)) || 0;
        const out = [];
        for (const g of el.querySelectorAll("g.icd-cat")) {
            const rects = [...g.querySelectorAll(":scope > rect")];
            const ai = rects.findIndex((r) => fill(r) === AC);
            if (ai < 0) { continue; }
            const ac = rects[ai];
            const ref = rects.slice(0, ai).concat(rects.slice(ai + 1)).find((r) =>
                fill(r) === PY || ((fill(r) === "#FFFFFF" || fill(r) === "WHITE" || fill(r) === "NONE") && r.getAttribute("stroke")));
            // Balken (waagerecht): AC und Vergleich beginnen am selben x und sind gleich hoch oder flach (C17: PY
            // schmaler als AC); sonst Säulen
            const horizontal = ref && Math.abs(num(ac, "x") - num(ref, "x")) < 0.5
                && (Math.abs(num(ac, "height") - num(ref, "height")) < 0.5 || num(ac, "height") < num(ac, "width"));
            const len = (r) => (horizontal ? num(r, "width") : num(r, "height"));
            // FC-Teil auf dem AC-Sockel (Jahressäule C19: AC + FC schraffiert gegen PL) gehört zur Basis, das Δ ist die
            // Schraffur in Gut-/Schlecht-Farbe (ICD-HATCH-BAD/-GOOD) bzw. das Teal-/Rot-Rechteck
            const fcPart = rects.slice(ai + 1).find((r) => /^URL\(#ICD-HATCH-\d/.test(fill(r)));
            const d = rects.slice(ai + 1).find((r) => [GOOD, BAD].includes(fill(r)) || /^URL\(#ICD-HATCH-(BAD|GOOD)/.test(fill(r))
                || (/^URL\(/.test(fill(r)) && r !== fcPart));
            if (!ref || !d) { continue; }
            const want = Math.abs(len(ac) + (fcPart ? len(fcPart) : 0) - len(ref)) * zoom, got = len(d);
            if (want < 2 && got < 3) { continue; }            // Mindesthöhe für sehr kleine Abweichungen
            out.push(Math.abs(got - want));
        }
        return { id: el.dataset.dwgTile, n: out.length, maxDev: out.length ? Math.max(...out) : 0, zoom };
    }));
    const scaleBad = scale.filter((s) => s.n > 0 && s.maxDev > 2);
    // ganze Seite im Fenster: Bühne endet über der Fensterkante; P&L: Tabelle läuft nicht über die Kachel (kein Bildlauf)
    const fit = await page.evaluate(() => {
        const st = document.querySelector("[data-dwg-stage]");
        // Überlauf am Inhalt: Unterkante des letzten Blocks ohne Innenabstand (wie contentOverflow in DwgPage)
        const over = (r) => {
            const last = r.lastElementChild; if (!last) { return 0; }
            const box = r.getBoundingClientRect(), k = r.offsetHeight ? box.height / r.offsetHeight : 1;
            const pad = parseFloat(getComputedStyle(last).paddingBottom) || 0;
            return Math.round((last.getBoundingClientRect().bottom - box.top) / k + r.scrollTop - pad - r.clientHeight);
        };
        const pnl = [...document.querySelectorAll(".pnl-root")].map(r => ({ id: r.closest("[data-dwg-tile]")?.dataset.dwgTile,
            over: over(r), h: r.clientHeight }));
        return { bottom: st ? Math.round(st.getBoundingClientRect().bottom) : 0, scrollH: document.documentElement.scrollHeight, pnl };
    });
    const problems = [
        ...scaleBad.map((s) => `${s.id}: Δ nicht in Basisskala (max. Abweichung ${s.maxDev.toFixed(1)} px über ${s.n} Kategorien${s.zoom !== 1 ? `, Lupe ×${s.zoom}` : ""})`),
        ...tiles.filter(t => t.alert).map(t => `${t.id}: ${t.alert.slice(0, 120)}`),
        ...tiles.filter(t => !t.alert && t.svg < 20).map(t => `${t.id}: nur ${t.svg} SVG-Elemente`),
        ...(desc ? [] : ["kein Erklärtext"]),
        ...(fit.bottom > VIEW.height + 1 ? [`Seite endet bei ${fit.bottom} px, Fenster ${VIEW.height} px`] : []),
        // bis 4 px: Rundung beim Füllen der Kachel (layout.maximize, NEED_TOLERANCE in DwgPage)
        ...fit.pnl.filter(t => t.over > 4).map(t => `${t.id}: P&L läuft ${t.over} px über die Kachel (${t.h} px)`),
        ...errors.slice(0, 2).map(e => `Konsole: ${e.slice(0, 120)}`),
    ];
    ok = ok && problems.length === 0;
    const file = `${String(n).padStart(2, "0")}-${tpl}.png`;
    await page.screenshot({ path: path.join(OUT, file) });
    results.push({ tpl, label: p.label, ok, tiles: tiles.length, queries, problems: [detail, ...problems].filter(Boolean), file });
    // einmal je Lauf, auf der ersten Seite mit ChartKitchen-Karten: der Zustand des Visuals überlebt ein update() der
    // App. Der Sortier-Chip der Karten schreibt chart.cardSortSel per persistProperties, und ChartKitchen liest den
    // Wert bei jedem Update aus den Objekten; setzte der Adapter die Spec-Objekte neu auf (Theme-Wechsel, neue
    // Abfrage), sprang die Reihenfolge zurück.
    const chip = '[data-dwg-tile] button:has-text("Sortieren"), [data-dwg-tile] [role=button]:has-text("Sortieren")';
    if (ok && !persistChecked && await page.$(chip)) {
        persistChecked = true;
        // Kartentitel: Texte ohne Ziffern und ohne Kennzeichen von Werten (Δ, %, ±, Σ)
        const cards = () => page.$$eval('[data-dwg-tile] svg text', els => els.map(e => e.textContent.trim()).filter(t => /^[^\d%+\-−Δ·Σ]{3,}$/.test(t)).slice(0, 6).join(","));
        const before = await cards();
        await page.click(chip);
        await page.waitForTimeout(600);
        const sorted = await cards();
        await page.click("text=Hell / Dunkel");
        await page.waitForTimeout(800);
        const after = await cards();
        await page.click("text=Hell / Dunkel");
        await page.waitForTimeout(400);
        const good = sorted !== before && after === sorted;
        console.log(`  ${good ? "ok  " : "FAIL"} Zustand des Visuals bleibt nach update(): Karten ${before} → Chip ${sorted} → Theme ${after}`);
        results.push({ tpl: "persist", label: `Zustand nach update() (${p.label})`, ok: good, tiles: 0, queries: 0,
            problems: good ? [] : [`Karten ${before} → ${sorted} → ${after}`], file: "" });
    }
    const measured = scale.filter((s) => s.n > 0).map((s) => `${s.id} Δ-Skala geprüft (${s.n} Kat.${s.zoom !== 1 ? `, Lupe ×${s.zoom}` : ""})`);
    console.log(`  ${ok ? "ok  " : "FAIL"} ${p.label} · ${tiles.length} Kacheln, ${queries} Abfragen${measured.length ? ` · ${measured.join(", ")}` : ""}${problems.length ? ` · ${problems.join(" | ")}` : ""}`);
}
await browser.close();
server.close();
fs.writeFileSync(path.join(OUT, "ergebnis.json"), JSON.stringify(results, null, 2));
const failed = results.filter(r => !r.ok).length;
console.log(`\nShowcase: ${results.length - failed}/${results.length} Seiten ohne Befund (Screenshots unter ${path.relative(ROOT, OUT)})`);
process.exit(failed ? 1 : 0);
