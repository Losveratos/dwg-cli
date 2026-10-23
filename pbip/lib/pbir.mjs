// PBIR-Bausteine: Literale, Felder, Formatbereich-Objekte, Filter, Visual- und Seiten-JSON.
// Formen wie Power BI Desktop sie schreibt (abgeglichen mit „ChartKitchen byDatenWG Demo.Report“).
import crypto from "node:crypto";

export const SCHEMA = {
    page: "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.1.0/schema.json",
    pages: "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/pagesMetadata/1.1.0/schema.json",
    visual: "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.10.0/schema.json",
};

/** 20 Hex-Zeichen wie die Namen, die Desktop vergibt */
export const newName = () => crypto.randomBytes(10).toString("hex");

/** Literal für Formatbereich-Objekte (Zahlen als Double „D“, wie Desktop) */
export function lit(value) {
    let text;
    if (typeof value === "boolean") { text = String(value); }
    else if (typeof value === "number") { text = `${value}D`; }
    else { text = `'${String(value).replace(/'/g, "''")}'`; }
    return { expr: { Literal: { Value: text } } };
}

/**
 * Literal für Filterwerte, passend zum Datentyp der Spalte (int64 → L, double → D). Ohne Datentyp im TMDL
 * (z. B. Spalten berechneter Tabellen wie 'Calender'[Year]) gelten ganze Zahlen als int64.
 */
export function filterLit(value, dataType) {
    if (value === null) { return { Literal: { Value: "null" } }; }
    if (typeof value === "boolean") { return { Literal: { Value: String(value) } }; }
    if (typeof value === "number") {
        return { Literal: { Value: dataType === "int64" || (dataType == null && Number.isInteger(value)) ? `${Math.trunc(value)}L` : `${value}D` } };
    }
    return { Literal: { Value: `'${String(value).replace(/'/g, "''")}'` } };
}

const COLOR_RX = /^#[0-9a-f]{6}$/i;

/** { chart: { orientation: "cards" } } → { chart: [{ properties: { orientation: {expr…} } }] } */
export function objects(spec = {}) {
    const out = {};
    for (const [obj, props] of Object.entries(spec)) {
        const properties = {};
        for (const [k, v] of Object.entries(props ?? {})) {
            if (v == null) { continue; }
            properties[k] = typeof v === "string" && COLOR_RX.test(v) && /color/i.test(k)
                ? { solid: { color: lit(v) } } : lit(v);
        }
        out[obj] = [{ properties }];
    }
    return out;
}

export function fieldExpr(f) {
    return { [f.node]: { Expression: { SourceRef: { Entity: f.table } }, Property: f.name } };
}

/**
 * queryState aus aufgelösten Rollen: { role: [field, …] }.
 * `active` ist Drill-Zustand: Power BI fragt aus einer Rolle mit mehreren Feldern nur die aktiven ab, auch wenn das
 * Visual die Rolle nicht als drilldown erklärt (P&L `levels` [L1, L2] lieferte sonst nur L1). Deshalb nur für Rollen
 * aus capabilities.drilldown (`drillRoles`), dort die oberste Ebene. Anzeigenamen gelten je Feld (`'T'[Feld]`) oder je
 * Rolle (`[actual]`, wie die App sie liest).
 */
export function queryState(roles, { showAll = false, displayNames = {}, drillRoles = [] } = {}) {
    const state = {};
    for (const [role, entry] of Object.entries(roles)) {
        const projections = entry.fields.map((f, i) => {
            const p = { field: fieldExpr(f), queryRef: `${f.table}.${f.name}`, nativeQueryRef: f.name };
            // Schlüssel wie in der Spec ('T'[Feld]) oder normalisiert (T[Feld], wie die App sie liest), sonst je Rolle
            const name = displayNames[f.ref] ?? displayNames[`${f.table}[${f.name}]`]
                ?? (entry.fields.length === 1 ? displayNames[`[${role}]`] : undefined);
            if (name) { p.displayName = name; }
            if (drillRoles.includes(role) && i === 0) { p.active = true; }
            return p;
        });
        state[role] = { projections };
        if (showAll && entry.kind === "Grouping") { state[role].showAll = true; }
    }
    return state;
}

