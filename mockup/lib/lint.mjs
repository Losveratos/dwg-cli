// dwg lint: prüft eine App-Spec auf Bündigkeit im Pixelraster und Barrierefreiheit, mit den Prüfungen aus MockupKitchen
// (gridcheck.js, a11y.js; geholt mit `dwg mockup build`). Texte für Menschen: was ist los, wo, was tun.
//
//   node dwg.mjs lint --spec <app-spec.json> [--json] [--strict]
//
// Raster: Bei Specs mit App-Rahmen (Slicer oder resolution) gilt der Layout-Vertrag aus layout/pixelgrid.mjs
// (Kopf, Filter-Panel links, Fuß, Ränder und Zwischenraum nach dem Raster); geprüft werden Kanten neben einer Rasterlinie
// (1 bis 3 px), Außenkanten knapp nicht bündig, Kacheln außerhalb des Inhalts. Ohne Rahmen nur fast bündige Kanten und
// Zwischenräume. Immer: Überlappungen. Barrierefreiheit: Kontrast der App-Farben (aus DwgShell.tsx, hell und dunkel),
// Mindestgrößen der Kacheln, Titel, Dichte, Schriftgröße je Seitenbreite, Slicer ohne Namen.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PG, GC, A11Y } from "./shared.mjs";
import { isShellSpec, layoutOf } from "../../app/lib/app.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHELL_TSX = path.resolve(HERE, "../../app/templates/DwgShell.tsx");
const LABEL = { chartkitchen: "ChartKitchen", pnl: "P&L Statement" };
const PALETTE_KEYS = ["bg", "surface", "panel", "text", "muted", "accent", "onAccent"];

/** Farben der App aus DwgShell.tsx (function palette), damit es keine zweite Farbtabelle gibt */
export function shellPalette(file = SHELL_TSX) {
    const src = fs.readFileSync(file, "utf8");
    const at = src.indexOf("function palette(");
    const m = at < 0 ? null : /\?\s*\{([\s\S]*?)\}\s*:\s*\{([\s\S]*?)\}\s*;/.exec(src.slice(at));
    if (!m) { throw new Error(`palette() in ${path.basename(file)} nicht gefunden (Aufbau geändert?)`); }
    const read = body => Object.fromEntries([...body.matchAll(/(\w+):\s*'(#[0-9a-fA-F]{6})'/g)].map(x => [x[1], x[2]]));
    const out = { dark: read(m[1]), light: read(m[2]) };
    for (const [mode, p] of Object.entries(out)) {
        const miss = PALETTE_KEYS.filter(k => !p[k]);
        if (miss.length) { throw new Error(`palette() in ${path.basename(file)} (${mode}): ${miss.join(", ")} fehlt`); }
    }
    return out;
}

const rectOf = t => { const [x, y, w, h] = t.rect ?? []; return { id: t.id, x, y, w, h }; };
const titleOf = t => t.title || t.objects?.ibcsTitle?.kpi || t.objects?.ibcsTitle?.message || t.objects?.titleBlock?.measureLine || "";
const r1 = v => Math.round(v * 10) / 10;
const de = v => String(r1(v)).replace(".", ",");
const SIDE = { left: "links", right: "rechts", top: "oben", bottom: "unten" };
const EDGE = { left: "linke Kante", right: "rechte Kante", top: "Oberkante", bottom: "Unterkante" };

/** Kantenfehler einer Kachel in ein korrigiertes Rechteck übersetzen (Kanten auf die nächste Rasterlinie) */
function snapRect(r, edges) {
    let [x0, y0, x1, y1] = [r.x, r.y, r.x + r.w, r.y + r.h];
    for (const e of edges) {
        if (e.edge === "left") { x0 -= e.delta; } else if (e.edge === "right") { x1 -= e.delta; }
        else if (e.edge === "top") { y0 -= e.delta; } else { y1 -= e.delta; }
    }
    return [x0, y0, x1 - x0, y1 - y0];
}

function overlaps(rects) {
    const out = [];
    for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
            const a = rects[i], b = rects[j];
            const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
            if (w > 0 && h > 0) { out.push({ a: a.id, b: b.id, w, h }); }
        }
    }
    return out;
}

/** Häufigster Zwischenraum zwischen direkten Nachbarn (für Seiten ohne Rahmen) */
function commonGap(rects) {
    const n = new Map();
    for (const a of rects) {
        for (const b of rects) {
            if (a === b) { continue; }
            const ovY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y), gx = b.x - (a.x + a.w);
            const ovX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), gy = b.y - (a.y + a.h);
            if (ovY > 0 && gx > 0 && gx < 80) { n.set(gx, (n.get(gx) ?? 0) + 1); }
            if (ovX > 0 && gy > 0 && gy < 80) { n.set(gy, (n.get(gy) ?? 0) + 1); }
        }
    }
    return [...n.entries()].sort((p, q) => q[1] - p[1] || p[0] - q[0])[0]?.[0] ?? null;
}

