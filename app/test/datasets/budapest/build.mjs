// Baut das Budapest-Demo-Set für die Tests aus den CSV-Quellen des Modells „PnL ChartkitchenDemoKit“
// (Budapest-BI-Forum-Demo, synthetische Daten der DWG Industries SE):
//   node app/test/datasets/budapest/build.mjs <Ordner demoData/demokit mit fact-abschluss.csv und den dim-*.csv>
// Schreibt nur Fakten 2026 (PY ist eine eigene Spalte, 2025 wird nicht gebraucht) ohne reine Nullzeilen, die GuV-Konten
// (die Seite filtert auf Statement „Income statement“), Gesellschaften, Regionen und den Kalender 2026.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.argv[2];
if (!SRC) { console.error("Ordner mit fact-abschluss.csv und den dim-*.csv angeben"); process.exit(1); }

/** CSV with ";" and quotes (comments contain ";" and line breaks) */
function readCsv(file) {
    const text = fs.readFileSync(path.join(SRC, file), "utf8").replace(/^﻿/, "");
    const rows = [];
    let row = [], cell = "", quoted = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (quoted) {
            if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
            else if (c === '"') { quoted = false; }
            else { cell += c; }
        } else if (c === '"') { quoted = true; }
        else if (c === ";") { row.push(cell); cell = ""; }
        else if (c === "\n" || c === "\r") {
            if (c === "\r" && text[i + 1] === "\n") { i++; }
            row.push(cell); cell = "";
            if (row.length > 1 || row[0] !== "") { rows.push(row); }
            row = [];
        } else { cell += c; }
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    const [columns, ...data] = rows;
    const bad = data.filter(r => r.length !== columns.length);
    if (bad.length) { throw new Error(`${file}: ${bad.length} rows with a wrong column count`); }
    return { columns, rows: data };
}
/** keep only some columns, rename (CSV name → model name), convert numbers, empty text → BLANK */
function pick(t, spec, filter = () => true) {
    const idx = Object.keys(spec).map(c => { const i = t.columns.indexOf(c); if (i < 0) { throw new Error(`column ${c} missing`); } return i; });
    const kinds = Object.values(spec);
    return {
        columns: kinds.map(k => k.name),
        rows: t.rows.filter(filter).map(r => idx.map((i, n) => {
            const v = r[i];
            if (kinds[n].num) { return v === "" ? null : Number(v); }
            return v === "" ? null : v;
        })),
    };
}
const s = name => ({ name }), n = name => ({ name, num: true });

const konten = readCsv("dim-konten.csv");
const kIdx = konten.columns.indexOf("Statement");
const accounts = pick(konten, {
    AccountID: s("AccountID"), Statement: s("Statement"), "Name EN": s("Name EN"),
    "L1 EN": s("L1 EN"), "L2 EN": s("L2 EN"), "L3 EN": s("L3 EN"), "L4 EN": s("L4 EN"),
    SortOrder: n("SortOrder"), RowType: s("RowType"), "FormulaDef EN": s("FormulaDef EN"), SignConvention: n("SignConvention"),
    DisplayInvert: s("DisplayInvert"), VarianceInvert: s("VarianceInvert"), "Comment EN": s("Comment EN"),
}, r => r[kIdx] === "Income statement");
const ids = new Set(accounts.rows.map(r => r[0]));

const fakten = readCsv("fact-abschluss.csv");
const fi = c => fakten.columns.indexOf(c);
const facts = pick(fakten, {
    AccountID: s("AccountID"), EntityID: s("EntityID"), Datum: s("Datum"),
    AC: n("AC Wert"), PY: n("PY Wert"), PL: n("PL Wert"), FC: n("FC Wert"),
}, r => r[fi("Monat")].startsWith("2026-") && ids.has(r[fi("AccountID")])
    && ["AC", "PY", "PL", "FC"].some(c => Number(r[fi(c)]) !== 0));

const companies = pick(readCsv("dim-gesellschaft.csv"), {
    EntityID: s("EntityID"), "Short name": s("Short name"), Country: s("Country"), "Währung": s("Währung"),
    RegionID: s("RegionID"), Sortierung: n("Sortierung"),
});
const regions = pick(readCsv("dim-region.csv"), { RegionID: s("RegionID"), Region: s("Region"), Sortierung: n("Sortierung") });
const datum = readCsv("dim-datum.csv");
const di = datum.columns.indexOf("Datum");
// facts sit on month ends; the calendar keeps only those days
const days = new Set(facts.rows.map(r => r[2]));
const calendar = pick(datum, {
    Datum: s("Datum"), Jahr: n("Jahr"), MonatNr: n("MonatNr"), "Month Short": s("Month Short"), "Period Status": s("Period Status"),
}, r => days.has(r[di]));

const write = (name, t) => fs.writeFileSync(path.join(HERE, name), JSON.stringify({ columns: t.columns, rows: t.rows }));
write("konten.json", accounts);
write("fakten-2026.json", facts);
write("gesellschaften.json", companies);
write("regionen.json", regions);
write("kalender-2026.json", calendar);
console.log(`konten ${accounts.rows.length}, fakten-2026 ${facts.rows.length}, gesellschaften ${companies.rows.length}, ` +
    `regionen ${regions.rows.length}, kalender-2026 ${calendar.rows.length}`);
