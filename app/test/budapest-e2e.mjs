// Browser-Test (Playwright/Chromium) der Budapest-Demo: specs/budapest-demo.json mit `dwg app page` in eine Minimal-App,
// ganze App im Rahmen (DwgShell) mit englischer Bedienung (lang: en) und en-US in den Visuals, Antworten per Mini-DAX
// auf dem Budapest-Demo-Set (datasets/budapest.mjs). Je Seite (custom-viz, group-p-l, plan-gap) ein frischer Browser-
// Kontext. Geprüft: Rendern, eine Abfrage je Kachel, englische Texte ohne deutsche Wörter, Slicer des Berichts,
// Filter-Panel einklappen ohne Abfrage, Slicer Region per TREATAS, Kontrollwerte im P&L (en-US), Optionen-Panel der
// P&L-Kachel (Zeilen, Abweichung, PY, Einheiten, ein- und ausklappen), eigene Bedienleiste der P&L, eine Wahl im Panel
// gewinnt über die Ebene, die das Visual selbst gespeichert hat, Querfilter per Klick, Dark Mode.
//
//   node app/test/budapest-e2e.mjs [--page custom-viz|group-p-l|plan-gap]     Screenshots unter app/test/out/budapest/
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
const OUT = path.join(HERE, "out", "budapest");
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const PAGES = arg("page") ? [arg("page")] : ["custom-viz", "group-p-l", "plan-gap"];
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "harness"), { recursive: true });

// Felder ohne TMDL (das Modell liegt nicht im Repo); die Abfragen prüft budapest.mjs gegen die Kontrollwerte
const spec = JSON.parse(fs.readFileSync(path.join(ROOT, "specs", "budapest-demo.json"), "utf8"));
const { src: SRC, gen } = await minimalApp(path.join(OUT, "app"), spec, { connector: "budapest" });

