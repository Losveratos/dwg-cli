// dwg tile add: eine Kachel aus einem Template in die App-Spec schreiben. Felder kommen aus der Kommandozeile oder als
// Vorschlag aus dem Modell (suggest.mjs); die Format-Objekte des Templates stehen in der Kachel, so wie das Visual sie
// beim Anwenden schreibt. Danach gelten dieselben Prüfungen wie für jede Spec (checkSpec); app page und pbip pages
// erzeugen daraus App-Seite und Power-BI-Seite.
import fs from "node:fs";
import path from "node:path";
import { checkSpec, isShellSpec, layoutOf, slug } from "../../app/lib/app.mjs";
import { parseRef, readModel } from "../../pbip/lib/tmdl.mjs";
import { suggestBindings } from "./suggest.mjs";

/** Rollen, die mehrere Felder tragen (Liste in der Spec) */
const MULTI = new Set(["levels", "colgroup"]);

const clone = o => JSON.parse(JSON.stringify(o));
const pageKey = p => slug(p.id ?? p.template ?? p.name);

export function findPage(spec, ref) {
    const key = slug(String(ref));
    const p = (spec.pages ?? []).find(x => pageKey(x) === key || x.name === ref);
    if (!p) { throw new Error(`Seite „${ref}“ fehlt in der Spec. Vorhanden: ${(spec.pages ?? []).map(x => `${pageKey(x)} („${x.name}“)`).join(", ") || "keine"}. Neue Seite mit --new-page "<Name>".`); }
    return p;
}

function parseRect(v) {
    const r = String(v).split(/[,\s]+/).filter(Boolean).map(Number);
    if (r.length !== 4 || !r.every(Number.isFinite)) { throw new Error(`--rect „${v}“: erwartet x,y,Breite,Höhe in Seitenpixeln.`); }
    return r;
}

/** Inhaltsbereich einer Seite (mit App-Rahmen nach dem Pixelraster, sonst die ganze Seite) */
export function contentOf(spec, page) {
    if (isShellSpec(spec)) { const c = layoutOf(spec, page).content; return [c.x, c.y, c.w, c.h]; }
    return [0, 0, page.width ?? 1920, page.height ?? 1080];
}

/**
 * Kachel bauen (ohne zu schreiben).
 * @returns {{ tile, rows, problems, stem }}
 */
export function buildTile({ spec, page, template, model, given = {}, measure, id, rect, title }) {
    const sug = model ? suggestBindings(model, template, given, measure) : {
        rows: template.roles.map(r => ({ ...r, value: given[r.role] ? [].concat(given[r.role]) : null, source: given[r.role] ? "angegeben" : null, alternatives: [] })),
        problems: template.roles.filter(r => r.need === "required" && !given[r.role] && !(r.alt ?? []).every(a => given[a]))
            .map(r => `Pflichtrolle ${r.role} (${r.label.de}) ohne Feld. Mit --${r.role} angeben oder --model für Vorschläge.`),
        stem: null,
    };
    const problems = [...sug.problems];
    const bindings = {};
    for (const r of sug.rows) {
        if (!r.value?.length) { continue; }
        bindings[r.role] = MULTI.has(r.role) ? r.value : r.value[0];
        if (!MULTI.has(r.role) && r.value.length > 1) { problems.push(`Rolle ${r.role} nimmt nur ein Feld (${r.value.length} angegeben).`); }
    }
    const used = new Set((page.tiles ?? []).map(t => t.id));
    let tileId = id ? slug(String(id)) : slug(template.id);
    if (!id) { for (let n = 2; used.has(tileId); n++) { tileId = `${slug(template.id)}-${n}`; } }
    else if (used.has(tileId)) { problems.push(`Kachel „${tileId}“ gibt es auf der Seite schon (--id ändern).`); }
    let box = rect ? parseRect(rect) : null;
    if (!box) {
        if ((page.tiles ?? []).length) {
            const c = contentOf(spec, page);
            problems.push(`Die Seite hat schon Kacheln; Lage mit --rect x,y,Breite,Höhe angeben (Inhaltsbereich ${c.join(",")}, belegt: ${page.tiles.map(t => `${t.id} ${t.rect.join(",")}`).join("; ")}).`);
            box = c;
        } else { box = contentOf(spec, page); }
    }
    const tile = { id: tileId, visual: template.visual, rect: box };
    // Titel: angegeben oder der des Templates (Screenreader kündigen Visuals über ihren Titel an, dwg lint)
    tile.title = title ? String(title) : template.title.de;
    tile.bindings = bindings;
    if (template.visual === "chartkitchen") {
        // Sortierspalte aus dem Modell (App: ORDER BY, Power BI: „Nach Spalte sortieren“) und Anzeigenamen der Kennzahlen
        const cat = bindings.category;
        if (cat && model) {
            const { table, name } = parseRef(cat);
            const sortBy = model.tables.get(table)?.columns.get(name)?.sortBy;
            if (sortBy) { tile.sortBy = { [cat]: `'${table.replace(/'/g, "''")}'[${sortBy}]` }; }
        }
        const names = {};
        for (const r of template.roles.filter(x => x.kind === "Measure")) {
            if (typeof bindings[r.role] === "string") { names[`[${r.role}]`] = parseRef(bindings[r.role]).name; }
        }
        if (Object.keys(names).length) { tile.displayNames = names; }
    }
    if (template.visual === "pnl" && (bindings.rowType || bindings.formulaDef)) { tile.showItemsWithNoData = true; }
    tile.objects = clone(template.objects);
    return { tile, rows: sug.rows, problems, stem: sug.stem };
}

