// dwg: fabscan.json neben der App, damit der Governance-Scanner fabscan die Abfragen der App gegen das Modell prüfen
// kann (sonst LIN-NO-MODEL, wenn das Modell nicht im selben Repo liegt). dwg kennt das Modell aus `app page --model`.
// Format (fabscan, Kitchen-Repo fabric-app-scanner/):
//   { "connectors": { "<App-Ordner>:<Konnektor>": "<Modellname>" }, "models": ["<Ordner, der das *.SemanticModel enthält>"] }
// fabscan liest die Datei aus dem Ordner, den es prüft (`fabscan <App-Ordner>`), Pfade relativ zu diesem Ordner.
// Unter "models" sucht fabscan (wie --models) *.SemanticModel-Ordner darin; der Modellordner selbst wird nicht erkannt,
// deshalb steht dort der Elternordner des Modells.
//
// Dazu "visibleFilters" (ab fabscan 0.6.2): die festen Filter der Spec (pages[].filters, tiles[].filters), die die App
// als Chip zeigt. fabscan meldet passende TREATAS-Stellen dann als Hinweis statt als QRY-HARDCODED-Warnung. Je Seite und
// Filter ein Eintrag { column, values, file } mit der .dax-Datei der Seite (Pfad relativ zum App-Ordner), so wie die
// Abfrage ihn enthält: dort steht jeder Seiten- und Kachelfilter als eigenes TREATAS. Slicer stehen nicht in den
// .dax-Dateien und gehören nicht hierher. Einträge von dwg tragen "source": "dwg" und werden bei jedem Lauf ersetzt,
// eigene Einträge bleiben.
import fs from "node:fs";
import path from "node:path";

/** Ordner der Seiten-Abfragen in der App, relativ zum App-Ordner (wie fabscan die Datei sieht) */
export const PAGES_DAX = "packages/frontend/src/dwg/pages";

const colKey = c => String(c).replace(/'/g, "").replace(/\s+/g, "").toLowerCase();
/** Datumswerte stehen in der Spec als ISO-Text, in der Abfrage als DATE(…): dann ohne values (jeder feste Wert der Spalte) */
const isIsoDate = v => typeof v === "string" && /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/.test(v);

/**
 * Feste Filter der Spec als visibleFilters für fabscan. `pageSlug(page)` liefert den Dateinamen der Seite ohne .dax.
 * @returns {{ column: string, values?: unknown[], file: string, source: "dwg" }[]}
 */
export function visibleFiltersOf(spec, pageSlug) {
    const out = [];
    const seen = new Set();
    for (const page of Array.isArray(spec?.pages) ? spec.pages : []) {
        const file = `${PAGES_DAX}/${pageSlug(page)}.dax`;
        // Seitenfilter stehen in jeder Kachelabfrage, Kachelfilter nur in ihrer; beide in derselben Datei
        const tiles = Array.isArray(page.tiles) ? page.tiles : [];
        const filters = [...(tiles.length ? page.filters ?? [] : []), ...tiles.flatMap(t => t?.filters ?? [])];
        for (const f of filters) {
            if (!f || typeof f.column !== "string" || !Array.isArray(f.values) || !f.values.length) { continue; }
            const entry = f.values.some(isIsoDate)
                ? { column: f.column, file, source: "dwg" }
                : { column: f.column, values: [...f.values], file, source: "dwg" };
            const key = JSON.stringify([colKey(f.column), entry.values ?? null, file]);
            if (!seen.has(key)) { seen.add(key); out.push(entry); }
        }
    }
    return out;
}

/** Anzeigename des Modells wie in fabscan: displayName aus .platform, sonst Ordnername ohne .SemanticModel */
export function modelName(modelDir) {
    const folder = path.basename(path.resolve(modelDir));
    const plain = folder.replace(/\.SemanticModel$/i, "");
    try {
        const p = JSON.parse(fs.readFileSync(path.join(modelDir, ".platform"), "utf8").replace(/^﻿/, ""));
        return p?.metadata?.displayName || plain;
    } catch { return plain; }
}

/**
 * <appDir>/fabscan.json schreiben: mit modelDir die Zuordnung Konnektor → Modell, dazu die festen Filter der Spec
 * (visibleFilters, Einträge mit source "dwg" werden ersetzt). Vorhandene eigene Einträge bleiben.
 * Ohne Modell und ohne feste Filter entsteht keine neue Datei. @returns Pfad und Inhalt, null wenn nichts zu schreiben war
 */
export function writeFabscanConfig({ appDir, connector, modelDir, visibleFilters = [] }) {
    const file = path.join(appDir, "fabscan.json");
    if (!modelDir && !visibleFilters.length && !fs.existsSync(file)) { return null; }
    let cfg = {};
    if (fs.existsSync(file)) {
        try { cfg = JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, "")); }
        catch (e) { throw new Error(`${file}: ${e.message} (fabscan.json reparieren oder löschen)`); }
        if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) { throw new Error(`${file}: erwartet ein JSON-Objekt.`); }
    }
    const out = { ...cfg };
    let name = null;
    if (modelDir) {
        const app = path.basename(path.resolve(appDir));
        name = modelName(modelDir);
        // echte Pfade: unter Windows sonst Kurznamen (MICHAE~1) gegen lange Namen, der relative Pfad liefe über die Wurzel
        const real = p => { try { return fs.realpathSync.native(p); } catch { return path.resolve(p); } };
        const rel = path.relative(real(appDir), path.dirname(real(modelDir))).split(path.sep).join("/") || ".";
        out.connectors = { ...(cfg.connectors ?? {}), [`${app}:${connector}`]: name };
        out.models = [...new Set([...(Array.isArray(cfg.models) ? cfg.models : []), rel])];
    }
    const own = (Array.isArray(cfg.visibleFilters) ? cfg.visibleFilters : []).filter(e => !(e && typeof e === "object" && e.source === "dwg"));
    if (own.length || visibleFilters.length) { out.visibleFilters = [...own, ...visibleFilters]; } else { delete out.visibleFilters; }
    const text = `${JSON.stringify(out, null, 2)}\n`;
    const changed = !fs.existsSync(file) || fs.readFileSync(file, "utf8") !== text;
    if (changed) { fs.writeFileSync(file, text); }
    return { file, config: out, model: name, changed };
}
