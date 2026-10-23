// Erzeugt aus einer Rollenbindung (Rolle → Spalte oder Measure im Modell) die
// DAX-Abfrage, die Power BI für dasselbe Visual stellen würde: SUMMARIZECOLUMNS über
// die gruppierenden Rollen, je Measure-Rolle eine Spalte. Die Zahlen kommen damit aus
// den Measures des Modells und stimmen mit dem Power-BI-Bericht überein.

import { ROLES } from "./_generated";
import { normalizeRef } from "./dataview";
import type { Bindings, VisualKind } from "./types";

/** Spaltenreferenz mit korrekt maskiertem Tabellennamen: col("Pipeline Status", "Sort Order"). */
export function col(table: string, column: string): string {
    return `'${table.replace(/'/g, "''")}'[${column.replace(/]/g, "]]")}]`;
}

export type DaxValue = string | number | boolean | Date | null;

/** Datentyp einer Spalte wie im TMDL (`dataType`): `dateTime`, `string`, `int64`, `double`, `decimal`, `boolean`. */
export type DaxColumnType = string;

export interface DaxFilter {
    column: string;
    /** Werteliste (TREATAS). */
    values: DaxValue[];
    /** Datentyp der Spalte, wenn bekannt (aus dem TMDL); entscheidet, ob ISO-Text ein Datum ist. */
    type?: DaxColumnType;
}

export interface DaxOptions {
    /** feste Filter und Querfilter aus der App (Auswahl in anderen Visuals) */
    filters?: DaxFilter[];
    /** Sortierspalte je gruppierender Spalte, z. B. Monatsname → Monatsnummer (wie „Nach Spalte sortieren"). */
    sortBy?: Record<string, string>;
    /** Elemente ohne Daten behalten (ADDMISSINGITEMS), z. B. Summen- und Formelzeilen der GuV. */
    showItemsWithNoData?: boolean;
}

export interface DaxQuery {
    query: string;
    /** Rollenbindung auf die Spalten des Abfrageergebnisses, direkt für mountVisual. */
    bindings: Bindings;
    /** Anzeigename je Measure-Spalte (`[actual]` → `Umsatz AC`), direkt für mountVisual. */
    displayNames: Record<string, string>;
}

const COLUMN_REF = /^\s*(?:'(?:[^']|'')+'|[A-Za-z_][\w ]*)?\s*\[(?:[^\]]|\]\])+\]\s*$/;

// Datumswerte an einer Stelle: Der Konnektor liefert Datums-/Zeitspalten als ISO-Text ohne Zone
// („2026-03-01T00:00:00“), Power BI gibt sie dem Visual als Date. Visuals, Slicer und Querfilter rechnen mit Date
// (Ortszeit), Vergleiche laufen über isoDate(), DAX bekommt DATE(…) bzw. DATE(…) + TIME(…). Ist der Spaltentyp
// bekannt (TMDL `dataType`, von `dwg app page --model` in die Spec geschrieben), wird nur eine dateTime-Spalte zum
// Datum; ohne Typ gilt das Aussehen (ISO-Text = Datum).
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?$/;

