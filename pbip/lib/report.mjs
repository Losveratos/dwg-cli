// Arbeitet auf einem *.Report-Ordner (PBIP/PBIR): Report anlegen, Custom Visuals aus
// .pbiviz eintragen, Seiten aus einer App-Spec erzeugen.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { readZip } from "./zip.mjs";
import { readModel, resolveField, parseRef } from "./tmdl.mjs";
import { SCHEMA, newName, objects, queryState, categoricalFilter, visualContainer, pageJson, textbox, slicerVisual } from "./pbir.mjs";
import { checkSpec, slug, isShellSpec, layoutOf } from "../../app/lib/app.mjs";
import { slicerStack } from "../../layout/pixelgrid.mjs";

/** Kurzname in der App-Spec → Präfix der Visual-GUID */
export const VISUAL_KINDS = { chartkitchen: "chartKitchenByDatenWG", pnl: "pnlByDatenWG" };

const readJson = f => JSON.parse(fs.readFileSync(f, "utf8"));
const writeJson = (f, data) => {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify(data, null, 2) + "\n");
};
const reportJsonPath = dir => path.join(dir, "definition", "report.json");

/** Bericht muss ein PBIR-Ordner sein (definition.pbir vorhanden) */
function needReport(dir) {
    if (!fs.existsSync(path.join(dir, "definition.pbir"))) { throw new Error(`Bericht ${dir} nicht gefunden (definition.pbir fehlt).`); }
}

/** Pfad zum Semantikmodell aus definition.pbir (byPath) */
export function modelDirOf(reportDir) {
    needReport(reportDir);
    const pbir = readJson(path.join(reportDir, "definition.pbir"));
    const rel = pbir.datasetReference?.byPath?.path;
    if (!rel) { throw new Error("definition.pbir verweist nicht per byPath auf ein Modell (byConnection wird nicht unterstützt)."); }
    return path.resolve(reportDir, rel);
}

/**
 * Neuer, leerer Report neben einem Modell. Theme, Basis-Theme und Einstellungen kommen aus
 * einem bestehenden Report (template), damit das Ergebnis wie die anderen Berichte aussieht.
 */
export function newReport({ out, name, modelDir, template }) {
    if (fs.existsSync(out)) { throw new Error(`${out} gibt es schon.`); }
    if (!fs.existsSync(path.join(modelDir, "definition"))) { throw new Error(`Modellordner ${modelDir} nicht gefunden (definition fehlt, erwartet wird ein TMDL-Modell).`); }
    if (!fs.existsSync(reportJsonPath(template))) { throw new Error(`Vorlagenbericht ${template} nicht gefunden (definition/report.json fehlt).`); }
    const tpl = readJson(reportJsonPath(template));
    writeJson(path.join(out, ".platform"), {
        $schema: "https://developer.microsoft.com/json-schemas/fabric/gitIntegration/platformProperties/2.0.0/schema.json",
        metadata: { type: "Report", displayName: name },
        config: { version: "2.0", logicalId: crypto.randomUUID() },
    });
    writeJson(path.join(out, "definition.pbir"), {
        $schema: "https://developer.microsoft.com/json-schemas/fabric/item/report/definitionProperties/2.0.0/schema.json",
        version: "4.0",
        datasetReference: { byPath: { path: path.relative(out, modelDir).split(path.sep).join("/") } },
    });
    writeJson(path.join(out, "definition", "version.json"), readJson(path.join(template, "definition", "version.json")));
    // Theme-Dateien übernehmen (nur die, auf die themeCollection zeigt)
    const keep = [tpl.themeCollection?.baseTheme?.name, tpl.themeCollection?.customTheme?.name].filter(Boolean);
    const packages = [];
    for (const pkg of tpl.resourcePackages ?? []) {
        if (pkg.type !== "SharedResources" && pkg.type !== "RegisteredResources") { continue; }
        const items = pkg.items.filter(i => keep.some(k => i.name === k || i.name === `${k}.json` || i.path.endsWith(`${k}.json`)));
        if (!items.length) { continue; }
        for (const i of items) {
            const src = path.join(template, "StaticResources", pkg.name, i.path);
            const dst = path.join(out, "StaticResources", pkg.name, i.path);
            fs.mkdirSync(path.dirname(dst), { recursive: true });
            fs.copyFileSync(src, dst);
        }
        packages.push({ ...pkg, items });
    }
    const report = { $schema: tpl.$schema, themeCollection: tpl.themeCollection, resourcePackages: packages };
    for (const k of ["objects", "settings", "slowDataSourceSettings"]) { if (tpl[k]) { report[k] = tpl[k]; } }
    writeJson(reportJsonPath(out), report);
    writeJson(path.join(out, "definition", "pages", "pages.json"), { $schema: SCHEMA.pages, pageOrder: [] });
    return out;
}

