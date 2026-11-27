// dwg check: eine App-Spec ohne Rayfin-App und ohne Bericht prüfen.
// Struktur (specProblems), Rollen und Bindungen je Kachel (daxQuery wie in generateAppPages), mit Modell auch die Felder.
// Hinweise (kein Exit 1): feste Zeitfilter (Jahr, Monat, Datum) in pages[].filters und tiles[].filters, die still in
// jeder Abfrage stehen; mit --app fremde Schriften in der Rayfin-App (Links zu Schrift-Diensten); mit Modell
// skalierende Kommas im Formatstring gebundener Measures (`#,##0.0,`, die Visuals zeigen sie falsch).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readModel, resolveField, parseRef } from "../../pbip/lib/tmdl.mjs";
import { specProblems, filterProblems, checkFields } from "./app.mjs";
import { foreignFonts } from "./fonts.mjs";
import { scalingCommaWarning } from "../../templates/lib/formats.mjs";

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../visuals/dist");

const TIME_TABLE = /^(calendar|calender|kalender|date|dates|datum|zeit|time|periode|period)$/i;
/** Art eines Zeitfilters nach dem Spaltennamen (deutsche Komposita wie „Geschäftsjahr“ zählen mit), sonst null */
function timeKind(table, name, dataType) {
    const n = name.toLowerCase();
    if (/(^|[^a-z])(year|fy)([^a-z]|$)|jahr/.test(n)) { return "Jahreswert"; }
    if (/(^|[^a-z])(quarter|qtr)([^a-z]|$)|quartal/.test(n)) { return "Quartalswert"; }
    if (/(^|[^a-z])month([^a-z]|$)|monat/.test(n)) { return "Monatswert"; }
    if (/(^|[^a-z])(week|kw)([^a-z]|$)|woche/.test(n)) { return "Wochenwert"; }
    if (dataType === "dateTime" || /(^|[^a-z])(date|day)([^a-z]|$)|datum/.test(n)) { return "Datumswert"; }
    if (TIME_TABLE.test(table ?? "") || /period|periode/.test(n)) { return "Zeitraumwert"; }
    return null;
}

const shortValues = values => (values.length > 4 ? `${values.slice(0, 3).map(v => JSON.stringify(v)).join(", ")} … (${values.length} Werte)` : values.map(v => JSON.stringify(v)).join(", "));

/**
 * Feste Zeitfilter: gelten immer, stehen still in jeder .dax-Abfrage und lassen sich in der App nicht ändern (dort nur
 * als Chip im Seitenkopf sichtbar). Für einen wählbaren Zeitraum: Slicer mit Vorgabe.
 */
export function fixedTimeFilterWarnings(spec, model = null) {
    const out = [];
    const slicerCols = new Set((Array.isArray(spec?.slicers) ? spec.slicers : []).map(s => s?.column).filter(c => typeof c === "string")
        .map(c => { try { const r = parseRef(c); return `${r.table}|${r.name}`.toLowerCase(); } catch { return c; } }));
    const look = (filters, at) => {
        if (!Array.isArray(filters)) { return; }
        for (const f of filters) {
            if (!f || typeof f.column !== "string" || !Array.isArray(f.values) || !f.values.length) { continue; }
            let ref;
            try { ref = parseRef(f.column); } catch { continue; }
            let dataType;
            if (model) { try { dataType = resolveField(model, f.column, "Grouping").dataType; } catch { /* meldet die Feldprüfung */ } }
            // Flags wie 'Kalender'[Ist] = true wandern mit den Daten (das Modell setzt sie), sie sind kein fester Zeitraum
            if (dataType === "boolean" || f.values.every(v => typeof v === "boolean")) { continue; }
            const kind = timeKind(ref.table, ref.name, dataType);
            if (!kind) { continue; }
            const head = `${at}, Filter ${f.column} = ${shortValues(f.values)}: fester ${kind}`;
            if (slicerCols.has(`${ref.table}|${ref.name}`.toLowerCase())) {
                out.push(`${head}, die Spalte ist auch Slicer. Beide gelten zusammen (Schnittmenge), der Slicer kann den festen Wert nicht verlassen. ` +
                    `Festen Filter streichen und den Wert als default des Slicers setzen.`);
            } else {
                const label = kind === "Jahreswert" ? "Jahr" : kind === "Monatswert" ? "Monat" : kind === "Quartalswert" ? "Quartal" : ref.name;
                out.push(`${head}. Er steht still in jeder Abfrage, in der App nur als Chip im Seitenkopf. Soll der Zeitraum wählbar sein: ` +
                    `Slicer mit Vorgabe, slicers: [{ "column": "${f.column}", "label": "${label}", "default": [${f.values.map(v => JSON.stringify(v)).join(", ")}]` +
                    `${f.values.length > 1 ? ', "multi": true' : ""} }].`);
            }
        }
    };
    for (const [pi, page] of (Array.isArray(spec?.pages) ? spec.pages : []).entries()) {
        if (!page || typeof page !== "object") { continue; }
        const at = typeof page.name === "string" && page.name ? `Seite „${page.name}“` : `Seite ${pi + 1}`;
        look(page.filters, at);
        for (const t of Array.isArray(page.tiles) ? page.tiles : []) { if (t && typeof t === "object") { look(t.filters, `${at}, Kachel ${t.id}`); } }
    }
    return out;
}

