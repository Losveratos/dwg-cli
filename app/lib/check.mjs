// dwg check: eine App-Spec ohne Rayfin-App und ohne Bericht prüfen.
// Struktur (specProblems), Rollen und Bindungen je Kachel (daxQuery wie in generateAppPages), mit Modell auch die Felder.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readModel, resolveField } from "../../pbip/lib/tmdl.mjs";
import { specProblems, filterProblems, checkFields } from "./app.mjs";

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../visuals/dist");

/** @returns {{ pages: number, tiles: number, problems: string[] }} schreibt nichts */
export async function checkSpecFile(spec, { modelDir } = {}) {
    if (!fs.existsSync(path.join(DIST, "dwg-visuals.js"))) { throw new Error("visuals/dist fehlt: erst `node dwg.mjs visuals build`."); }
    const { daxQuery, ROLES } = await import(pathToFileURL(path.join(DIST, "dwg-visuals.js")).href);
    const model = modelDir ? readModel(modelDir) : null;
    const problems = specProblems(spec);
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
            if (model) { problems.push(...checkFields(tile, model, roles).map(m => `${at}, ${m}`)); }
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
    return { pages: pages.length, tiles, problems };
}

export function formatCheck(r) {
    return [...r.problems.map(p => `  ${p}`), `${r.pages} Seiten, ${r.tiles} Kacheln, ${r.problems.length} Probleme`].join("\n");
}
