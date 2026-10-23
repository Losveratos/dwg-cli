// JSON-Dateien lesen und bei fehlender Datei oder kaputtem JSON mit dem Dateinamen melden.
import fs from "node:fs";

/** Liest eine JSON-Datei; `what` ist das Wort in der Meldung („Spec“, „Mockup“). */
export function readJsonFile(file, what = "Datei") {
    if (!fs.existsSync(file)) { throw new Error(`${what} ${file} nicht gefunden.`); }
    try { return JSON.parse(fs.readFileSync(file, "utf8")); }
    catch (e) { throw new Error(`${what} ${file}: ${e.message}`); }
}

/** Liest eine App-Spec. */
export const readSpec = file => readJsonFile(file, "Spec");
