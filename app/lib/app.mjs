// dwg app: schreibt Seiten aus einer App-Spec in eine Rayfin-App (React + Vite).
// Ziel in der App (alles unter packages/frontend/src, bei jedem Lauf ersetzt):
//   vendor/dwg-visuals/   Adapter-Build (@visuals, ChartKitchen + P&L)
//   dwg/                  DwgVisual.tsx, DwgPage.tsx, DwgShell.tsx, dwg-page.ts (+ Test)
//   dwg/pages/<slug>.ts   Seiten-Spec als TypeScript, <slug>.dax alle Abfragen zum Prüfen
//   dwg/apps/<slug>.ts    ganze Spec für DwgShell: Slicer (Filter-Panel), Seiten in Navigationsreihenfolge
//   vendor/dwg-pixelgrid/ Pixelraster (layout/pixelgrid.mjs) für die Shell
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readModel, resolveField, parseRef } from "../../pbip/lib/tmdl.mjs";
import { valueProblem } from "../../pbip/lib/pbir.mjs";
import { zones as gridZones, inside, DWG_CHROME } from "../../layout/pixelgrid.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(HERE, "../../visuals/dist");
const TEMPLATES = path.resolve(HERE, "../templates");
const PIXELGRID = path.resolve(HERE, "../../layout");

export function slug(name) {
    return name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
        .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "seite";
}

function copyDir(src, dst, skip = () => false) {
    fs.mkdirSync(dst, { recursive: true });
    for (const e of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, e.name);
        if (skip(s)) { continue; }
        if (e.isDirectory()) { copyDir(s, path.join(dst, e.name), skip); } else { fs.copyFileSync(s, path.join(dst, e.name)); }
    }
}

/** Konnektoren aus rayfin/rayfin.yml (nur Name und Typ, ohne YAML-Bibliothek) */
export function connectorsOf(appDir) {
    const yml = fs.readFileSync(path.join(appDir, "rayfin", "rayfin.yml"), "utf8");
    const block = yml.split(/^connectors:\s*$/m)[1] ?? "";
    const out = [];
    for (const m of block.matchAll(/^\s*-\s*name:\s*(\S+)\s*\n\s*type:\s*(\S+)/gm)) { out.push({ name: m[1], type: m[2] }); }
    return out;
}

/** Auflösungsmodi der Shell: Seite in Full HD bzw. HD aufbauen und als Ganzes skalieren, oder nur Kacheln skalieren */
export const RESOLUTIONS = ["fullhd", "hd", "responsive"];

/** Spec mit App-Rahmen (DwgShell): Slicer oder Auflösungsmodus gesetzt. Dann gilt der Layout-Vertrag (layout/pixelgrid.mjs). */
export const isShellSpec = spec => (spec.slicers ?? []).length > 0 || spec.resolution != null;

/** Zonen einer Seite (Kopf, Filter, Fuß, Inhalt) nach dem Pixelraster, Filter-Panel nur mit Slicern */
export const chromeOf = spec => ({ ...DWG_CHROME, filter: { ...DWG_CHROME.filter, on: (spec.slicers ?? []).length > 0 } });
export const layoutOf = (spec, page) => gridZones({ w: page.width ?? 1920, h: page.height ?? 1080 }, chromeOf(spec));
/** Zonen für die Seiten-Spec der App (Seitenpixel) */
const zonesOf = z => Object.fromEntries(["header", "filter", "footer", "content"].filter(k => z[k]).map(k => [k, z[k]]));

const COLUMN_RX = /^\s*'(?:[^']|'')+'\s*\[(?:[^\]]|\]\])+\]\s*$/;

/** Wertelisten-Abfrage eines Slicers, wie slicerQuery() in dwg-page.ts */
export function slicerQuery(slicer) {
    const sort = slicer.sortBy && slicer.sortBy !== slicer.column ? slicer.sortBy : null;
    return `EVALUATE\nSUMMARIZECOLUMNS(${slicer.column}${sort ? `, ${sort}` : ""})\nORDER BY ${sort ? `${sort}, ` : ""}${slicer.column}`;
}