/**
 * Kachel in eine Spec-Datei schreiben. Ohne Spec-Datei entsteht eine neue Spec.
 * @returns {{ written: boolean, spec, page, tile, rows, problems, stem }}
 */
export function addTile({ specPath, pageRef, newPage, group, template, modelDir, given, measure, id, rect, title, dryRun }) {
    const spec = fs.existsSync(specPath) ? JSON.parse(fs.readFileSync(specPath, "utf8"))
        : { name: path.basename(specPath, path.extname(specPath)), resolution: "fullhd", pages: [] };   // App-Rahmen wie mockup import
    spec.pages ??= [];
    let page;
    if (newPage) {
        const key = slug(String(newPage));
        if (spec.pages.some(p => pageKey(p) === key)) { throw new Error(`Seite „${newPage}“ gibt es schon (--page "${newPage}" nimmt sie).`); }
        const first = spec.pages[0];
        page = { id: key, name: String(newPage), ...(group ? { group: String(group) } : {}), width: first?.width ?? 1920, height: first?.height ?? 1080, tiles: [] };
        spec.pages.push(page);
    } else {
        if (!pageRef) { throw new Error("--page <Seite> oder --new-page \"<Name>\" fehlt."); }
        page = findPage(spec, pageRef);
    }
    page.tiles ??= [];
    const model = modelDir ? readModel(modelDir) : null;
    const res = buildTile({ spec, page, template, model, given, measure, id, rect, title });
    if (res.problems.length || dryRun) { return { written: false, spec, page, ...res }; }
    page.tiles.push(res.tile);
    checkSpec(spec);
    fs.mkdirSync(path.dirname(path.resolve(specPath)), { recursive: true });
    fs.writeFileSync(specPath, JSON.stringify(spec, null, 2) + "\n");
    return { written: true, spec, page, ...res };
}

/** Ergebnis für die Konsole: Rollen, gewählte Felder, Quelle, Alternativen */
export function formatResult(res, template, specPath) {
    const pad = (s, n) => String(s) + " ".repeat(Math.max(1, n - [...String(s)].length));
    const NEED = { required: "Pflicht", recommended: "empfohlen", optional: "optional" };
    const lines = [`${template.id} · ${template.title.de} → Seite „${res.page.name}“, Kachel „${res.tile.id}“ [${res.tile.rect.join(", ")}]` +
        (res.stem != null ? `, Kennzahlen-Stamm „${res.stem}“` : "")];
    for (const r of res.rows) {
        if (!r.value && r.need === "optional") { continue; }
        const v = r.value ? r.value.join(", ") : "—";
        const more = r.alternatives?.length ? `  auch: ${r.alternatives.slice(0, 2).join(", ")}` : "";
        lines.push(`  ${pad(r.role, 16)}${pad(NEED[r.need], 11)}${pad(v, 44)}${pad(r.source ?? "", 11)}${more}`);
    }
    const opt = res.rows.filter(r => !r.value && r.need === "optional").map(r => r.role);
    if (opt.length) { lines.push(`  optional, nicht gesetzt: ${opt.join(", ")}`); }
    if (res.problems.length) { lines.push("", `Nicht geschrieben (${res.problems.length}):`, ...res.problems.map(p => `  ${p}`)); }
    else if (res.written) { lines.push("", `${specPath}: Kachel geschrieben. Weiter: dwg app page … bzw. dwg pbip pages …`); }
    else { lines.push("", "Probelauf (--dry-run): nichts geschrieben."); }
    return lines.join("\n");
}