/**
 * @returns {{ findings: Array<{level: "error"|"warn"|"info", code: string, page: string|null, tile: string|null,
 *   text: string, hint: string, fix?: number[]}>, counts: {error: number, warn: number, info: number} }}
 */
export function lintSpec(spec, { palette = shellPalette() } = {}) {
    const findings = [];
    const add = (level, code, page, tile, text, hint, fix) => findings.push({ level, code, page, tile, text, hint, ...(fix ? { fix } : {}) });
    const shell = isShellSpec(spec);

    for (const page of spec.pages ?? []) {
        const tiles = (page.tiles ?? []).filter(t => Array.isArray(t.rect) && t.rect.length === 4 && t.rect.every(Number.isFinite));
        for (const t of page.tiles ?? []) { if (!tiles.includes(t)) { add("error", "RECT", page.name, t.id, `Kachel ${t.id}: rect fehlt oder ist kein [x, y, Breite, Höhe].`, "rect als vier Zahlen in Seitenpixeln angeben."); } }
        const rects = tiles.map(rectOf);
        const w = page.width ?? 1920, k = PG.kOf(w);

        for (const o of overlaps(rects)) {
            add("error", "OVERLAP", page.name, o.a, `Kacheln ${o.a} und ${o.b} überlappen sich (${o.w} × ${o.h} px).`,
                "Eine Kachel verkleinern oder verschieben; in der App und in Power BI läge sonst eine über der anderen.");
        }

        // ---- Raster
        const z = shell ? layoutOf(spec, page) : null;
        const g = z ? z.g : PG.R(12 * k);
        if (z) {
            const res = GC.checkLattice(rects, z);
            for (const f of res.findings) {
                if (f.code === "OUTSIDE_CONTENT") {
                    const c = z.content;
                    add("error", f.code, page.name, f.id, `Kachel ${f.id} liegt nicht im Inhaltsbereich (x ${c.x} bis ${c.x + c.w}, y ${c.y} bis ${c.y + c.h}).`,
                        "Kopf, Filter-Panel und Fußleiste gehören dem App-Rahmen; die Generatoren brechen hier ab.");
                } else if (f.code === "OFF_LATTICE") {
                    const byTile = new Map();
                    for (const e of f.edges) { byTile.set(e.id, [...(byTile.get(e.id) ?? []), e]); }
                    for (const [id, edges] of byTile) {
                        const r = rects.find(x => x.id === id);
                        const parts = edges.map(e => `${EDGE[e.edge]} bei ${e.axis} = ${e.value}, Rasterlinie bei ${e.value - e.delta}`);
                        add("warn", f.code, page.name, id, `Kachel ${id} liegt knapp neben dem Raster: ${parts.join(", ")}.`,
                            `Spaltenschritt ${z.pitch.x / z.n} px, Zeilenschritt ${z.pitch.y / z.n} px, Zwischenraum ${z.g} px. Vorschlag rect [${snapRect(r, edges).join(", ")}].`,
                            snapRect(r, edges));
                    }
                } else if (f.code === "NOT_FLUSH") {
                    const txt = f.sides.map(s => `${SIDE[s.side]} ${Math.abs(s.delta)} px ${s.delta > 0 ? "Luft" : "über den Rand"}`).join(", ");
                    add("warn", f.code, page.name, null, `Die Kacheln schließen nicht bündig mit dem Inhaltsrand ab: ${txt}.`,
                        `Inhalt x ${z.content.x} bis ${z.content.x + z.content.w}, y ${z.content.y} bis ${z.content.y + z.content.h}; äußere Kanten dorthin legen.`);
                }
            }
        }
        const gc = GC.check(null, { leaves: rects.map(r => ({ rect: r })) }, z ? g : (commonGap(rects) ?? g));
        for (const f of gc.findings) {
            if (f.code === "EDGE_NEAR_X" || f.code === "EDGE_NEAR_Y") {
                add("warn", f.code, page.name, null, `Kanten fast bündig, aber nicht ganz (${f.code.endsWith("X") ? "x" : "y"} = ${f.values.replace(/\//g, " / ")}).`,
                    "1 bis 3 px Versatz sieht nach Versehen aus; auf denselben Wert legen.");
            } else if (f.code === "GUTTER_MISMATCH") {
                add(z ? "warn" : "info", f.code, page.name, null, `Zwischenräume ${f.values} px statt ${f.gutter} px.`,
                    z ? `Im Raster ist jeder Zwischenraum genau ${f.gutter} px.` : `Ohne App-Rahmen frei; einheitlich wirkt ruhiger (Raster bei ${w} px: ${g} px).`);
            }
        }

        // ---- Barrierefreiheit je Seite (Kachelgrößen, Titel, Dichte, Schriftgröße)
        const S = { canvas: { w }, design: {}, chrome: {}, lang: "de", pages: [{ id: "p", name: page.name, layout: { type: "leaf" } }] };
        const computed = { p: { leaves: tiles.map(t => ({ node: { id: t.id, visual: { kind: t.visual, title: titleOf(t) } }, rect: rectOf(t) })) } };
        for (const f of A11Y.check(S, computed, { lang: "de", catalog: { byId: Object.fromEntries(Object.entries(LABEL).map(([id, label]) => [id, { label }])) } })) {
            if (f.page == null && f.code !== "A11Y_FONT_MIN") { continue; }          // Farben prüft der Rahmen-Teil unten
            add(f.level, f.code, page.name, f.visual, f.text, f.hint);
        }
    }

    // ---- Barrierefreiheit des App-Rahmens (Farben aus DwgShell.tsx, hell und dunkel)
    const slicers = (spec.slicers ?? []).map(s => ({ name: s.label || "" }));
    for (const [mode, p] of Object.entries(palette)) {
        const S = { canvas: { w: 1920 }, lang: "de", pages: [], chrome: { filter: { fields: mode === "light" ? slicers : [] } },
            design: { ink: p.text, tileBg: p.surface, accent: p.accent, header: "custom", headerInk: p.text, headerBg: p.panel } };
        for (const f of A11Y.check(S, {}, { lang: "de" })) {
            add(f.level, f.code, null, null, `${mode === "dark" ? "Dunkel" : "Hell"}: ${f.text}`, f.hint);
        }
        for (const [fg, bg, min, what] of [["muted", "panel", 4.5, "Grauschrift im Filter-Panel"], ["muted", "bg", 4.5, "Grauschrift auf dem Seitengrund"],
            ["onAccent", "accent", 4.5, "Schrift auf Akzentflächen (aktive Seite, gewählte Werte)"], ["text", "bg", 4.5, "Schrift auf dem Seitengrund"]]) {
            const ratio = A11Y.contrastRatio(p[fg], p[bg]);
            if (ratio < min) {
                add("warn", "A11Y_CONTRAST_SHELL", null, null, `${mode === "dark" ? "Dunkel" : "Hell"}: ${what} hat ${de(ratio)}:1 (Ziel ≥ ${de(min)}:1).`,
                    `${p[fg]} auf ${p[bg]}; Farbe in app/templates/DwgShell.tsx (palette) anpassen, gilt dann für alle Apps.`);
            }
        }
    }
    const counts = { error: 0, warn: 0, info: 0 };
    for (const f of findings) { counts[f.level]++; }
    return { findings, counts };
}