/** Kategorischer Filter „Spalte in (Werte)“, wie ihn der Filterbereich anlegt */
export function categoricalFilter(col, values) {
    return {
        name: newName(),
        field: fieldExpr(col),
        type: "Categorical",
        filter: {
            Version: 2,
            From: [{ Name: "t", Entity: col.table, Type: 0 }],
            Where: [{
                Condition: {
                    In: {
                        Expressions: [{ Column: { Expression: { SourceRef: { Source: "t" } }, Property: col.name } }],
                        Values: values.map(v => [filterLit(v, col.dataType)]),
                    },
                },
            }],
        },
        howCreated: "User",
    };
}

/**
 * Kachelrahmen wie in der App (DwgPage: 8 px Innenabstand, 1 px Rand #E1DFD6, Radius 9, weiße Fläche). Ohne diese
 * Angaben gilt der Innenabstand des Themes (Fluent2: 16/14/16/16 px), die Visuals bekämen in Power BI eine kleinere
 * Fläche als in der App: KPI-Karten 104 statt 116 px hoch, dann fällt die zweite Δ-Zeile weg.
 */
export const TILE_FRAME = { padding: 8, border: "#E1DFD6", radius: 9, background: "#FFFFFF" };

export function visualContainer({ name, rect, z, tabOrder, visualType, state, objs, title, subtitle, filters }) {
    const [x, y, width, height] = rect;
    const f = TILE_FRAME;
    // Containertitel nicht sichtbar, wie in der App (dort nur aria-label): sichtbare Titel stehen im Visual selbst
    // (ibcsTitle, titleBlock) und sehen so in beiden Zielen gleich aus. Der Text bleibt als Name des Visuals erhalten.
    const container = {
        title: [{ properties: { show: lit(false), ...(title ? { text: lit(title) } : {}) } }],
        padding: [{ properties: { top: lit(f.padding), bottom: lit(f.padding), left: lit(f.padding), right: lit(f.padding) } }],
        border: [{ properties: { show: lit(true), color: { solid: { color: lit(f.border) } }, width: lit(1), radius: lit(f.radius) } }],
        background: [{ properties: { show: lit(true), color: { solid: { color: lit(f.background) } }, transparency: lit(0) } }],
        dropShadow: [{ properties: { show: lit(false) } }],
    };
    if (subtitle) { container.subTitle = [{ properties: { show: lit(false), text: lit(subtitle) } }]; }
    const visual = {
        $schema: SCHEMA.visual,
        name,
        position: { x, y, z, width, height, tabOrder },
        visual: {
            visualType,
            query: { queryState: state },
            objects: objs,
            visualContainerObjects: container,
            drillFilterOtherVisuals: true,
        },
    };
    if (filters?.length) { visual.filterConfig = { filters }; }
    return visual;
}

export function pageJson({ name, displayName, width, height, background, filters }) {
    const page = {
        $schema: SCHEMA.page,
        name,
        displayName,
        displayOption: "FitToWidth",
        height,
        width,
    };
    if (filters?.length) { page.filterConfig = { filters }; }
    if (background) {
        page.objects = { background: [{ properties: { color: { solid: { color: lit(background) } }, transparency: lit(0) } }] };
    }
    return page;
}

/** Filter „ist nicht leer“ auf eine Spalte (wie „(Leer)“ im Filterbereich abwählen) */
export function notBlankFilter(col) {
    return {
        Version: 2,
        From: [{ Name: "t", Entity: col.table, Type: 0 }],
        Where: [{
            Condition: {
                Not: {
                    Expression: {
                        In: {
                            Expressions: [{ Column: { Expression: { SourceRef: { Source: "t" } }, Property: col.name } }],
                            Values: [[{ Literal: { Value: "null" } }]],
                        },
                    },
                },
            },
        }],
    };
}