/** Prüft die Spec-Felder für App-Rahmen und Layout (gemeinsam mit dwg pbip). Wirft mit allen Problemen. */
export function checkSpec(spec) {
    const problems = [];
    const slicers = spec.slicers ?? [];
    if (!Array.isArray(slicers)) { problems.push("slicers muss eine Liste sein."); }
    const seen = new Set();
    for (const [i, s] of (Array.isArray(slicers) ? slicers : []).entries()) {
        const where = `Slicer ${i + 1}${s?.label ? ` („${s.label}“)` : ""}`;
        if (!s || typeof s.column !== "string" || !COLUMN_RX.test(s.column)) { problems.push(`${where}: column muss eine Spalte mit Tabelle sein ('Tabelle'[Spalte]).`); continue; }
        if (!s.label) { problems.push(`${where}: label fehlt.`); }
        if (seen.has(s.column)) { problems.push(`${where}: Spalte ${s.column} gibt es schon als Slicer.`); }
        seen.add(s.column);
        if (s.sortBy != null && !COLUMN_RX.test(s.sortBy)) { problems.push(`${where}: sortBy muss eine Spalte mit Tabelle sein.`); }
        if (s.default != null && !Array.isArray(s.default)) { problems.push(`${where}: default muss eine Liste sein, z. B. [2026].`); }
        if (!s.multi && (s.default ?? []).length > 1) { problems.push(`${where}: Einfachauswahl mit ${s.default.length} Startwerten (multi: true setzen).`); }
    }
    if (spec.resolution != null && !RESOLUTIONS.includes(spec.resolution)) {
        problems.push(`resolution „${spec.resolution}“ gibt es nicht (${RESOLUTIONS.join(", ")}).`);
    }
    const shell = isShellSpec(spec);
    const ids = new Map();
    for (const page of spec.pages ?? []) {
        const id = slug(page.id ?? page.template ?? page.name);
        if (ids.has(id)) { problems.push(`Seite „${page.name}“: Kennung „${id}“ hat schon „${ids.get(id)}“ (id oder template ändern).`); }
        ids.set(id, page.name);
        const layout = shell ? layoutOf(spec, page) : null;
        for (const t of page.tiles ?? []) {
            const [x, y, tw, th] = t.rect ?? [];
            if (![x, y, tw, th].every(Number.isFinite)) { problems.push(`Seite „${page.name}“, Kachel ${t.id}: rect braucht [x, y, Breite, Höhe].`); continue; }
            if (layout && !inside(layout, t.rect)) {
                const c = layout.content;
                problems.push(`Seite „${page.name}“, Kachel ${t.id}: [${t.rect.join(", ")}] liegt nicht im Inhaltsbereich ` +
                    `(x ${c.x} bis ${c.x + c.w}, y ${c.y} bis ${c.y + c.h}; Kopf, Filter-Panel und Fußleiste gehören dem Rahmen).`);
            }
        }
    }
    if (problems.length) { throw new Error(`Spec passt nicht:\n  ${problems.join("\n  ")}`); }
}

/** Filterwerte gegen den Datentyp der Spalte prüfen (Text auf einer Zahlenspalte träfe still nichts) */
function checkValues(where, model, column, values) {
    let col;
    try { col = resolveField(model, column, "Grouping"); } catch (e) { return [`${where}: ${e.message}`]; }
    return (values ?? []).map(v => valueProblem(v, col.dataType)).filter(Boolean).map(p => `${where}, ${column}: ${p}`);
}

/** `'Tabelle'[Spalte]`, wie normColumn() in dwg-page.ts (Schlüssel für columnTypes) */
const columnKey = (table, name) => `'${table.replace(/'/g, "''")}'[${name.replace(/]/g, "]]")}]`;

/**
 * Datentyp je Spalte aus dem TMDL für die App: Abfrageergebnisse des Konnektors tragen keine Typen (nur Namen,
 * Datum als ISO-Text). Mit dem Typ wird nur eine dateTime-Spalte zum Datum, eine Textspalte bleibt Text.
 */
function columnTypesOf(model, refs) {
    const out = {};
    for (const ref of refs) {
        try {
            const c = resolveField(model, ref, "Grouping");
            if (c.dataType) { out[columnKey(c.table, c.name)] = c.dataType; }
        } catch { /* fehlende Spalten meldet checkFields */ }
    }
    return out;
}

/** Felder der Spec gegen ein TMDL-Modell prüfen (optional, wenn das Modell als PBIP vorliegt) */
function checkFields(tile, model, roles) {
    const problems = [];
    for (const [role, refs] of Object.entries(tile.bindings)) {
        for (const ref of [].concat(refs)) {
            const kind = roles.kind[role];
            if (kind === "Measure") {
                try { parseRef(ref); } catch { continue; }          // freier DAX-Ausdruck: nur in der App erlaubt
            }
            try { resolveField(model, ref, kind === "Measure" ? "Measure" : "Grouping"); }
            catch (e) { problems.push(`Kachel ${tile.id}, Rolle ${role}: ${e.message}`); }
        }
    }
    for (const f of tile.filters ?? []) { problems.push(...checkValues(`Kachel ${tile.id}, Filter`, model, f.column, f.values)); }
    return problems;
}

