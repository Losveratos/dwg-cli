// Mini-DAX für Tests: führt genau die Abfragen aus, die daxQuery() erzeugt, auf exportierten
// Tabellen eines Sternschemas (eine Faktentabelle, Dimensionen über n:1-Beziehungen).
//   EVALUATE [ADDMISSINGITEMS(…,] SUMMARIZECOLUMNS(<Spalten>, TREATAS({…}, <Spalte>), "<name>", <Ausdruck>, …) [ORDER BY …]
// Ausdrücke: SUM('T'[C]), MAX('T'[C]), SUMX/AVERAGEX(VALUES('T'[C]), a * 'T'[C]), CALCULATE(<Ausdruck>, 'T'[C] = <Literal>, …),
// DIVIDE(a, b[, alt]), a + b - c, Zahlen, [Measure] aus model.measures.
// Ergebnis im Format des Rayfin-Konnektors: { columns: [{name}], rows: [[…]] }. Alles andere wirft einen Fehler,
// damit ein Test nie stillschweigend etwas anderes rechnet als Power BI.

/** Teilt an Kommas (oder `sep`) auf oberster Ebene (Klammern, Strings, Tabellen- und Spaltennamen beachtet). */
export function splitTop(s, sep = ",") {
    const out = [];
    let depth = 0, cur = "", i = 0;
    while (i < s.length) {
        const c = s[i];
        if (c === '"' || c === "'" || c === "[") {
            const close = c === "[" ? "]" : c;
            let j = i + 1;
            while (j < s.length) {
                if (s[j] === close) { if (s[j + 1] === close) { j += 2; continue; } break; }
                j++;
            }
            cur += s.slice(i, j + 1);
            i = j + 1;
            continue;
        }
        if (c === "(" || c === "{") { depth++; }
        if (c === ")" || c === "}") { depth--; }
        if (c === sep && depth === 0) { out.push(cur.trim()); cur = ""; i++; continue; }
        cur += c;
        i++;
    }
    if (cur.trim()) { out.push(cur.trim()); }
    return out;
}

/** Zerlegt an + und - auf oberster Ebene: "a - b + c" → [{ sign: 1, term: "a" }, { sign: -1, term: "b" }, …]. */
export function splitSigned(s) {
    const out = [];
    let sign = 1, cur = "", depth = 0, i = 0;
    while (i < s.length) {
        const c = s[i];
        if (c === '"' || c === "'" || c === "[") {
            const close = c === "[" ? "]" : c;
            let j = i + 1;
            while (j < s.length) {
                if (s[j] === close) { if (s[j + 1] === close) { j += 2; continue; } break; }
                j++;
            }
            cur += s.slice(i, j + 1);
            i = j + 1;
            continue;
        }
        if (c === "(" || c === "{") { depth++; }
        if (c === ")" || c === "}") { depth--; }
        if ((c === "+" || c === "-") && depth === 0) {
            if (cur.trim()) { out.push({ sign, term: cur.trim() }); sign = 1; }
            if (c === "-") { sign = -sign; }
            cur = "";
            i++;
            continue;
        }
        cur += c;
        i++;
    }
    if (cur.trim()) { out.push({ sign, term: cur.trim() }); }
    return out;
}

/** "NAME( … )" → { name, args } für einen vollständigen Aufruf */
function call(s) {
    const m = /^\s*([A-Z]+)\s*\(([\s\S]*)\)\s*$/.exec(s);
    return m ? { name: m[1], args: splitTop(m[2]) } : null;
}

export function parseRef(s) {
    const m = /^\s*(?:'((?:[^']|'')+)'|([A-Za-z_][\w\- ]*?))?\s*\[((?:[^\]]|\]\])+)\]\s*$/.exec(s);
    if (!m) { return null; }
    const table = m[1] != null ? m[1].replace(/''/g, "'") : (m[2]?.trim() || null);
    return { table, col: m[3].replace(/\]\]/g, "]") };
}

function literal(s) {
    const t = s.trim();
    if (/^".*"$/s.test(t)) { return t.slice(1, -1).replace(/""/g, '"'); }
    if (/^TRUE\s*\(\s*\)$/.test(t)) { return true; }
    if (/^FALSE\s*\(\s*\)$/.test(t)) { return false; }
    if (/^BLANK\s*\(\s*\)$/.test(t)) { return null; }
    const d = /^DATE\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(t);
    if (d) { return `${d[1]}-${d[2].padStart(2, "0")}-${d[3].padStart(2, "0")}T00:00:00`; }
    if (/^-?\d+(\.\d+)?$/.test(t)) { return Number(t); }
    throw new Error(`Mini-DAX: Literal nicht unterstützt: ${t}`);
}

/**
 * model = { fact: "Utilization", tables: { Name: { columns: [..], rows: [[..]] } },
 *           relationships: [{ from: ["Utilization", "Employee"], to: ["Employees", "ID"] }], measures: { Name: "DAX" } }
 */