const withExt = p => [".tsx", ".ts", ""].map(e => p + e).find(f => fs.existsSync(f)) ?? p;
const harnessResolve = {
    name: "harness-resolve",
    setup(build) {
        build.onResolve({ filter: /^@\/hooks\/use-semantic-model-query$/ }, () => ({ path: path.join(HERE, "harness", "mock-minidax.ts") }));
        build.onResolve({ filter: /^@app\// }, a => ({ path: withExt(path.join(SRC, a.path.slice(5))) }));
        build.onResolve({ filter: /^@shell$/ }, () => ({ path: withExt(path.join(SRC, "dwg", "apps", gen.app)) }));
        build.onResolve({ filter: /^@dataset$/ }, () => ({ path: path.join(HERE, "datasets", "budapest.mjs") }));
    },
};
const reactFrom = createRequire(path.join(ROOT, "node_modules", "x.js"));
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
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>dwg Budapest · Test</title>' +
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

const checks = [];
const check = (name, ok, detail = "") => { checks.push(ok); console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${detail ? ` · ${detail}` : ""}`); };
// Tausendertrennzeichen (Komma oder schmales Leerzeichen) und Leerraum entfernen, damit Werte vergleichbar sind
const flat = x => x.replace(/[\s   ,]/g, "");
/** Deutsche Wörter, die in einer englischen App weder im Rahmen noch in den Visuals stehen dürfen */
const GERMAN = /Gesamt|rundungsbedingt|Mio\.|Summe|Abweichung|Vorjahr|\bJanuar\b|\bMär\b|\bOkt\b|\bDez\b|lädt|Zurücksetzen|\bAlle\b|Kopfzeilen|Seiten?\b|Filter-Panel|Erneut|Optionen/g;

async function runPage(pageId) {
    console.log(`\nSeite ${pageId}`);
    const shotDir = path.join(OUT, pageId);
    fs.mkdirSync(shotDir, { recursive: true });
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    page.on("console", m => { if (m.type() === "error") { errors.push(m.text()); } });
    const shot = name => page.screenshot({ path: path.join(shotDir, name) });
    // im Rahmen fragen auch die Slicer ab; Kachelabfragen erkennt man an benannten Kennzahl-Spalten
    const tileQueries = () => page.evaluate(() => window.__dwgQueries.slice()).then(qs => qs.filter(q => /"[A-Za-z]+", /.test(q)));
    const settle = async () => {
        await page.waitForTimeout(400);
        await page.waitForFunction(() => [...document.querySelectorAll("[data-dwg-tile]")].length > 0
            && [...document.querySelectorAll("[data-dwg-tile]")].every(t => t.querySelector("svg") || t.querySelector("[role=alert]")), null, { timeout: 30000 });
        await page.waitForTimeout(500);
    };
    const rects = () => page.$$eval("[data-dwg-tile]", els => els.map(e => {
        const r = e.closest("section").getBoundingClientRect();
        return { id: e.dataset.dwgTile, left: Math.round(r.left), width: Math.round(r.width) };
    }));

    await page.goto(`http://localhost:${server.address().port}/index.html#${pageId}`);
    await settle();
    const ids = await page.$$eval("[data-dwg-tile]", els => els.map(e => e.dataset.dwgTile));
    for (const id of ids) {
        const n = await page.$$eval(`[data-dwg-tile="${id}"] svg *`, els => els.length);
        check(`Kachel ${id} rendert`, n > 20, `${n} SVG-Elemente`);
    }
    check("keine Kachel meldet einen Fehler", !(await page.$("[data-dwg-tile] [role=alert]")),
        await page.$$eval("[data-dwg-tile] [role=alert]", els => els.map(e => e.textContent).join(" | ")));
    const n0 = (await tileQueries()).length;
    check("eine DAX-Abfrage je Kachel", n0 === ids.length, `${n0} Abfragen für ${ids.length} Kacheln`);

    // Englisch: Rahmen und Visuals
    const ui = await page.$eval("[data-dwg-shell]", e => e.textContent);
    const allPill = await page.$eval('[data-dwg-slicer="Region"] button:not([data-value])', e => e.textContent.trim()).catch(() => "");
    const missing = [/Filters/, /Reset/, /Headers (on|off)/].filter(rx => !rx.test(ui)).map(String).concat(allPill === "All" ? [] : [`Slicer-Knopf „${allPill}“`]);
    check("Rahmen englisch (Filters, All, Reset, Headers)", missing.length === 0, missing.join(", "));
    check("lang=en am Rahmen", (await page.$eval("[data-dwg-shell]", e => e.getAttribute("lang"))) === "en");
    const de = ui.match(GERMAN) ?? [];
    check("keine deutschen Wörter in Rahmen und Visuals", de.length === 0, [...new Set(de)].join(", "));
    const labels = await page.$$eval("[data-dwg-shell] [aria-label], [data-dwg-shell] [title], [data-dwg-shell] [placeholder]",
        els => els.flatMap(e => ["aria-label", "title", "placeholder"].map(a => e.getAttribute(a)).filter(Boolean)));
    const deLabels = labels.filter(l => /Seite|Filter-Panel|einklappen|Zurücksetzen|Auflösung|Kopfzeilen|Optionen|entfernen|aufheben/.test(l));
    check("keine deutschen Beschriftungen (aria-label, title)", deLabels.length === 0, deLabels.slice(0, 3).join(" | "));
    check("keine Gedankenstriche in den Texten des Rahmens", !/ [–—] /.test(ui));
    const slicers = await page.$$eval("[data-dwg-slicer]", els => els.map(e => e.dataset.dwgSlicer));
    check("Filter-Panel mit den Slicern des Berichts", slicers.join("|") === "Year|Region|Country|Currency|Company|Close status", slicers.join(" | "));
    const fixed = await page.$$eval("[data-dwg-fixed-filter]", els => els.map(e => e.textContent.trim()));
    check("feste Filter als Chips (Period Status)", fixed.includes("Period Status: Actual"), fixed.join(" | "));

    // Seitenmenü ☰: drei Seiten, englisch
    await page.click("[data-dwg-menu-toggle]");
    await page.waitForSelector("[data-dwg-menu]");
    const menu = await page.$$eval("[data-dwg-menu] a[href]", els => els.map(e => e.textContent.trim()));
    const menuText = await page.$eval("[data-dwg-menu]", e => e.textContent);
    check("Seitenmenü: drei Seiten, englische Texte", menu.join("|") === "Custom Viz|Group P&L|Plan gap" && /3 pages/.test(menuText), `${menu.join(" | ")} · ${menuText.slice(0, 40)}`);
    await page.keyboard.press("Escape");
    await shot("1-filters-open.png");

    // Filter-Panel einklappen: Kacheln über die ganze Breite, keine Abfrage, Filterleiste englisch
    const open = await rects();
    await page.click("[data-dwg-toggle=panel]");
    await settle();
    const closed = await rects();
    check("eingeklappt: Kacheln rücken nach links und werden breiter", closed.every((r, i) => r.left < open[i].left && r.width > open[i].width),
        closed.map((r, i) => `${r.id} ${open[i].width}→${r.width} px`).join(", "));
    const bar = await page.$eval("[data-dwg-filterbar]", e => e.textContent);
    check("Filterleiste englisch, aktiver Slicer Year als Chip", /Filters/.test(bar) && /Year: 2026/.test(bar) && !GERMAN.test(bar), bar.slice(0, 80));
    GERMAN.lastIndex = 0;
    check("Einklappen löst keine Abfrage aus", (await tileQueries()).length === n0);
    await shot("2-filters-collapsed.png");
    await page.click("[data-dwg-toggle=filter]");
    await settle();
    check("wieder aufgeklappt, Kacheln an ihrem Platz, Year bleibt 2026", JSON.stringify(await rects()) === JSON.stringify(open)
        && (await page.$$eval('[data-dwg-slicer="Year"] button[aria-pressed=true]', els => els.map(e => e.textContent.trim()))).join() === "2026");
    check("Aufklappen löst keine Abfrage aus", (await tileQueries()).length === n0);

    let added = 0;
    if (pageId === "custom-viz") {
        await page.click('[data-dwg-slicer="Region"] button[data-value="EMEA"]');
        await settle();
        let q = (await tileQueries()).slice(n0);
        check("Slicer Region EMEA: je Kachel eine Abfrage mit TREATAS", q.length === ids.length && q.every(x => x.includes(`TREATAS({"EMEA"}, 'dim-region'[Region])`)), `${q.length} Abfragen`);
        await shot("3-region-emea.png");
        await page.click('[data-dwg-slicer="Region"] button:not([data-value])');
        await settle();
        q = (await tileQueries()).slice(n0);
        added = q.length;
        check("Region wieder All: je Kachel eine weitere Abfrage ohne EMEA", q.length === 2 * ids.length && q.slice(ids.length).every(x => !x.includes("EMEA")));
    }

    if (pageId === "group-p-l") {
        const id = "pnl";
        const text = () => page.$eval(`[data-dwg-tile="${id}"]`, e => e.textContent);
        const rows = () => page.$$eval(`[data-dwg-tile="${id}"] svg text`, els => els.length);
        const t0 = await text();
        // Kontrollwerte Jan bis Okt 2026 (Mio. EUR) in en-US
        for (const [name, v] of [["Revenue AC", "2,817.6"], ["Revenue PL", "2,782.1"], ["Revenue PY", "2,498.1"], ["Gross profit AC", "942.8"], ["Gross profit PL", "957.0"],
            ["EBITDA AC", "400.5"], ["EBITDA PL", "424.2"], ["Net income AC", "151.6"], ["Net income PL", "176.3"]]) {
            check(`P&L zeigt Kontrollwert ${name} ${v}`, flat(t0).includes(flat(v)));
        }
        check("P&L rechnet en-US (Dezimalpunkt: 2,817.6 bzw. 2 817.6, nicht 2.817,6)", /2[\s,  ]?817\.6/.test(t0) && !/2\.817,6/.test(t0));
        check("Optionen-Panel neben der P&L ist offen", Boolean(await page.$(`[data-dwg-options="${id}"]`)));
        const choice = async (opt, label) => {
            await page.click(`[data-dwg-options="${id}"] [data-dwg-option="${opt}"] button[data-choice="${label}"]`);
            await page.waitForTimeout(700);
        };
        const pressed = opt => page.$eval(`[data-dwg-options="${id}"] [data-dwg-option="${opt}"] button[aria-pressed=true]`, e => e.textContent).catch(() => "");
        const state = async () => [await pressed("rows"), await pressed("variance"), await pressed("py"), await pressed("pl"), await pressed("units")].join();
        check("Startwahl aus dem Format des Berichts (L2, Numbers, PY On, PL On, Million)", (await state()) === "L2,Numbers,On,On,Million", await state());
        await shot("4-pnl-options.png");

        const r2 = await rows();
        await choice("rows", "All");
        const rAll = await rows();
        check("Zeilen All klappt die GuV auf", rAll > r2, `${r2} → ${rAll} Textelemente`);
        await choice("rows", "L1");
        const r1 = await rows();
        check("Zeilen L1 klappt sie zu", r1 < r2, `${r1} Textelemente`);
        await shot("5-pnl-rows-l1.png");
        await choice("rows", "L2");

        const before = await text();
        await choice("variance", "Charts");
        check("Abweichung als Grafik ändert das Visual", (await text()) !== before);
        await shot("6-pnl-variance-charts.png");
        await choice("variance", "Numbers");
        await choice("py", "Off");
        const noPy = await text();
        check("PY Off entfernt die Vorjahresspalten (kein 2,498.1, kein +319.5)", noPy !== before && !flat(noPy).includes(flat("2,498.1")) && !flat(noPy).includes(flat("+319.5")));
        await choice("py", "On");
        check("PY On bringt sie zurück", flat(await text()).includes(flat("+319.5")));
        await choice("units", "Thousand");
        check("Einheit Thousand skaliert die Zahlen (Umsatz 2,817,6xx)", /28176\d\d/.test(flat(await text())));
        await choice("units", "Million");

        // Panel einklappen: das Visual bekommt die Breite
        const vw = () => page.$eval(`[data-dwg-tile="${id}"] > div`, e => e.getBoundingClientRect().width);
        const w0 = await vw();
        await page.click(`[data-dwg-options="${id}"] [data-dwg-options-toggle="${id}"]`);
        await page.waitForTimeout(900);
        const w1 = await vw();
        check("Optionen-Panel klappt ein, die P&L bekommt die Breite", !(await page.$(`[data-dwg-options="${id}"]`)) && w1 > w0 + 100, `${Math.round(w0)} → ${Math.round(w1)} px`);
        const strip = await page.$eval(`[data-dwg-options-toggle="${id}"]`, e => e.textContent.trim());
        check("eingeklappt bleibt die Leiste „Options“", /Options/.test(strip), strip);
        await shot("7-pnl-options-collapsed.png");

        // eigene Bedienleiste der P&L (toolbar.foldable): ☰ klappt sie auf und zu
        const fold = await page.$$(`[data-dwg-tile="${id}"] :is(button, [role=button], g, span, div)`).then(async els => {
            for (const e of els) { if (await e.evaluate(n => n.childElementCount === 0 && (n.textContent ?? "").trim() === "☰")) { return e; } }
            return null;
        });
        check("Bedienleiste der P&L ist einklappbar (☰ vorhanden)", Boolean(fold));
        if (fold) {
            const tb0 = await text();
            await fold.click();
            await page.waitForTimeout(700);
            check("☰ schaltet die Bedienleiste der P&L um", (await text()) !== tb0);
            await shot("8-pnl-toolbar.png");
            await fold.click().catch(() => {});
            await page.waitForTimeout(500);
        }
        await page.click(`[data-dwg-options-toggle="${id}"]`);
        await page.waitForTimeout(500);
        check("Optionen-Panel öffnet wieder, Wahl erhalten", Boolean(await page.$(`[data-dwg-options="${id}"]`)) && (await state()) === "L2,Numbers,On,On,Million", await state());

        // Ebene aus der Bedienleiste des Visuals (persistProperties): das Panel zeigt sie, eine neue Wahl im Panel gewinnt
        const levelBtn = await page.$$(`[data-dwg-tile="${id}"] :is(button, [role=button], span, div, g)`).then(async els => {
            for (const e of els) { if (await e.evaluate(n => n.childElementCount === 0 && (n.textContent ?? "").trim() === "L1")) { return e; } }
            return null;
        });
        if (levelBtn) {
            await levelBtn.click();
            await page.waitForTimeout(800);
            check("Ebene L1 aus der Bedienleiste: Panel zeigt L1", (await pressed("rows")) === "L1", await pressed("rows"));
            const rL1 = await rows();
            await choice("rows", "All");
            check("danach Zeilen All im Panel: GuV klappt auf (Wahl gewinnt über den gespeicherten Wert)", (await rows()) > rL1 && (await pressed("rows")) === "All");
            await choice("rows", "L2");
        } else {
            console.log("  (Bedienleiste ohne Ebenen-Knopf L1, Prüfung der Rangfolge übersprungen)");
        }
        check("Optionen und Bedienleiste lösen keine Abfrage aus", (await tileQueries()).length === n0);
    }

    if (pageId === "plan-gap") {
        // Querfilter: Klick auf die erste Gesellschaft filtert die Monatskachel
        const pt = await page.$$eval('[data-dwg-tile="company"] g.icd-cat', els => {
            const g = els[0];
            if (!g) { return null; }
            for (const r of [...g.querySelectorAll("rect")].sort((a, b) => b.getBBox().height * b.getBBox().width - a.getBBox().height * a.getBBox().width)) {
                const b = r.getBoundingClientRect();
                const x = b.x + b.width / 2, y = b.y + b.height / 2;
                if (b.width > 2 && b.height > 2 && g.contains(document.elementFromPoint(x, y))) { return { x, y }; }
            }
            return null;
        });
        check("Gesellschaft in der Kachel company ist klickbar", pt !== null);
        const before = await page.$eval('[data-dwg-tile="months"]', e => e.textContent);
        if (pt) { await page.mouse.click(pt.x, pt.y); }
        await settle();
        const q = (await tileQueries()).slice(n0);
        check("Klick: Monatskachel fragt einmal mit TREATAS auf die Gesellschaft ab", q.length === 1 && q[0].includes("'dim-gesellschaft'[Short name]"), `${q.length} Abfragen`);
        check("Monatskachel zeigt gefilterte Werte", (await page.$eval('[data-dwg-tile="months"]', e => e.textContent)) !== before);
        const chip = await page.$eval("button[title='Clear filter']", e => e.textContent).catch(() => "");
        check("Filter-Chip englisch (Clear filter)", chip.length > 0, chip.trim());
        await shot("3-cross-filter.png");
        if (chip) { await page.click("button[title='Clear filter']"); }
        await settle();
        added = (await tileQueries()).length - n0;
        check("Chip hebt den Filter auf (eine weitere Abfrage ohne Filter)", added === 2 && !(await page.$("button[title='Clear filter']")));
    }

    await page.click("#theme");
    await page.waitForTimeout(600);
    await shot("9-dark.png");
    check("Theme löst keine Abfrage aus", (await tileQueries()).length === n0 + added);
    check("keine Fehler in der Konsole", errors.length === 0, errors.slice(0, 3).join(" | "));
    await context.close();
}

for (const p of PAGES) { await runPage(p); }
await browser.close();
server.close();
const failed = checks.filter(c => !c).length;
console.log(failed ? `\nBudapest: ${failed} Prüfung(en) fehlgeschlagen` : `\nBudapest: alle ${checks.length} Prüfungen grün`);
process.exit(failed ? 1 : 0);
