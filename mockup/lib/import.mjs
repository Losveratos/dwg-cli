// dwg mockup import: aus einem MockupKitchen-Export (mockup-spec.json) wird eine dwg App-Spec.
//
//   node dwg.mjs mockup import --in <mockup-spec.json> --out <app-spec.json> [--model <X.SemanticModel>]
//                                  [--width 1920 --height 1080] [--json]
//
// Die Zuordnung Mockup → ChartKitchen/P&L (Rollen, Szenario aus dem Feldnamen, Modus, Formatbereich) rechnet NICHT dwg,
// sondern der Konverter des Skills mockup-to-powerbi (mockup_to_pbir.py, mit `dwg mockup build` geholt). Er schreibt
// je Seite chartkitchen-slots.json und custom-visuals.json; daraus baut dwg die Kacheln. So gibt es die Zuordnung nur
// einmal, und Power-BI-Weg (Skill) und App-Weg (dwg) bekommen dieselben Rollen.
//
// Lage: Kacheln werden im Pixelraster übertragen (layout/pixelgrid.mjs). Mit Rastermodus im Mockup (canvas.pixel,
// visuals[].cell) exakt über die Brüche, sonst über die Lage im Mockup-Inhalt, gerundet auf 1/24.
// Was dwg nicht abbilden kann (native Visuals, Text, Gantt, Deneb, Drill-through, Slicer-Arten), steht als Hinweis da.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PG, SKILL_SCRIPTS } from "./shared.mjs";
import { readJsonFile } from "../../templates/lib/readspec.mjs";
import { chromeOf, checkSpec } from "../../app/lib/app.mjs";
import { readModel, resolveField } from "../../pbip/lib/tmdl.mjs";

/** ChartKitchen-Formatbereich, den dwg nicht aus dem Mockup übernimmt (App: Hell/Dunkel per Schalter, Schrift skaliert anders) */
const CK_DROP = new Set(["colors.appearance", "labels.fontScale", "labels.fontSize", "categoryAxis.fontSize", "ibcsTitle.show", "ibcsTitle.kpi", "chart.chartButtons"]);
/** Bucket-Namen der KPI-Karte (ibcsKpiCard) → ChartKitchen-Rollen; dwg zeigt KPI-Kacheln als ChartKitchen-Karten */
const KPI_TO_CK = { ac: "actual", pl: "plan", py: "previousYear", fc: "forecast", trend: "trend", category: "trend" };

/** "Tabelle.Feld" (MockupKitchen) → 'Tabelle'[Feld] (dwg/DAX) */
export function daxRef(ref) {
    const i = String(ref).indexOf(".");
    if (i < 0) { return `[${ref}]`; }
    return `'${ref.slice(0, i).replace(/'/g, "''")}'[${ref.slice(i + 1).replace(/\]/g, "]]")}]`;
}

function findPython() {
    const cands = [process.env.DWG_PYTHON ? [process.env.DWG_PYTHON] : null, ["python"], ["python3"], ["py", "-3"]].filter(Boolean);
    for (const [cmd, ...pre] of cands) {
        const r = spawnSync(cmd, [...pre, "--version"], { encoding: "utf8" });
        if (r.status === 0 && /Python 3/.test(`${r.stdout}${r.stderr}`)) { return [cmd, ...pre]; }
    }
    return null;
}

