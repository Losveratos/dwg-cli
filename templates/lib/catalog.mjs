// Template-Katalog lesen (visuals/dist/templates.json, erzeugt von dwg visuals build) und für die Konsole aufbereiten.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CATALOG_FILE = path.resolve(HERE, "../../visuals/dist/templates.json");

export const NEED = { required: { de: "Pflicht", en: "required" }, recommended: { de: "empfohlen", en: "recommended" }, optional: { de: "optional", en: "optional" } };
export const VISUAL = { chartkitchen: "ChartKitchen", pnl: "P&L Statement" };

export function loadCatalog(file = CATALOG_FILE) {
    if (!fs.existsSync(file)) { throw new Error(`${path.relative(process.cwd(), file)} fehlt: erst \`node dwg.mjs visuals build\`.`); }
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function findTemplate(catalog, id) {
    const t = catalog.templates.find(x => x.id.toLowerCase() === String(id).toLowerCase());
    if (!t) { throw new Error(`Template „${id}“ gibt es nicht. Vorhanden: ${catalog.templates.map(x => x.id).join(", ")}.`); }
    return t;
}

/**
 * P&L-Kachel ohne AC: P&L 1.8.4 zeichnet dann nichts (das Visual verlangt AC, Hinweis „AC (Ist)“). Die Forecast-Templates
 * T01D, T02E und T02F führen AC nur als Empfehlung, weil der Berichtsmonat später wählbar wird; bis dahin warnen tile add
 * und dwg lint. Gibt den Text der Warnung zurück oder null.
 */
export function pnlNoAcWarning(tile, catalog = null) {
    if (tile?.visual !== "pnl" || !tile.bindings || typeof tile.bindings !== "object") { return null; }
    if ([].concat(tile.bindings.ac ?? []).some(r => typeof r === "string" && r)) { return null; }
    let v = catalog?.versions?.pnl;
    if (!v) { try { v = loadCatalog().versions?.pnl; } catch { v = null; } }
    const version = v ? String(v).replace(/\.0$/, "") : "";
    return `P&L${version ? ` ${version}` : ""} zeichnet ohne AC nichts; AC binden, bis der Berichtsmonat wählbar ist.`;
}

const pad = (s, n) => String(s) + " ".repeat(Math.max(1, n - [...String(s)].length));

/** Übersicht aller Templates, nach Visual und Gruppe */
export function formatList(catalog, lang = "de", visual = null) {
    const lines = [];
    for (const v of Object.keys(VISUAL)) {
        if (visual && v !== visual) { continue; }
        const ts = catalog.templates.filter(t => t.visual === v);
        lines.push(`${VISUAL[v]} ${catalog.versions?.[v] ?? ""}`.trim());
        let group = null;
        for (const t of ts) {
            if (t.group?.id !== group) { group = t.group?.id; lines.push(`  ${t.group ? t.group.title[lang] : ""}`); }
            const req = t.roles.filter(r => r.need === "required").map(r => r.role);
            lines.push(`    ${pad(t.id, 6)}${pad(t.title[lang], 44)}${lang === "de" ? "Pflicht" : "required"}: ${req.join(", ")}`);
        }
        lines.push("");
    }
    lines.push(lang === "de" ? "Details: dwg templates <ID>   Kachel anlegen: dwg tile add --template <ID> …"
        : "Details: dwg templates <ID>   Add a tile: dwg tile add --template <ID> …");
    return lines.join("\n");
}

/** ein Template im Detail: Zweck, Rollen, was das Template im Visual einstellt */
export function formatTemplate(t, lang = "de") {
    const de = lang === "de";
    const lines = [`${t.id} · ${t.title[lang]} (${VISUAL[t.visual]}${t.group ? `, ${t.group.title[lang]}` : ""})`];
    if (t.use?.[lang]) { lines.push(`  ${t.use[lang]}`); }
    lines.push("", de ? "  Rollen" : "  Roles");
    for (const need of ["required", "recommended", "optional"]) {
        for (const r of t.roles.filter(x => x.need === need)) {
            const alt = r.alt ? (de ? `  (oder ${r.alt.join(" + ")})` : `  (or ${r.alt.join(" + ")})`) : "";
            const hint = r.hint ? `  · ${r.hint[lang]}` : "";
            lines.push(`    ${pad(r.role, 16)}${pad(NEED[need][lang], 12)}${pad(r.kind === "Measure" ? (de ? "Kennzahl" : "measure") : (de ? "Spalte" : "column"), 10)}${r.label[lang]}${alt}${hint}`);
        }
    }
    lines.push("", de ? "  Stellt im Visual ein" : "  Sets in the visual");
    for (const [obj, props] of Object.entries(t.objects)) {
        const kv = Object.entries(props).filter(([k]) => k !== "template" && k !== "templateApplied").map(([k, v]) => `${k}=${v}`);
        lines.push(`    ${obj}: ${kv.join(", ")}`);
    }
    lines.push("", de ? `  Kachel anlegen: dwg tile add --spec <app-spec.json> --page <Seite> --template ${t.id} --model <X.SemanticModel> [--measure <Stamm>]`
        : `  Add a tile: dwg tile add --spec <app-spec.json> --page <page> --template ${t.id} --model <X.SemanticModel> [--measure <stem>]`);
    return lines.join("\n");
}