export function createEngine(model) {
    const tables = {};
    for (const [name, t] of Object.entries(model.tables)) {
        tables[name] = { ...t, idx: Object.fromEntries(t.columns.map((c, i) => [c, i])) };
    }
    const fact = tables[model.fact];
    const rel = {};
    for (const r of model.relationships) {
        const [ft, fc] = r.from, [dt, dc] = r.to;
        if (ft !== model.fact) { throw new Error("Mini-DAX: nur Beziehungen von der Faktentabelle aus"); }
        const dim = tables[dt];
        const key = new Map(dim.rows.map(row => [String(row[dim.idx[dc]]), row]));
        rel[dt] = { fromIdx: fact.idx[fc], dim, key };
    }

    /** Getter für eine Spalte aus Sicht einer Faktzeile */
    function getter(ref) {
        if (ref.table === model.fact) {
            const i = fact.idx[ref.col];
            if (i == null) { throw new Error(`Mini-DAX: Spalte ${ref.table}[${ref.col}] fehlt`); }
            return row => row[i];
        }
        const r = rel[ref.table];
        if (!r) { throw new Error(`Mini-DAX: keine Beziehung zu '${ref.table}'`); }
        const i = r.dim.idx[ref.col];
        if (i == null) { throw new Error(`Mini-DAX: Spalte '${ref.table}'[${ref.col}] fehlt`); }
        return row => { const d = r.key.get(String(row[r.fromIdx])); return d ? d[i] : null; };
    }

    function evaluate(expr, rows, ctx = new Map()) {
        const t = expr.trim();
        // Summe und Differenz auf oberster Ebene: a + b - c, auch -a (BLANK zählt wie in DAX als 0, nur BLANK ± BLANK bleibt BLANK)
        const terms = splitSigned(t);
        if (terms.length > 1 || terms[0].sign < 0) {
            let s = 0, any = false;
            for (const { sign, term } of terms) { const v = evaluate(term, rows, ctx); if (v != null) { s += sign * v; any = true; } }
            return any ? s : null;
        }
        if (/^-?\d+(\.\d+)?$/.test(t)) { return Number(t); }
        // Produkt auf oberster Ebene: a * b (z. B. [GuV AC] * 'dim-konten'[SignConvention] in SUMX)
        const factors = splitTop(t, "*");
        if (factors.length > 1) {
            let p = 1;
            for (const f of factors) { const v = evaluate(f, rows, ctx); if (v == null) { return null; } p *= v; }
            return p;
        }
        const ref = parseRef(t);
        if (ref && ctx.has(`${ref.table}[${ref.col}]`)) { return ctx.get(`${ref.table}[${ref.col}]`); }
        if (ref && !ref.table && model.measures?.[ref.col]) { return evaluate(model.measures[ref.col], rows); }
        if (ref && ref.table && model.measures?.[ref.col] && !tables[ref.table]?.idx[ref.col]) { return evaluate(model.measures[ref.col], rows); }
        const c = call(t);
        if (c?.name === "SUM") {
            const g = getter(parseRef(c.args[0]));
            let sum = 0, any = false;
            for (const r of rows) { const v = g(r); if (v != null && v !== "") { sum += Number(v); any = true; } }
            return any ? sum : null;
        }
        if (c?.name === "MAX") {
            const g = getter(parseRef(c.args[0]));
            let max = null;
            for (const r of rows) { const v = g(r); if (v != null && v !== "" && (max == null || Number(v) > max)) { max = Number(v); } }
            return max;
        }
        if (c?.name === "SUMX" || c?.name === "AVERAGEX") {
            // SUMX/AVERAGEX(VALUES(<Spalte>), <Ausdruck>): je Wert der Spalte den Ausdruck auf ihren Zeilen, die Spalte im Ausdruck = dieser Wert.
            // AVERAGEX mittelt wie DAX nur über nicht leere Ergebnisse.
            const v = call(c.args[0]);
            const vr = v?.name === "VALUES" ? parseRef(v.args[0]) : null;
            if (!vr?.table) { throw new Error(`Mini-DAX: ${c.name} nur über VALUES(<Spalte>): ${t}`); }
            const g = getter(vr), key = `${vr.table}[${vr.col}]`, groups = new Map();
            for (const r of rows) { const k = g(r); if (!groups.has(k)) { groups.set(k, []); } groups.get(k).push(r); }
            let sum = 0, n = 0;
            for (const [k, rs] of groups) {
                const x = evaluate(c.args[1], rs, new Map([...ctx, [key, k]]));
                if (x != null) { sum += Number(x); n++; }
            }
            return n ? (c.name === "SUMX" ? sum : sum / n) : null;
        }
        if (c?.name === "DIVIDE") {
            // DIVIDE(a, b [, alternativ]): BLANK oder Alternative, wenn b leer oder 0 ist
            const num = evaluate(c.args[0], rows, ctx), den = evaluate(c.args[1], rows, ctx);
            if (den == null || den === 0) { return c.args[2] != null ? evaluate(c.args[2], rows, ctx) : null; }
            return num == null ? null : num / den;
        }
        if (c?.name === "CALCULATE") {
            let sub = rows;
            for (const f of c.args.slice(1)) {
                const m = /^(.+?)\s*=\s*(.+)$/s.exec(f);
                const fr = m && parseRef(m[1]);
                if (!fr) { throw new Error(`Mini-DAX: CALCULATE-Filter nicht unterstützt: ${f}`); }
                const g = getter(fr), v = literal(m[2]);
                sub = sub.filter(r => g(r) === v);
            }
            return evaluate(c.args[0], sub);
        }
        throw new Error(`Mini-DAX: Ausdruck nicht unterstützt: ${t}`);
    }

    function summarize(args) {
        const groups = [], filters = [], measures = [];
        for (let i = 0; i < args.length; i++) {
            const a = args[i];
            if (a.startsWith('"')) { measures.push([literal(a), args[++i]]); continue; }
            const c = call(a);
            if (c?.name === "TREATAS") {
                const vals = splitTop(c.args[0].trim().replace(/^\{|\}$/g, "")).map(literal);
                filters.push({ g: getter(parseRef(c.args[1])), vals });
                continue;
            }
            const ref = parseRef(a);
            if (!ref?.table) { throw new Error(`Mini-DAX: Argument nicht unterstützt: ${a}`); }
            groups.push(ref);
        }
        const rows = fact.rows.filter(r => filters.every(f => f.vals.includes(f.g(r))));
        const gs = groups.map(getter);
        const buckets = new Map();
        for (const r of rows) {
            const key = gs.map(g => g(r));
            const k = JSON.stringify(key);
            if (!buckets.has(k)) { buckets.set(k, { key, rows: [] }); }
            buckets.get(k).rows.push(r);
        }
        const out = [];
        for (const { key, rows: rs } of buckets.values()) {
            const vals = measures.map(([, e]) => evaluate(e, rs));
            if (measures.length && vals.every(v => v == null)) { continue; }   // wie SUMMARIZECOLUMNS
            out.push([...key, ...vals]);
        }
        return {
            columns: [...groups.map(g => ({ name: `${g.table}[${g.col}]` })), ...measures.map(([n]) => ({ name: `[${n}]` }))],
            rows: out, groups,
        };
    }

    return {
        query(dax) {
            const body = dax.replace(/^\s*\/\/.*$/gm, "").trim();
            const m = /^EVALUATE\s+([\s\S]+?)(?:\s+ORDER BY\s+([\s\S]+))?$/.exec(body);
            if (!m) { throw new Error("Mini-DAX: keine EVALUATE-Abfrage"); }
            let c = call(m[1]);
            let result;
            if (c?.name === "ADDMISSINGITEMS") {
                const inner = c.args.findIndex(a => /^\s*SUMMARIZECOLUMNS\(/.test(a));
                const showAll = c.args.slice(0, inner).map(parseRef);
                result = summarize(call(c.args[inner]).args);
                const table = showAll[0].table;
                if (!showAll.every(r => r.table === table)) { throw new Error("Mini-DAX: ADDMISSINGITEMS nur mit Spalten einer Tabelle"); }
                const t = tables[table];
                const have = new Set(result.rows.map(r => JSON.stringify(result.groups.map((g, i) => (g.table === table ? r[i] : null)))));
                const width = result.columns.length;
                for (const row of t.rows) {
                    const key = result.groups.map(g => (g.table === table ? row[t.idx[g.col]] : null));
                    const k = JSON.stringify(key);
                    if (have.has(k)) { continue; }
                    have.add(k);
                    result.rows.push([...key, ...Array(width - key.length).fill(null)]);
                }
            } else if (c?.name === "SUMMARIZECOLUMNS") {
                result = summarize(c.args);
            } else {
                throw new Error(`Mini-DAX: ${c?.name ?? "Ausdruck"} nicht unterstützt`);
            }
            if (m[2]) {
                const keys = splitTop(m[2]).map(parseRef).map(r => result.groups.findIndex(g => g.table === r.table && g.col === r.col));
                if (keys.some(i => i < 0)) { throw new Error("Mini-DAX: ORDER BY auf eine Spalte, die nicht gruppiert ist"); }
                const cmp = (a, b) => (a == null ? -1 : b == null ? 1 : typeof a === "number" ? a - b : String(a).localeCompare(String(b)));
                result.rows.sort((a, b) => { for (const i of keys) { const d = cmp(a[i], b[i]); if (d) { return d; } } return 0; });
            }
            return { columns: result.columns, rows: result.rows };
        },
    };
}