/** Trägt ein Custom Visual aus einer .pbiviz in den Report ein (ersetzt eine ältere Version). */
export function registerVisual(reportDir, pbivizFile) {
    needReport(reportDir);
    if (!fs.existsSync(pbivizFile)) { throw new Error(`Datei ${pbivizFile} nicht gefunden.`); }
    const files = readZip(fs.readFileSync(pbivizFile));
    const pkgName = Object.keys(files).find(f => /^resources\/.+\.pbiviz\.json$/.test(f));
    if (!files["package.json"] || !pkgName) { throw new Error(`${pbivizFile} ist keine gültige .pbiviz (package.json oder resources/*.pbiviz.json fehlt).`); }
    const meta = JSON.parse(files[pkgName].toString("utf8"));
    const guid = meta.visual.guid;
    const target = path.join(reportDir, "CustomVisuals", guid);
    fs.rmSync(target, { recursive: true, force: true });
    fs.mkdirSync(path.join(target, "resources"), { recursive: true });
    fs.writeFileSync(path.join(target, "package.json"), files["package.json"]);
    fs.writeFileSync(path.join(target, "resources", `${guid}.pbiviz.json`), files[pkgName]);

    const rj = readJson(reportJsonPath(reportDir));
    const before = (rj.resourcePackages ?? []).find(p => p.name === guid);
    rj.resourcePackages = (rj.resourcePackages ?? []).filter(p => p.name !== guid);
    rj.resourcePackages.push({
        name: guid,
        type: "CustomVisual",
        items: [{ name: `${guid}.pbiviz.json`, path: `${guid}.pbiviz.json`, type: "CustomVisualMetadata" }],
    });
    writeJson(reportJsonPath(reportDir), rj);
    return { guid, version: meta.visual.version, displayName: meta.visual.displayName, replaced: Boolean(before) };
}

/** Seitenname mit Template-Kennung („C03 Säulen im Zeitverlauf“), wie pageLabel() in der App */
export function pageLabel(page) {
    const t = page.template?.trim();
    return t && !page.name.trim().toLowerCase().startsWith(t.toLowerCase()) ? `${t} ${page.name}` : page.name;
}

/**
 * Rahmen einer Seite nach dem Pixelraster (layout/pixelgrid.mjs, wie die App): im Kopf ein Textfeld mit Kennung + Name, Gruppe
 * und Erklärtext, im Filter-Panel links die Slicer der Spec (Sync-Gruppe je Spalte, Auswahl gilt auf allen Seiten,
 * leere Werte ausgeblendet), in der Fußleiste der Fußtext der Spec. Kacheln liegen im Inhaltsbereich.
 */