const LEVEL = { error: "Fehler", warn: "Warnung", info: "Hinweis" };

/** Befunde als Text, nach Seiten gruppiert; derselbe Befund auf mehreren Seiten steht einmal mit der Seitenliste */
export function formatFindings({ findings, counts }, specName = "") {
    const lines = [];
    const same = new Map();
    for (const f of findings) { const key = `${f.level}|${f.text}|${f.hint}`; same.set(key, [...(same.get(key) ?? []), f]); }
    const groups = new Map();
    for (const list of same.values()) {
        const pages = [...new Set(list.map(f => f.page))];
        const key = pages.length > 1 ? `Auf ${pages.length} Seiten: ${pages.length > 4 ? `${pages.slice(0, 3).map(p => `„${p}“`).join(", ")} …` : pages.map(p => `„${p}“`).join(", ")}`
            : (pages[0] ?? "App-Rahmen und Farben");
        groups.set(key, [...(groups.get(key) ?? []), list[0]]);
    }
    for (const [page, list] of groups) {
        lines.push(`\n${page}`);
        for (const f of list) { lines.push(`  ${LEVEL[f.level].padEnd(8)} ${f.text}`, `           → ${f.hint}`); }
    }
    lines.push(`\n${specName ? `${specName}: ` : ""}${counts.error} Fehler, ${counts.warn} Warnungen, ${counts.info} Hinweise.`);
    return lines.join("\n");
}