const solid = color => ({ solid: { color: lit(color) } });

/** Rahmen und Fläche wie die Slicer im Demo-Report (ruhig, ohne Schatten) */
function quietContainer(border = "#E1DFD6") {
    return {
        title: [{ properties: { show: lit(false) } }],
        background: [{ properties: { show: lit(true), color: solid("#FFFFFF"), transparency: lit(0) } }],
        border: [{ properties: { show: lit(true), color: solid(border), width: lit(1), radius: lit(6) } }],
        dropShadow: [{ properties: { show: lit(false) } }],
    };
}

/**
 * Textfeld mit Absätzen: [{ text, size (pt), color, bold }] oder [{ runs: [{ text, size, color, bold }, …] }].
 */
export function textbox({ name, rect, z, tabOrder, paragraphs }) {
    const [x, y, width, height] = rect;
    return {
        $schema: SCHEMA.visual,
        name,
        position: { x, y, z, width, height, tabOrder },
        visual: {
            visualType: "textbox",
            objects: {
                general: [{
                    properties: {
                        paragraphs: paragraphs.map(p => ({
                            textRuns: (p.runs ?? [p]).map(r => ({
                                value: r.text,
                                textStyle: { fontSize: `${r.size ?? 11}pt`, color: r.color ?? "#1F2328", ...(r.bold ? { fontWeight: "bold" } : {}) },
                            })),
                        })),
                    },
                }],
            },
            visualContainerObjects: {
                background: [{ properties: { show: lit(false) } }],
                border: [{ properties: { show: lit(false) } }],
                dropShadow: [{ properties: { show: lit(false) } }],
            },
            drillFilterOtherVisuals: true,
        },
    };
}

/**
 * Nativer Slicer (Dropdown) auf eine Spalte. Einfach- oder Mehrfachauswahl, Startauswahl als Slicer-Filter,
 * Sync-Gruppe, damit die Auswahl über alle Seiten gilt (wie „Slicer synchronisieren“ in Desktop). `hideEmpty`:
 * Visual-Filter „ist nicht leer“, damit der Slicer keinen Eintrag (Leer) zeigt; die Daten filtert das nicht.
 */
export function slicerVisual({ name, rect, z, tabOrder, col, label, values = [], multi = false, hideEmpty = false, syncGroup }) {
    const [x, y, width, height] = rect;
    const objs = {
        data: [{ properties: { mode: lit("Dropdown") } }],
        selection: [{ properties: { singleSelect: lit(!multi), selectAllCheckboxEnabled: lit(Boolean(multi)) } }],
        header: [{ properties: { show: lit(true), textSize: lit(11), fontColor: solid("#374151"), bold: lit(true) } }],
        items: [{ properties: { textSize: lit(11), fontColor: solid("#374151") } }],
    };
    if (values.length) {
        objs.general = [{ properties: { filter: { filter: categoricalFilter(col, values).filter } } }];
    }
    return {
        $schema: SCHEMA.visual,
        name,
        position: { x, y, z, width, height, tabOrder },
        visual: {
            visualType: "slicer",
            query: {
                queryState: {
                    Values: {
                        projections: [{
                            field: fieldExpr(col), queryRef: `${col.table}.${col.name}`, nativeQueryRef: col.name,
                            displayName: label, active: true,
                        }],
                    },
                },
            },
            objects: objs,
            visualContainerObjects: quietContainer(),
            syncGroup: { groupName: syncGroup, fieldChanges: true, filterChanges: true },
            drillFilterOtherVisuals: true,
        },
        filterConfig: { filters: [{ name: newName(), field: fieldExpr(col), type: "Categorical", ...(hideEmpty ? { filter: notBlankFilter(col) } : {}) }] },
    };
}