export async function generateAppPages({ appDir, spec, connector, model: modelDir }) {
    const front = path.join(appDir, "packages", "frontend");
    if (!fs.existsSync(path.join(front, "src"))) { throw new Error(`${appDir} ist keine Rayfin-App (packages/frontend/src fehlt).`); }
    if (!fs.existsSync(path.join(DIST, "dwg-visuals.js"))) { throw new Error("visuals/dist fehlt: erst `node dwg.mjs visuals build`."); }
    const con = connectorsOf(appDir).find(c => c.name === connector);
    if (!con) { throw new Error(`Konnektor "${connector}" fehlt in rayfin/rayfin.yml (rayfin connector add …).`); }
    if (con.type !== "fabric-semanticmodel") { throw new Error(`Konnektor "${connector}" ist ${con.type}, gebraucht wird fabric-semanticmodel.`); }
    if (!fs.existsSync(path.join(front, "src", "hooks", "use-semantic-model-query.ts"))) {
        throw new Error("Hook use-semantic-model-query fehlt: npm run pack:add -- analytics");
    }

    checkSpec(spec);
    const { daxQuery, ROLES } = await import(pathToFileURL(path.join(DIST, "dwg-visuals.js")).href);
    const model = modelDir ? readModel(modelDir) : null;
    const problems = [];
    const written = [];

    const src = path.join(front, "src");
    fs.rmSync(path.join(src, "vendor", "dwg-visuals"), { recursive: true, force: true });
    // templates.json ist der Katalog für die CLI (dwg templates, tile add), die App braucht ihn nicht
    copyDir(DIST, path.join(src, "vendor", "dwg-visuals"), f => f.endsWith(".map") || path.basename(f) === "templates.json");
    written.push("src/vendor/dwg-visuals/");
    // Pixelraster (eine Quelle für Generator, Shell und PBIP): als ES-Modul mit Typen
    const gridDir = path.join(src, "vendor", "dwg-pixelgrid");
    fs.rmSync(gridDir, { recursive: true, force: true });
    fs.mkdirSync(gridDir, { recursive: true });
    fs.copyFileSync(path.join(PIXELGRID, "pixelgrid.mjs"), path.join(gridDir, "pixelgrid.js"));
    fs.copyFileSync(path.join(PIXELGRID, "pixelgrid.d.ts"), path.join(gridDir, "pixelgrid.d.ts"));
    written.push("src/vendor/dwg-pixelgrid/");
    for (const f of fs.readdirSync(TEMPLATES)) {
        fs.mkdirSync(path.join(src, "dwg"), { recursive: true });
        fs.copyFileSync(path.join(TEMPLATES, f), path.join(src, "dwg", f));
        written.push(`src/dwg/${f}`);
    }

    const pageModules = [];
    for (const page of spec.pages) {
        // Datentyp je Spalte der Seite (gruppierende Rollen, Filter, Slicer), damit Datumswerte in der App stimmen
        const columnTypes = model ? columnTypesOf(model, [
            ...(page.filters ?? []).map(f => f.column),
            ...page.tiles.flatMap(t => [
                ...Object.entries(t.bindings ?? {}).filter(([role]) => ROLES[t.visual]?.kind[role] !== "Measure").flatMap(([, refs]) => [].concat(refs)),
                ...(t.filters ?? []).map(f => f.column),
            ]),
            ...(spec.slicers ?? []).map(s => s.column),
        ]) : {};
        const typeOf = column => {
            try { const { table, name } = parseRef(column); return table ? columnTypes[columnKey(table, name)] : undefined; } catch { return undefined; }
        };
        const typed = filters => (filters ?? []).map(f => (typeOf(f.column) ? { ...f, type: typeOf(f.column) } : f));
        const daxParts = [];
        for (const tile of page.tiles) {
            if (!ROLES[tile.visual]) { throw new Error(`Kachel ${tile.id}: unbekanntes Visual "${tile.visual}" (chartkitchen, pnl).`); }
            // wirft bei unbekannten Rollen und ungültigen Spalten, wie später in der App
            const q = daxQuery(tile.visual, tile.bindings, {
                filters: [...typed(page.filters), ...typed(tile.filters)], sortBy: tile.sortBy, showItemsWithNoData: tile.showItemsWithNoData,
            });
            daxParts.push(`// Kachel ${tile.id} (${tile.visual})\n${q.query}\n`);
            if (model) { problems.push(...checkFields(tile, model, ROLES[tile.visual])); }
        }
        if (model) {
            for (const f of page.filters ?? []) { problems.push(...checkValues(`Seite „${page.name}“, Filter`, model, f.column, f.values)); }
        }
        const name = slug(page.name);
        const pagesDir = path.join(src, "dwg", "pages");
        fs.mkdirSync(pagesDir, { recursive: true });
        const pageSpec = {
            name: page.name,
            ...Object.fromEntries(Object.entries({ id: page.id, template: page.template, group: page.group, description: page.description })
                .filter(([, v]) => v !== undefined)),
            width: page.width ?? 1920, height: page.height ?? 1080,
            ...(page.background ? { background: page.background } : {}),
            ...(isShellSpec(spec) ? { zones: zonesOf(layoutOf(spec, page)) } : {}),
            filters: page.filters ?? [],
            ...(Object.keys(columnTypes).length ? { columnTypes } : {}),
            tiles: page.tiles.map(t => {
                const { id, visual, rect, title, subtitle, bindings, filters, objects, sortBy, showItemsWithNoData, displayNames, formats } = t;
                return Object.fromEntries(Object.entries({ id, visual, rect, title, subtitle, bindings, filters, objects, sortBy, showItemsWithNoData, displayNames, formats })
                    .filter(([, v]) => v !== undefined));
            }),
        };
        fs.writeFileSync(path.join(pagesDir, `${name}.ts`),
            `// erzeugt von \`dwg app page\` aus der App-Spec „${spec.name ?? page.name}“, nicht von Hand ändern.\n` +
            `import type { DwgPageSpec } from '../dwg-page';\n\n` +
            `export const page: DwgPageSpec = ${JSON.stringify(pageSpec, null, 2)};\n`);
        fs.writeFileSync(path.join(pagesDir, `${name}.dax`),
            `// Abfragen der Seite „${page.name}“ ohne Querfilter, zum Prüfen in der DAX-Abfrageansicht.\n` +
            `// erzeugt von \`dwg app page\`, nicht von Hand ändern.\n\n${daxParts.join("\n")}`);
        written.push(`src/dwg/pages/${name}.ts`, `src/dwg/pages/${name}.dax`);
        pageModules.push(name);
    }

    // ganze Spec für DwgShell (Navigation, Filter-Panel)
    const slicers = spec.slicers ?? [];
    if (model) {
        for (const s of slicers) {
            for (const ref of [s.column, s.sortBy].filter(Boolean)) {
                try { resolveField(model, ref, "Grouping"); } catch (e) { problems.push(`Slicer „${s.label}“: ${e.message}`); }
            }
            if (s.default?.length) { problems.push(...checkValues(`Slicer „${s.label}“, default`, model, s.column, s.default)); }
        }
    }
    const appName = slug(spec.name ?? "app");
    const appsDir = path.join(src, "dwg", "apps");
    fs.mkdirSync(appsDir, { recursive: true });
    const imports = pageModules.map((m, i) => `import { page as p${i} } from '../pages/${m}';`).join("\n");
    const appSpec = {
        name: spec.name ?? appName, ...(spec.about ? { about: spec.about } : {}), ...(spec.footer ? { footer: spec.footer } : {}),
        resolution: spec.resolution ?? "fullhd", visualHeaders: spec.visualHeaders ?? false, chrome: chromeOf(spec), slicers,
    };
    const slicerTypes = model ? columnTypesOf(model, slicers.map(s => s.column)) : {};
    if (Object.keys(slicerTypes).length) { appSpec.columnTypes = slicerTypes; }
    const appJson = JSON.stringify(appSpec, null, 2)
        .replace(/\n}$/, `,\n  "pages": [${pageModules.map((_, i) => `p${i}`).join(", ")}]\n}`);
    fs.writeFileSync(path.join(appsDir, `${appName}.ts`),
        `// erzeugt von \`dwg app page\` aus der App-Spec „${spec.name ?? appName}“, nicht von Hand ändern.\n` +
        `// Einbinden: <DwgShell app={app} connection="${connector}" isDark={isDark} />\n` +
        `import type { DwgAppSpec } from '../dwg-page';\n${imports}\n\n` +
        `export const app: DwgAppSpec = ${appJson};\n`);
    written.push(`src/dwg/apps/${appName}.ts`);
    if (slicers.length) {
        fs.writeFileSync(path.join(appsDir, `${appName}.dax`),
            `// Wertelisten der Slicer im Filter-Panel, zum Prüfen in der DAX-Abfrageansicht.\n` +
            `// erzeugt von \`dwg app page\`, nicht von Hand ändern.\n\n` +
            slicers.map(s => `// Slicer ${s.label}\n${slicerQuery(s)}\n`).join("\n"));
        written.push(`src/dwg/apps/${appName}.dax`);
    }
    if (problems.length) {
        throw new Error(`Felder passen nicht zum Modell:\n  ${problems.join("\n  ")}`);
    }
    return { written, connector: con.name, app: appName, slicers: slicers.length };
}
