// Baut das GuV-Demo-Set für die Tests aus den CSV-Quellen des Modells „ChartKitchen byDatenWG Demo“
// (Parameter DemoPfad, Ordner demoData/merged neben dem Kitchen-Demo-PBIP):
//   node app/test/datasets/guv/build.mjs <ordner mit fact-guv.csv und dim-konten.csv>
// Schreibt konten.json (alle 5.000 Konten) und fakten-2026.json (nur Januar bis August 2026, den Zeitraum der Spec
// specs/guv.json; das ganze Set wäre 12 MB groß).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.argv[2];
if (!SRC) { console.error("Ordner mit fact-guv.csv und dim-konten.csv angeben"); process.exit(1); }

/** CSV mit „;“ und Anführungszeichen wie Csv.Document(…, QuoteStyle.Csv): Kommentare enthalten selbst „;“ und Zeilenumbrüche. */
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
    if (bad.length) { throw new Error(`${file}: ${bad.length} Zeilen mit falscher Spaltenzahl`); }
    return { columns, rows: data };
}

const INT = new Set(["SortOrder", "SignConvention"]);
const konten = readCsv("dim-konten.csv");
konten.rows = konten.rows.map(r => r.map((v, i) => (INT.has(konten.columns[i]) ? Number(v) : v === "" ? null : v)));

const fakten = readCsv("fact-guv.csv");
const NUM = new Set(["AC", "PY", "PL", "FC", "FC_FY", "PL_FY"]);
fakten.rows = fakten.rows
    .filter(r => { const m = r[fakten.columns.indexOf("Monat")]; return m >= "2026-01" && m <= "2026-08"; })
    .map(r => r.map((v, i) => (NUM.has(fakten.columns[i]) ? (v === "" ? null : Number(v)) : v)));   // leer = BLANK, nicht 0

const write = (name, t) => fs.writeFileSync(path.join(HERE, name), JSON.stringify({ columns: t.columns, rows: t.rows }));
write("konten.json", konten);
write("fakten-2026.json", fakten);
console.log(`konten.json: ${konten.rows.length} Konten, fakten-2026.json: ${fakten.rows.length} Zeilen`);
