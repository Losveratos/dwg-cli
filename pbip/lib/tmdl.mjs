// Liest aus einem *.SemanticModel/definition/tables/*.tmdl, was die Prüfung braucht:
// Tabellen, Spalten (Datentyp, Sortierspalte) und Measures (Heimattabelle, Formatstring), dazu aus
// definition/relationships.tmdl die Beziehungen (welche Tabellen verbunden sind, für Feldvorschläge).
import fs from "node:fs";
import path from "node:path";

const NAME = String.raw`('(?:[^']|'')+'|[^\s=']+)`;
const TABLE_RX = new RegExp(String.raw`^table\s+${NAME}`);
const MEMBER_RX = new RegExp(String.raw`^\t(column|measure)\s+${NAME}`);
const PROP_RX = /^\t\t(dataType|sortByColumn|formatString):\s*(.+?)\s*$/;
const PROP_KEY = { dataType: "dataType", sortByColumn: "sortBy", formatString: "formatString" };

export const unquote = n => (n.startsWith("'") ? n.slice(1, -1).replace(/''/g, "'") : n);

/**
 * Formatstrings der Measures (`formats`) braucht der Paritätstest: Power BI gibt sie dem Visual als source.format mit,
 * die App nicht.
 * @returns {{ tables: Map<string, {columns: Map<string, {dataType?: string, sortBy?: string, formatString?: string}>, measures: Set<string>, formats: Map<string, string>}>, measureHome: Map<string, string[]>, relationships: {from: [string, string], to: [string, string]}[] }}
 */
export function readModel(modelDir) {
    const dir = path.join(modelDir, "definition", "tables");
    if (!fs.existsSync(dir)) { throw new Error(`Kein TMDL-Modell unter ${dir}`); }
    const tables = new Map();
    const measureHome = new Map();
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith(".tmdl"))) {
        let table = null;
        let member = null;
        for (const line of fs.readFileSync(path.join(dir, file), "utf8").split(/\r?\n/)) {
            const t = TABLE_RX.exec(line);
            if (t) {
                table = { name: unquote(t[1]), columns: new Map(), measures: new Set(), formats: new Map() };
                tables.set(table.name, table);
                member = null;
                continue;
            }
            if (!table) { continue; }
            const m = MEMBER_RX.exec(line);
            if (m) {
                const name = unquote(m[2]);
                if (m[1] === "column") {
                    member = {};
                    table.columns.set(name, member);
                } else {
                    member = { measure: name };
                    table.measures.add(name);
                    measureHome.set(name, [...(measureHome.get(name) ?? []), table.name]);
                }
                continue;
            }
            if (/^\t\S/.test(line)) { member = null; continue; }
            const p = member && PROP_RX.exec(line);
            if (!p) { continue; }
            if (member.measure) {
                if (p[1] === "formatString") { table.formats.set(member.measure, p[2]); }
            } else {
                member[PROP_KEY[p[1]]] = p[1] === "formatString" ? p[2] : unquote(p[2]);
            }
        }
    }
    return { tables, measureHome, relationships: readRelationships(modelDir) };
}

const REL_COL_RX = new RegExp(String.raw`^\t(from|to)Column:\s*${NAME}\.(.+?)\s*$`);

/** Beziehungen aus definition/relationships.tmdl: [{ from: [Tabelle, Spalte], to: [Tabelle, Spalte] }] */
function readRelationships(modelDir) {
    const file = path.join(modelDir, "definition", "relationships.tmdl");
    if (!fs.existsSync(file)) { return []; }
    const out = [];
    let cur = null;
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
        if (/^relationship\s/.test(line)) { cur = {}; out.push(cur); continue; }
        const m = cur && REL_COL_RX.exec(line);
        if (m) { cur[m[1]] = [unquote(m[2]), unquote(m[3])]; }
    }
    return out.filter(r => r.from && r.to);
}

/** Sind zwei Tabellen direkt über eine Beziehung verbunden (gleich welche Richtung)? */
export function related(model, a, b) {
    return (model.relationships ?? []).some(r => (r.from[0] === a && r.to[0] === b) || (r.from[0] === b && r.to[0] === a));
}

/** `'Sales Demo'[AC]` → { table: "Sales Demo", name: "AC" }, `[AC]` → { table: null, name: "AC" } */
export function parseRef(ref) {
    const m = /^\s*(?:'((?:[^']|'')+)'|([A-Za-z_][\w\- ]*?))?\s*\[((?:[^\]]|\]\])+)\]\s*$/.exec(ref);
    if (!m) { throw new Error(`"${ref}" ist keine Feldreferenz ('Tabelle'[Feld] oder [Measure]).`); }
    const table = m[1] != null ? m[1].replace(/''/g, "'") : (m[2] ?? null);
    return { table: table ? table.trim() : null, name: m[3].replace(/\]\]/g, "]") };
}

/** Löst eine Referenz gegen das Modell auf. kind: "Grouping" (Spalte) oder "Measure". */
export function resolveField(model, ref, kind) {
    const { table, name } = parseRef(ref);
    if (kind === "Measure") {
        let home = table;
        if (!home) {
            const homes = model.measureHome.get(name) ?? [];
            if (homes.length !== 1) {
                throw new Error(homes.length ? `Measure [${name}] gibt es in mehreren Tabellen (${homes.join(", ")}). Mit Tabelle angeben.`
                    : `Measure [${name}] fehlt im Modell.`);
            }
            home = homes[0];
        }
        const t = model.tables.get(home);
        if (!t) { throw new Error(`Tabelle '${home}' fehlt im Modell.`); }
        if (t.measures.has(name)) { return { node: "Measure", table: home, name }; }
        throw new Error(`'${home}'[${name}] ist kein Measure im Modell. Für Power BI muss jede Kennzahl ein Modell-Measure sein.`);
    }
    if (!table) { throw new Error(`Spalte "${ref}" braucht einen Tabellennamen.`); }
    const t = model.tables.get(table);
    if (!t) { throw new Error(`Tabelle '${table}' fehlt im Modell.`); }
    const col = t.columns.get(name);
    if (!col) { throw new Error(`Spalte '${table}'[${name}] fehlt im Modell.`); }
    return { node: "Column", table, name, ...col };
}