/** Fremde Schriften in einer Rayfin-App als Hinweise (dwg app page liefert die Schriften lokal mit) */
export function fontWarnings(appDir) {
    return foreignFonts(appDir).map(h => `App ${h.file}:${h.line}: Schrift von einem fremden Server (${h.text}). ` +
        "Jeder Aufruf schickt die IP der Nutzer an den Dienst. `dwg app page` liefert Geist und JetBrains Mono lokal mit und entfernt die Links aus index.html; " +
        "andere Stellen von Hand auf lokale Dateien umstellen.");
}

/** @returns {{ pages: number, tiles: number, problems: string[], warnings: string[] }} schreibt nichts */
export async function checkSpecFile(spec, { modelDir } = {}) {
    if (!fs.existsSync(path.join(DIST, "dwg-visuals.js"))) { throw new Error("visuals/dist fehlt: erst `node dwg.mjs visuals build`."); }
    const { daxQuery, ROLES } = await import(pathToFileURL(path.join(DIST, "dwg-visuals.js")).href);
    const model = modelDir ? readModel(modelDir) : null;
    const problems = specProblems(spec);
    const warnings = [];
    const pages = Array.isArray(spec?.pages) ? spec.pages.filter(p => p && typeof p === "object") : [];
    let tiles = 0;

    for (const [pi, page] of pages.entries()) {
        const at = typeof page.name === "string" && page.name ? `Seite „${page.name}“` : `Seite ${pi + 1}`;
        const pageFiltersOk = !filterProblems(page.filters, at).length;
        if (model && pageFiltersOk) {
            for (const f of page.filters ?? []) {
                try { resolveField(model, f.column, "Grouping"); } catch (e) { problems.push(`${at}, Filter: ${e.message}`); }
            }
        }
        for (const tile of Array.isArray(page.tiles) ? page.tiles : []) {
            tiles++;
            // Strukturfehler stehen schon in problems; hier nur Kacheln prüfen, die daxQuery nicht an einem TypeError scheitern lassen
            const roles = ROLES[tile?.visual];
            if (!tile || !roles || !tile.bindings || typeof tile.bindings !== "object" || Array.isArray(tile.bindings)) { continue; }
            const tat = `${at}, Kachel ${tile.id}`;
            if (!pageFiltersOk || filterProblems(tile.filters, tat).length) { continue; }
            try {
                daxQuery(tile.visual, tile.bindings, {
                    filters: [...(page.filters ?? []), ...(tile.filters ?? [])], sortBy: tile.sortBy, showItemsWithNoData: tile.showItemsWithNoData,
                });
            } catch (e) { problems.push(`${tat}: ${e.message}`); continue; }
            if (model) {
                problems.push(...checkFields(tile, model, roles).map(m => `${at}, ${m}`));
                warnings.push(...modelFormatWarnings(tile, model, roles).map(w => `${tat}, ${w}`));
            }
        }
    }
    const slicers = Array.isArray(spec?.slicers) ? spec.slicers : [];
    if (model) {
        for (const s of slicers) {
            for (const ref of [s?.column, s?.sortBy].filter(r => typeof r === "string")) {
                try { resolveField(model, ref, "Grouping"); } catch (e) { problems.push(`Slicer „${s.label}“: ${e.message}`); }
            }
        }
    }
    return { pages: pages.length, tiles, problems, warnings: [...fixedTimeFilterWarnings(spec, model), ...warnings] };
}

/** Formatstrings der gebundenen Measures im Modell mit skalierenden Kommas (`#,##0.0,`): das Visual zeigt sie falsch */
export function modelFormatWarnings(tile, model, roles) {
    const out = [];
    for (const [role, refs] of Object.entries(tile.bindings ?? {})) {
        if (roles.kind?.[role] !== "Measure") { continue; }
        for (const ref of [].concat(refs).filter(r => typeof r === "string")) {
            let m;
            try { m = resolveField(model, ref, "Measure"); } catch { continue; }
            const w = scalingCommaWarning(model.tables.get(m.table)?.formats?.get(m.name), tile.visual, "model");
            if (w) { out.push(`Rolle ${role}, '${m.table}'[${m.name}]: ${w}`); }
        }
    }
    return out;
}

export function formatCheck(r) {
    const counts = [r.pages != null && `${r.pages} Seiten, ${r.tiles} Kacheln`, `${r.problems.length} Probleme`, `${r.warnings.length} Hinweise`]
        .filter(Boolean).join(", ");
    return [...r.problems.map(p => `  ${p}`), ...r.warnings.map(w => `  Hinweis: ${w}`), counts].join("\n");
}