/** `2026-03-01` oder `2026-03-01T10:30:00` → Date in Ortszeit, sonst null. */
export function parseIsoDate(s: string): Date | null {
    const m = ISO_DATE.exec(s);
    if (!m) { return null; }
    const d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
    return d.getMonth() === +m[2] - 1 && d.getDate() === +m[3] ? d : null;
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** Date → `2026-03-01T00:00:00` (Ortszeit, wie der Konnektor schreibt): ein Schlüssel je Zeitpunkt. */
export function isoDate(d: Date): string {
    return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** ISO-Text als Datum lesen: Spalte dateTime oder Typ unbekannt. */
const readsDate = (type?: DaxColumnType) => type == null || type === "dateTime";

/**
 * Filterwert in die gemeinsame Form bringen: Datum als Date. Auf einer Spalte mit anderem bekanntem Typ bleibt
 * ISO-Text Text (und ein Date wird ISO-Text). Slicer-Werte, Querfilter und Spec-Filter laufen hier durch.
 */
export function filterValue(v: unknown, type?: DaxColumnType): DaxValue {
    if (v == null) { return null; }
    if (v instanceof Date) { return readsDate(type) ? v : isoDate(v); }
    if (typeof v === "string" && readsDate(type)) { return parseIsoDate(v) ?? v; }
    return v as DaxValue;
}

/** Schlüssel zum Vergleichen (Schnittmenge, Slicer-Auswahl): Datum über isoDate(), sonst Typ und Text. */
export function valueKey(v: unknown, type?: DaxColumnType): string {
    const x = filterValue(v, type);
    return x instanceof Date ? `d:${isoDate(x)}` : `${typeof x}:${String(x)}`;
}

/** DAX-Literal für einen Filterwert; `type` ist der Datentyp der Spalte, wenn bekannt. */
export function daxLiteral(v: DaxValue, type?: DaxColumnType): string {
    const x = filterValue(v, type);
    if (x == null) { return "BLANK()"; }
    if (typeof x === "number") {
        if (!Number.isFinite(x)) { throw new Error(`Ungültige Zahl im Filter: ${x}`); }
        return String(x);
    }
    if (typeof x === "boolean") { return x ? "TRUE()" : "FALSE()"; }
    if (x instanceof Date) {
        const day = `DATE(${x.getFullYear()}, ${x.getMonth() + 1}, ${x.getDate()})`;
        const [h, m, s] = [x.getHours(), x.getMinutes(), x.getSeconds()];
        return h || m || s ? `${day} + TIME(${h}, ${m}, ${s})` : day;
    }
    return `"${String(x).replace(/"/g, '""')}"`;
}

function isColumnRef(ref: string): boolean {
    return COLUMN_REF.test(ref) && !/^\s*\[/.test(ref);
}

export function daxQuery(kind: VisualKind, bindings: Bindings, opts: DaxOptions = {}): DaxQuery {
    const spec = ROLES[kind];
    const kinds = spec.kind as Record<string, string>;
    const groups: string[] = [];
    const measures: [string, string][] = [];
    const out: Bindings = {};
    const displayNames: Record<string, string> = {};

    for (const role of spec.order) {
        const refs = bindings[role];
        if (refs == null) { continue; }
        const list = ([] as string[]).concat(refs);
        if (kinds[role] === "Measure") {
            if (list.length !== 1) { throw new Error(`Measure-Rolle "${role}" braucht genau einen Ausdruck.`); }
            measures.push([role, list[0]]);
            out[role] = `[${role}]`;
            // Measure-Verweis [Umsatz AC] oder 'Sales'[Umsatz AC] → Anzeigename „Umsatz AC“, sonst die Rolle
            const m = /^\s*(?:'(?:[^']|'')+'|[A-Za-z_][\w\- ]*)?\s*\[((?:[^\]]|\]\])+)\]\s*$/.exec(list[0]);
            displayNames[`[${role}]`] = m ? m[1].replace(/\]\]/g, "]") : role;
        } else {
            for (const ref of list) {
                if (!isColumnRef(ref)) {
                    throw new Error(`Rolle "${role}": "${ref}" ist keine Spaltenreferenz ('Tabelle'[Spalte]).`);
                }
                if (!groups.includes(ref)) { groups.push(ref); }
            }
            out[role] = list.length === 1 ? normalizeRef(list[0]) : list.map(normalizeRef);
        }
    }
    for (const role of Object.keys(bindings)) {
        if (!kinds[role]) { throw new Error(`${kind} kennt die Rolle "${role}" nicht. Rollen: ${spec.order.join(", ")}`); }
    }
    if (!groups.length && !measures.length) { throw new Error("Keine Rolle gebunden."); }

    // Sortierspalten gruppieren mit (1:1 zur Anzeigespalte) und ordnen das Ergebnis
    const order: string[] = [];
    for (const g of groups) {
        const s = opts.sortBy?.[g] ?? opts.sortBy?.[normalizeRef(g)];
        if (s) {
            if (!isColumnRef(s)) { throw new Error(`Sortierspalte "${s}" ist keine Spaltenreferenz.`); }
            order.push(s);
        } else {
            order.push(g);
        }
    }
    const groupBy = [...groups];
    for (const s of order) { if (!groupBy.includes(s)) { groupBy.push(s); } }

    const filters = (opts.filters ?? []).map(f => {
        if (!isColumnRef(f.column)) { throw new Error(`Filterspalte "${f.column}" ist keine Spaltenreferenz.`); }
        return `TREATAS({${f.values.map(v => daxLiteral(v, f.type)).join(", ")}}, ${f.column})`;
    });

    const indent = "        ";
    const args = [
        ...groupBy,
        ...filters,
        ...measures.map(([role, expr]) => `"${role}", ${expr}`),
    ];
    let table = `SUMMARIZECOLUMNS(\n${args.map(a => indent + a).join(",\n")}\n    )`;
    if (opts.showItemsWithNoData && groupBy.length) {
        table = `ADDMISSINGITEMS(\n${groupBy.map(a => indent + a).join(",\n")},\n    ${table},\n${groupBy.map(a => indent + a).join(",\n")}\n    )`;
    }
    const query = `EVALUATE\n    ${table}${order.length ? `\nORDER BY ${order.join(", ")}` : ""}`;
    return { query, bindings: out, displayNames };
}
