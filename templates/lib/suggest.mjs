// Feldvorschläge für die Rollen eines Templates aus einem TMDL-Modell (dwg tile add).
//
// Kennzahlen: Szenario am Namen erkennen (AC/Ist, PY/VJ/Vorjahr, PL/Plan/Budget, FC/Forecast, FY/Gesamtjahr), den Rest
// des Namens als Stamm nehmen („Umsatz AC“ → Stamm „umsatz“, Szenario AC). Alle Szenario-Rollen einer Kachel kommen aus
// demselben Stamm; der Stamm kommt aus --measure, aus einer explizit gesetzten Kennzahl oder, wenn das Modell nur einen
// Stamm mit Ist-Wert hat, von selbst. Abweichungen (±, Δ, delta, %-Abweichung) sind keine Szenario-Werte und fallen weg;
// Varianten wie „bis Ist“, YTD, R12 oder FC2 bleiben Alternativen hinter dem einfachen Measure; nur wenn ein P&L-Template
// Ist über das laufende Jahr ohne Periodenfeld vergleicht, gehen „PY/PL bis Ist“ vor (gleiche Monate wie das Ist).
// Spalten: Zeitachse aus der Kalendertabelle (Monatsname mit Sortierspalte vor Monat und Datum), Ebenen L1..Ln aus
// einer Tabelle, die GuV-Logik (Zeilentyp, Formel, Vorzeichen …) aus derselben Tabelle wie die Ebenen. Bei den
// P&L-Strukturtabellen (T01/T02) sind die Ebenen Dimensionen (Region, Land, Kunde); die gibt man an, dwg nennt Kandidaten.
// Ein Vorschlag wird nur übernommen, wenn er eindeutig vorn liegt (AUTO_MARGIN); sonst nennt dwg die Kandidaten.
import { parseRef, resolveField } from "../../pbip/lib/tmdl.mjs";

/** Abstand, um den der beste Vorschlag vor dem zweiten liegen muss, damit dwg ihn ohne Rückfrage nimmt */
export const AUTO_MARGIN = 10;

const SCEN = {
    AC: ["ac", "ist", "actual", "act"],
    PY: ["py", "vj", "vorjahr", "ly", "prior"],
    PL: ["pl", "plan", "budget", "bu", "soll"],
    FC: ["fc", "forecast", "fcst", "prognose", "hochrechnung"],
    // Benchmark ist ein eigener Vergleich (ChartKitchen-Rolle benchmark), nie Ist
    BM: ["bm", "benchmark"],
};
const TOKEN_SCEN = Object.fromEntries(Object.entries(SCEN).flatMap(([s, ts]) => ts.map(t => [t, s])));
const FY = new Set(["fy", "gesamtjahr", "fullyear"]);
const DELTA = new Set(["δ", "delta", "abw", "abweichung", "var", "variance", "diff"]);
// „±“ heißt in GuV-Modellen meist „mit Vorzeichen“ (GuV ± AC), nicht Abweichung: Variante, keine Δ-Kennzahl
const VARIANT = new Set(["ytd", "ytg", "r12", "pm", "mtd", "qtd", "rolling", "±"]);
/** Rolle → Szenario der Kennzahl (beide Visuals) */
export const ROLE_SCEN = {
    actual: "AC", ac: "AC", previousYear: "PY", py: "PY", plan: "PL", pl: "PL", forecast: "FC", fc: "FC",
    fcFy: "FC", plFy: "PL", prevForecast: "FC", benchmark: "BM",
};
const FY_ROLES = new Set(["fcFy", "plFy"]);

