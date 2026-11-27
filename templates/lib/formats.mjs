// Skalierende Kommas im Formatstring (Excel-Stil): Kommas direkt hinter einem Ziffernplatzhalter, auf die kein
// weiterer Ziffernplatzhalter folgt (`#,##0.0,`, `#,##0,,`, `0.0,`, `#,##0,.0`), teilen je Komma durch 1 000.
// ChartKitchen 1.58 zeigt das falsch: formattingutils skaliert nur Kommas vor dem Dezimalpunkt, und die 3-Ziffern-Regel
// rechnet mit dem unskalierten Wert (81 statt 81,5). dwg lint und dwg check warnen deshalb.
import { loadCatalog, VISUAL } from "./catalog.mjs";

const DIGIT = /[0#?]/;

/** Anzahl skalierender Kommas je Abschnitt (`;`); Literale `"…"`, Escapes `\x` und `[…]` zählen nicht. */
export function scalingCommas(fmt) {
    if (typeof fmt !== "string" || !fmt) { return []; }
    const out = [0];
    let prevDigit = false;
    for (let i = 0; i < fmt.length; i++) {
        const ch = fmt[i];
        if (ch === "\\") { i++; prevDigit = false; continue; }
        if (ch === '"' || ch === "[") {
            const j = fmt.indexOf(ch === '"' ? '"' : "]", i + 1);
            i = j < 0 ? fmt.length : j;
            prevDigit = false;
            continue;
        }
        if (ch === ";") { out.push(0); prevDigit = false; continue; }
        if (ch === "," && prevDigit) {
            let j = i;
            while (fmt[j] === ",") { j++; }
            // gefolgt von einem Ziffernplatzhalter: Tausendertrennzeichen (`#,##0`), sonst Skalierung
            if (!(j < fmt.length && DIGIT.test(fmt[j]))) { out[out.length - 1] += j - i; prevDigit = false; }
            i = j - 1;
            continue;
        }
        prevDigit = DIGIT.test(ch);
    }
    return out;
}

export const hasScalingComma = fmt => scalingCommas(fmt).some(n => n > 0);

/**
 * Warnung für einen Formatstring mit skalierenden Kommas, sonst null. `source`: "formats" (Kachelfeld, gilt nur in der
 * App) oder "model" (Formatstring des Measures, gilt in App und Power BI).
 */
export function scalingCommaWarning(fmt, visual = "chartkitchen", source = "formats", catalog = null) {
    if (!hasScalingComma(fmt)) { return null; }
    let v = catalog?.versions?.[visual];
    if (!v) { try { v = loadCatalog().versions?.[visual]; } catch { v = null; } }
    const name = `${VISUAL[visual] ?? visual}${v ? ` ${String(v).replace(/(\.0)+$/, "")}` : ""}`;
    const example = visual === "chartkitchen" ? " (81 statt 81,5)" : "";
    return `Formatstring „${fmt}“ hat skalierende Kommas. ${name} zeigt sie falsch${example}; Werte im Modell skalieren ` +
        `oder labels.displayUnits nutzen.${source === "formats" ? " formats gilt nur in der App, Power BI nimmt das Format des Measures." : ""}`;
}