/** Konverter des Skills auf die Mockup-Spec anwenden; liefert je Mockup-Visual-ID den Slot */
export function runSkill(specFile) {
    const py = findPython();
    if (!py) { throw new Error("Python 3 nicht gefunden (python, python3, py -3 oder DWG_PYTHON). Der Import nutzt den Konverter des Skills mockup-to-powerbi."); }
    const out = fs.mkdtempSync(path.join(os.tmpdir(), "dwg-mockup-"));
    try {
        const r = spawnSync(py[0], [...py.slice(1), "-B", path.join(SKILL_SCRIPTS, "mockup_to_pbir.py"), path.resolve(specFile), "--out", out, "--lang", "de"],
            { encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
        if (r.status !== 0) { throw new Error(`Konverter des Skills meldet einen Fehler:\n${(r.stderr || r.stdout).trim().split("\n").slice(-8).join("\n")}`); }
        const read = (dir, f) => { const p = path.join(dir, f); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : []; };
        const byId = new Map();
        for (const e of fs.readdirSync(out, { withFileTypes: true })) {
            if (!e.isDirectory()) { continue; }
            const dir = path.join(out, e.name);
            for (const s of read(dir, "chartkitchen-slots.json")) { byId.set(s.id, { type: "ck", slot: s }); }
            for (const s of read(dir, "custom-visuals.json")) { byId.set(s.id, { type: "custom", slot: s }); }
            for (const s of read(dir, "deneb-slots.json")) { byId.set(s.id, { type: "deneb", slot: s }); }
            for (const s of read(dir, "text-visuals.json")) { byId.set(s.name, { type: "text", slot: s }); }
            for (const s of read(dir, "pbir-visuals.json")) { if (!byId.has(s.name)) { byId.set(s.name, { type: "native", slot: s }); } }
        }
        return byId;
    } finally {
        fs.rmSync(out, { recursive: true, force: true });
    }
}

/** "a.b": v → { a: { b: v } } */
function nest(flat, drop = new Set()) {
    const out = {};
    for (const [k, v] of Object.entries(flat ?? {})) {
        if (drop.has(k) || v == null) { continue; }
        const i = k.indexOf(".");
        if (i < 0) { continue; }
        (out[k.slice(0, i)] ??= {})[k.slice(i + 1)] = v;
    }
    return out;
}

const bindingsOf = roles => Object.fromEntries(Object.entries(roles ?? {}).filter(([, refs]) => refs?.length)
    .map(([role, refs]) => [role, refs.length === 1 ? daxRef(refs[0]) : refs.map(daxRef)]));

/** Mockup-Rechteck → Brüche im Mockup-Raster: cell (Rastermodus) oder Lage im Inhalt, gerundet auf 1/24 */
function fractionsOf(v, page, spec, hints) {
    if (v.cell?.x && v.cell?.y) { return { x: v.cell.x, y: v.cell.y }; }
    const c = page.contentRect, g = spec.spacing?.gutter ?? 0, r = v.rect;
    const Px = c.w + g, Py = c.h + g, den = 24;
    const snap = (pos, P) => { const j = Math.round(pos / P * den); return { j, err: Math.abs(pos - j * P / den) }; };
    const e = [snap(r.x - c.x, Px), snap(r.x + r.w + g - c.x, Px), snap(r.y - c.y, Py), snap(r.y + r.h + g - c.y, Py)];
    const worst = Math.max(...e.map(s => s.err));
    if (worst > 3) { hints.push(`Seite „${page.name}“, ${v.title || v.id}: lag im Mockup nicht im Raster (bis ${Math.round(worst)} px), Lage auf 1/24 gerundet. Mit Pixelraster im Mockup wird es exakt.`); }
    return { x: [[e[0].j, den], [e[1].j, den]], y: [[e[2].j, den], [e[3].j, den]] };
}

/**
 * @param {object} mockup  mockup-spec.json (specVersion 2 oder 3)
 * @param {Map} slots       Ergebnis von runSkill()
 * @param {{ model?: object, width?: number, height?: number }} opts  model = readModel(...) für Prüfung, Sortierspalten, Datentypen
 * @returns {{ spec: object, hints: string[] }}
 */
export function buildSpec(mockup, slots, { model, width, height } = {}) {
    const hints = [];
    const W = width ?? mockup.canvas?.width ?? 1920, H = height ?? mockup.canvas?.height ?? 1080;
    const columnInfo = ref => { const i = ref.indexOf("."); return model?.tables.get(ref.slice(0, i))?.columns.get(ref.slice(i + 1)); };
    const name = mockup.report?.name || mockup.meta?.name || "Mockup";

    // Slicer: Filterbereich des Mockups → Filter-Panel der App (Power BI: Slicer links)
    const slicers = [];
    for (const s of mockup.zones?.filter?.slicers ?? []) {
        const info = columnInfo(s.ref);
        const numeric = info ? /^(int64|double|decimal)$/i.test(info.dataType ?? "") : /^-?\d+(\.\d+)?$/.test(String(s.default ?? ""));
        const out = { column: daxRef(s.ref), label: s.alias || s.name, multi: ["list", "tile", "search"].includes(s.type) };
        if (s.default != null && s.default !== "") {
            out.default = String(s.default).split(/\s*[;,|]\s*/).filter(Boolean).map(x => (numeric && /^-?\d+(\.\d+)?$/.test(x) ? Number(x) : x));
            if (!out.multi && out.default.length > 1) { out.multi = true; }
        }
        if (info?.sortBy) { out.sortBy = daxRef(`${s.ref.slice(0, s.ref.indexOf("."))}.${info.sortBy}`); }
        if (!["dropdown", "list", "tile", undefined].includes(s.type)) {
            hints.push(`Slicer „${out.label}“: Art „${s.type}“ gibt es im Filter-Panel der App nicht, dort als Liste; in Power BI ein Dropdown.`);
        }
        slicers.push(out);
    }
    if (mockup.zones?.filter && ["top", "right", "burger"].includes(mockup.zones.filter.mode)) {
        hints.push(`Filterbereich im Mockup ${{ top: "oben", right: "rechts", burger: "als Burger-Menü" }[mockup.zones.filter.mode]}; die dwg-Shell hat das Filter-Panel immer links.`);
    }

    const spec = { name, about: [mockup.report?.purpose, mockup.report?.audience && `Zielgruppe: ${mockup.report.audience}`].filter(Boolean).join(" ") || undefined };
    if (slicers.length) { spec.slicers = slicers; }
    spec.resolution = "fullhd";
    spec.pages = [];
    const shellSpec = { slicers, resolution: spec.resolution };
    const to = PG.zones({ w: W, h: H }, chromeOf(shellSpec));

    for (const page of mockup.pages ?? []) {
        const tiles = [];
        for (const v of page.visuals ?? []) {
            const found = slots.get(v.id);
            const label = `Seite „${page.name}“, ${v.title || v.label || v.kind}`;
            const f = fractionsOf(v, page, mockup, hints);
            const [x0, x1] = f.x, [y0, y1] = f.y;
            const r = PG.placeFrac(to, x0, x1, y0, y1);
            const base = { id: v.stableId || v.id.replace(/^mk_/, ""), rect: [r.x, r.y, r.w, r.h] };
            if (v.title) { base.title = v.title; }
            if (found?.type === "ck") {
                const s = found.slot;
                const tile = { ...base, visual: "chartkitchen", bindings: bindingsOf(s.chartKitchenRoles), objects: nest(s.ckSettings ?? { "chart.orientation": s.orientation }, CK_DROP) };
                if (!s.titleShown) { delete tile.title; }
                tiles.push(tile);
                for (const w of s.warnings ?? []) { hints.push(`${label}: ${w}`); }
            } else if (found?.type === "custom" && found.slot.visualName === "pnlByDatenWG") {
                const s = found.slot;
                tiles.push({ ...base, visual: "pnl", bindings: bindingsOf(s.buckets), objects: nest(s.settings),
                    ...(s.buckets?.rowType || s.buckets?.formulaDef ? { showItemsWithNoData: true } : {}) });
                for (const w of s.warnings ?? []) { hints.push(`${label}: ${w}`); }
            } else if (found?.type === "custom" && found.slot.visualName === "ibcsKpiCard") {
                const s = found.slot, b = {};
                for (const [bucket, refs] of Object.entries(s.buckets ?? {})) {
                    const role = KPI_TO_CK[bucket];
                    if (role && refs?.length) { b[role] = refs.length === 1 ? daxRef(refs[0]) : refs.map(daxRef); }
                    else if (refs?.length) { hints.push(`${label}: KPI-Feld „${bucket}“ hat in der ChartKitchen-Karte keine Rolle, weggelassen.`); }
                }
                const cmp = s.settings?.["display.comparisonMode"];
                tiles.push({ ...base, visual: "chartkitchen", bindings: b, displayNames: b.actual ? { "[actual]": v.title || s.title } : undefined,
                    objects: { chart: { orientation: "cards", ...(cmp ? { comparisonMode: cmp } : {}) }, labels: { fontPreset: "compact" } } });
                hints.push(`${label}: KPI-Kachel ist in Power BI das Visual ibcsKpiCard, in dwg eine ChartKitchen-Karte (cards).`);
            } else {
                const what = found?.type === "native" ? `natives Power-BI-Visual (${found.slot.visual_type})`
                    : found?.type === "text" ? "Text-Kachel" : found?.type === "deneb" ? "Deneb-Kachel"
                    : found?.type === "custom" ? `Custom Visual ${found.slot.visualName}` : `Typ ${v.kind}`;
                hints.push(`${label}: ${what} gibt es in dwg nicht (nur ChartKitchen und P&L), Kachel weggelassen.${v.content ? ` Text: „${v.content}“` : ""}`);
            }
            if (v.link) { hints.push(`${label}: Sprungziel „${v.link.pageName}“ (Drill-through/Navigation) kennt dwg noch nicht.`); }
        }
        // Sortierspalten aus dem Modell (App: ORDER BY; Power BI: „Nach Spalte sortieren“ muss im Modell stehen)
        for (const t of tiles) {
            for (const ref of Object.values(t.bindings).flat()) {
                const m = /^'((?:[^']|'')+)'\[(.+)\]$/.exec(ref);
                const info = m && model?.tables.get(m[1].replace(/''/g, "'"))?.columns.get(m[2].replace(/\]\]/g, "]"));
                if (info?.sortBy) { (t.sortBy ??= {})[ref] = `'${m[1]}'[${info.sortBy}]`; }
            }
        }
        const out = { name: page.name, width: W, height: H, tiles };
        if (page.question) { out.description = page.question; }
        spec.pages.push(out);
    }
    for (const l of mockup.links ?? []) { if (!(mockup.pages ?? []).some(p => (p.visuals ?? []).some(v => v.id === l.fromVisual))) { hints.push(`Verknüpfung ${l.fromPage} → ${l.toPage}: kennt dwg noch nicht.`); } }
    for (const i of mockup.issues ?? []) { if (i.level !== "info") { hints.push(`Mockup${i.page ? ` „${i.page}“` : ""}: ${i.text}`); } }
    if (mockup.zones?.header?.title && mockup.zones.header.title !== name) { hints.push(`Kopfband-Titel „${mockup.zones.header.title}“: die Shell zeigt den App-Namen „${name}“.`); }

    // Felder gegen das Modell
    if (model) {
        for (const p of spec.pages) {
            for (const t of p.tiles) {
                for (const [role, refs] of Object.entries(t.bindings)) {
                    for (const ref of [].concat(refs)) {
                        const measure = !/^(category|series|colgroup|multiples|rowType|trend|fcFlag|levels|account|accountName|parent|period|colCategory|formulaDef|signConvention|displayInvert|varianceInvert|sortOrder|comment)$/.test(role);
                        try { resolveField(model, ref, measure ? "Measure" : "Grouping"); }
                        catch (e) { hints.push(`Seite „${p.name}“, Kachel ${t.id}, Rolle ${role}: ${e.message}`); }
                    }
                }
            }
        }
        for (const s of spec.slicers ?? []) { try { resolveField(model, s.column, "Grouping"); } catch (e) { hints.push(`Slicer „${s.label}“: ${e.message}`); } }
    }
    checkSpec(spec);   // Layout-Vertrag und Slicer wie in dwg app page / dwg pbip pages
    return { spec: JSON.parse(JSON.stringify(spec)), hints };
}

/** CLI-Einstieg: liest, konvertiert, schreibt; liefert { spec, hints } */
export function importMockup({ input, output, modelDir, width, height }) {
    const mockup = readJsonFile(input, "Mockup");
    if (!mockup.pages || !mockup.meta) { throw new Error(`${input} ist kein MockupKitchen-Export (meta und pages fehlen).`); }
    const model = modelDir ? readModel(modelDir) : undefined;
    const result = buildSpec(mockup, runSkill(input), { model, width, height });
    if (output) { fs.writeFileSync(output, JSON.stringify(result.spec, null, 2) + "\n"); }
    return result;
}