/** Name einer Kennzahl zerlegen: Szenario, Stamm, Gesamtjahr, Abweichung, Variante */
export function parseMeasureName(name) {
    let s = ` ${name.toLowerCase()} `.replace(/\bbis\s+(ist|heute|dato)\b/g, " bisist ");
    const tokens = s.replace(/[_\-/()]+/g, " ").replace(/([a-z])(\d+)\b/g, "$1 $2").split(/\s+/).filter(Boolean);
    let scen = null, fy = false, delta = false;
    const variants = [];
    const stem = [];
    for (const t of tokens) {
        if (TOKEN_SCEN[t]) { scen = scen && scen !== TOKEN_SCEN[t] ? "MIX" : TOKEN_SCEN[t]; continue; }
        if (FY.has(t)) { fy = true; continue; }
        if (DELTA.has(t) || t.startsWith("δ")) { delta = true; continue; }
        if (t === "bisist" || VARIANT.has(t) || /^\d+$/.test(t)) { variants.push(t); continue; }
        if (t === "%" && delta) { continue; }
        if (/^[€$£#]+$/.test(t)) { continue; }        // Einheitenpräfix („€ Umsatz AC“, „# Kunden“) gehört nicht zum Stamm
        stem.push(t);
    }
    return { scen, fy, delta, variants, stem: stem.join(" ") };
}

const isIdName = n => /(^|[\s_])(key|nr|no)$/i.test(n) || /id$/i.test(n);
const DATE_TABLE = /kalend|calend|date|datum|zeit|time/i;

/** alle Felder des Modells als flache Liste */
export function fieldsOf(model) {
    const out = [];
    for (const [table, t] of model.tables) {
        for (const m of t.measures) { out.push({ node: "Measure", table, name: m, format: t.formats.get(m), ...parseMeasureName(m) }); }
        for (const [c, v] of t.columns) { out.push({ node: "Column", table, name: c, ...v }); }
    }
    return out;
}

export const refOf = f => `'${f.table.replace(/'/g, "''")}'[${f.name.replace(/\]/g, "]]")}]`;

/**
 * Stämme mit Ist-Kennzahl (Kandidaten für --measure): { stem, table, scenarios: Set }
 * Statement-Templates bevorzugen GuV-Stämme.
 */
export function measureStems(fields) {
    const stems = new Map();
    for (const f of fields) {
        if (f.node !== "Measure" || f.delta || f.scen === "MIX" || f.variants.length || f.fy) { continue; }
        const key = f.stem;
        const e = stems.get(key) ?? { stem: key, table: f.table, scenarios: new Set(), names: [] };
        e.scenarios.add(f.scen ?? "AC");
        e.names.push(f.name);
        stems.set(key, e);
    }
    // ganze Szenario-Familien (AC, PY, PL …) vor einzelnen Ist-Kennzahlen
    return [...stems.values()].filter(e => e.scenarios.has("AC"))
        .sort((a, b) => b.scenarios.size - a.scenarios.size || a.stem.localeCompare(b.stem));
}

/**
 * Kennzahl-Kandidaten für eine Szenario-Rolle, sortiert. toActual: Vergleich über das laufende Jahr ohne Periodenfeld,
 * dann ist „PL bis Ist“ / „PY bis Ist“ richtig (sonst stünde das Ist Jan..Aug gegen den Plan des ganzen Jahres).
 */
function measureCandidates(fields, roleName, anchor, toActual = false) {
    const want = ROLE_SCEN[roleName];
    const wantFy = FY_ROLES.has(roleName);
    const out = [];
    for (const f of fields) {
        if (f.node !== "Measure" || f.delta || f.scen === "MIX") { continue; }
        const scen = f.scen ?? (want === "AC" ? "AC" : null);
        if (scen !== want) { continue; }
        if (wantFy !== f.fy) { continue; }
        let score = f.scen ? 60 : 35;
        score -= 15 * f.variants.length;
        if (toActual && (want === "PY" || want === "PL") && f.variants.length === 1 && f.variants[0] === "bisist") { score += 30; }
        if (anchor != null) {
            if (f.stem === anchor.stem) { score += 50; }
            else if (anchor.stem && (f.stem.includes(anchor.stem) || anchor.stem.includes(f.stem)) && f.stem) { score += 10; }
            else { score -= 40; }
            if (anchor.table && f.table === anchor.table) { score += 5; }
        }
        out.push({ field: f, score });
    }
    return out.sort((a, b) => b.score - a.score || a.field.name.localeCompare(b.field.name));
}

const COLUMN_RULES = {
    // P&L-Logik: Name der Spalte, bevorzugt in der Tabelle der Ebenen
    account: /^(konto|account)[\s_]*(id|nr|key)$|^(konto|account)id$/i,
    parent: /^parent|eltern|parent[\s_]*(account)?[\s_]*id$/i,
    accountName: /^(konto|account|kontoname|account[\s_]*name|name|bezeichnung)$/i,
    sortOrder: /^(sort[\s_]*order|sortierung|sortorder)$/i,
    rowType: /^(row[\s_]*type|zeilentyp)$/i,
    formulaDef: /^(formula[\s_]*def(inition)?|formel)$/i,
    signConvention: /^(sign[\s_]*convention|vorzeichen)$/i,
    displayInvert: /^display[\s_]*invert$/i,
    varianceInvert: /^variance[\s_]*invert$/i,
    comment: /^(kommentar|comment|bemerkung)$/i,
};
const LEVEL_RX = /^(?:l|ebene|level)[\s_]*(\d+)$/i;

/** Ebenen-Spalten je Tabelle (L1..Ln, Ebene 1..n), aufsteigend */
export function levelSets(fields) {
    const by = new Map();
    for (const f of fields) {
        const m = f.node === "Column" && LEVEL_RX.exec(f.name);
        if (!m) { continue; }
        by.set(f.table, [...(by.get(f.table) ?? []), { f, n: Number(m[1]) }]);
    }
    return [...by].map(([table, ls]) => ({ table, fields: ls.sort((a, b) => a.n - b.n).map(x => x.f) }));
}

/** Kandidaten für eine Spaltenrolle */
function columnCandidates(fields, roleName, ctx) {
    const cols = fields.filter(f => f.node === "Column");
    const out = [];
    if (COLUMN_RULES[roleName]) {
        for (const f of cols) {
            if (!COLUMN_RULES[roleName].test(f.name)) { continue; }
            let score = 60;
            if (ctx.levelTable) { score += f.table === ctx.levelTable ? 30 : -30; }
            out.push({ field: f, score });
        }
    } else if (roleName === "category" && ctx.time || roleName === "period" || roleName === "trend") {
        for (const f of cols) {
            const dateTable = DATE_TABLE.test(f.table);
            const n = f.name.toLowerCase();
            let score = dateTable ? 20 : 0;
            if (roleName === "period" && /^(periode|period)$/.test(n)) { score += 60; }
            // P&L-Periode: aus dem Kalender, ein Monat mit Jahr (2025-03); ein Monatsname allein mischt die Jahre
            if (roleName === "period" && !dateTable) { score -= 25; }
            if (roleName === "period" && /(jahr|year)/.test(n) && /(monat|month|periode|period)/.test(n)) { score += 40; }
            if (roleName === "period" && /^start[\s_]*of[\s_]*month$|^monatsanfang$/.test(n)) { score += 45; }
            if (roleName === "period" && /^(monatsname|month[\s_]*name)$/.test(n)) { score -= 30; }
            if (/^(monatsname|month[\s_]*name)$/.test(n)) { score += 50; }
            else if (/^(monat|month)$/.test(n)) { score += 40; }
            else if (/^(datum|date)$/.test(n)) { score += 25; }
            else if (/(monat|month|periode|period)/.test(n)) { score += 15; }
            else { continue; }
            if (f.sortBy) { score += 10; }
            if (f.dataType === "string") { score += 5; }
            if (/short|kurz|fiscal|offset|number|nummer/.test(n)) { score -= 20; }
            out.push({ field: f, score });
        }
    } else if (["category", "series", "multiples", "colgroup", "colCategory"].includes(roleName)) {
        // Struktur: Textspalten aus Dimensionen, keine Schlüssel, keine Kalenderspalten
        for (const f of cols) {
            if (DATE_TABLE.test(f.table) || isIdName(f.name) || (f.dataType && f.dataType !== "string")) { continue; }
            if (LEVEL_RX.test(f.name) || Object.values(COLUMN_RULES).some(rx => rx.test(f.name))) { continue; }
            let score = 20;
            if (/region|kanal|channel|land|country|produkt|product|kunde|customer|sorte|category|kategorie|segment|markt|market/i.test(f.name)) { score += 10; }
            if (f.sortBy) { score += 5; }
            out.push({ field: f, score });
        }
    } else if (roleName === "rowType" && !ctx.levelTable) {
        for (const f of cols) { if (/typ/i.test(f.name)) { out.push({ field: f, score: 30 }); } }
    }
    return out.sort((a, b) => b.score - a.score || a.field.name.localeCompare(b.field.name));
}

/** Kennzahlen für Rollen ohne Szenario (X-Achse, Blasengröße, Linie): alle Ist-Kennzahlen, ohne Auto-Wahl */
function plainMeasureCandidates(fields, anchor) {
    return fields.filter(f => f.node === "Measure" && !f.delta && (f.scen ?? "AC") === "AC" && !f.fy)
        .map(f => ({ field: f, score: 20 - 15 * f.variants.length - (anchor && f.stem === anchor.stem ? 10 : 0) }))
        .sort((a, b) => b.score - a.score || a.field.name.localeCompare(b.field.name));
}

/** eine Kurzangabe („Umsatz AC“, „Konto.L1“, „'Konto'[L1]“) gegen das Modell auflösen */
export function resolveInput(model, fields, input, kind) {
    const s = String(input).trim();
    if (/\[/.test(s)) {
        const r = parseRef(s);
        if (!r.table && kind !== "Measure") {
            const hits = fields.filter(f => f.node === "Column" && f.name === r.name);
            if (hits.length === 1) { return refOf(hits[0]); }
        }
        const res = resolveField(model, s, kind === "Measure" ? "Measure" : "Grouping");
        return refOf(res);
    }
    const dot = /^(.+?)\.([^.]+)$/.exec(s);
    const pool = fields.filter(f => (kind === "Measure" ? f.node === "Measure" : f.node === "Column"));
    let hits = dot ? pool.filter(f => f.table === dot[1] && f.name === dot[2]) : [];
    if (!hits.length) { hits = pool.filter(f => f.name === s); }
    if (!hits.length) { hits = pool.filter(f => f.name.toLowerCase() === s.toLowerCase()); }
    if (hits.length === 1) { return refOf(hits[0]); }
    const what = kind === "Measure" ? "Kennzahl" : "Spalte";
    if (hits.length > 1) { throw new Error(`${what} „${s}“ gibt es mehrfach: ${hits.map(refOf).join(", ")}. Mit Tabelle angeben.`); }
    throw new Error(`${what} „${s}“ fehlt im Modell.`);
}

/** Werte einer Rolle aus der Eingabe: Liste von Referenzen (Komma oder mehrfach angegeben) */
export function splitRefs(v) {
    const out = [];
    for (const item of [].concat(v)) {
        const s = String(item);
        const refs = s.match(/'(?:[^']|'')+'\[(?:[^\]]|\]\])+\]|\[(?:[^\]]|\]\])+\]/g);
        if (refs && refs.join("").replace(/\s|,/g, "").length === s.replace(/\s|,/g, "").length) { out.push(...refs); }
        else { out.push(...s.split(",").map(x => x.trim()).filter(Boolean)); }
    }
    return out;
}

/**
 * Bindungen für ein Template vorschlagen.
 * @param template  Eintrag aus templates.json
 * @param given     { rolle: [eingaben] } aus der Kommandozeile
 * @param measure   Stamm der Kennzahl (--measure), optional
 * @returns {{ rows: {role, need, kind, label, value, source, alternatives}[], problems: string[], stem: string|null }}
 */
export function suggestBindings(model, template, given = {}, measure = null) {
    const fields = fieldsOf(model);
    const problems = [];
    const bindings = {};
    const source = {};
    const alts = {};
    const roleOf = Object.fromEntries(template.roles.map(r => [r.role, r]));
    // 1 · explizite Angaben
    for (const [role, vals] of Object.entries(given)) {
        const kind = roleOf[role]?.kind ?? null;
        if (!kind) { problems.push(`Rolle „${role}“ gehört nicht zu ${template.id} (${template.roles.map(r => r.role).join(", ")}).`); continue; }
        try { bindings[role] = splitRefs(vals).map(v => resolveInput(model, fields, v, kind)); source[role] = "angegeben"; }
        catch (e) { problems.push(`${role}: ${e.message}`); }
    }
    // 2 · Stamm der Kennzahlen
    const stems = measureStems(fields);
    let anchor = null;
    const acRole = template.visual === "pnl" ? "ac" : "actual";
    if (measure) {
        const m = parseMeasureName(String(measure)).stem;
        const hit = stems.find(s => s.stem === m) ?? stems.find(s => s.names.some(n => n.toLowerCase() === String(measure).toLowerCase().trim()))
            ?? (stems.filter(s => s.stem.includes(m)).length === 1 ? stems.find(s => s.stem.includes(m)) : null);
        if (hit) { anchor = { stem: hit.stem, table: hit.table }; }
        else { problems.push(`--measure „${measure}“: kein Kennzahlen-Stamm mit Ist-Wert passt (vorhanden: ${stems.map(s => s.stem || s.names[0]).join(", ")}).`); }
    } else if (bindings[acRole]?.length) {
        const f = fields.find(x => x.node === "Measure" && refOf(x) === bindings[acRole][0]);
        if (f) { anchor = { stem: f.stem, table: f.table }; }
    } else if (stems.length === 1) {
        anchor = { stem: stems[0].stem, table: stems[0].table };
    } else if (template.data === "statement") {
        // GuV-Familie mit den meisten Szenarien („GuV AC/PY/PL/FC“ vor „GuV Letzter Ist-Monat“)
        const guv = stems.filter(s => /guv|g&v|p&l|pnl|gewinn|ergebnisrechnung|income/.test(s.stem));
        if (guv.length === 1 || (guv.length > 1 && guv[0].scenarios.size > guv[1].scenarios.size)) {
            anchor = { stem: guv[0].stem, table: guv[0].table };
        }
    }
    // 3 · Ebenen und ihre Tabelle (P&L)
    let levelTable = null;
    if (template.visual === "pnl" && template.data === "structure") {
        if (!bindings.levels?.length) { alts.levels = columnCandidates(fields, "category", { time: false }).slice(0, 6).map(c => refOf(c.field)); }
    } else if (template.visual === "pnl") {
        if (bindings.levels?.length) { levelTable = parseRef(bindings.levels[0]).table; }
        else {
            const sets = levelSets(fields);
            const withLogic = sets.filter(s => fields.some(f => f.table === s.table && COLUMN_RULES.rowType.test(f.name)));
            const pick = withLogic.length === 1 ? withLogic[0] : sets.length === 1 ? sets[0] : null;
            if (pick) {
                bindings.levels = pick.fields.slice(0, 8).map(refOf); source.levels = "Vorschlag"; levelTable = pick.table;
                alts.levels = sets.filter(s => s !== pick).map(s => `${s.table}: ${s.fields.map(f => f.name).join(", ")}`);
            } else if (sets.length) {
                alts.levels = sets.map(s => `${s.table}: ${s.fields.map(f => f.name).join(", ")}`);
            }
        }
    }
    const time = template.group?.id === "time" || template.objects?.chart?.orientation === "line";
    const cols = template.objects?.columns;
    const toActual = template.visual === "pnl" && cols?.minuend === "ac" && cols?.blockKind !== "fy" && !bindings.period?.length;
    // 4 · übrige Rollen
    for (const r of template.roles) {
        if (bindings[r.role] || r.role === "levels") { continue; }
        let cands;
        if (r.kind === "Measure") {
            cands = ROLE_SCEN[r.role] ? measureCandidates(fields, r.role, anchor, toActual) : plainMeasureCandidates(fields, anchor);
        } else {
            cands = columnCandidates(fields, r.role, { time, levelTable });
        }
        alts[r.role] = cands.slice(0, r.kind === "Measure" ? 4 : 6).map(c => refOf(c.field));
        if (!cands.length || r.need === "optional") { continue; }
        const [a, b] = cands;
        const scenarioRole = r.kind === "Measure" && ROLE_SCEN[r.role];
        const confident = scenarioRole ? anchor != null && a.field.stem === anchor.stem && (!b || b.field.stem !== anchor.stem || a.score - b.score >= AUTO_MARGIN)
            : (a.score >= 40 && (!b || a.score - b.score >= AUTO_MARGIN));
        if (confident) { bindings[r.role] = [refOf(a.field)]; source[r.role] = "Vorschlag"; alts[r.role] = alts[r.role].filter(x => x !== bindings[r.role][0]); }
    }
    // 5 · Pflichtrollen ohne Feld
    for (const r of template.roles.filter(x => x.need === "required")) {
        if (bindings[r.role]?.length) { continue; }
        if (r.alt && r.alt.every(x => bindings[x]?.length)) { continue; }
        const hint = r.kind === "Measure" && ROLE_SCEN[r.role] && !anchor
            ? ` Mit --measure <Stamm> wählen (${stems.map(s => s.stem || s.names[0]).slice(0, 8).join(", ")}) oder --${r.role} angeben.`
            : ` Mit --${r.role} angeben${alts[r.role]?.length ? `, z. B. ${alts[r.role].slice(0, 3).join(", ")}` : ""}.`;
        problems.push(`Pflichtrolle ${r.role} (${r.label.de}) ohne Feld.${hint}`);
    }
    const rows = template.roles.map(r => ({
        role: r.role, need: r.need, kind: r.kind, label: r.label,
        value: bindings[r.role] ?? null, source: source[r.role] ?? null, alternatives: alts[r.role] ?? [],
    }));
    return { rows, problems, stem: anchor?.stem ?? null, bindings };
}
