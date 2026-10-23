// Browser-Durchlauf der Showcase-Spec (specs/showcase.json, in eine Minimal-App erzeugt): echter Code, Konnektor per Mini-DAX auf dem
// Showcase-Datensatz (datasets/showcase.mjs). Jede Seite einmal: Kacheln rendern ohne Fehler, eine Abfrage je
// Kachel, Erklärtext sichtbar, Δ in Basisskala (ChartKitchen); Screenshot je Seite unter app/test/out/showcase/<nr>-<template>.png.
//
//   node app/test/showcase-e2e.mjs [--only C03,T03A] [--width 1440 --height 900]
import esbuild from "esbuild";
import fs from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { minimalApp } from "./minimal-app.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const OUT = path.join(HERE, "out", process.argv.includes("--width") ? `showcase-${process.argv[process.argv.indexOf("--width") + 1]}` : "showcase");
const onlyArg = process.argv.indexOf("--only");
const ONLY = onlyArg > 0 ? new Set(process.argv[onlyArg + 1].split(",")) : null;
const num = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? Number(process.argv[i + 1]) : d; };
const VIEW = { width: num("width", 1920), height: num("height", 1200) };
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "harness"), { recursive: true });

const showcaseSpec = JSON.parse(fs.readFileSync(path.join(ROOT, "specs", "showcase.json"), "utf8"));
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
for (const p of pages) {
    const tpl = (/^(C\d\d|T\d\d[A-Z]|12[A-Z])/.exec(p.label) ?? [p.label.split(/\s+/)[0]])[0];
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
            // Balken (waagerecht): AC und Vergleich beginnen am selben x und sind gleich hoch; sonst Säulen
            const horizontal = ref && Math.abs(num(ac, "x") - num(ref, "x")) < 0.5 && Math.abs(num(ac, "height") - num(ref, "height")) < 0.5;
            const len = (r) => (horizontal ? num(r, "width") : num(r, "height"));
            const d = rects.slice(ai + 1).find((r) => [GOOD, BAD].includes(fill(r)) || /^URL\(/.test(fill(r)));
            if (!ref || !d) { continue; }
            const want = Math.abs(len(ac) - len(ref)) * zoom, got = len(d);
            if (want < 2 && got < 3) { continue; }            // Mindesthöhe für sehr kleine Abweichungen
            out.push(Math.abs(got - want));
        }
        return { id: el.dataset.dwgTile, n: out.length, maxDev: out.length ? Math.max(...out) : 0, zoom };
    }));
    const scaleBad = scale.filter((s) => s.n > 0 && s.maxDev > 2);
    const problems = [
        ...scaleBad.map((s) => `${s.id}: Δ nicht in Basisskala (max. Abweichung ${s.maxDev.toFixed(1)} px über ${s.n} Kategorien${s.zoom !== 1 ? `, Lupe ×${s.zoom}` : ""})`),
        ...tiles.filter(t => t.alert).map(t => `${t.id}: ${t.alert.slice(0, 120)}`),
        ...tiles.filter(t => !t.alert && t.svg < 20).map(t => `${t.id}: nur ${t.svg} SVG-Elemente`),
        ...(desc ? [] : ["kein Erklärtext"]),
        ...errors.slice(0, 2).map(e => `Konsole: ${e.slice(0, 120)}`),
    ];
    ok = ok && problems.length === 0;
    const file = `${String(n).padStart(2, "0")}-${tpl}.png`;
    await page.screenshot({ path: path.join(OUT, file), fullPage: true });
    results.push({ tpl, label: p.label, ok, tiles: tiles.length, queries, problems: [detail, ...problems].filter(Boolean), file });
    const measured = scale.filter((s) => s.n > 0).map((s) => `${s.id} Δ-Skala geprüft (${s.n} Kat.${s.zoom !== 1 ? `, Lupe ×${s.zoom}` : ""})`);
    console.log(`  ${ok ? "ok  " : "FAIL"} ${p.label} · ${tiles.length} Kacheln, ${queries} Abfragen${measured.length ? ` · ${measured.join(", ")}` : ""}${problems.length ? ` · ${problems.join(" | ")}` : ""}`);
}
await browser.close();
server.close();
fs.writeFileSync(path.join(OUT, "ergebnis.json"), JSON.stringify(results, null, 2));
const failed = results.filter(r => !r.ok).length;
console.log(`\nShowcase: ${results.length - failed}/${results.length} Seiten ohne Befund (Screenshots unter ${path.relative(ROOT, OUT)})`);
process.exit(failed ? 1 : 0);