function frameVisuals(spec, page, model, zFrom) {
    const out = [];
    const L = layoutOf(spec, page);
    const { header, footer } = L;
    const stack = slicerStack(L, (spec.slicers ?? []).length);
    const add = json => out.push({ name: json.name, json });
    const title = [{ text: pageLabel(page), size: 14, color: "#1F2328", bold: true }];
    if (page.group) { title.push({ text: `   ${page.group}`, size: 9, color: "#C25A2D", bold: true }); }
    const paragraphs = [{ runs: title }];
    if (page.description) { paragraphs.push({ text: page.description, size: 10, color: "#5F6368" }); }
    add(textbox({ name: newName(), rect: [L.m0, header.y, header.w - 2 * L.m0, header.h], z: zFrom, tabOrder: zFrom, paragraphs }));
    (spec.slicers ?? []).forEach((s, i) => {
        const col = resolveField(model, s.column, "Grouping");
        const z = zFrom + (i + 1) * 1000;
        add(slicerVisual({
            name: newName(), rect: stack[i], z, tabOrder: z, col, label: s.label, values: s.default ?? [],
            multi: Boolean(s.multi), hideEmpty: !s.showEmpty, syncGroup: `dwg-${slug(`${col.table} ${col.name}`)}`,
        }));
    });
    if (spec.footer) {
        const z = zFrom + 900;
        add(textbox({ name: newName(), rect: [L.m0, footer.y, footer.w - 2 * L.m0, footer.h], z, tabOrder: z,
            paragraphs: [{ text: spec.footer, size: 8, color: "#5F6368" }] }));
    }
    return out;
}

/** Datenrollen eines eingetragenen Visuals (aus seiner pbiviz.json) */
export function registeredVisuals(reportDir) {
    const dir = path.join(reportDir, "CustomVisuals");
    const out = {};
    if (!fs.existsSync(dir)) { return out; }
    for (const guid of fs.readdirSync(dir)) {
        const f = path.join(dir, guid, "resources", `${guid}.pbiviz.json`);
        if (!fs.existsSync(f)) { continue; }
        const meta = readJson(f);
        out[guid] = {
            version: meta.visual.version,
            roles: Object.fromEntries(meta.capabilities.dataRoles.map(r => [r.name, r.kind])),
            max: Object.fromEntries(Object.entries(meta.capabilities.dataViewMappings?.[0]?.conditions?.[0] ?? {}).map(([r, c]) => [r, c.max])),
            objects: Object.fromEntries(Object.entries(meta.capabilities.objects ?? {}).map(([o, d]) => [o, Object.keys(d.properties ?? {})])),
            drill: meta.capabilities.drilldown?.roles ?? [],
        };
    }
    return out;
}

/**
 * Erzeugt Seiten aus einer App-Spec. Eine Seite mit gleichem Anzeigenamen wird ersetzt,
 * damit der Lauf wiederholbar ist. Gibt Hinweise (warnings) zurück.
 */
export function addPages(reportDir, spec) {
    needReport(reportDir);
    checkSpec(spec);
    const model = readModel(modelDirOf(reportDir));
    const visuals = registeredVisuals(reportDir);
    const warnings = [];
    const slicers = spec.slicers ?? [];
    for (const s of slicers) {
        const c = resolveField(model, s.column, "Grouping");
        const want = s.sortBy ? parseRef(s.sortBy).name : null;
        if (want && want !== c.name && c.sortBy !== want) {
            warnings.push(`Slicer „${s.label}“: '${c.table}'[${c.name}] ist im Modell ${c.sortBy ? `nach [${c.sortBy}]` : "nicht"} sortiert, die App sortiert nach [${want}]. In Power BI „Nach Spalte sortieren“ setzen.`);
        }
    }
    const pagesDir = path.join(reportDir, "definition", "pages");
    const pagesJson = readJson(path.join(pagesDir, "pages.json"));
    const created = [];

    for (const page of spec.pages) {
        // gleichnamige Seite ersetzen; ihre ID und Position bleiben (Links und Lesezeichen im Service, kleiner Git-Diff)
        let pageId = null;
        for (const id of [...pagesJson.pageOrder]) {
            const pj = path.join(pagesDir, id, "page.json");
            if (fs.existsSync(pj) && readJson(pj).displayName === pageLabel(page)) {
                fs.rmSync(path.join(pagesDir, id), { recursive: true, force: true });
                if (pageId) { pagesJson.pageOrder = pagesJson.pageOrder.filter(p => p !== id); } else { pageId = id; }
            }
        }
        const reused = Boolean(pageId);
        pageId ??= newName();
        const filters = (page.filters ?? []).map(f => categoricalFilter(resolveField(model, f.column, "Grouping"), f.values));

        page.tiles.forEach((tile, i) => {
            const prefix = VISUAL_KINDS[tile.visual];
            const guid = Object.keys(visuals).find(g => g.startsWith(prefix ?? "\0"));
            if (!guid) { throw new Error(`Kachel ${tile.id}: Visual "${tile.visual}" ist im Report nicht eingetragen (erst dwg-pbip register).`); }
            const caps = visuals[guid];
            const roles = {};
            for (const [role, refs] of Object.entries(tile.bindings)) {
                const kind = caps.roles[role];
                if (!kind) { throw new Error(`Kachel ${tile.id}: ${tile.visual} kennt die Rolle "${role}" nicht.`); }
                const list = [].concat(refs);
                if (caps.max[role] != null && list.length > caps.max[role]) {
                    throw new Error(`Kachel ${tile.id}: Rolle "${role}" nimmt höchstens ${caps.max[role]} Feld(er).`);
                }
                roles[role] = {
                    kind,
                    fields: list.map(ref => {
                        try { return { ...resolveField(model, ref, kind), ref }; }
                        catch (e) { throw new Error(`Kachel ${tile.id}, Rolle ${role}: ${e.message}`); }
                    }),
                };
            }
            // Sortierung: in Power BI eine Eigenschaft des Modells, nicht des Visuals
            for (const [col, sortCol] of Object.entries(tile.sortBy ?? {})) {
                const c = resolveField(model, col, "Grouping");
                const want = parseRef(sortCol).name;
                if (c.sortBy !== want) {
                    warnings.push(`Kachel ${tile.id}: '${c.table}'[${c.name}] ist im Modell ${c.sortBy ? `nach [${c.sortBy}]` : "nicht"} sortiert, die App sortiert nach [${want}]. In Power BI „Nach Spalte sortieren“ setzen.`);
                }
            }
            for (const obj of Object.keys(tile.objects ?? {})) {
                if (!caps.objects[obj]) { warnings.push(`Kachel ${tile.id}: Objekt "${obj}" gibt es in ${tile.visual} nicht.`); continue; }
                for (const prop of Object.keys(tile.objects[obj])) {
                    if (!caps.objects[obj].includes(prop)) { warnings.push(`Kachel ${tile.id}: Eigenschaft ${obj}.${prop} gibt es in ${tile.visual} nicht.`); }
                }
            }
            const name = newName();
            writeJson(path.join(pagesDir, pageId, "visuals", name, "visual.json"), visualContainer({
                name,
                rect: tile.rect,
                z: (i + 1) * 1000,
                tabOrder: i * 1000,
                visualType: guid,
                state: queryState(roles, { showAll: Boolean(tile.showItemsWithNoData), displayNames: tile.displayNames, drillRoles: caps.drill }),
                objs: objects(tile.objects),
                title: tile.title,
                subtitle: tile.subtitle,
                filters: (tile.filters ?? []).map(f => categoricalFilter(resolveField(model, f.column, "Grouping"), f.values)),
            }));
        });

        for (const v of isShellSpec(spec) ? frameVisuals(spec, page, model, (page.tiles.length + 1) * 1000) : []) {
            writeJson(path.join(pagesDir, pageId, "visuals", v.name, "visual.json"), v.json);
        }
        writeJson(path.join(pagesDir, pageId, "page.json"), pageJson({
            name: pageId, displayName: pageLabel(page), width: page.width ?? 1920, height: page.height ?? 1080,
            background: page.background, filters,
        }));
        if (!reused) { pagesJson.pageOrder.push(pageId); }
        created.push({ id: pageId, name: pageLabel(page), tiles: page.tiles.length, slicers: slicers.length });
    }
    if (!pagesJson.activePageName || !pagesJson.pageOrder.includes(pagesJson.activePageName)) {
        pagesJson.activePageName = pagesJson.pageOrder[0];
    }
    writeJson(path.join(pagesDir, "pages.json"), pagesJson);
    return { created, warnings };
}
